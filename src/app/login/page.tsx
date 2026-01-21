'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';

export default function LoginPage() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('아이디 또는 비밀번호가 잘못되었습니다.');
      }
    } catch (err) {
      setError('로그인 중 오류가 발생했습니다.');
    }
  };

  return (
    <main className="min-h-screen bg-[#F2F4F8] flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-slate-100 w-full max-w-md">
        <Header />

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">아이디</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="아이디를 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              placeholder="비밀번호를 입력하세요"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center font-medium">{error}</p>}

          <button
            type="submit"
            className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 mt-4 active:scale-95"
          >
            로그인
          </button>
        </form>
      </div>
    </main>
  );
}