import { get } from 'fast-levenshtein';

export interface FeedbackResult {
  score: number;
  grammarFeedback: string[];
  missingKeywords: string[];
  fluency: string;
}

export const analyzeSpeech = (original: string, userSpoken: string): FeedbackResult => {
  const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const orgNorm = normalize(original);
  const userNorm = normalize(userSpoken);

  // 1. 점수 계산 (Levenshtein Distance)
  const distance = get(orgNorm, userNorm);
  const maxLength = Math.max(orgNorm.length, userNorm.length);
  const rawScore = maxLength === 0 ? 0 : ((maxLength - distance) / maxLength) * 100;
  const score = Math.max(0, Math.floor(rawScore));

  // 2. 키워드 분석 (간단한 형태소 분석 시뮬레이션)
  const orgWords = orgNorm.split(/\s+/);
  const userWords = userNorm.split(/\s+/);
  const missingKeywords = orgWords.filter(word => !userWords.includes(word) && word.length > 3);

  // 3. 문법/정확도 피드백 생성 (규칙 기반 시뮬레이션)
  const grammarFeedback: string[] = [];
  
  if (score === 100) {
    grammarFeedback.push("완벽합니다! 문법과 어휘가 정확해요.");
  } else if (score > 80) {
    grammarFeedback.push("아주 훌륭해요. 사소한 차이만 있었습니다.");
  } else {
    if (Math.abs(orgWords.length - userWords.length) > 3) {
      grammarFeedback.push("문장의 길이가 원문과 많이 다릅니다. 내용을 더 보충해보세요.");
    }
    if (missingKeywords.length > 0) {
      grammarFeedback.push(`핵심 단어 누락: '${missingKeywords.slice(0, 3).join("', '")}' 등이 들리지 않았어요.`);
    }
  }

  // 4. 유창성 평가 (단어 수와 길이로 대략적 추정)
  let fluency = "Good";
  if (userNorm.length < orgNorm.length * 0.5) fluency = "Needs Practice (Too Short)";
  else if (score > 90) fluency = "Excellent";
  else if (score > 70) fluency = "Great";

  return { score, grammarFeedback, missingKeywords, fluency };
};