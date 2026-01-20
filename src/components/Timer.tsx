'use client';
import { useEffect, useState } from 'react';

interface TimerProps {
  duration: number; // 초 단위
  onComplete: () => void;
  isActive: boolean;
  label?: string;
  color?: string;
}

export default function Timer({ duration, onComplete, isActive, label, color = "stroke-indigo-500" }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  
  // 원의 둘레 계산 (r=40)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((duration - timeLeft) / duration) * circumference;

  useEffect(() => {
    if (!isActive) return;
    
    // 타이머 리셋
    if (timeLeft === 0 && duration > 0) {
        // 이미 완료된 상태면 아무것도 안 함 (부모가 처리)
        return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, duration, onComplete]);

  // duration이 바뀌면 리셋
  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

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