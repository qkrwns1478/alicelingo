"use client";

import Image from "next/image";
import Logo from "../../public/icon.png"

export default function Header() {
  return (
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
        <Image src={Logo} alt="Logo" width={48} height={48} />
      </div>
      <h1 className="text-3xl font-extrabold text-slate-800">
        Alice<span className="text-indigo-600">Lingo</span>
      </h1>
    </div>
  );
}
