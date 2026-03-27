"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import problemData from "../../data/problems.json";

type PartKey = "part1" | "part2" | "part3" | "part4" | "part5";
type QuestionType = "text" | "image" | "image_text";
type ExamView = "landing" | "running";
type ExamPhase =
  | "idle"
  | "directions"
  | "question_tts"
  | "listening"
  | "prep"
  | "recording"
  | "submitting"
  | "finalizing"
  | "completed";

interface DirectionCard {
  title: string;
  lines: string[];
  tts: string;
}

interface ExamQuestion {
  id: string;
  number: number;
  partKey: PartKey;
  partNumber: number;
  type: QuestionType;
  content: string;
  subText?: string;
  modelAnswer: string;
  prepTime: number;
  responseTime: number;
  promptLabel?: string;
  contextText?: string;
}

interface AnswerResult {
  questionId: string;
  status: "pending" | "scored" | "error";
  score: number | null;
  feedback: string[];
  fluency: string;
  userTranscript: string;
  updatedAt: string;
}

interface FinalResult {
  weightedRawScore: number;
  scaledScore: number;
  level: string;
  partAverages: Record<PartKey, number>;
}

interface ExamSession {
  version: 1;
  examId: string;
  createdAt: string;
  completedAt?: string;
  currentQuestionIndex: number;
  questions: ExamQuestion[];
  answers: Record<string, AnswerResult>;
  finalResult?: FinalResult;
}

interface Part1Source {
  sentence: string;
}

interface Part2Source {
  image: string;
  answer_sheet: string;
}

interface Part3Source {
  question: string;
  sub_q1: string;
  sub_q2: string;
  sub_q3: string;
  sub_a1: string;
  sub_a2: string;
  sub_a3: string;
}

interface Part4Source {
  image: string;
  sub_q1: string;
  sub_q2: string;
  sub_q3: string;
  sub_a1: string;
  sub_a2: string;
  sub_a3: string;
}

interface Part5Source {
  question: string;
  answer_sheet: string;
}

interface ProblemSource {
  part1: Part1Source[];
  part2: Part2Source[];
  part3: Part3Source[];
  part4: Part4Source[];
  part5: Part5Source[];
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

interface EvaluationResponse {
  score?: number;
  feedback?: string[];
  fluency?: string;
  userTranscript?: string;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type BrowserWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

const STORAGE_KEY = "alicelingo_exam_session_v1";
const TOTAL_QUESTIONS = 11;

const PART_DIRECTIONS: Record<PartKey, DirectionCard> = {
  part1: {
    title: "Questions 1-2: Read a text aloud",
    lines: [
      "Directions: In this part of the test, you will read aloud the text on the screen.",
      "You will have 45 seconds to prepare.",
      "Then you will have 45 seconds to read the text aloud.",
    ],
    tts: "In this part of the test, you will read aloud the text on the screen. You will have 45 seconds to prepare. Then you will have 45 seconds to read the text aloud.",
  },
  part2: {
    title: "Questions 3-4: Describe a picture",
    lines: [
      "Directions: In this part of the test, you will describe the picture on the screen.",
      "You will have 45 seconds to prepare.",
      "Then you will have 45 seconds to describe the picture.",
    ],
    tts: "In this part of the test, you will describe the picture on the screen. You will have 45 seconds to prepare. Then you will have 45 seconds to describe the picture.",
  },
  part3: {
    title: "Questions 5-7: Respond to questions",
    lines: [
      "Directions: In this part of the test, you will respond to three questions.",
      "You will have 3 seconds to prepare for each question.",
      "You will have 15 seconds to answer Questions 5 and 6, and 30 seconds for Question 7.",
    ],
    tts: "In this part of the test, you will respond to three questions. You will have 3 seconds to prepare for each question. You will have 15 seconds to answer questions 5 and 6, and 30 seconds for question 7.",
  },
  part4: {
    title: "Questions 8-10: Use provided information",
    lines: [
      "Directions: In this part of the test, you will answer questions using the information provided.",
      "You will have 3 seconds to prepare for each question.",
      "You will have 15 seconds to answer Questions 8 and 9, and 30 seconds for Question 10.",
    ],
    tts: "In this part of the test, you will answer questions using the information provided. You will have 3 seconds to prepare for each question. You will have 15 seconds to answer questions 8 and 9, and 30 seconds for question 10.",
  },
  part5: {
    title: "Question 11: Express an opinion",
    lines: [
      "Directions: In this part of the test, you will express your opinion on a given topic.",
      "You will have 45 seconds to prepare.",
      "Then you will have 60 seconds to respond.",
    ],
    tts: "In this part of the test, you will express your opinion on a given topic. You will have 45 seconds to prepare. Then you will have 60 seconds to respond.",
  },
};

const text = (value: unknown) => (typeof value === "string" ? value.replace(/\\n/g, "\n") : "");
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const pick = <T,>(items: T[], count: number) => shuffle(items).slice(0, Math.min(count, items.length));

const weightByQuestion = (number: number) =>
  ({ 1: 6, 2: 6, 3: 8, 4: 8, 5: 8, 6: 8, 7: 10, 8: 8, 9: 8, 10: 10, 11: 20 }[number] ?? 0);

const levelByScaled = (score: number) => {
  if (score >= 160) return "AL";
  if (score >= 140) return "IH";
  if (score >= 130) return "IM3";
  if (score >= 120) return "IM2";
  if (score >= 110) return "IM1";
  if (score >= 90) return "IL";
  if (score >= 60) return "NH";
  if (score >= 30) return "NM";
  return "NL";
};

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds));
  const hh = String(Math.floor(total / 3600)).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const questionPromptForEval = (question: ExamQuestion) => {
  if (question.type === "image_text") return question.subText || "Use the information to answer.";
  if (question.type === "image") return "Describe this image in detail.";
  return question.content;
};

