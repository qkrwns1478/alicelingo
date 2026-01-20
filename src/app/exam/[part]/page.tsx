'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import problemData from '../../../data/problems.json'; // problems.json import
import { calculateSimilarity } from '../../../utils/scoring';
import Timer from '../../../components/Timer';
import { ArrowLeft, Mic, BarChart2 } from 'lucide-react';

// 문제 데이터 타입 정의 (problems.json 구조에 맞춤)
type ProblemData = typeof problemData;
type PartKey = keyof ProblemData;

// 앱 내에서 사용할 통일된 문제 스텝 인터페이스
interface QuestionStep {
  type: 'text' | 'image' | 'image_text' | 'table';
  content: string; // 텍스트 질문 또는 이미지 URL
  subText?: string; // 이미지와 함께 나오는 텍스트 질문 등
  modelAnswer: string; // 채점 기준이 되는 모범 답안
  prepTime: number;
  responseTime: number;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const partKey = params.part as PartKey; // 예: 'part2', 'part3'

  // State
  const [examState, setExamState] = useState<'intro' | 'prep' | 'recording' | 'processing' | 'result'>('intro');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  
  // 결과 State
  const [score, setScore] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<string[]>([]);
  
  const recognitionRef = useRef<any>(null);

  // --- 1. 문제 데이터 가공 로직 ---
  const questions: QuestionStep[] = useMemo(() => {
    const rawData = (problemData as any)[partKey];
    if (!rawData) return [];

    const list: QuestionStep[] = [];

    // 파트별로 데이터를 평탄화(Flatten)하여 문제 리스트 생성
    if (partKey === 'part1') {
      // Part 1: 지문 읽기 (준비 45초 / 답변 45초)
      rawData.forEach((item: any) => {
        list.push({
          type: 'text',
          content: item.sentence,
          modelAnswer: item.sentence,
          prepTime: 45,
          responseTime: 45
        });
      });
    } else if (partKey === 'part2') {
      // Part 2: 사진 묘사 (준비 45초 / 답변 30초)
      rawData.forEach((item: any) => {
        list.push({
          type: 'image',
          content: item.image,
          modelAnswer: item.answer_sheet,
          prepTime: 45,
          responseTime: 30
        });
      });
    } else if (partKey === 'part3') {
      // Part 3: 듣고 답하기 (Q4-5: 3/15초, Q6: 3/30초)
      // JSON 구조: { question, sub_q1, sub_a1, ... } -> 3개의 문제로 분리
      rawData.forEach((item: any) => {
        // Q4 (Intro + Q1)
        list.push({
          type: 'text',
          content: `Situation: ${item.question}\n\nQ. ${item.sub_q1}`,
          modelAnswer: item.sub_a1,
          prepTime: 3,
          responseTime: 15
        });
        // Q5
        list.push({
          type: 'text',
          content: `Q. ${item.sub_q2}`,
          modelAnswer: item.sub_a2,
          prepTime: 3,
          responseTime: 15
        });
        // Q6
        list.push({
          type: 'text',
          content: `Q. ${item.sub_q3}`,
          modelAnswer: item.sub_a3,
          prepTime: 3,
          responseTime: 30
        });
      });
    } else if (partKey === 'part4') {
      // Part 4: 표 보고 답하기 (Q7-8: 3/15초, Q9: 3/30초)
      // JSON 구조: { image, sub_q1, sub_a1, ... } -> 이미지를 포함한 3개의 문제로 분리
      rawData.forEach((item: any) => {
        list.push({
          type: 'image_text',
          content: item.image, // 이미지 URL
          subText: `Q. ${item.sub_q1}`,
          modelAnswer: item.sub_a1,
          prepTime: 3, // 실제 시험은 45초 표 읽기 시간이 있으나 여기서는 각 문제당 3초 준비로 설정
          responseTime: 15
        });
        list.push({
          type: 'image_text',
          content: item.image,
          subText: `Q. ${item.sub_q2}`,
          modelAnswer: item.sub_a2,
          prepTime: 3,
          responseTime: 15
        });
        list.push({
          type: 'image_text',
          content: item.image,
          subText: `Q. ${item.sub_q3}`,
          modelAnswer: item.sub_a3,
          prepTime: 3,
          responseTime: 30
        });
      });
    } else if (partKey === 'part5') {
      // Part 5: 의견 제시하기 (준비 45초 / 답변 60초)
      rawData.forEach((item: any) => {
        list.push({
          type: 'text',
          content: item.question,
          modelAnswer: item.answer_sheet,
          prepTime: 45,
          responseTime: 60
        });
      });
    }

    // 문제 섞기 (랜덤 선택) - 전체를 섞거나, 일부만 추출
    // 여기서는 데모를 위해 섞은 후 앞에서 1~3개 세트만 가져오는 식으로 응용 가능
    // 편의상 전체 리스트를 반환합니다.
    return list.sort(() => Math.random() - 0.5); 
  }, [partKey]);

