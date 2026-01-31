'use client';
import { useEffect, useState } from 'react';

interface TimerProps {
  duration: number; // 초 단위
  onComplete: () => void;
  isActive: boolean;
  label?: string;
  color?: string;
  mode?: 'circle' | 'linear';
}

export default function Timer({ 
  duration, 
  onComplete, 
  isActive, 
  label, 
  color = "stroke-indigo-500",
  mode = 'circle'
}: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const progress = duration > 0 ? (duration - timeLeft) / duration : 0;
  const percentage = duration > 0 ? (timeLeft / duration) * 100 : 0;
  const strokeDashoffset = circumference - progress * circumference;

  const getColorClass = (strokeColor: string) => {
    const colorMap: Record<string, string> = {
      "stroke-yellow-400": "bg-yellow-400",
      "stroke-red-500": "bg-red-500",
      "stroke-indigo-500": "bg-indigo-500",
      "stroke-blue-500": "bg-blue-500",
      "stroke-green-500": "bg-green-500",
      "stroke-purple-500": "bg-purple-500",
    };
    return colorMap[strokeColor] || "bg-indigo-500";
  };

  const bgColor = getColorClass(color);

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (!isActive) return;
    if (timeLeft <= 0) {
        return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) return 0;
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && isActive) {
      onComplete();
    }
  }, [timeLeft, isActive, onComplete]);

  if (mode === 'linear') {
    return (
      <div className="flex items-center gap-4 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-lg shadow-xl px-5 py-3 min-w-[280px] animate-in slide-in-from-left fade-in duration-300">
        {label && <span className="text-xs font-bold uppercase text-slate-400 w-16 flex-none">{label}</span>}
        <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
          <div 
            className={`h-full ${bgColor} transition-all duration-100 ease-linear rounded-full`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="font-mono font-bold text-white w-10 text-right flex-none">{Math.ceil(timeLeft)}s</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center w-32 h-32">
      {/* SVG Ring */}
      <svg className="transform -rotate-90 w-32 h-32">
        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          className="text-slate-200"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`${color} transition-all duration-100 ease-linear`}
        />
      </svg>
      {/* Text content */}
      <div className="absolute flex flex-col items-center text-slate-700">
        <span className="text-2xl font-bold font-mono">{Math.ceil(timeLeft)}</span>
        {label && <span className="text-xs uppercase font-semibold text-slate-400">{label}</span>}
      </div>
    </div>
  );
}