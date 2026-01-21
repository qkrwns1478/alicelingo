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

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const progress = duration > 0 ? (duration - timeLeft) / duration : 0;
  const strokeDashoffset = circumference - progress * circumference;

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (!isActive) return;
    if (timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        // 부동소수점 오차 등을 고려하여 0.1초 이하일 때 0으로 처리
        if (prev <= 0.1) {
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, timeLeft]); // timeLeft를 의존성에 추가하여 0이 되면 인터벌 정지

  // timeLeft가 0이 되고, 활성 상태일 때만 onComplete 호출
  useEffect(() => {
    if (timeLeft === 0 && isActive) {
      onComplete();
    }
  }, [timeLeft, isActive, onComplete]);

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