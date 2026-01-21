"use client";

import { Rabbit } from "lucide-react";

export default function Header() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
        <Rabbit className="w-8 h-8 text-indigo-600" />
      </div>
      <h1 className="text-3xl font-extrabold text-slate-800">
        Alice<span className="text-indigo-600">Lingo</span>
      </h1>
    </div>
  );
}
