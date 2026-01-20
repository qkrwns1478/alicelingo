import Link from 'next/link';
import { BookOpen, Mic, Layers, MessageCircle, GraduationCap, PlayCircle } from 'lucide-react';

const parts = [
  { id: 'part2', title: 'Part 2', desc: '사진 묘사하기', icon: <BookOpen className="w-8 h-8" /> },
  { id: 'part3', title: 'Part 3', desc: '질문에 답하기', icon: <MessageCircle className="w-8 h-8" /> },
  { id: 'part4', title: 'Part 4', desc: '정보 사용하여 답하기', icon: <Layers className="w-8 h-8" /> },
  { id: 'part5', title: 'Part 5', desc: '의견 제시하기', icon: <Mic className="w-8 h-8" /> },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F2F4F8] p-8 flex flex-col items-center justify-center font-sans">
      <div className="max-w-5xl w-full">
        
        <header className="mb-16 text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
            <Mic className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-5xl font-extrabold text-slate-800 tracking-tight">
            Alice<span className="text-indigo-600">Lingo</span>
          </h1>
          <p className="text-lg text-slate-500 font-medium max-w-2xl mx-auto">
            원하는 파트를 선택하여 문장을 학습하거나, 실전 모의고사를 통해 실력을 테스트해보세요.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {parts.map((part) => (
            <div 
              key={part.id} 
              className="bg-white p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col items-start gap-6 group hover:-translate-y-1"
            >
              <div className="flex items-center gap-4 w-full">
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 shadow-inner">
                  {part.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{part.title}</h2>
                  <p className="text-slate-400 font-medium text-sm">{part.desc}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 w-full mt-2">
                <Link 
                  href={`/study/${part.id}`}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all active:scale-95"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>학습하기</span>
                </Link>

                <Link 
                  href={`/exam/${part.id}`}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200 active:scale-95"
                >
                  <GraduationCap className="w-4 h-4" />
                  <span>모의고사</span>
                </Link>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-20 text-center text-slate-400 text-sm">
          <p>© 2026 AliceLingo. All rights reserved.</p>
        </footer>
      </div>
    </main>
  );
}