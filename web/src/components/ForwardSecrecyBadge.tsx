'use client';

import { ShieldCheck } from 'lucide-react';
import { useDoubleRatchetStore } from '@/stores/doubleRatchetStore';
import { cn } from '@/lib/utils';

interface ForwardSecrecyBadgeProps {
  encryptedContent?: string;
  className?: string;
}

function isRatchetMessage(content?: string): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return parsed.v === 5 && parsed.header && parsed.ct;
  } catch {
    return false;
  }
}

export default function ForwardSecrecyBadge({ encryptedContent, className }: ForwardSecrecyBadgeProps) {
  const { enabled } = useDoubleRatchetStore();

  if (!enabled || !isRatchetMessage(encryptedContent)) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium',
        'bg-green-500/10 text-green-500',
        className
      )}
      title="This message uses Forward Secrecy (Double Ratchet)"
    >
      <ShieldCheck className="w-3 h-3" />
    </div>
  );
}
