'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import data from '../../../data/sentences.json';
import { SentenceData, PartKey, Sentence } from '../../../types';
import { calculateSimilarity } from '../../../utils/scoring';
import { 
  ArrowLeft, Volume2, Shuffle, Eye, EyeOff, 
  ChevronRight, ChevronLeft, Mic, MicOff, Languages, Play, Square
} from 'lucide-react';

export default function StudyPage() {
  const params = useParams();
  const router = useRouter();
  const partKey = params.part as PartKey;
  
  const originalList: Sentence[] = (data as SentenceData)[partKey] || [];
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
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (originalList.length > 0) {
      setSentences(originalList);
    }
  }, [originalList]);

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

  const handleNext = () => {
    if (currentIndex < sentences.length - 1) {
      setCurrentIndex(prev => prev + 1);
      resetState();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      resetState();
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

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

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
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
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
            silenceTimerRef.current = setTimeout(() => {
              stopRecording(); 
            }, 2000); 
          };

          recognition.onerror = (event: any) => {
            console.error("Speech recognition error", event.error);
            if (event.error === 'no-speech') {
              stopRecording();
            }
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
    if (isListening) {
      stopRecording();
    } else {
      startRecording();
    }
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
  const progress = ((currentIndex + 1) / sentences.length) * 100;

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-slate-800 flex flex-col font-sans selection:bg-indigo-100">
      <audio ref={audioPlayerRef} className="hidden" />
      <header className="px-6 py-4 flex items-center justify-between sticky top-0 bg-[#F2F4F8]/80 backdrop-blur-md z-20">
        <button 
          onClick={() => router.push('/')} 
          className="p-2 -ml-2 rounded-full hover:bg-white/50 transition-colors text-slate-500"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
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
        </div>
      </header>

      <div className="px-6 mb-6">
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out" 
            style={{ width: `${progress}%` }} 
          />
        </div>
        <div className="flex justify-between mt-2 text-xs font-medium text-slate-400">
          <span>Progress</span>
          <span>{currentIndex + 1} / {sentences.length}</span>
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center px-6 pb-32 max-w-lg mx-auto w-full">
        <div className="w-full perspective-1000 group">
          <div 
            onClick={() => setIsFlipped(!isFlipped)}
            className="relative bg-white rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-white/50 cursor-pointer overflow-hidden transition-all duration-500 hover:-translate-y-1"
          >
            <div className="p-10 flex flex-col items-center justify-center min-h-[360px] text-center">
              <div className="mb-8 w-full">
                <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold tracking-wider mb-4">
                  {viewMode === 'en' ? 'ENGLISH' : 'KOREAN'}
                </span>
                <h2 className="text-3xl font-bold text-slate-800 leading-snug break-keep">
                  {viewMode === 'en' ? currentItem.english : currentItem.korean}
                </h2>
              </div>
              <div className={`transition-all duration-500 w-full ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none absolute bottom-10'}`}>
                {isFlipped && (
                  <div className="pt-6 border-t border-slate-100">
                    <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold tracking-wider mb-2">
                      {viewMode === 'en' ? 'MEANING' : 'ANSWER'}
                    </span>
                    <p className="text-xl font-medium text-slate-600 leading-relaxed">
                      {viewMode === 'en' ? currentItem.korean : currentItem.english}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute bottom-4 w-full text-center">
              <span className="text-xs text-slate-300 font-medium">
                {isFlipped ? 'Tap to hide' : 'Tap to reveal'}
              </span>
            </div>
          </div>
        </div>
        <div className={`mt-6 w-full transition-all duration-500 ${isListening || userTranscript ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className={`relative overflow-hidden rounded-2xl bg-white border p-4 shadow-sm transition-colors ${isListening ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100'}`}>
            
            {score !== null && (
              <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-2xl text-sm font-bold shadow-sm ${score >= 80 ? 'bg-emerald-500 text-white' : 'bg-orange-400 text-white'}`}>
                {score}점
              </div>
            )}

            <div className="flex flex-col items-center justify-center min-h-[3rem]">
              {isListening && !userTranscript ? (
                <div className="flex gap-1 py-2">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <div className="w-full">
                    <p className="text-lg font-medium text-slate-700 text-center mb-3">"{userTranscript}"</p>
                    
                    {!isListening && audioUrl && (
                      <button 
                        onClick={playMyVoice}
                        disabled={isPlayingMyVoice}
                        className="mx-auto flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-600 text-sm font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
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
      </main>

      <div className="fixed bottom-8 left-0 right-0 px-6 flex justify-center z-30 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-xl border border-white/20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-[2.5rem] p-2 flex items-center gap-2 pointer-events-auto">
          
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
            {isListening ? (
              <Square className="w-8 h-8 fill-current" />
            ) : (
              <Mic className="w-8 h-8" />
            )}
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
    </div>
  );
}