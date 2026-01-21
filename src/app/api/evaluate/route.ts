import { NextResponse } from "next/server";
import { Client } from "@gradio/client";

interface EvaluationResult {
  score: number;
  feedback: string[];
  fluency: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { part, question, answer, modelAnswer } = body;

    if (!answer || answer.trim().length === 0) {
      return NextResponse.json({
        score: 0,
        feedback: ["음성이 인식되지 않았습니다."],
        fluency: "Low",
      });
    }

    const prompt = `
You are a strict TOEIC Speaking examiner. Evaluate the user's spoken response based on the official criteria.

[Context]
- Part: ${part}
- Question/Prompt: "${question}"
- User's Answer (Transcript): "${answer}"
- Model Answer (Reference): "${modelAnswer}"

[Scoring Criteria]
- Part 1-2 (Read/Describe): Focus on Pronunciation, Intonation, Stress.
- Part 3-5 (Respond/Express Opinion): Focus on Content relevance, Grammar, Vocabulary, Cohesion, and Completeness.

[Task]
Analyze the "User's Answer" and provide a response in the following strictly valid JSON format ONLY. Do not add any conversational text.

{
  "score": (integer 0-100),
  "feedback": ["point 1", "point 2", "point 3"],
  "fluency": "Excellent" | "Good" | "Needs Improvement"
}
`;

    const client = await Client.connect("amd/gpt-oss-120b-chatbot");
    const result = await client.predict("/chat", { 
      message: prompt 
    });

    const responseText = (result.data as any)[0];
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    let evaluation: EvaluationResult;
    try {
      evaluation = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      evaluation = {
        score: 50,
        feedback: ["AI 응답 형식을 해석할 수 없습니다. 내용: " + responseText.substring(0, 50) + "..."],
        fluency: "Unknown"
      };
    }

    return NextResponse.json(evaluation);

  } catch (error) {
    console.error("Evaluation Error:", error);
    return NextResponse.json(
      { error: "Failed to evaluate response" },
      { status: 500 }
    );
  }
}