  const currentQuestion = questions[currentQuestionIndex];

  // STT 설정
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
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
    setExamState('prep');
  };

  const startRecording = useCallback(() => {
    setExamState('recording');
    setUserTranscript('');
    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.error("Mic error:", e);
    }
  }, []);

  const stopRecordingAndAnalyze = useCallback(() => {
    recognitionRef.current?.stop();
    setExamState('processing');

    setTimeout(() => {
      // --- 채점 로직 ---
      // 현재 문제의 모범 답안(modelAnswer)과 사용자 답변(userTranscript) 비교
      const calculatedScore = calculateSimilarity(currentQuestion.modelAnswer, userTranscript);
      setScore(calculatedScore);

      // 피드백 생성
      const msgs = [];
      if (calculatedScore > 80) msgs.push("Excellent! 의미 전달이 명확합니다.");
      else if (calculatedScore > 50) msgs.push("Good effort. 핵심 키워드를 더 사용해보세요.");
      else msgs.push("Try to speak more clearly and focus on the question.");

      if (userTranscript.trim().split(' ').length < 5) {
        msgs.push("답변이 너무 짧습니다. 문장으로 완성해서 말해보세요.");
      }

      setFeedbackMsg(msgs);
      setExamState('result');
    }, 1500);
  }, [userTranscript, currentQuestion]);

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setExamState('prep');
      setUserTranscript('');
      setScore(0);
    } else {
      alert("All questions completed!");
      router.push('/');
    }
  };

  if (!questions || questions.length === 0) {
    return <div className="min-h-screen bg-slate-900 text-white flex justify-center items-center">Loading or No Data...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4 relative font-sans">
      
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black z-0"></div>

      {/* Header */}
      <header className="absolute top-0 w-full p-6 flex justify-between z-10">
        <button onClick={() => router.push('/')} className="text-slate-400 hover:text-white"><ArrowLeft /></button>
        <div className="flex flex-col items-end">
          <span className="font-mono text-slate-500 text-sm">MOCK TEST MODE</span>
          <span className="text-xs text-slate-600">Part {partKey?.replace('part', '')} - Q{currentQuestionIndex + 1}/{questions.length}</span>
        </div>
      </header>

      {/* --- INTRO --- */}
      {examState === 'intro' && (
        <div className="z-10 text-center max-w-md animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black mb-2 tracking-tight capitalize">{partKey} Simulation</h1>
          <p className="text-slate-400 mb-8">
            실제 시험 데이터를 기반으로 한 모의고사입니다.<br/>
            Start 버튼을 누르면 문제가 시작됩니다.
          </p>
          <button onClick={startExam} className="w-full py-4 bg-white text-slate-900 rounded-xl font-bold hover:scale-105 transition-transform">
            Start Test
          </button>
        </div>
      )}

      {/* --- PREP & RECORDING (문제 화면) --- */}
      {(examState === 'prep' || examState === 'recording') && currentQuestion && (
        <div className="z-10 w-full max-w-4xl flex flex-col items-center gap-6">
          
          {/* 문제 영역 */}
          <div className="w-full bg-black/40 backdrop-blur-sm border border-slate-700 rounded-2xl overflow-hidden shadow-2xl min-h-[300px] flex flex-col items-center justify-center relative p-4">
            
            {/* 1. 이미지 유형 (Part 2) */}
            {currentQuestion.type === 'image' && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentQuestion.content} alt="Exam Prompt" className="w-full h-full object-contain max-h-[500px] rounded-lg" />
            )}

            {/* 2. 텍스트 유형 (Part 1, 3, 5) */}
            {currentQuestion.type === 'text' && (
              <div className="p-8 text-center">
                <span className="text-blue-400 font-bold tracking-widest text-sm uppercase mb-4 block">Question</span>
                <h2 className="text-2xl md:text-3xl font-bold leading-relaxed whitespace-pre-wrap">
                  {currentQuestion.content}
                </h2>
              </div>
            )}

            {/* 3. 이미지 + 텍스트 유형 (Part 4) */}
            {currentQuestion.type === 'image_text' && (
              <div className="flex flex-col md:flex-row gap-6 w-full items-center">
                <div className="flex-1 bg-white p-2 rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentQuestion.content} alt="Schedule" className="w-full h-auto object-contain max-h-[400px]" />
                </div>
                <div className="flex-1 text-left p-4">
                  <span className="text-green-400 font-bold tracking-widest text-xs uppercase mb-2 block">Question</span>
                  <p className="text-xl font-semibold leading-relaxed">{currentQuestion.subText}</p>
                </div>
              </div>
            )}
            
            {/* 상태 뱃지 */}
            <div className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold uppercase backdrop-blur ${examState === 'prep' ? 'bg-yellow-500/20 text-yellow-200' : 'bg-red-500/20 text-red-200'}`}>
              {examState === 'prep' ? 'Preparation Time' : 'Recording...'}
            </div>
          </div>

          {/* 타이머 */}
          <div className="flex flex-col items-center">
            {examState === 'prep' ? (
              <Timer 
                key={`prep-${currentQuestionIndex}`} // 키 변경으로 타이머 리셋 유도
                duration={currentQuestion.prepTime} 
                isActive={true} 
                onComplete={startRecording} 
                label="PREPARING" 
                color="stroke-yellow-400" 
              />
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-red-500 blur-2xl opacity-20 animate-pulse rounded-full"></div>
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
          </div>

          {/* 실시간 자막 */}
          <div className={`h-16 w-full max-w-2xl text-center flex items-center justify-center p-2 rounded-lg transition-opacity duration-300 ${userTranscript ? 'opacity-100 bg-slate-800/50' : 'opacity-0'}`}>
            <p className="text-slate-300 font-medium text-lg truncate">
              "{userTranscript}"
            </p>
          </div>
        </div>
      )}

      {/* --- PROCESSING --- */}
      {examState === 'processing' && (
        <div className="z-10 text-center animate-pulse">
          <BarChart2 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold">Analyzing Answer...</h2>
        </div>
      )}

      {/* --- RESULT --- */}
      {examState === 'result' && currentQuestion && (
        <div className="z-10 w-full max-w-3xl animate-in slide-in-from-bottom-8 p-4 pb-20">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl overflow-hidden shadow-2xl">
            
            <div className="p-8 border-b border-slate-700 bg-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Analysis Report</h2>
                <div className="flex flex-wrap gap-2">
                  {feedbackMsg.map((msg, i) => (
                    <span key={i} className="text-xs px-3 py-1 bg-slate-700 rounded-full text-slate-300">{msg}</span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-5xl font-black ${score >= 80 ? 'text-emerald-400' : 'text-orange-400'}`}>
                  {score}
                </div>
                <span className="text-sm text-slate-500">Similarity Score</span>
              </div>
            </div>

            <div className="p-8 space-y-8 bg-slate-900/50">
              {/* 내 답변 */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Your Answer
                </label>
                <div className="p-5 bg-slate-800 rounded-xl text-slate-200 leading-relaxed border border-slate-700 min-h-[80px]">
                  {userTranscript || <span className="text-slate-600 italic">(No speech detected)</span>}
                </div>
              </div>

              {/* 모범 답변 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-blue-400 uppercase flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Model Answer
                    </label>
                </div>
                <div className="p-5 bg-blue-950/20 border border-blue-900/30 rounded-xl">
                  <p className="text-blue-100 font-medium leading-relaxed">
                    {currentQuestion.modelAnswer}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-800 border-t border-slate-700">
              <button onClick={nextQuestion} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2">
                Next Question <ArrowLeft className="rotate-180 w-5 h-5" />
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}