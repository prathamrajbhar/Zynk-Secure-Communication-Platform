'use client';

import { useState, useEffect, useRef } from 'react';
import { Timer, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisappearingMessageBadgeProps {
  expiresAt: string | Date;
  messageId: string;
  onExpire: () => void;
}

export default function DisappearingMessageBadge({ 
  expiresAt, 
  messageId,
  onExpire 
}: DisappearingMessageBadgeProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpiring, setIsExpiring] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const expiryTime = new Date(expiresAt).getTime();
      const remaining = Math.max(0, expiryTime - now);
      
      setTimeLeft(remaining);

      // Start expiring animation when <5s left
      if (remaining < 5000 && remaining > 0) {
        setIsExpiring(true);
      }

      // Trigger deletion when expired
      if (remaining === 0) {
        onExpire();
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }
    };

    calculateTimeLeft();
    timerRef.current = setInterval(calculateTimeLeft, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [expiresAt, messageId, onExpire]);

  const formatTimeLeft = (ms: number): string => {
    if (ms === 0) return 'Expired';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  if (timeLeft === 0) {
    return null; // Message should be removed
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        isExpiring 
          ? 'bg-red-500/20 text-red-400 animate-pulse' 
          : 'bg-[var(--accent)]/10 text-[var(--accent)]'
      )}
    >
      {isExpiring ? (
        <Flame className="w-3 h-3" />
      ) : (
        <Timer className="w-3 h-3" />
      )}
      <span>{formatTimeLeft(timeLeft)}</span>
    </div>
  );
}