const questionReadText = (question: ExamQuestion) => {
  if (question.partKey === "part1") return "";
  if (question.partKey === "part2") return "Please describe the picture in detail.";
  if (question.partKey === "part4") return question.subText || "Please answer using the information.";
  return question.content;
};

const createQuestions = (examId: string): ExamQuestion[] => {
  const source = problemData as ProblemSource;
  const questions: ExamQuestion[] = [];
  let no = 1;

  pick(source.part1, 2).forEach((item) => {
    questions.push({
      id: `${examId}_q${no}`,
      number: no,
      partKey: "part1",
      partNumber: 1,
      type: "text",
      content: text(item.sentence),
      modelAnswer: text(item.sentence),
      prepTime: 45,
      responseTime: 45,
    });
    no += 1;
  });

  pick(source.part2, 2).forEach((item) => {
    questions.push({
      id: `${examId}_q${no}`,
      number: no,
      partKey: "part2",
      partNumber: 2,
      type: "image",
      content: text(item.image),
      modelAnswer: text(item.answer_sheet),
      prepTime: 45,
      responseTime: 45,
      promptLabel: "Describe the picture.",
    });
    no += 1;
  });
  const part3Set = pick(source.part3, 1)[0];
  [
    { q: part3Set.sub_q1, a: part3Set.sub_a1, t: 15 },
    { q: part3Set.sub_q2, a: part3Set.sub_a2, t: 15 },
    { q: part3Set.sub_q3, a: part3Set.sub_a3, t: 30 },
  ].forEach((item) => {
    questions.push({
      id: `${examId}_q${no}`,
      number: no,
      partKey: "part3",
      partNumber: 3,
      type: "text",
      content: text(item.q),
      modelAnswer: text(item.a),
      prepTime: 3,
      responseTime: item.t,
      promptLabel: "Respond to the question.",
      contextText: text(part3Set.question),
    });
    no += 1;
  });

  const part4Set = pick(source.part4, 1)[0];
  [
    { q: part4Set.sub_q1, a: part4Set.sub_a1, t: 15 },
    { q: part4Set.sub_q2, a: part4Set.sub_a2, t: 15 },
    { q: part4Set.sub_q3, a: part4Set.sub_a3, t: 30 },
  ].forEach((item) => {
    questions.push({
      id: `${examId}_q${no}`,
      number: no,
      partKey: "part4",
      partNumber: 4,
      type: "image_text",
      content: text(part4Set.image),
      subText: text(item.q),
      modelAnswer: text(item.a),
      prepTime: 3,
      responseTime: item.t,
      promptLabel: "Use the provided information.",
    });
    no += 1;
  });

  const part5 = pick(source.part5, 1)[0];
  questions.push({
    id: `${examId}_q${no}`,
    number: no,
    partKey: "part5",
    partNumber: 5,
    type: "text",
    content: text(part5.question),
    modelAnswer: text(part5.answer_sheet),
    prepTime: 45,
    responseTime: 60,
    promptLabel: "Give your opinion with reasons.",
  });

  return questions;
};

