'use client';

import { Shield, ShieldCheck, Info } from 'lucide-react';
import { useDoubleRatchetStore } from '@/stores/doubleRatchetStore';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export default function DoubleRatchetToggle() {
  const { enabled, toggleRatchet } = useDoubleRatchetStore();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-[var(--bg-wash)] border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            enabled ? 'bg-green-500/10' : 'bg-[var(--bg-surface)]'
          )}>
            {enabled ? (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            ) : (
              <Shield className="w-5 h-5 text-[var(--text-muted)]" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Forward Secrecy (Double Ratchet)
              </p>
              <button
                onClick={() => setShowInfo(!showInfo)}
                className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {enabled 
                ? 'Enhanced security with key rotation per message' 
                : 'Basic encryption (no key rotation)'}
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleRatchet(!enabled)}
          className={cn(
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2',
            enabled ? 'bg-green-500' : 'bg-[var(--bg-secondary)]'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
              enabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>

      {showInfo && (
        <div className="mt-3 p-4 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 text-sm space-y-2">
          <h4 className="font-semibold text-[var(--accent)] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            What is Forward Secrecy?
          </h4>
          <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
            Forward secrecy (via Double Ratchet) means that even if your encryption keys are compromised today, 
            past messages remain secure. Each message uses a unique key that's immediately discarded after use.
          </p>
          <div className="pt-2 border-t border-[var(--accent)]/10 text-xs">
            <p className="text-[var(--text-muted)]">
              <strong>⚡ Enabled:</strong> Maximum security with automatic key rotation
            </p>
            <p className="text-[var(--text-muted)] mt-1">
              <strong>⚠️ Disabled:</strong> Basic encryption (static keys, faster but less secure)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
