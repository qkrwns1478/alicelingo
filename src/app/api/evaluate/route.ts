import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface EvaluationResult {
  score: number;
  feedback: string[];
  fluency: string;
  userTranscript?: string;
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

function getImageAsBase64(imagePathStr: string): string | null {
  try {
    // 1. 이미 완전한 URL인 경우
    if (imagePathStr.startsWith("http")) {
      return imagePathStr; 
    }

    // 2. 로컬 public 폴더 경로인 경우
    if (imagePathStr.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", imagePathStr);
      
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        
        const ext = path.extname(filePath).toLowerCase();
        let mimeType = "image/jpeg";
        if (ext === ".png") mimeType = "image/png";
        else if (ext === ".webp") mimeType = "image/webp";
        else if (ext === ".gif") mimeType = "image/gif";

        const base64Data = fileBuffer.toString("base64");

        return `data:${mimeType};base64,${base64Data}`;
      } else {
        console.warn(`[Vision Warning] Image file not found: ${filePath}`);
      }
    }
    return null;
  } catch (e) {
    console.error("[Vision Error] Failed to read image:", e);
    return null;
  }
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

    const get_criteria = (part: number): string => {
      if (part == 1) return "**Part 1 (Read a Text Aloud):** Focus on Pronunciation, Intonation, Stress.";
      else if (part == 2) return "**Part 2 (Describe a Picture):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency";
      else if (part == 3) return "**Part 3 (Respond to Questions):** Focus on Pronunciation, Intonation, Stress, Relevance to the problem, Appropriateness and completeness of the content";
      else if (part == 4) return "**Part 4 (Respond to Questions Using Information Provided):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content";
      else return "**Part 5 (Give a Opinion):** Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content";
    };

    const base64Image = image ? getImageAsBase64(image) : null;
    const hasImage = !!base64Image;

    const systemPrompt = `
You are a strict TOEIC Speaking examiner.

[CRITICAL INSTRUCTION - IGNORE FORMATTING & NOTATION]
The "User's Answer" provided is a **RAW SPEECH-TO-TEXT TRANSCRIPT**. It naturally contains artifacts like "6pm", "10.30", or missing punctuation.
You must strictly adhere to these **NEGATIVE CONSTRAINTS**:

1. **NO FORMATTING POLICING:** NEVER criticize time formats, date formats, capitalization, or punctuation.
   - **CORRECT:** "The user said 6pm." (Acceptable)
   - **WRONG:** "The user should write '6:00 p.m.' instead of '6pm'." (**FORBIDDEN**)
   - **WRONG:** "Time expression is informal." (**FORBIDDEN**)
2. **SEMANTIC EQUIVALENCE:** Treat "6pm", "6 pm", "6:00 PM", and "18:00" as **IDENTICAL** spoken values. Do not distinguish between them.
3. **NO WRITING ADVICE:** Do not give feedback on how to *write* the answer. Only evaluate how it was *spoken* (content, grammar, pronunciation).
4. **FOCUS ONLY ON:** - **Information Accuracy:** Did they convey the right time/date?
   - **Grammar:** Spoken grammar (e.g., subject-verb agreement), NOT punctuation.
   - **Pronunciation/Fluency:** Based on the metrics provided.

[PHASE 1: PHYSICAL CHECK (Pass/Fail)]
1. **Speed (WPS):**
   - **< 1.5 WPS:** Slightly Slow.
   - **< 1.0 WPS:** Too slow. **MAX SCORE: 60**.
2. **Confidence (Pronunciation):**
   - **< 70:** Unclear pronunciation. **PENALIZE SCORE.**
   - **< 50:** Unintelligible. **MAX SCORE: 40.**

[PHASE 2: CONTENT EVALUATION (CRITICAL)]
1. **IMAGE CONTEXT:** If the context says an image is provided, assume the user is describing it.
2. **ROLE OF MODEL ANSWER:** Use the Model Answer **ONLY as a reference for facts**. 
   - **DO NOT** compare sentence structure.
   - **IF** the user conveys the same *meaning* with different words/structure, **GIVE FULL CREDIT**.

[SCORING CRITERIA]
- ${get_criteria(part)}

[Feedback Rules]
- Feedback MUST be in **Korean**.
- Output strictly valid JSON.
`;

    const userPrompt = `
[Context]
- Part: ${part}
- Question: "${question}"
- User's Answer (Transcript): "${userTranscript}"
- Reference Context: "${modelAnswer}"

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

    const messages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    if (hasImage && base64Image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { 
            type: "image_url", 
            image_url: { 
              url: base64Image 
            } 
          }
        ]
      });
    } else {
      messages.push({
        role: "user",
        content: userPrompt
      });
    }

    const completion = await client.chat.completions.create({
      messages: messages,
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.2,
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
        evaluation.feedback = ["AI가 분석하는 중 오류가 발생했습니다. 다시 시도해 주세요."];
      }

      if (typeof evaluation.score !== 'number') evaluation.score = 0;

      if (evaluation.score >= 90) evaluation.fluency = "High";
      else if (evaluation.score >= 50) evaluation.fluency = "Medium";
      else evaluation.fluency = "Low";

    } catch (e) {
      evaluation = parseFallback(responseText);
    }

    evaluation.userTranscript = userTranscript;

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