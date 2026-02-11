'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Timer, Zap, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DisappearingMessageTimerProps {
  conversationId: string;
  onTimerSet: (seconds: number | null) => void;
  currentTimer?: number | null;
}

const TIMER_OPTIONS = [
  { label: 'Off', value: null, icon: Clock },
  { label: '5 sec', value: 5, icon: Zap },
  { label: '30 sec', value: 30, icon: Zap },
  { label: '1 min', value: 60, icon: Timer },
  { label: '5 min', value: 300, icon: Timer },
  { label: '1 hour', value: 3600, icon: Timer },
  { label: '1 day', value: 86400, icon: Timer },
  { label: '1 week', value: 604800, icon: Timer },
];

export default function DisappearingMessageTimer({ 
  conversationId, 
  onTimerSet, 
  currentTimer 
}: DisappearingMessageTimerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (value: number | null) => {
    onTimerSet(value);
    setIsOpen(false);
    
    // Store preference per conversation
    const key = `zynk_disappearing_timer_${conversationId}`;
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value.toString());
    }
  };

  const getCurrentLabel = () => {
    if (!currentTimer) return 'Off';
    const option = TIMER_OPTIONS.find(opt => opt.value === currentTimer);
    return option ? option.label : `${currentTimer}s`;
  };

  const isActive = currentTimer !== null && currentTimer > 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'p-2 rounded-full transition-all duration-200',
          isActive 
            ? 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20' 
            : 'hover:bg-[var(--hover)] text-[var(--text-muted)]'
        )}
        title={`Disappearing messages: ${getCurrentLabel()}`}
      >
        <Timer className={cn('w-5 h-5', isActive && 'animate-pulse')} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 right-0 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-2xl p-2 min-w-[160px] animate-scale-in z-50">
          <div className="text-xs font-semibold text-[var(--text-muted)] px-2 py-1 mb-1">
            Disappearing Messages
          </div>
          <div className="space-y-0.5">
            {TIMER_OPTIONS.map(({ label, value, icon: Icon }) => (
              <button
                key={label}
                onClick={() => handleSelect(value)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                  'hover:bg-[var(--hover)]',
                  currentTimer === value 
                    ? 'bg-[var(--accent)]/10 text-[var(--accent)]' 
                    : 'text-[var(--text-primary)]'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {currentTimer === value && (
                  <Check className="w-4 h-4 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] px-2 py-1.5 mt-1 border-t border-[var(--border)]">
            Messages auto-delete after timer expires
          </div>
        </div>
      )}
    </div>
  );
}
