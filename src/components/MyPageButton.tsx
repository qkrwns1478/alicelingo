'use client';

import { useState } from 'react';
import { User } from 'lucide-react';
import MyPageModal from './MyPageModal';

export default function MyPageButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white text-slate-500 text-sm font-bold hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm border border-slate-200 cursor-pointer"
      >
        <User className="w-4 h-4" />
        마이페이지
      </button>

      <MyPageModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}