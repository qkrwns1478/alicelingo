'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white text-slate-500 text-sm font-bold hover:bg-red-50 hover:text-red-600 transition-all shadow-sm border border-slate-200"
    >
      <LogOut className="w-4 h-4" />
      로그아웃
    </button>
  );
}