import Link from 'next/link';
import { User } from 'lucide-react';

export default function MyPageButton() {
  return (
    <Link
      href="/mypage"
      className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white text-slate-500 text-sm font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm border border-slate-200"
    >
      <User className="w-4 h-4" />
      마이페이지
    </Link>
  );
}