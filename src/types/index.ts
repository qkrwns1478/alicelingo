export interface Sentence {
  english: string;
  korean: string;
}

export interface SentenceData {
  part2: Sentence[];
  part3: Sentence[];
  part4: Sentence[];
  part5: Sentence[];
}

export type PartKey = keyof SentenceData;