const createSession = (): ExamSession => {
  const examId = `exam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    version: 1,
    examId,
    createdAt: new Date().toISOString(),
    currentQuestionIndex: 0,
    questions: createQuestions(examId),
    answers: {},
  };
};

const isSession = (value: unknown): value is ExamSession => {
  if (!value || typeof value !== "object") return false;
  const session = value as ExamSession;
  return session.version === 1 && Array.isArray(session.questions) && session.questions.length === TOTAL_QUESTIONS;
};

const normalizeAnswers = (questions: ExamQuestion[], answers: Record<string, AnswerResult>) => {
  const next = { ...answers };
  const now = new Date().toISOString();

  questions.forEach((question) => {
    const found = next[question.id];
    if (!found || found.status === "pending" || found.score === null) {
      next[question.id] = {
        questionId: question.id,
        status: "error",
        score: 0,
        feedback: ["Scoring was not completed for this response."],
        fluency: "Low",
        userTranscript: found?.userTranscript || "",
        updatedAt: now,
      };
    }
  });

  return next;
};

const calcFinal = (questions: ExamQuestion[], answers: Record<string, AnswerResult>): FinalResult => {
  const weightedRawScore = Number(
    questions.reduce((acc, q) => acc + ((answers[q.id]?.score ?? 0) * weightByQuestion(q.number)) / 100, 0).toFixed(2)
  );
  const scaledScore = Math.max(0, Math.min(200, Math.round((weightedRawScore * 2) / 10) * 10));
  const level = levelByScaled(scaledScore);
  const partAverages: Record<PartKey, number> = { part1: 0, part2: 0, part3: 0, part4: 0, part5: 0 };

  (["part1", "part2", "part3", "part4", "part5"] as PartKey[]).forEach((part) => {
    const subset = questions.filter((q) => q.partKey === part);
    const sum = subset.reduce((acc, q) => acc + (answers[q.id]?.score ?? 0), 0);
    partAverages[part] = subset.length ? Math.round(sum / subset.length) : 0;
  });

  return { weightedRawScore, scaledScore, level, partAverages };
};

export default function ExamPage() {
  const router = useRouter();

  const [view, setView] = useState<ExamView>("landing");
  const [session, setSession] = useState<ExamSession | null>(null);
  const [savedSession, setSavedSession] = useState<ExamSession | null>(null);
  const [phase, setPhase] = useState<ExamPhase>("idle");
  const [timeLeft, setTimeLeft] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [startError, setStartError] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef("");
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recordingRef = useRef(false);
  const mountedRef = useRef(false);
  const transitionRef = useRef(false);
  const flowTokenRef = useRef(0);
  const sessionRef = useRef<ExamSession | null>(null);
  const startedQuestionIdRef = useRef<string | null>(null);
  const jobsRef = useRef<Record<string, Promise<void>>>({});

  const currentQuestion = useMemo(() => {
    if (!session) return null;
    return session.questions[session.currentQuestionIndex] || null;
  }, [session]);

  const currentDirections = useMemo(() => {
    if (!currentQuestion) return null;
    return PART_DIRECTIONS[currentQuestion.partKey];
  }, [currentQuestion]);
  const isDirectionsPhase = phase === "directions" && !!currentDirections;

  const updateAnswer = useCallback((questionId: string, result: AnswerResult) => {
    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, answers: { ...prev.answers, [questionId]: result } };
    });
  }, []);
  const ensureMicrophoneReady = useCallback(async () => {
    if (streamRef.current && streamRef.current.active) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return true;
    } catch {
      setStartError("마이크 권한이 필요합니다. 브라우저 설정을 확인해 주세요.");
      return false;
    }
  }, []);

  const playBeep = useCallback(() => {
    return new Promise<void>((resolve) => {
      try {
        const AudioContextRef = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
        if (!AudioContextRef) {
          resolve();
          return;
        }
        const context = new AudioContextRef();
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.connect(gain);
        gain.connect(context.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(523, context.currentTime);
        gain.gain.setValueAtTime(0.1, context.currentTime);
        osc.start();
        osc.stop(context.currentTime + 0.4);
        setTimeout(() => {
          try {
            context.close();
          } catch {}
          resolve();
        }, 450);
      } catch {
        resolve();
      }
    });
  }, []);

  const playTTS = useCallback(
    (speakText: string, gender: "male" | "female" = "female") =>
      new Promise<void>((resolve) => {
        if (!mountedRef.current || !speakText.trim()) {
          resolve();
          return;
        }

        const synth = window.speechSynthesis;
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(speakText);
        utterance.lang = "en-US";
        utterance.rate = gender === "male" ? 1.0 : 0.9;
        utterance.pitch = gender === "male" ? 0.85 : 1.0;

        const preferredVoice = voices.find((voice) => {
          if (gender === "male") return voice.name.toLowerCase().includes("male");
          return voice.lang === "en-US";
        });
        if (preferredVoice) utterance.voice = preferredVoice;

        currentUtteranceRef.current = utterance;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synth.speak(utterance);
      }),
    [voices]
  );

  const isActiveQuestionFlow = useCallback((questionId: string, token: number) => {
    const activeSession = sessionRef.current;
    if (!mountedRef.current || flowTokenRef.current !== token || !activeSession) return false;
    const activeQuestion = activeSession.questions[activeSession.currentQuestionIndex];
    return activeQuestion?.id === questionId;
  }, []);

  const stopCurrentRecording = useCallback(async () => {
    recordingRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {}

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    mediaRecorderRef.current = null;
  }, []);

  const evaluateAsync = useCallback(
    (question: ExamQuestion, audioBase64: string, transcriptDraft: string) => {
      const job = (async () => {
        try {
          const response = await fetch("/api/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              part: question.partNumber,
              question: questionPromptForEval(question),
              image: question.type === "image" || question.type === "image_text" ? question.content : undefined,
              audioData: audioBase64,
              modelAnswer: question.modelAnswer,
            }),
          });

          if (!response.ok) throw new Error("evaluation failed");
          const data = (await response.json()) as EvaluationResponse;
          const cleanedTranscript = (data.userTranscript || transcriptDraft || "")
            .replace(/(\bThank you\.?|\bThanks for watching\.?|\bMBC News\.?)/gi, "")
            .replace(/\s+/g, " ")
            .trim();

          updateAnswer(question.id, {
            questionId: question.id,
            status: "scored",
            score: clamp(data.score ?? 0),
            feedback: Array.isArray(data.feedback) ? data.feedback : ["피드백을 불러오지 못했습니다."],
            fluency: data.fluency || "N/A",
            userTranscript: cleanedTranscript,
            updatedAt: new Date().toISOString(),
          });
        } catch {
          updateAnswer(question.id, {
            questionId: question.id,
            status: "error",
            score: 0,
            feedback: ["AI 채점에 실패했습니다."],
            fluency: "Low",
            userTranscript: transcriptDraft,
            updatedAt: new Date().toISOString(),
          });
        } finally {
          delete jobsRef.current[question.id];
        }
      })();
      jobsRef.current[question.id] = job;
    },
    [updateAnswer]
  );

  const finalizeExam = useCallback(async () => {
    setPhase("finalizing");
    setMessage("남은 채점을 마무리하는 중입니다...");

    const jobs = Object.values(jobsRef.current);
    if (jobs.length > 0) await Promise.allSettled(jobs);

    setSession((prev) => {
      if (!prev) return prev;
      const answers = normalizeAnswers(prev.questions, prev.answers);
      return {
        ...prev,
        answers,
        finalResult: calcFinal(prev.questions, answers),
        completedAt: new Date().toISOString(),
      };
    });

    setMessage("");
    setPhase("completed");
  }, []);
  const submitCurrentQuestion = useCallback(async () => {
    if (transitionRef.current || !sessionRef.current) return;
    transitionRef.current = true;

    const activeSession = sessionRef.current;
    const question = activeSession.questions[activeSession.currentQuestionIndex];
    if (!question) {
      transitionRef.current = false;
      return;
    }

    setPhase("submitting");
    await stopCurrentRecording();

    if (audioChunksRef.current.length === 0) {
      updateAnswer(question.id, {
        questionId: question.id,
        status: "error",
        score: 0,
        feedback: ["녹음된 음성이 없어 0점 처리되었습니다."],
        fluency: "Low",
        userTranscript: "",
        updatedAt: new Date().toISOString(),
      });
    } else {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const transcriptDraft = (finalTranscriptRef.current || userTranscript).trim();
      updateAnswer(question.id, {
        questionId: question.id,
        status: "pending",
        score: null,
        feedback: ["채점 중입니다..."],
        fluency: "Pending",
        userTranscript: transcriptDraft,
        updatedAt: new Date().toISOString(),
      });
      evaluateAsync(question, audioBase64, transcriptDraft);
    }

    audioChunksRef.current = [];
    finalTranscriptRef.current = "";
    setUserTranscript("");

    if (question.number === TOTAL_QUESTIONS) {
      await finalizeExam();
      transitionRef.current = false;
      return;
    }

    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 };
    });
    startedQuestionIdRef.current = null;
    setPhase("idle");
    setTimeLeft(0);
    setMessage("");
    transitionRef.current = false;
  }, [evaluateAsync, finalizeExam, stopCurrentRecording, updateAnswer, userTranscript]);

  const startRecordingForQuestion = useCallback(
    async (question: ExamQuestion) => {
      if (transitionRef.current) return;
      transitionRef.current = true;
      const token = flowTokenRef.current;

      setPhase("listening");
      setMessage("답변 녹음을 시작합니다...");
      await playTTS("Begin speaking now.", "male");
      if (!isActiveQuestionFlow(question.id, token)) {
        transitionRef.current = false;
        return;
      }
      await playBeep();
      if (!isActiveQuestionFlow(question.id, token)) {
        transitionRef.current = false;
        return;
      }

      const micReady = await ensureMicrophoneReady();
      if (!micReady || !isActiveQuestionFlow(question.id, token) || !streamRef.current) {
        setPhase("idle");
        transitionRef.current = false;
        return;
      }

      recordingRef.current = true;
      finalTranscriptRef.current = "";
      setUserTranscript("");
      audioChunksRef.current = [];

      try {
        recognitionRef.current?.abort();
      } catch {}

      setTimeout(() => {
        if (recordingRef.current && isActiveQuestionFlow(question.id, token)) {
          try {
            recognitionRef.current?.start();
          } catch {}
        }
      }, 100);

      try {
        const mimeType = "audio/webm";
        const recorder = MediaRecorder.isTypeSupported?.(mimeType)
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current);

        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };
        recorder.start();

        setPhase("recording");
        setTimeLeft(question.responseTime);
        setMessage("");
      } catch {
        recordingRef.current = false;
        setPhase("idle");
        setMessage("녹음을 시작하지 못했습니다.");
      }

      transitionRef.current = false;
    },
    [ensureMicrophoneReady, isActiveQuestionFlow, playBeep, playTTS]
  );

  const beginQuestionFlow = useCallback(
    async (question: ExamQuestion, index: number) => {
      const token = Date.now();
      flowTokenRef.current = token;

      setPhase("question_tts");
      setMessage(`Question ${question.number} 안내 중...`);

      const prevQuestion = index > 0 ? sessionRef.current?.questions[index - 1] : null;
      const isPartChanged = !prevQuestion || prevQuestion.partKey !== question.partKey;

      if (isPartChanged) {
        setPhase("directions");
        setMessage("Directions");
        await playTTS(PART_DIRECTIONS[question.partKey].tts, "female");
        if (!isActiveQuestionFlow(question.id, token)) return;
      }

      setPhase("question_tts");
      setMessage(`Question ${question.number}`);

      if (isPartChanged && question.contextText) {
        await playTTS(question.contextText, "female");
        if (!isActiveQuestionFlow(question.id, token)) return;
      }

      const toRead = questionReadText(question);
      if (toRead) {
        await playTTS(toRead, "female");
        if (!isActiveQuestionFlow(question.id, token)) return;
      }

      await playTTS("Begin preparing now.", "male");
      if (!isActiveQuestionFlow(question.id, token)) return;
      await playBeep();
      if (!isActiveQuestionFlow(question.id, token)) return;

      setPhase("prep");
      setTimeLeft(question.prepTime);
      setMessage("");
    },
    [isActiveQuestionFlow, playBeep, playTTS]
  );

  const startNewExam = useCallback(async () => {
    setStartError("");
    const micReady = await ensureMicrophoneReady();
    if (!micReady) return;

    const next = createSession();
    setSession(next);
    setSavedSession(next);
    setView("running");
    setPhase("idle");
    setMessage("");
    setTimeLeft(0);
    setUserTranscript("");
    audioChunksRef.current = [];
    finalTranscriptRef.current = "";
    startedQuestionIdRef.current = null;
  }, [ensureMicrophoneReady]);

  const continueExam = useCallback(async () => {
    if (!savedSession) return;
    setStartError("");
    const micReady = await ensureMicrophoneReady();
    if (!micReady) return;

    setSession(savedSession);
    setView("running");
    setPhase(savedSession.finalResult ? "completed" : "idle");
    setMessage(savedSession.finalResult ? "" : "저장된 위치에서 자동으로 이어집니다.");
    startedQuestionIdRef.current = null;
  }, [ensureMicrophoneReady, savedSession]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setSavedSession(session.finalResult ? null : session);
  }, [session]);

  useEffect(() => {
    if (view !== "running" || phase !== "idle" || !session || !currentQuestion) return;
    if (startedQuestionIdRef.current === currentQuestion.id) return;
    startedQuestionIdRef.current = currentQuestion.id;
    void beginQuestionFlow(currentQuestion, session.currentQuestionIndex);
  }, [beginQuestionFlow, currentQuestion, phase, session, view]);

  useEffect(() => {
    if (phase !== "prep" && phase !== "recording") return;
    const timerId = setInterval(() => {
      setTimeLeft((prev) => (prev <= 0.1 ? 0 : prev - 0.1));
    }, 100);
    return () => clearInterval(timerId);
  }, [phase]);

  useEffect(() => {
    if (timeLeft > 0 || !currentQuestion || view !== "running") return;
    if (phase === "prep") void startRecordingForQuestion(currentQuestion);
    if (phase === "recording") void submitCurrentQuestion();
  }, [currentQuestion, phase, startRecordingForQuestion, submitCurrentQuestion, timeLeft, view]);
  useEffect(() => {
    mountedRef.current = true;

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isSession(parsed) && !parsed.finalResult) setSavedSession(parsed);
        }
      } catch {}

      const browserWindow = window as BrowserWindow;
      const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let interim = "";
          if (event.results.length > 0) {
            const transcript = event.results[0][0].transcript;
            if (event.results[0].isFinal) finalTranscriptRef.current += `${transcript} `;
            else interim = transcript;
          }
          setUserTranscript(`${finalTranscriptRef.current}${interim}`.trim());
        };
        recognition.onend = () => {
          if (recordingRef.current) {
            try {
              recognition.start();
            } catch {}
          }
        };
        recognitionRef.current = recognition;
      }

      const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    setLoading(false);
    return () => {
      mountedRef.current = false;
      recordingRef.current = false;
      transitionRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {}
      window.speechSynthesis.cancel();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
        streamRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex items-center justify-center text-slate-700">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>모의고사 준비 중...</span>
        </div>
      </div>
    );
  }

  if (view === "landing") {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black z-0 pointer-events-none" />

        <header className="h-16 w-full px-6 flex justify-between items-center z-20 bg-slate-900/50 backdrop-blur border-b border-slate-700 flex-none relative">
          <button
            onClick={() => router.push("/")}
            className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Home</span>
          </button>

          <div className="flex flex-col items-end">
            <span className="font-mono text-slate-500 text-xs tracking-wider">EXAM MODE</span>
            <span className="text-sm text-blue-400 font-bold">TOEIC SPEAKING MOCK TEST</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4 z-10 relative">
          <div className="w-full max-w-5xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-full bg-black/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl min-h-[500px] flex flex-col items-center justify-center relative p-6 md:p-10">
              <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20">
                <Play className="w-10 h-10 text-white ml-1" />
              </div>

              <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Mock Test</h2>
              <p className="text-slate-300 text-center max-w-2xl leading-relaxed mb-6">
                Are you ready?
              </p>

              {/* <div className="w-full max-w-2xl p-4 rounded-xl border border-slate-700 bg-slate-900/50 text-sm text-slate-300 mb-6">
                11문항 구성: Part 1(2문항), Part 2(2문항), Part 3(1세트), Part 4(1세트), Part 5(1문항)
              </div> */}

              {startError && (
                <div className="w-full max-w-2xl mb-6 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
                  {startError}
                </div>
              )}

              <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={startNewExam}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-white text-blue-900 font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                >
                  <Play className="w-4 h-4" />
                  시작하기
                </button>

                {savedSession ? (
                  <button
                    onClick={continueExam}
                    className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-slate-800 text-white font-bold border border-slate-600 hover:bg-slate-700 transition-all"
                  >
                    이어서 하기
                  </button>
                ) : (
                  <button
                    disabled
                    className="py-3.5 px-4 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-500 font-bold cursor-not-allowed"
                  >
                    이어서 하기 (저장된 시험 없음)
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (!session || !currentQuestion) {
    return (
      <div className="min-h-screen bg-[#F2F4F8] flex items-center justify-center text-slate-700">
        세션 정보를 불러오지 못했습니다.
      </div>
    );
  }

  if (phase === "completed" && session.finalResult) {
    return (
      <div className="min-h-screen bg-[#f2f2f2] text-[#111]">
        <header className="h-24 bg-gradient-to-r from-[#0d5ea8] via-[#4b4b8a] to-[#9b003f] text-white flex items-end justify-center pb-5">
          <h1 className="text-3xl font-semibold">Mock Test Result</h1>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
          <section className="bg-white border border-[#d6d6d6] rounded-2xl p-8">
            <p className="text-sm text-[#666]">Final Grade</p>
            <div className="flex items-end gap-3 mt-1">
              <span className="text-6xl font-black text-[#1d3557]">{session.finalResult.level}</span>
              <span className="text-2xl font-semibold">{session.finalResult.scaledScore} / 200</span>
            </div>
            <p className="text-sm text-[#555] mt-3">Weighted Raw Score: {session.finalResult.weightedRawScore}</p>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(Object.entries(session.finalResult.partAverages) as [PartKey, number][]).map(([part, value]) => (
              <div key={part} className="bg-white border border-[#d6d6d6] rounded-xl p-4">
                <p className="text-xs uppercase text-[#666] font-bold">{part.toUpperCase()}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setView("landing");
                setSession(null);
                setPhase("idle");
                setMessage("");
              }}
              className="px-6 py-3 rounded-xl bg-[#111] text-white font-semibold hover:opacity-90"
            >
              메인으로
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-[#111] flex flex-col ${isDirectionsPhase ? "bg-[#e8dcc0]" : "bg-[#ececec]"}`}>
      <header className="relative h-24 bg-gradient-to-r from-[#0d5ea8] via-[#4b4b8a] to-[#9b003f] text-white">
        <div className="h-full flex items-end justify-center pb-5">
          <h1 className="text-4xl font-semibold">Question {currentQuestion.number} of 11</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className={`w-full ${isDirectionsPhase ? "" : "max-w-5xl"}`}>
          <p className="sr-only" aria-live="polite">
            {message}
          </p>
          {/* {pendingCount > 0 && (
            <div className="mb-3 px-4 py-3 rounded-lg bg-[#eff6ff] border border-[#bfdbfe] text-sm">
              백그라운드 채점 중: {pendingCount}문항
            </div>
          )}
          {message && <div className="mb-3 px-4 py-3 rounded-lg bg-white border border-[#d6d6d6] text-sm">{message}</div>} */}

          <section className={isDirectionsPhase ? "flex-1 flex items-center justify-center px-6 py-8" : "min-h-[58vh] flex items-center justify-center px-4 py-8"}>
            {isDirectionsPhase && currentDirections ? (
              <div className="w-full max-w-5xl text-center text-[#1f1f1f] px-6">
                <h2 className="text-2xl font-semibold mb-14">{currentDirections.title}</h2>
                {currentDirections.lines.map((line, index) => {
                  const isDirectionLine = index === 0 && line.startsWith("Directions:");
                  if (isDirectionLine) {
                    return (
                      <p key={index} className="text-2xl leading-relaxed mb-6">
                        <span className="font-semibold">Directions:</span> {line.replace("Directions:", "").trim()}
                      </p>
                    );
                  }
                  return (
                    <p key={index} className="text-2xl leading-relaxed mb-6">
                      {line}
                    </p>
                  );
                })}
              </div>
            ) : (
              <div className="max-w-3xl w-full space-y-5">
                {currentQuestion.promptLabel && (
                  <p className="text-lg font-semibold text-[#444]">{currentQuestion.promptLabel}</p>
                )}
                {currentQuestion.contextText && (
                  <p className="text-2xl leading-relaxed whitespace-pre-wrap">{currentQuestion.contextText}</p>
                )}
                {currentQuestion.type === "text" && (
                  <p className="text-2xl leading-relaxed whitespace-pre-wrap">{currentQuestion.content}</p>
                )}
                {currentQuestion.type === "image" && (
                  <img
                    src={currentQuestion.content}
                    alt={`Q${currentQuestion.number}`}
                    className="w-full max-h-[360px] object-contain bg-white border border-[#d6d6d6] rounded-lg"
                  />
                )}
                {currentQuestion.type === "image_text" && (
                  <div className="space-y-4">
                    <img
                      src={currentQuestion.content}
                      alt={`Q${currentQuestion.number}`}
                      className="w-full max-h-[320px] object-contain bg-white border border-[#d6d6d6] rounded-lg"
                    />
                    <p className="text-2xl leading-relaxed whitespace-pre-wrap">{currentQuestion.subText}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={`mt-8 flex flex-col items-center gap-4 ${isDirectionsPhase ? "pb-8" : ""}`}>
            {(phase === "prep" || phase === "recording") && (
              <div className="w-[280px] border border-[#1b1b1b] shadow-lg">
                <div className="bg-[#111] text-white text-center font-bold text-xl tracking-wide py-2">
                  {phase === "prep" ? "PREPARATION TIME" : "RESPONSE TIME"}
                </div>
                <div className="bg-white text-[#333] text-center text-2xl font-mono py-3">{formatClock(timeLeft)}</div>
              </div>
            )}

            {phase === "submitting" && (
              <div className="flex items-center gap-3 text-[#333]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>답변을 제출하고 있습니다...</span>
              </div>
            )}

            {phase === "finalizing" && (
              <div className="flex items-center gap-3 text-[#333]">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>최종 점수를 계산하고 있습니다...</span>
              </div>
            )}

            {/* {phase === "recording" && userTranscript && (
              <div className="w-full max-w-3xl p-4 rounded-xl bg-white border border-[#d6d6d6] text-sm text-slate-600">
                {userTranscript}
              </div>
            )} */}
          </section>
        </div>
      </main>
    </div>
  );
}
