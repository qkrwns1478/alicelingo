import { get } from 'fast-levenshtein';

// 숫자 -> 단어 변환 맵
const numberMap: { [key: string]: string } = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
  '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
  '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty',
  '40': 'forty', '50': 'fifty', '60': 'sixty', '70': 'seventy',
  '80': 'eighty', '90': 'ninety'
};

export const calculateSimilarity = (original: string, userSpoken: string, confidence: number = 1.0): number => {
  // 1. 정규화 함수
  const normalize = (str: string) => {
    let s = str.toLowerCase();
    
    // 시간 포맷 처리 (예: 9:00 -> 9)
    s = s.replace(/(\d{1,2}):00/g, '$1');
    
    // 숫자를 단어로 변환 (예: 5 -> five)
    s = s.replace(/\b\d+\b/g, (match) => numberMap[match] || match);
    
    // 특수문자 제거 및 공백 정리
    return s.replace(/[^\w\s]/g, '').trim();
  };
  
  const str1 = normalize(original);
  const str2 = normalize(userSpoken);

  if (str1.length === 0) return 0;

  // 2. Levenshtein 거리 계산
  const distance = get(str1, str2);
  
  // 3. 유사도 퍼센트 계산
  const maxLength = Math.max(str1.length, str2.length);
  let similarity = ((maxLength - distance) / maxLength) * 100;

  // 4. 발음 정확도(Confidence) 보정
  // 텍스트가 100% 일치하더라도 인식 신뢰도가 낮으면(발음이 부정확하면) 점수 조정
  // 예: 신뢰도가 0.6이면 100점 -> 88점 (70 + 18)
  if (similarity === 100 && confidence < 0.9) {
    similarity = 70 + (30 * confidence);
  }

  return Math.max(0, Math.floor(similarity));
};