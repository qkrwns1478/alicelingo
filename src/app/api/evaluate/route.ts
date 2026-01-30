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
        .filter(item => item.length > 5);
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
    const { part, question, audioData, modelAnswer, image } = body;

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

    let activeDuration = transcription.duration || 1;
    if (transcription.segments && transcription.segments.length > 0) {
      const firstStart = transcription.segments[0].start;
      const lastEnd = transcription.segments[transcription.segments.length - 1].end;
      const speechDuration = lastEnd - firstStart;
      activeDuration = speechDuration > 0.5 ? speechDuration : activeDuration;
    }
    const wordCount = userTranscript.trim().split(/\s+/).length;
    const wps = wordCount / activeDuration; 
    
    let confidenceScore = 0;
    if (transcription.segments && transcription.segments.length > 0) {
      const totalLogprob = transcription.segments.reduce((acc: number, seg: any) => acc + (seg.avg_logprob || 0), 0);
      const avgLogprob = totalLogprob / transcription.segments.length;
      confidenceScore = Math.max(0, 100 + (avgLogprob * 40)); 
    } else {
      confidenceScore = 80;
    }

    if (!userTranscript || userTranscript.length < 2 || userTranscript.match(/^[. ]*$/)) {
      return NextResponse.json({
        score: 0,
        feedback: ["음성이 명확하지 않습니다. 더 크게 말씀해 주세요."],
        fluency: "Low"
      });
    }

    const imageContext = image ? `- Context Image: Provided (URL: ${image})` : "- Context Image: None";

    const systemPrompt = `
You are a strict TOEIC Speaking examiner.

[PHASE 1: PHYSICAL CHECK (Pass/Fail)]
1. **Speed (WPS):**
   - **< 1.5 WPS:** Slightly Slow.
   - **< 1.0 WPS:** Too slow. **MAX SCORE: 60**.
2. **Confidence (Pronunciation):**
   - **< 70:** Unclear pronunciation. **PENALIZE SCORE.**
   - **< 50:** Unintelligible. **MAX SCORE: 40.**

[PHASE 2: CONTENT EVALUATION (CRITICAL)]
1. **IMAGE CONTEXT:** If the context says an image is provided, you cannot see it but must assume the user is describing that image. If the context says “None”, skip image‑specific checks.
2. **ROLE OF MODEL ANSWER:** When an image is provided, use the Model Answer **ONLY as a “Scene Description Reference”** to understand what objects/actions are in the picture.
   - **DO NOT** compare the user's sentence structure or vocabulary choices to the Model Answer.
   - **IF** the user describes the same scene (relevant objects/actions) but in a completely different way, **GIVE FULL CREDIT**.
3. **IGNORE Capitalization & Punctuation.**

[SCORING CRITERIA]
- **Part 1 (Read a Text Aloud):** Focus on Pronunciation, Intonation, Stress.
- **Part 2 (Describe a Picture):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency
- **Part 3 (Respond to Questions):** Focus on Pronunciation, Intonation, Stress, Relevance to the problem, Appropriateness and completeness of the content
- **Part 4 (Respond to Questions Using Information Provided):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content
- **Part 5 (Give a Opinion):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content

[Feedback Rules]
- Feedback MUST be in **Korean**.
- Output strictly valid JSON.
`;

    const userPrompt = `
[Context]
- Part: ${part}
- Question: "${question}"
${imageContext} 
- User's Answer (Transcript): "${userTranscript}"
- Model Answer (SCENE REFERENCE ONLY - Do NOT Compare Syntax): "${modelAnswer}"

[Technical Metrics]
- **Speed:** ${wps.toFixed(2)} Words/Sec
- **Confidence:** ${confidenceScore.toFixed(0)} / 100

[Task]
Evaluate based on Metrics AND Content Relevance.
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
        evaluation.feedback = evaluation.feedback.filter(item => typeof item === "string" && item.length > 5);
      }
      
      if (!evaluation.feedback || evaluation.feedback.length === 0) {
        evaluation.feedback = ["답변 내용을 분석할 수 없습니다. 조금 더 명확하게 말씀해 주세요."];
      }

      if (typeof evaluation.score !== 'number') evaluation.score = 0;

      if (evaluation.score >= 90) evaluation.fluency = "High";
      else if (evaluation.score >= 50) evaluation.fluency = "Medium";
      else evaluation.fluency = "Low";

    } catch (e) {
      evaluation = parseFallback(responseText);
    }

    return NextResponse.json(evaluation);

  } catch (error) {
    return NextResponse.json(
      { 
        score: 0, 
        feedback: ["평가 서버 오류입니다. 잠시 후 다시 시도해주세요."], 
        fluency: "Unknown" 
      },
      { status: 500 }
    );
  }
}