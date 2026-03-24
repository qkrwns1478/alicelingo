import Link from 'next/link';
import { BookOpen, Mic, MicVocal, Image, Table, MessageCircle, Pencil, GraduationCap, PlayCircle } from 'lucide-react';
import LogoutButton from '../components/LogoutButton';
import MyPageButton from '../components/MyPageButton';
import Header from '../components/Header';
import { createClient } from '../utils/supabase/server';

const parts = [
  { id: 'part1', title: 'Part 1', desc: '지문 읽기', icon: <MicVocal className="w-8 h-8" /> },
  { id: 'part2', title: 'Part 2', desc: '사진 묘사하기', icon: <Image className="w-8 h-8" /> },
  { id: 'part3', title: 'Part 3', desc: '질문에 답하기', icon: <MessageCircle className="w-8 h-8" /> },
  { id: 'part4', title: 'Part 4', desc: '정보 사용하여 답하기', icon: <Table className="w-8 h-8" /> },
  { id: 'part5', title: 'Part 5', desc: '의견 제시하기', icon: <Mic className="w-8 h-8" /> },
];

const GREETINGS = [
  "안녕하세요!",
  "오늘도 화이팅!",
  "반갑습니다!",
  "열공할 준비 되셨나요?",
  "오늘도 목표를 향해 달려봐요!",
  "좋은 하루 보내세요!",
  "환영합니다!"
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let nickname = '';
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('nickname')
      .eq('id', user.id)
      .single();
    nickname = data?.nickname || '';
  }

  const randomMessage = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

  return (
    <main className="min-h-screen bg-[#F2F4F8] p-8 flex flex-col items-center justify-center font-sans">
      <div className="absolute top-8 right-8 z-10 flex items-center gap-3">
        {nickname && (
          <>
            <span className="text-sm font-bold text-slate-600 mr-2 drop-shadow-sm">
              {nickname}님, {randomMessage}
            </span>
            <MyPageButton />
          </>
        )}
        <LogoutButton />
      </div>

      <div className="max-w-5xl w-full">
        <header className="mb-16 text-center space-y-4">
          <Header />
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                  <Pencil className="w-4 h-4" />
                  <span>문제풀기</span>
                </Link>
              </div>
            </div>
          ))}

          {/* <div className="bg-white p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col items-start gap-6 group hover:-translate-y-1">
              <div className="flex items-center gap-4 w-full">
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 shadow-inner">
                  <GraduationCap className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">모의고사</h2>
                  <p className="text-slate-400 font-medium text-sm">실전처럼 시험보기</p>
                </div>
              </div>

              <div className="w-full mt-2">
                <Link 
                  href={`/`}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200 active:scale-95"
                >
                  <Pencil className="w-4 h-4" />
                  <span>문제풀기</span>
                </Link>
              </div>
            </div> */}
        </div>

        <footer className="mt-20 text-center text-slate-400 text-sm">
          <strong>© 2026 AliceLingo</strong>
          <p>본 서비스는 수익을 창출하지 않는 개인 학습 및 포트폴리오 용도로 제작되었습니다.<br />서비스 내 포함된 모든 문제 컨텐츠의 저작권은 각 원저작권자에게 있으며, 요청 시 즉시 삭제될 수 있습니다.</p>
        </footer>
      </div>
    </main>
  );
}