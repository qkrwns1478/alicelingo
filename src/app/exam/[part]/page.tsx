"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import problemData from "../../../data/problems.json";
import Timer from "../../../components/Timer";
import { ArrowLeft, Mic, List, CheckCircle2, Play, RefreshCw, MessageSquare, Eye, EyeOff, SkipForward, X, Zap, Menu, Volume2 } from "lucide-react";

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

  const [examState, setExamState] = useState<"idle" | "listening" | "prep" | "recording" | "processing" | "result">("idle");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userTranscript, setUserTranscript] = useState("");
  const [score, setScore] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string[]>([]);
  const [fluencyLevel, setFluencyLevel] = useState<string>("");
  
  const [showAnswer, setShowAnswer] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const isTransitioningRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const questions: QuestionStep[] = useMemo(() => {
    const rawData = (problemData as any)[partKey];
    if (!rawData) return [];

    const list: QuestionStep[] = [];
    let qCounter = 1;

    const addQ = (item: Omit<QuestionStep, "id" | "label">) => {
      list.push({
        ...item,
        id: `${partKey}_${qCounter}`,
        label: `Question ${qCounter++}`,
      });
    };

    if (partKey === "part1") {
      rawData.forEach((item: any) => {
        addQ({ type: "text", content: item.sentence, modelAnswer: item.sentence, prepTime: 45, responseTime: 45 });
      });
    } else if (partKey === "part2") {
      rawData.forEach((item: any) => {
        addQ({ type: "image", content: item.image, modelAnswer: item.answer_sheet, prepTime: 45, responseTime: 30 });
      });
    } else if (partKey === "part3") {
      rawData.forEach((item: any) => {
        addQ({ type: "text", content: `Situation: ${item.question}\n\n${item.sub_q1}`, modelAnswer: item.sub_a1, prepTime: 3, responseTime: 15 });
        addQ({ type: "text", content: `${item.sub_q2}`, modelAnswer: item.sub_a2, prepTime: 3, responseTime: 15 });
        addQ({ type: "text", content: `${item.sub_q3}`, modelAnswer: item.sub_a3, prepTime: 3, responseTime: 30 });
      });
    } else if (partKey === "part4") {
      rawData.forEach((item: any) => {
        addQ({ type: "image_text", content: item.image, subText: `${item.sub_q1}`, modelAnswer: item.sub_a1, prepTime: 3, responseTime: 15 });
        addQ({ type: "image_text", content: item.image, subText: `${item.sub_q2}`, modelAnswer: item.sub_a2, prepTime: 3, responseTime: 15 });
        addQ({ type: "image_text", content: item.image, subText: `${item.sub_q3}`, modelAnswer: item.sub_a3, prepTime: 3, responseTime: 30 });
      });
    } else if (partKey === "part5") {
      rawData.forEach((item: any) => {
        addQ({ type: "text", content: item.question, modelAnswer: item.answer_sheet, prepTime: 45, responseTime: 60 });
      });
    }
    return list;
  }, [partKey]);

  const currentQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    const loadVoices = () => {
      const availVoices = window.speechSynthesis.getVoices();
      setVoices(availVoices);
    };
    
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== "undefined") {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; 
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let interim = "";
          if (event.results.length > 0) {
            const transcript = event.results[0][0].transcript;
            if (event.results[0].isFinal) {
              finalTranscriptRef.current += transcript + " ";
            } else {
              interim = transcript;
            }
          }
          setUserTranscript(finalTranscriptRef.current + interim);
        };
        
        recognition.onend = () => {
          if (isRecordingRef.current) {
            try { recognition.start(); } catch (e) {}
          }
        };
        recognitionRef.current = recognition;
      }
    }
  }, []);

  const playTTS = (text: string, gender: "male" | "female" = "female"): Promise<void> => {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return resolve();
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      
      let targetVoice = null;
      if (gender === "male") {
        targetVoice = voices.find(v => 
          v.name.includes("Google UK English Male") || 
          v.name.includes("Microsoft David") || 
          v.name.includes("Daniel") ||
          v.name.toLowerCase().includes("male")
        );
        if (targetVoice) {
          utter.voice = targetVoice;
          utter.rate = 1.0; 
        } else {
          utter.rate = 0.95; 
          utter.pitch = 0.7;
        }
      } else {
        targetVoice = voices.find(v => v.name.includes("Google US English")) || voices.find(v => v.lang === "en-US");
        if (targetVoice) utter.voice = targetVoice;
        utter.rate = 1.0;
        utter.pitch = 1.0;
      }

      utter.onend = () => resolve();
      utter.onerror = () => resolve(); 
      try {
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    });
  };

  const playBeep = (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(523, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);

        setTimeout(() => {
          ctx.close();
          resolve();
        }, 500);
      } catch (e) {
        resolve(); 
      }
    });
  };

  const playDingDong = (): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        
        const now = ctx.currentTime;

        // Ding
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.frequency.setValueAtTime(659, now);
        gain1.gain.setValueAtTime(0.1, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc1.start(now);
        osc1.stop(now + 1.2);

        // Dong
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(523, now + 0.6);
        gain2.gain.setValueAtTime(0.1, now + 0.6);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        osc2.start(now + 0.6);
        osc2.stop(now + 2.0);

        setTimeout(() => {
          ctx.close();
          resolve();
        }, 2000);
      } catch (e) {
        resolve();
      }
    });
  };

  const startCurrentQuestion = async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setExamState("listening");

    let textToRead = "";
    if (partKey === "part3" || partKey === "part5") textToRead = currentQuestion.content;
    else if (partKey === "part4") textToRead = currentQuestion.subText || "";

    if (textToRead) {
      await playTTS(textToRead, "female");
      if (!isTransitioningRef.current) return;
    }

    await playTTS("Begin preparing now.", "male");
    if (!isTransitioningRef.current) return;

    await playBeep();
    if (!isTransitioningRef.current) return;

    setExamState("prep");
    isTransitioningRef.current = false;
  };

  const startRecordingSequence = useCallback(async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    await playTTS("Begin speaking now.", "male");
    if (!isTransitioningRef.current) return;

    await playBeep();
    if (!isTransitioningRef.current) return;

    isRecordingRef.current = true;
    finalTranscriptRef.current = ""; 
    setUserTranscript("");
    setExamState("recording");

    try { recognitionRef.current?.stop(); } catch(e) {}
    setTimeout(() => { try { recognitionRef.current?.start(); } catch (e) {} }, 100);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMimeType = "audio/webm";
      const mediaRecorder = MediaRecorder.isTypeSupported?.(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.start();
    } catch (err) {
      alert("마이크 권한이 필요합니다.");
      setExamState("idle");
    }

    isTransitioningRef.current = false;
  }, [voices]);

  const stopRecordingAndAnalyze = useCallback(async () => {
    isRecordingRef.current = false;
    try { recognitionRef.current?.stop(); } catch(e) {}

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      await new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current) return resolve();
        mediaRecorderRef.current.onstop = () => resolve();
      });
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }

    setExamState("processing");

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    try {
      const base64Audio = await blobToBase64(audioBlob);
      const imageUrl = (currentQuestion.type === "image" || currentQuestion.type === "image_text") ? currentQuestion.content : undefined;
      
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          part: partKey,
          question: currentQuestion.type === "text" ? currentQuestion.content : currentQuestion.subText || "Describe this image",
          image: imageUrl,
          audioData: base64Audio,
          modelAnswer: currentQuestion.modelAnswer,
        }),
      });

      if (!response.ok) throw new Error("Evaluation failed");
      const data = await response.json();
      setScore(data.score);
      setFeedbackMsg(data.feedback || ["No feedback provided."]);
      setFluencyLevel(data.fluency || "N/A");
      if (data.userTranscript) setUserTranscript(data.userTranscript);
      playDingDong();

    } catch (error) {
      setScore(0);
      setFeedbackMsg(["AI 평가 서버 연결 실패 또는 오디오 처리 오류."]);
    } finally {
      setExamState("result");
    }
  }, [currentQuestion, partKey]);

  const jumpToQuestion = (index: number) => {
    isRecordingRef.current = false;
    isTransitioningRef.current = false;

    if (examState === "recording" || examState === "listening" || examState === "prep") {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      window.speechSynthesis.cancel();
      mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    }
    setCurrentQuestionIndex(index);
    setExamState("idle");
    setUserTranscript("");
    finalTranscriptRef.current = "";
    setScore(0);
    setFeedbackMsg([]);
    setFluencyLevel("");
    setShowAnswer(false);
    setIsMobileMenuOpen(false);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      jumpToQuestion(currentQuestionIndex + 1);
    } else {
      jumpToQuestion(0);
    }
  };

  if (!questions || questions.length === 0) {
    return <div className="h-screen bg-slate-900 text-white flex justify-center items-center">Loading...</div>;
  }

  const isContentVisible = examState !== "idle";

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black z-0 pointer-events-none"></div>

      {/* Header */}
      <header className="h-16 w-full px-6 flex justify-between items-center z-20 bg-slate-900/50 backdrop-blur border-b border-slate-700 flex-none relative">
        <button onClick={() => router.push("/")} className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors">
          <ArrowLeft className="w-5 h-5" /> <span className="hidden md:inline">Back to Home</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="font-mono text-slate-500 text-xs tracking-wider">EXAM MODE</span>
            <span className="text-sm text-blue-400 font-bold capitalize">{partKey?.replace("part", "Part ")}</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 z-10 relative">
        <main className="flex-1 flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4 relative">

          {/* Timer Progress Bar */}
          {isContentVisible && (examState === "prep" || examState === "recording") && (
            <div className="fixed top-24 left-6 z-50">
              {examState === "prep" ? (
                <Timer
                  key={`prep-${currentQuestionIndex}`}
                  duration={currentQuestion.prepTime}
                  isActive={true}
                  onComplete={startRecordingSequence}
                  label="PREP"
                  color="stroke-yellow-400"
                  mode="linear"
                />
              ) : (
                <Timer
                  key={`rec-${currentQuestionIndex}`}
                  duration={currentQuestion.responseTime}
                  isActive={true}
                  onComplete={stopRecordingAndAnalyze}
                  label="SPEAK"
                  color="stroke-red-500"
                  mode="linear"
                />
              )}
            </div>
          )}

          {/* Skip Prep Button */}
          {examState === "prep" && (
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
              <button
                onClick={startRecordingSequence}
                disabled={isTransitioningRef.current}
                className="flex items-center gap-2 px-6 py-3 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-bold transition-all border border-slate-700 shadow-2xl backdrop-blur group disabled:opacity-50 hover:scale-105 active:scale-95"
              >
                <SkipForward className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" /> 
                Skip Preparation
              </button>
            </div>
          )}

          <div className="w-full max-w-5xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-full bg-black/40 backdrop-blur-md border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl min-h-[500px] flex flex-col items-center justify-center relative p-6 transition-all">
              <div className="absolute top-4 right-4 z-30">
                <button onClick={() => setShowAnswer(!showAnswer)} className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full backdrop-blur border border-slate-700 transition-all shadow-lg" title={showAnswer ? "Hide Model Answer" : "Show Model Answer"}>
                  {showAnswer ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {showAnswer && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-8 animate-in fade-in duration-200">
                  <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-2xl w-full max-h-[80%] overflow-y-auto shadow-2xl relative">
                    <button onClick={() => setShowAnswer(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
                    <div className="flex items-center gap-2 mb-4 text-emerald-400"><CheckCircle2 className="w-6 h-6" /><h3 className="text-xl font-bold">Model Answer</h3></div>
                    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50"><p className="text-slate-300 leading-relaxed whitespace-pre-wrap text-lg">{currentQuestion.modelAnswer}</p></div>
                  </div>
                </div>
              )}

              {!isContentVisible && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-md">
                  {examState === "idle" && (
                    <div className="text-center animate-in zoom-in duration-300">
                      <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20">
                        <Play className="w-8 h-8 text-white ml-1" />
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-2">Question {currentQuestionIndex + 1}</h2>
                      <p className="text-slate-300 mb-8">Ready to start?</p>
                      <button onClick={startCurrentQuestion} className="px-8 py-3 bg-white text-blue-900 rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-xl">Start Question</button>
                    </div>
                  )}
                </div>
              )}

              <div className={`w-full h-full flex flex-col items-center justify-center transition-all duration-500 ${!isContentVisible ? "opacity-30 blur-sm scale-95 grayscale" : "opacity-100 scale-100"}`}>
                {currentQuestion.type === "image" && <img src={currentQuestion.content} alt="Exam Prompt" className="w-full h-full object-contain max-h-[500px] rounded-lg shadow-lg" />}
                {currentQuestion.type === "text" && (
                  <div className="p-4 md:p-10 text-center max-w-3xl">
                    <span className="text-blue-400 font-bold tracking-widest text-xs uppercase mb-6 block opacity-80">Question {currentQuestionIndex + 1}</span>
                    <h2 className={`text-xl md:text-3xl font-bold leading-relaxed whitespace-pre-wrap transition-colors duration-300 ${examState === 'listening' ? 'text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-slate-100'}`}>
                      {currentQuestion.content}
                    </h2>
                  </div>
                )}
                {currentQuestion.type === "image_text" && (
                  <div className="flex flex-col gap-4 w-full h-full">
                    <div className="flex-1 bg-white p-2 rounded-lg shadow-xl w-full min-h-0 overflow-hidden flex items-center justify-center">
                      <img src={currentQuestion.content} alt="Schedule" className="w-full h-full object-contain" />
                    </div>
                    <div className={`flex-none w-full text-left p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 ${examState === 'listening' ? 'bg-blue-900/40 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' : 'bg-slate-800/80 border-slate-700'}`}>
                      <span className="text-green-400 font-bold tracking-widest text-xs uppercase mb-2 block">Question {currentQuestionIndex + 1}</span>
                      <p className={`text-lg md:text-xl font-semibold leading-relaxed transition-colors duration-300 ${examState === 'listening' ? 'text-blue-300' : 'text-white'}`}>
                        {currentQuestion.subText}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {isContentVisible && (
                <div className={`absolute top-4 left-4 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide backdrop-blur border z-10 ${
                    examState === "listening" ? "bg-blue-500/10 text-blue-200 border-blue-500/20 animate-pulse" :
                    examState === "prep" ? "bg-yellow-500/10 text-yellow-200 border-yellow-500/20" :
                    examState === "recording" ? "bg-red-500/10 text-red-200 border-red-500/20 animate-pulse" :
                    "bg-slate-700/50 text-slate-300 border-slate-600"
                  }`}>
                  {examState === "listening" ? "● Listening..." : examState === "prep" ? "● Preparation Time" : examState === "recording" ? "● Recording..." : "Review"}
                </div>
              )}
            </div>

            {isContentVisible && (
              <div className="flex flex-col items-center gap-6 w-full max-w-2xl animate-in slide-in-from-bottom-4 fade-in">

                {examState === "processing" && (
                  <div className="flex flex-col items-center gap-3 text-slate-300 p-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="font-bold text-lg">AI Evaluator is analyzing...</span>
                    <span className="text-xs text-slate-500">Checking pronunciation, grammar, and relevance</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
        
        <aside className="hidden md:flex w-72 bg-slate-900/80 backdrop-blur border-l border-slate-700 flex-col h-[calc(100vh-4rem)] sticky top-16 shadow-2xl z-20">
          <div className="p-5 border-b border-slate-700/50 flex-none">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><List className="w-4 h-4 text-blue-400" /> Problem List</h3>
            <p className="text-xs text-slate-500 mt-1">Select a question to jump.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {questions.map((q, idx) => (
                <button key={q.id} onClick={() => jumpToQuestion(idx)} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group border ${currentQuestionIndex === idx ? "bg-purple-600/90 border-purple-500 text-white shadow-md shadow-purple-900/30" : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
                  <span className="truncate">{q.label}</span>
                  {currentQuestionIndex === idx && <div className="w-2 h-2 rounded-full bg-white shadow-lg" />}
                </button>
            ))}
          </div>
        </aside>

        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-[80%] max-w-sm bg-slate-900 border-l border-slate-700 shadow-2xl p-4 flex flex-col animate-in slide-in-from-right duration-300">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700">
                <h3 className="font-bold text-slate-100 flex items-center gap-2"><List className="w-5 h-5 text-blue-400" /> Problem List</h3>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1">
                {questions.map((q, idx) => (
                    <button key={q.id} onClick={() => jumpToQuestion(idx)} className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-between group border ${currentQuestionIndex === idx ? "bg-purple-600/90 border-purple-500 text-white shadow-md shadow-purple-900/30" : "bg-transparent border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
                      <span className="truncate">{q.label}</span>
                      {currentQuestionIndex === idx && <div className="w-2 h-2 rounded-full bg-white shadow-lg" />}
                    </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {examState === "result" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
              <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center flex-none">
                <div><h2 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="w-6 h-6 text-yellow-400 fill-yellow-400" /> AI Evaluation Report</h2><p className="text-slate-400 text-sm mt-1">Detailed analysis of your response</p></div>
                <div className="text-right">
                  <div className="flex items-baseline justify-end gap-2"><span className={`text-4xl font-black ${score >= 80 ? "text-emerald-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>{score}</span><span className="text-sm font-bold text-slate-500">/ 100</span></div>
                  <div className="text-xs text-slate-400 font-mono mt-1">Fluency: <span className="text-blue-400 font-bold">{fluencyLevel}</span></div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-700">
                <div><h3 className="text-sm font-bold text-slate-400 uppercase mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Feedback</h3><div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5"><ul className="space-y-3">{feedbackMsg.map((msg, i) => (<li key={i} className="flex items-start gap-3 text-slate-300 text-sm leading-relaxed"><span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-none" />{msg}</li>))}</ul></div></div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col h-full"><label className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Mic className="w-3 h-3" /> Your Answer (Preview)</label><div className="flex-1 p-4 bg-slate-800 rounded-xl text-slate-300 text-sm leading-relaxed border border-slate-700">{userTranscript || <span className="text-slate-600 italic">No speech detected.</span>}</div></div>
                  <div className="flex flex-col h-full"><label className="text-xs font-bold text-blue-500/80 uppercase mb-2 flex items-center gap-2"><CheckCircle2 className="w-3 h-3" /> Model Answer</label><div className="flex-1 p-4 bg-blue-950/10 border border-blue-500/10 rounded-xl text-blue-200/70 text-sm leading-relaxed">{currentQuestion.modelAnswer}</div></div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-700 bg-slate-800/30 flex justify-end flex-none"><button onClick={nextQuestion} className="w-full sm:w-auto px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-purple-500/20 flex items-center justify-center gap-2">Close</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}