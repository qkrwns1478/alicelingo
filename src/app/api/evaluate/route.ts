import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface EvaluationResult {
  score: number;
  feedback: string[];
  fluency: string;
}

function parseFallback(text: string): EvaluationResult {
  const scoreMatch = text.match(/"?score"?\s*:\s*(\d+)/i);
  let score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  
  const fluencyMatch = text.match(/"?fluency"?\s*:\s*["']?(High|Medium|Low)["']?/i);
  const fluency = fluencyMatch ? fluencyMatch[1] : "Low";

  let feedback: string[] = [];
  const arrayMatch = text.match(/"?feedback"?\s*:\s*\[([\s\S]*?)\]/);
  if (arrayMatch && arrayMatch[1]) {
    const items = arrayMatch[1].match(/"([^"]*)"|'([^']*)'/g);
    if (items) {
      feedback = items
        .map(item => item.replace(/^["']|["']$/g, "").trim())
        .filter(item => item.length > 10);
    }
  }
  
  if (feedback.length === 0) {
    feedback = ["구체적인 피드백을 생성하지 못했습니다."];
  }

  return { score, feedback, fluency };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { part, question, audioData, modelAnswer } = body;

    if (!audioData) {
      return NextResponse.json({ error: "No audio data" }, { status: 400 });
    }

    const base64Content = audioData.split(";base64,").pop();
    const audioBuffer = Buffer.from(base64Content, "base64");
    const audioFile = await toFile(audioBuffer, "audio.webm", { type: "audio/webm" });

    const transcription: any = await client.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      language: "en",
      response_format: "verbose_json",
    });

    const userTranscript = transcription.text.trim();
    // console.log("Transcript:", userTranscript);

    const duration = transcription.duration || 1; 
    const wordCount = userTranscript.split(/\s+/).length;
    const wps = wordCount / duration; 
    // console.log(`Speech Rate: ${wps.toFixed(2)} WPS`);

    let confidenceScore = 0;
    if (transcription.segments && transcription.segments.length > 0) {
      const totalLogprob = transcription.segments.reduce((acc: number, seg: any) => acc + (seg.avg_logprob || 0), 0);
      const avgLogprob = totalLogprob / transcription.segments.length;
      confidenceScore = Math.max(0, 100 + (avgLogprob * 40)); // 선형 감점 적용 (-0.5만 되어도 80점대로 하락)
    } else {
      confidenceScore = 80;
    }
    // console.log(`Strict Confidence: ${confidenceScore.toFixed(2)}`);

    if (!userTranscript || userTranscript.length < 2 || userTranscript.match(/^[. ]*$/)) {
      return NextResponse.json({
        score: 0,
        feedback: ["음성이 명확하지 않습니다. 더 크게 말씀해 주세요."],
        fluency: "Low"
      });
    }

    const systemPrompt = `
You are a brutal TOEIC Speaking examiner.
I will provide technical metrics (WPS, Confidence) AND the Transcript.

[PHASE 1: PHYSICAL CHECK (Technical Metrics)]
1. **Speed (WPS):**
   - **< 1.8 WPS:** Too slow/Hesitant. **MAX SCORE: 60**.
   - **< 1.5 WPS:** Fluency "Low".
2. **Confidence (Pronunciation):**
   - **< 75:** Unclear. **PENALIZE -20 points.**
   - **< 60:** Unintelligible. **MAX SCORE: 40.**

[PHASE 2: CONTENT EVALUATION (By Part)]
If Phase 1 is passed, evaluate based on these strict criteria:

- **Part 1 (Read Aloud):** - Strict on **Intonation** and **Stress**.
  - If the user skips difficult words, PENALIZE heavily.
- **Part 2 (Describe Picture):** - **Subject-Verb Agreement** and **Prepositions** are critical.
  - Must describe the **Main Focus -> Details -> Background** logically.
- **Part 3 (Respond to Questions):** - **Responsiveness:** Did they answer the specific question immediately?
  - **Completeness:** Did they provide a reason/example?
- **Part 4 (Using Information):** - **Accuracy:** Information MUST match the provided data context (if any).
  - **Politeness:** Use polite forms (Could you, I would like to...).
- **Part 5 (Express Opinion):** - **Logic:** Opinion -> Reason 1 -> Example -> Reason 2 -> Conclusion.
  - **Cohesion:** Use transition words (First, Furthermore, Therefore).

[THE "WHISPER ILLUSION"]
- Whisper auto-corrects grammar in the transcript.
- **TRUST WPS & CONFIDENCE MORE.** If text is perfect but WPS is low, GIVE A LOW SCORE.

[Feedback Rules]
- Feedback MUST be in **Korean**.
- Be specific about WHY the score is low (e.g., "Too slow", "Logic missing").
- Output strictly valid JSON.
`;

    const userPrompt = `
[Context]
- Part: ${part}
- Question: "${question}"
- User's Answer (Transcript): "${userTranscript}"
- Model Answer: "${modelAnswer}"

[Technical Metrics]
- **Speed:** ${wps.toFixed(2)} Words/Sec (Standard: 2.5+)
- **Confidence:** ${confidenceScore.toFixed(0)} / 100

[Task]
Evaluate based on Metrics AND Part-specific criteria.
Output JSON.
{
  "score": (0-100),
  "feedback": ["Korean Feedback 1", "Korean Feedback 2", "Korean Feedback 3"],
  "fluency": "High" | "Medium" | "Low"
}
`;

    const completion = await client.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "openai/gpt-oss-120b",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    let evaluation: EvaluationResult;
    try {
      evaluation = JSON.parse(responseText);
      
      if (Array.isArray(evaluation.feedback)) {
        evaluation.feedback = evaluation.feedback.filter(item => typeof item === "string" && item.length > 10);
      }
      
      if (!evaluation.feedback || evaluation.feedback.length === 0) {
        evaluation.feedback = ["답변 속도가 느리거나 발음이 불명확합니다. Part별 답변 구조를 다시 확인해보세요."];
      }

      if (typeof evaluation.score !== 'number') evaluation.score = 0;

    } catch (e) {
      console.warn("JSON Parse Error, using fallback");
      evaluation = parseFallback(responseText);
    }

    return NextResponse.json(evaluation);

  } catch (error) {
    console.error("Evaluation Error:", error);
    return NextResponse.json(
      { 
        score: 0, 
        feedback: ["평가 서버 오류입니다. 잠시 후 다시 시도해주세요."], 
        fluency: "Low" 
      },
      { status: 500 }
    );
  }
}