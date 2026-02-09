'use client';

import { useState, useEffect } from 'react';
import { X, Shield, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useCryptoStore } from '@/stores/cryptoStore';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface SafetyNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function SafetyNumberModal({ isOpen, onClose, userId, userName }: SafetyNumberModalProps) {
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const { getSafetyNumber } = useCryptoStore();

  useEffect(() => {
    if (isOpen && userId) {
      setLoading(true);
      getSafetyNumber(userId)
        .then((number) => setSafetyNumber(number))
        .catch(() => toast.error('Failed to generate safety number'))
        .finally(() => setLoading(false));
    }
    return () => {
      setSafetyNumber(null);
      setLoading(true);
    };
  }, [isOpen, userId, getSafetyNumber]);

  const copyToClipboard = () => {
    if (safetyNumber) {
      navigator.clipboard.writeText(safetyNumber);
      toast.success('Safety number copied');
    }
  };

  const formatSafetyNumber = (num: string): string[][] => {
    // Format as 12 groups of 5 digits
    const groups: string[][] = [];
    let row: string[] = [];
    for (let i = 0; i < num.length; i += 5) {
      row.push(num.slice(i, i + 5));
      if (row.length === 4) {
        groups.push(row);
        row = [];
      }
    }
    if (row.length > 0) groups.push(row);
    return groups;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4 z-[60]" onClick={onClose}>
      <div
        className="modal-content glass-card rounded-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Shield className="w-[18px] h-[18px] text-green-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">Safety Number</h3>
              <p className="text-xs text-[var(--text-muted)]">Verify with {userName}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon text-[var(--text-muted)]">
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-[var(--accent)] animate-spin mb-3" />
              <p className="text-sm text-[var(--text-muted)]">Generating safety number...</p>
            </div>
          ) : safetyNumber ? (
            <>
              {/* Safety number grid */}
              <div className="bg-[var(--bg-app)] rounded-xl border border-[var(--border)] p-4">
                <div className="space-y-2 font-mono text-center">
                  {formatSafetyNumber(safetyNumber).map((row, i) => (
                    <div key={i} className="flex justify-center gap-4">
                      {row.map((group, j) => (
                        <span
                          key={j}
                          className="text-sm font-semibold text-[var(--text-primary)] tracking-widest"
                        >
                          {group}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
                <button
                  onClick={() => {
                    setVerified(!verified);
                    if (!verified) toast.success('Marked as verified');
                  }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    verified
                      ? 'bg-green-500/10 border border-green-500/30 text-green-500'
                      : 'bg-[var(--accent)] text-white hover:opacity-90'
                  )}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {verified ? 'Verified' : 'Mark Verified'}
                </button>
              </div>

              {/* Explanation */}
              <div className="p-4 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-muted)]">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Compare this safety number with <strong>{userName}</strong> using a different channel
                  (in person, phone call, etc.). If the numbers match, your conversation is end-to-end
                  encrypted and no one can intercept your messages.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Shield className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Not Available</p>
              <p className="text-xs mt-1 text-center">
                Safety number is available once an encrypted session is established.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
