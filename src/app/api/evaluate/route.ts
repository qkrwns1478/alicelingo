import { NextResponse } from "next/server";
import { Client } from "@gradio/client";

interface EvaluationResult {
  score: number;
  feedback: string[];
  fluency: string;
}

// AI 응답이 JSON 형식이 아닐 경우 강제로 데이터를 추출하는 함수
function parseFallback(text: string): EvaluationResult {
  console.log("Attempting fallback parsing for:", text);

  const scoreMatch = text.match(/"?score"?\s*:\s*(\d+)/i);
  let score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  const fluencyMatch = text.match(/"?fluency"?\s*:\s*["']?(High|Medium|Low)["']?/i);
  const fluency = fluencyMatch ? fluencyMatch[1] : "Low";

  let feedback: string[] = [];

  const arrayMatch = text.match(/"?feedback"?\s*:\s*\[([\s\S]*?)\]/);
  if (arrayMatch && arrayMatch[1]) {
    const items = arrayMatch[1].match(/"([^"]*)"|'([^']*)'/g);
    if (items) {
      feedback = items
        .map(item => item.replace(/^["']|["']$/g, "").trim())
        .filter(item => {
          if (item.length < 3) return false;
          if (item.includes("...")) return false;
          if (item.includes("We need to evaluate")) return false;
          if (item.includes("User's answer")) return false;
          return true;
        });
    }
  }

  if (feedback.length === 0) {
    const bulletMatches = text.match(/[-*]\s+(.*)/g);
    if (bulletMatches) {
      feedback = bulletMatches
        .map(line => line.replace(/^[-*]\s+/, "").trim())
        .filter(line => {
            if (line.startsWith("{") || line.includes('"score":')) return false; 
            if (line.toLowerCase().includes("we need to evaluate")) return false;
            if (line.includes("User's answer")) return false;
            if (line.includes("Analysis:")) return false;
            if (line.length < 5) return false;
            if (line.includes("...")) return false;
            return true;
        });
    }
  }

  if (feedback.length === 0) {
    feedback = ["AI가 구체적인 피드백을 생성하지 못했습니다. (내용 없음)"];
  }

  return { score, feedback, fluency };
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

[CRITICAL INSTRUCTIONS]
1. **STT Artifacts:** "10:00" instead of "10" is NOT an error. Ignore formatting. Focus on meaning.
2. **Self-Correction:** If the user corrects themselves (e.g., "a day... a week"), grade the FINAL phrase ("a week").
3. **JSON ONLY:** Output ONLY the valid JSON object. NO "Analysis:", NO "Here is the result:", NO bullet points before the JSON. Start immediately with '{'.

[Evaluation Focus]
- **NO PLACEHOLDERS:** Do NOT output "..." or "Specific advice". Write actual feedback sentences.
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
Analyze the "User's Answer" and provide a response in the following strictly valid JSON format ONLY.
**IMPORTANT:** Output ONLY the JSON object. Do NOT include any introduction, "Analysis:", "Thinking:", markdown code blocks (\`\`\`json), or explanations.

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
    console.log("Raw AI Response:", responseText);

    let evaluation: EvaluationResult;
    
    try {
      let jsonStr = responseText;
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "");

      const firstOpen = jsonStr.indexOf("{");
      const lastClose = jsonStr.lastIndexOf("}");

      if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
        jsonStr = jsonStr.substring(firstOpen, lastClose + 1);
        evaluation = JSON.parse(jsonStr);
      } else {
        throw new Error("Cannot find JSON brackets");
      }
      
      if (typeof evaluation.score !== 'number' || !Array.isArray(evaluation.feedback)) {
        throw new Error("Missing required fields");
      }

      const isLazyResponse = evaluation.feedback.some(f => f.includes("...") || f.length < 3);
      if (isLazyResponse) {
        throw new Error("Detected lazy response (placeholders)");
      }

    } catch (e) {
      console.warn("JSON Parse Error or Invalid Content, switching to regex fallback:", e);
      evaluation = parseFallback(responseText);
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