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
    const { part, question, answer, modelAnswer, image } = body;

    if (!answer || answer.trim().length === 0) {
      return NextResponse.json({
        score: 0,
        feedback: ["음성이 인식되지 않았습니다."],
        fluency: "Low",
      });
    }

    const imageContext = image ? `- Context Image/Chart URL: "${image}"` : "";
    const prompt = `
You are a strict TOEIC Speaking examiner. Evaluate the user's spoken response based on the official criteria.

[Important Context]
- The "User's Answer" provided below is a **raw Speech-to-Text (STT) transcript**.
- **It typically lacks punctuation (periods, commas) and capitalization.**
- **DO NOT** penalize or give feedback regarding missing punctuation, sentence division, or text formatting.
- **DO NOT** say "sentences are connected in a single line". Treat the text as a continuous stream of speech.
- Focus purely on the spoken content, flow, grammar, and vocabulary.
- Give feedbacks in Korean.

[Context]
- Part: ${part}
- Question/Prompt: "${question}"
${imageContext}
- User's Answer (Transcript): "${answer}"
- Model Answer (Reference): "${modelAnswer}"

[Scoring Criteria]
- Part 1 (Read a Text Aloud): Focus on Pronunciation, Intonation, Stress.
- Part 2 (Describe a Picture): Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency
- Part 3 (Respond to Questions): Focus on Pronunciation, Intonation, Stress, Relevance to the problem, Appropriateness and completeness of the content
- Part 4 (Respond to Questions Using Information Provided): Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content
- Part 5 (Give a Opinion): Focus on Pronunciation, Intonation, Stress, Grammar, Vocabulary, Consistency, Relevance to the problem, Appropriateness and completeness of the content

[Task]
Analyze the "User's Answer" and provide a response in the following strictly valid JSON format ONLY. Do not add any conversational text.

{
  "score": (integer 0-100),
  "feedback": ["Specific advice 1", "Specific advice 2", "Specific advice 3"],
  "fluency": "High" | "Medium" | "Low"
}`;

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