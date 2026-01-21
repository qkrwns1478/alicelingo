'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import sentenceData from '../../../data/sentences.json';
import problemData from '../../../data/problems.json';
import { SentenceData, PartKey, Sentence } from '../../../types';
import { calculateSimilarity } from '../../../utils/scoring';
import { 
  ArrowLeft, Volume2, Shuffle, Eye, EyeOff, 
  ChevronRight, ChevronLeft, Mic, Languages, Play, Square, List, CheckCircle2, Menu, X
} from 'lucide-react';

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const partKey = params.part as string;
  
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<'en' | 'ko'>('en');

  const [isListening, setIsListening] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [confidence, setConfidence] = useState(1.0);
  const [score, setScore] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingMyVoice, setIsPlayingMyVoice] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let list: Sentence[] = [];
    if (partKey === 'part1') {
      const part1Data = (problemData as any).part1 || [];
      list = part1Data.map((item: any) => ({
        english: item.sentence,
        korean: '지문 읽기 파트입니다. (해석 없음)'
      }));
    } else {
      list = (sentenceData as SentenceData)[partKey as PartKey] || [];
    }
    setSentences(list);
  }, [partKey]);

  const resetState = () => {
    setIsFlipped(false);
    setUserTranscript('');
    setScore(null);
    setIsListening(false);
    setAudioUrl(null);
    setConfidence(1.0);
    audioChunksRef.current = [];
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };

  const jumpToSentence = (index: number) => {
    setCurrentIndex(index);
    resetState();
    setIsMobileMenuOpen(false);
  };

  const handleNext = () => {
    if (currentIndex < sentences.length - 1) {
      jumpToSentence(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      jumpToSentence(currentIndex - 1);
    }
  };

  const shuffleList = () => {
    const shuffled = [...sentences].sort(() => Math.random() - 0.5);
    setSentences(shuffled);
    setCurrentIndex(0);
    resetState();
  };

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) recognitionRef.current.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();

      if (typeof window !== 'undefined') {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.continuous = true; 
          recognition.interimResults = true;
          recognition.onresult = (event: any) => {
            const results = Array.from(event.results) as any[];
            const transcript = Array.from(event.results)
              .map((result: any) => result[0].transcript)
              .join('');
            const totalConfidence = results.reduce((sum, result) => sum + (result[0].confidence || 0), 0);
            const avgConfidence = results.length > 0 ? totalConfidence / results.length : 1.0;

            setUserTranscript(transcript);
            setConfidence(avgConfidence);

            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = setTimeout(() => { stopRecording(); }, 2000); 
          };
          recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') stopRecording();
          };
          recognitionRef.current = recognition;
          recognition.start();
        }
      }

      setUserTranscript('');
      setConfidence(1.0);
      setScore(null);
      setAudioUrl(null);
      setIsListening(true);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => { stopRecording(); }, 3000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("마이크 접근 권한이 필요합니다.");
    }
  };

  const toggleListening = () => {
    if (isListening) stopRecording();
    else startRecording();
  };

  useEffect(() => {
    if (!isListening && userTranscript.length > 0) {
      const currentSentence = sentences[currentIndex];
      const resultScore = calculateSimilarity(currentSentence.english, userTranscript, confidence);
      setScore(resultScore);
    }
  }, [isListening, userTranscript]);

  const speak = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
  };

  const playMyVoice = () => {
    if (audioPlayerRef.current && audioUrl) {
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current.play();
      setIsPlayingMyVoice(true);
      audioPlayerRef.current.onended = () => setIsPlayingMyVoice(false);
    }
  };

  if (sentences.length === 0) return <div className="flex h-screen items-center justify-center text-gray-400">Loading...</div>;

  const currentItem = sentences[currentIndex];

  return (
    <div className="h-screen bg-[#F2F4F8] text-slate-800 flex flex-col font-sans selection:bg-indigo-100 overflow-hidden relative">
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between bg-[#F2F4F8]/80 backdrop-blur-md z-20 border-b border-slate-200/50 flex-none">
        <div className="flex items-center gap-2">
            <button 
            onClick={() => router.push('/')} 
            className="flex items-center gap-2 px-2 py-2 -ml-2 rounded-xl hover:bg-white transition-all text-slate-500 hover:text-slate-800"
            >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold text-sm hidden sm:inline">Back to Home</span>
            </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setViewMode(prev => prev === 'en' ? 'ko' : 'en'); setIsFlipped(false); }}
            className="p-2 rounded-full bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-indigo-600 active:scale-95 transition-all"
            title="언어 전환"
          >
            <Languages className="w-5 h-5" />
          </button>
          <button 
            onClick={shuffleList}
            className="p-2 rounded-full bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-indigo-600 active:scale-95 transition-all"
            title="순서 섞기"
          >
            <Shuffle className="w-5 h-5" />
          </button>
          
          {/* Mobile Menu Button */}
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-full bg-white shadow-sm border border-slate-200 text-slate-600 hover:text-indigo-600 active:scale-95 transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          
          <div className="flex-1 flex flex-col items-center px-6 pb-40 max-w-2xl mx-auto w-full">
            
            {/* Card */}
            <div className="w-full perspective-1000 group mt-4">
              <div 
                onClick={() => setIsFlipped(!isFlipped)}
                className="relative bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white cursor-pointer overflow-hidden transition-all duration-500 hover:shadow-xl hover:-translate-y-1"
              >
                <div className="p-10 flex flex-col items-center justify-center min-h-[400px] text-center">
                  <div className="mb-8 w-full">
                    <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold tracking-wider mb-6">
                      {viewMode === 'en' ? 'ENGLISH' : 'KOREAN'}
                    </span>
                    <h2 className="text-3xl md:text-4xl font-bold text-slate-800 leading-snug break-keep">
                      {viewMode === 'en' ? currentItem.english : currentItem.korean}
                    </h2>
                  </div>
                  <div className={`transition-all duration-500 w-full ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none absolute bottom-10'}`}>
                    {isFlipped && (
                      <div className="pt-8 border-t border-slate-100 w-full">
                        <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold tracking-wider mb-4">
                          {viewMode === 'en' ? 'MEANING' : 'ANSWER'}
                        </span>
                        <p className="text-xl font-medium text-slate-500 leading-relaxed">
                          {viewMode === 'en' ? currentItem.korean : currentItem.english}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="absolute bottom-6 w-full text-center">
                  <span className="text-xs text-slate-300 font-medium uppercase tracking-widest">
                    {isFlipped ? 'Tap to hide' : 'Tap to reveal'}
                  </span>
                </div>
              </div>
            </div>

            {/* Feedback / Transcript Area */}
            <div className={`mt-8 w-full transition-all duration-500 ${isListening || userTranscript ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <div className={`relative overflow-hidden rounded-3xl bg-white border p-6 shadow-sm transition-all ${isListening ? 'border-indigo-200 ring-4 ring-indigo-50 shadow-indigo-100' : 'border-slate-100'}`}>
                
                {score !== null && (
                  <div className={`absolute top-0 right-0 px-5 py-2 rounded-bl-2xl text-sm font-bold shadow-sm ${score >= 80 ? 'bg-emerald-500 text-white' : 'bg-orange-400 text-white'}`}>
                    {score} Point
                  </div>
                )}

                <div className="flex flex-col items-center justify-center min-h-[3rem]">
                  {isListening && !userTranscript ? (
                    <div className="flex gap-1.5 py-2">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <div className="w-full text-center">
                        <p className="text-xl font-medium text-slate-700 mb-4 leading-relaxed">"{userTranscript}"</p>
                        
                        {!isListening && audioUrl && (
                          <button 
                            onClick={playMyVoice}
                            disabled={isPlayingMyVoice}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                          >
                            {isPlayingMyVoice ? (
                              <>
                                <Volume2 className="w-4 h-4 animate-pulse text-indigo-500" /> 
                                <span className="text-indigo-500">Playing...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4" /> 
                                <span>내 목소리 듣기</span>
                              </>
                            )}
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Bottom Controls */}
          <div className="fixed bottom-8 left-0 md:left-0 md:right-72 right-0 px-6 flex justify-center z-30 pointer-events-none">
            <div className="bg-white/90 backdrop-blur-xl border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-[2.5rem] p-2 flex items-center gap-3 pointer-events-auto">
              
              <button onClick={handlePrev} disabled={currentIndex === 0} className="w-12 h-12 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-30">
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <button 
                onClick={() => speak(currentItem.english)}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90"
                title="원어민 발음 듣기"
              >
                <Volume2 className="w-6 h-6" />
              </button>
              
              <button 
                onClick={toggleListening}
                className={`w-20 h-20 -my-4 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 active:scale-95 ${
                  isListening 
                    ? 'bg-gradient-to-tr from-rose-500 to-orange-500 text-white shadow-orange-500/40 ring-4 ring-orange-100' 
                    : 'bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-indigo-500/40 hover:shadow-indigo-500/60'
                }`}
              >
                {isListening ? <Square className="w-8 h-8 fill-current" /> : <Mic className="w-8 h-8" />}
              </button>
              
              <button 
                onClick={() => setIsFlipped(!isFlipped)}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-90"
              >
                {isFlipped ? <EyeOff className="w-6 h-6"/> : <Eye className="w-6 h-6"/>}
              </button>
              
              <button onClick={handleNext} disabled={currentIndex === sentences.length - 1} className="w-12 h-12 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all disabled:opacity-30">
                <ChevronRight className="w-6 h-6" />
              </button>

            </div>
          </div>

        </main>

        {/* Right Sidebar (Desktop) */}
        <aside className="hidden md:flex w-72 bg-white border-l border-slate-200 flex-col h-full shadow-xl z-20">
          <div className="p-5 border-b border-slate-100 flex-none bg-white">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <List className="w-4 h-4 text-indigo-600" /> Sentence List
            </h3>
            <p className="text-xs text-slate-400 mt-1">Select to practice specific sentence</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {sentences.map((sent, idx) => {
              const isActive = currentIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => jumpToSentence(idx)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-start justify-between group gap-2
                    ${isActive 
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                      : 'text-slate-500 hover:bg-slate-50 border border-transparent'
                    }`}
                >
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className={`text-xs font-bold ${isActive ? 'text-indigo-500' : 'text-slate-400'}`}>
                      #{idx + 1}
                    </span>
                    <span className="truncate w-full block opacity-90">
                      {sent.english}
                    </span>
                  </div>
                  {isActive && <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-none mt-1" />}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mobile Sidebar (Overlay) */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" 
              onClick={() => setIsMobileMenuOpen(false)} 
            />
            {/* Drawer */}
            <div className="absolute right-0 top-0 bottom-0 w-[80%] max-w-sm bg-white shadow-2xl p-4 flex flex-col animate-in slide-in-from-right duration-300">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <List className="w-5 h-5 text-indigo-600" /> Sentence List
                </h3>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-1 space-y-1 scrollbar-thin scrollbar-thumb-slate-200">
                {sentences.map((sent, idx) => {
                  const isActive = currentIndex === idx;
                  return (
                    <button
                      key={idx}
                      onClick={() => jumpToSentence(idx)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-start justify-between group gap-2
                        ${isActive 
                          ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' 
                          : 'text-slate-500 hover:bg-slate-50 border border-transparent'
                        }`}
                    >
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <span className={`text-xs font-bold ${isActive ? 'text-indigo-500' : 'text-slate-400'}`}>
                          #{idx + 1}
                        </span>
                        <span className="truncate w-full block opacity-90">
                          {sent.english}
                        </span>
                      </div>
                      {isActive && <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-none mt-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}