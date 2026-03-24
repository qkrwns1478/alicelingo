'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import { Zap, Activity, Calendar } from 'lucide-react';

export default function MyPage() {
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [planInfo, setPlanInfo] = useState({
    plan: 'Free',
    dailyCount: 0,
    lastDate: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/user/profile')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNickname(data.user.nickname);
          setEmail(data.user.email);
          setPlanInfo({
            plan: data.user.plan || 'Free',
            dailyCount: data.user.daily_eval_count || 0,
            lastDate: data.user.last_eval_date || '-'
          });
        } else {
          router.push('/login');
        }
      });
  }, [router]);

  const limits: Record<string, number | string> = { Free: 50, Plus: 100, Pro: '무제한' };
  const maxCount = limits[planInfo.plan] || 50;
  const isUnlimited = maxCount === '무제한';

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    
    if (res.ok) {
      alert('닉네임이 성공적으로 변경되었습니다!');
      window.location.reload(); 
    } else {
      alert('닉네임 변경에 실패했습니다.');
    }
    setIsLoading(false);
  };

  const handleWithdraw = async () => {
    const isConfirm = confirm('정말로 탈퇴하시겠습니까?\n모든 학습 기록이 삭제되며 되돌릴 수 없습니다.');
    if (!isConfirm) return;

    const res = await fetch('/api/auth/withdraw', { method: 'POST' });
    if (res.ok) {
      alert('회원탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
      router.push('/login');
    } else {
      alert('탈퇴 처리 중 문제가 발생했습니다.');
    }
  };

  return (
    <main className="min-h-screen bg-[#F2F4F8] flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 w-full max-w-md">
        <Header />

        <div className="mb-6 text-center border-b pb-4 border-slate-100">
          <h2 className="text-xl font-bold text-slate-800">마이페이지</h2>
        </div>

        <div className="mb-8 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2 text-slate-700 font-bold">
              <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
              <span>현재 플랜</span>
            </div>
            <span className="bg-indigo-100 text-indigo-700 font-extrabold px-3 py-1 rounded-lg text-sm">
              {planInfo.plan}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
              <Activity className="w-4 h-4 text-indigo-500" />
              <span>오늘 AI 평가 사용량</span>
            </div>
            <span className="font-bold text-slate-800">
              <span className="text-indigo-600">{planInfo.dailyCount}</span> / {maxCount}
              {!isUnlimited && <span className="text-xs font-normal text-slate-400 ml-1">회</span>}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600 font-medium text-sm">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>마지막 사용일 (KST)</span>
            </div>
            <span className="font-medium text-slate-500 text-sm">
              {planInfo.lastDate}
            </span>
          </div>
        </div>

        <form onSubmit={handleUpdate} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">이메일 (아이디)</label>
            <input
              type="text"
              value={email}
              disabled
              className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 font-medium cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">닉네임</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
              placeholder="사용하실 닉네임을 입력하세요"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all active:scale-95 disabled:bg-indigo-400 mt-2"
          >
            {isLoading ? '저장 중...' : '정보 수정'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <button
            onClick={handleWithdraw}
            className="text-sm font-bold text-red-500 hover:text-red-600 underline underline-offset-4"
          >
            회원탈퇴
          </button>
        </div>
      </div>
    </main>
  );
}