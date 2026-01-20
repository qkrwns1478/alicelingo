"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import problemData from "../../../data/problems.json";
import { calculateSimilarity } from "../../../utils/scoring";
import Timer from "../../../components/Timer";
import { ArrowLeft, Mic, BarChart2, List, CheckCircle2, Circle, PlayCircle } from "lucide-react";

// 문제 데이터 타입 정의
type ProblemData = typeof problemData;
type PartKey = keyof ProblemData;

interface QuestionStep {
  id: string;
  label: string;
  type: "text" | "image" | "image_text" | "table";
  content: string;
  subText?: string;
  modelAnswer: string;
  prepTime: number;
  responseTime: number;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const partKey = params.part as PartKey;

  // State
  const [examState, setExamState] = useState<"intro" | "prep" | "recording" | "processing" | "result">("intro");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userTranscript, setUserTranscript] = useState("");

  // 결과 State
  const [score, setScore] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string[]>([]);

  const recognitionRef = useRef<any>(null);

  // --- 1. 문제 데이터 가공 ---
  const questions: QuestionStep[] = useMemo(() => {
    const rawData = (problemData as any)[partKey];
    if (!rawData) return [];

    const list: QuestionStep[] = [];
    let qCounter = 1;

    // Helper to add question
    const addQ = (item: Omit<QuestionStep, "id" | "label">) => {
      list.push({
        ...item,
        id: `${partKey}_${qCounter}`,
        label: `Question ${qCounter++}`,
      });
    };

    if (partKey === "part1") {
      rawData.forEach((item: any) => {
        addQ({
          type: "text",
          content: item.sentence,
          modelAnswer: item.sentence,
          prepTime: 45,
          responseTime: 45,
        });
      });
    } else if (partKey === "part2") {
      rawData.forEach((item: any) => {
        addQ({
          type: "image",
          content: item.image,
          modelAnswer: item.answer_sheet,
          prepTime: 45,
          responseTime: 30,
        });
      });
    } else if (partKey === "part3") {
      rawData.forEach((item: any) => {
        addQ({
          type: "text",
          content: `Situation: ${item.question}\n\nQ. ${item.sub_q1}`,
          modelAnswer: item.sub_a1,
          prepTime: 3,
          responseTime: 15,
        });
        addQ({
          type: "text",
          content: `Q. ${item.sub_q2}`,
          modelAnswer: item.sub_a2,
          prepTime: 3,
          responseTime: 15,
        });
        addQ({
          type: "text",
          content: `Q. ${item.sub_q3}`,
          modelAnswer: item.sub_a3,
          prepTime: 3,
          responseTime: 30,
        });
      });
    } else if (partKey === "part4") {
      rawData.forEach((item: any) => {
        addQ({
          type: "image_text",
          content: item.image,
          subText: `Q. ${item.sub_q1}`,
          modelAnswer: item.sub_a1,
          prepTime: 3,
          responseTime: 15,
        });
        addQ({
          type: "image_text",
          content: item.image,
          subText: `Q. ${item.sub_q2}`,
          modelAnswer: item.sub_a2,
          prepTime: 3,
          responseTime: 15,
        });
        addQ({
          type: "image_text",
          content: item.image,
          subText: `Q. ${item.sub_q3}`,
          modelAnswer: item.sub_a3,
          prepTime: 3,
          responseTime: 30,
        });
      });
    } else if (partKey === "part5") {
      rawData.forEach((item: any) => {
        addQ({
          type: "text",
          content: item.question,
          modelAnswer: item.answer_sheet,
          prepTime: 45,
          responseTime: 60,
        });
      });
    }

    return list;
  }, [partKey]);

  const currentQuestion = questions[currentQuestionIndex];

  // STT 설정
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join("");
          setUserTranscript(transcript);
        };
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const startExam = () => {
    if (questions.length === 0) {
      alert("No questions found for this part.");
      return;
    }
    setExamState("prep");
  };

  const startRecording = useCallback(() => {
    setExamState("recording");
    setUserTranscript("");
    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.error("Mic error:", e);
    }
  }, []);

  const stopRecordingAndAnalyze = useCallback(() => {
    recognitionRef.current?.stop();
    setExamState("processing");

    setTimeout(() => {
      const calculatedScore = calculateSimilarity(currentQuestion.modelAnswer, userTranscript);
      setScore(calculatedScore);

      const msgs = [];
      if (calculatedScore > 80) msgs.push("Excellent! 의미 전달이 명확합니다.");
      else if (calculatedScore > 50) msgs.push("Good effort. 핵심 키워드를 더 사용해보세요.");
      else msgs.push("Try to speak more clearly and focus on the question.");

      if (userTranscript.trim().split(" ").length < 5) {
        msgs.push("답변이 너무 짧습니다. 문장으로 완성해서 말해보세요.");
      }

      setFeedbackMsg(msgs);
      setExamState("result");
    }, 1500);
  }, [userTranscript, currentQuestion]);

  // 문제 이동
  const jumpToQuestion = (index: number) => {
    if (examState === "recording") {
      recognitionRef.current?.stop();
    }
    setCurrentQuestionIndex(index);
    setExamState("prep");
    setUserTranscript("");
    setScore(0);
    setFeedbackMsg([]);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      jumpToQuestion(currentQuestionIndex + 1);
    } else {
      alert("All questions completed!");
      router.push("/");
    }
  };

  if (!questions || questions.length === 0) {
    return <div className="h-screen bg-slate-900 text-white flex justify-center items-center">Loading...</div>;
  }

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col font-sans overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black z-0 pointer-events-none"></div>

      {/* Header */}
      <header className="h-16 w-full px-6 flex justify-between items-center z-20 bg-slate-900/50 backdrop-blur border-b border-slate-700 flex-none">
        <button
          onClick={() => router.push("/")}
          className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" /> <span className="hidden md:inline">Exit Test</span>
        </button>
        <div className="flex flex-col items-end">
          <span className="font-mono text-slate-500 text-xs tracking-wider">SIMULATION MODE</span>
          <span className="text-sm text-blue-400 font-bold capitalize">
            {partKey?.replace("part", "Part ")}
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden z-10 relative">
        {/* Main Exam Area */}
        <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {/* --- INTRO --- */}
          {examState === "intro" && (
            <div className="text-center max-w-md animate-in fade-in zoom-in duration-500 p-6 bg-slate-800/50 rounded-3xl border border-slate-700/50 backdrop-blur-sm">
              <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20 ring-4 ring-blue-500/10">
                <PlayCircle className="w-10 h-10 text-white fill-white/20" />
              </div>
              <h1 className="text-3xl font-black mb-3 tracking-tight capitalize">{partKey} Test</h1>
              <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                총 <strong className="text-white">{questions.length}</strong>개의 문제가 준비되어
                있습니다.
                <br />
                실제 시험과 동일한 시간 제한이 적용됩니다.
              </p>
              <button
                onClick={startExam}
                className="w-full py-4 bg-white text-slate-900 rounded-xl font-bold hover:scale-105 transition-all shadow-lg hover:shadow-white/20"
              >
                Start Examination
              </button>
            </div>
          )}

          {/* --- PREP & RECORDING --- */}
          {(examState === "prep" || examState === "recording") && currentQuestion && (
            <div className="w-full max-w-5xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* 문제 표시 영역 */}
              <div className="w-full bg-black/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl min-h-[300px] flex flex-col items-center justify-center relative p-6">
                {/* Image Type */}
                {currentQuestion.type === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentQuestion.content}
                    alt="Exam Prompt"
                    className="w-full h-full object-contain max-h-[500px] rounded-lg shadow-lg"
                  />
                )}

                {/* Text Type */}
                {currentQuestion.type === "text" && (
                  <div className="p-4 md:p-10 text-center max-w-3xl">
                    <span className="text-blue-400 font-bold tracking-widest text-xs uppercase mb-6 block opacity-80">
                      Question {currentQuestionIndex + 1} of {questions.length}
                    </span>
                    <h2 className="text-xl md:text-3xl font-bold leading-relaxed whitespace-pre-wrap text-slate-100">
                      {currentQuestion.content}
                    </h2>
                  </div>
                )}

                {/* Image + Text Type */}
                {currentQuestion.type === "image_text" && (
                  <div className="flex flex-col lg:flex-row gap-8 w-full items-start h-full">
                    <div className="flex-1 bg-white p-2 rounded-lg shadow-xl w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={currentQuestion.content}
                        alt="Schedule"
                        className="w-full h-auto object-contain max-h-[400px]"
                      />
                    </div>
                    <div className="flex-1 text-left p-4 lg:py-10">
                      <span className="text-green-400 font-bold tracking-widest text-xs uppercase mb-4 block">
                        Question {currentQuestionIndex + 1}
                      </span>
                      <p className="text-xl md:text-2xl font-semibold leading-relaxed text-white">
                        {currentQuestion.subText}
                      </p>
                    </div>
                  </div>
                )}

                {/* Status Badge */}
                <div
                  className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide backdrop-blur border ${
                    examState === "prep"
                      ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/20"
                      : "bg-red-500/10 text-red-200 border-red-500/20 animate-pulse"
                  }`}
                >
                  {examState === "prep" ? "● Preparation Time" : "● Recording..."}
                </div>
              </div>

              {/* Controls & Feedback Area */}
              <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
                {examState === "prep" ? (
                  <Timer
                    key={`prep-${currentQuestionIndex}`}
                    duration={currentQuestion.prepTime}
                    isActive={true}
                    onComplete={startRecording}
                    label="PREPARING"
                    color="stroke-yellow-400"
                  />
                ) : (
                  <div className="relative">
                    <div className="absolute inset-0 bg-red-500 blur-3xl opacity-20 animate-pulse rounded-full"></div>
                    <Timer
                      key={`rec-${currentQuestionIndex}`}
                      duration={currentQuestion.responseTime}
                      isActive={true}
                      onComplete={stopRecordingAndAnalyze}
                      label="SPEAK NOW"
                      color="stroke-red-500"
                    />
                  </div>
                )}

                {/* Live Transcript */}
                <div
                  className={`w-full text-center p-4 rounded-xl border border-slate-700/50 transition-all duration-300 ${
                    userTranscript
                      ? "opacity-100 bg-slate-800/80 translate-y-0"
                      : "opacity-0 bg-transparent translate-y-4"
                  }`}
                >
                  <p className="text-slate-300 font-medium text-lg break-words">"{userTranscript}"</p>
                </div>
              </div>
            </div>
          )}

          {/* --- PROCESSING --- */}
          {examState === "processing" && (
            <div className="text-center animate-pulse flex flex-col items-center justify-center h-full">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <BarChart2 className="w-10 h-10 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Analyzing Answer...</h2>
              <p className="text-slate-500">Checking similarity with model answer</p>
            </div>
          )}

          {/* --- RESULT --- */}
          {examState === "result" && currentQuestion && (
            <div className="w-full max-w-3xl animate-in slide-in-from-bottom-8 p-4 pb-20">
              <div className="bg-slate-800 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-slate-700 bg-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Analysis Report
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {feedbackMsg.map((msg, i) => (
                        <span
                          key={i}
                          className="text-xs px-3 py-1 bg-slate-700 rounded-full text-slate-300 border border-slate-600"
                        >
                          {msg}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-700/50">
                    <div
                      className={`text-4xl font-black ${score >= 80 ? "text-emerald-400" : "text-orange-400"}`}
                    >
                      {score}
                    </div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                      Similarity Score
                    </span>
                  </div>
                </div>

                <div className="p-8 space-y-8 bg-slate-900/50">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-3 block pl-1">
                      Your Answer
                    </label>
                    <div className="p-5 bg-slate-800 rounded-xl text-slate-200 leading-relaxed border border-slate-700 shadow-inner">
                      {userTranscript || (
                        <span className="text-slate-500 italic flex items-center gap-2">
                          <Mic className="w-4 h-4" /> No speech detected
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute -left-3 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full opacity-50"></div>
                    <label className="text-xs font-bold text-blue-400 uppercase mb-3 block pl-1">
                      Model Answer
                    </label>
                    <div className="p-5 bg-blue-950/10 border border-blue-500/20 rounded-xl text-blue-100/90 leading-relaxed shadow-sm">
                      {currentQuestion.modelAnswer}
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-800 border-t border-slate-700 flex justify-end">
                  <button
                    onClick={nextQuestion}
                    className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    Next Question <ArrowLeft className="w-5 h-5 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="hidden md:flex w-72 bg-slate-900/80 backdrop-blur border-l border-slate-700 flex-col h-full shadow-2xl z-20">
          {/* Sidebar Header */}
          <div className="p-5 border-b border-slate-700/50 flex-none">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <List className="w-4 h-4 text-blue-400" /> Problem List
            </h3>
            <p className="text-xs text-slate-500 mt-1">Select a question to jump directly.</p>
          </div>

          {/* Sidebar List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {questions.map((q, idx) => {
              const isActive = currentQuestionIndex === idx;
              return (
                <button
                  key={q.id}
                  onClick={() => jumpToQuestion(idx)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group border
          ${
            isActive
              ? "bg-blue-600/90 border-blue-500 text-white shadow-md shadow-blue-900/30"
              : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
                >
                  <span className="truncate">{q.label}</span>
                  {isActive ? (
                    <div className="w-2 h-2 rounded-full bg-white shadow-lg animate-pulse" />
                  ) : (
                    <span className="text-[10px] text-slate-600 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      GO
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-slate-700/50 bg-slate-900/50 flex-none">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Progress</span>
              <span>{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
