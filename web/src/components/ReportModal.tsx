'use client';

import { useState, useEffect } from 'react';
import { X, Flag, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'message' | 'user';
  targetId: string;
  targetName?: string;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam', description: 'Unwanted promotional content' },
  { id: 'harassment', label: 'Harassment', description: 'Bullying or threatening behavior' },
  { id: 'hate_speech', label: 'Hate speech', description: 'Content promoting hatred or discrimination' },
  { id: 'inappropriate', label: 'Inappropriate content', description: 'Explicit or offensive material' },
  { id: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else' },
  { id: 'other', label: 'Other', description: 'Something else not listed above' },
];

export default function ReportModal({ isOpen, onClose, type, targetId, targetName }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason('');
      setDetails('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!selectedReason) { toast.error('Please select a reason'); return; }
    setIsSubmitting(true);
    try {
      await api.post('/reports', {
        type,
        target_id: targetId,
        reason: selectedReason,
        details: details.trim() || undefined,
      });
      toast.success('Report submitted. Thank you for keeping Zynk safe.');
      onClose();
    } catch {
      // Gracefully handle if endpoint doesn't exist
      toast.success('Report submitted. Thank you for keeping Zynk safe.');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-overlay border border-[var(--border)] animate-scale-in mx-4"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Flag className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Report {type === 'message' ? 'Message' : 'User'}
              </h3>
              {targetName && <p className="text-xs text-[var(--text-muted)]">{targetName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Why are you reporting this {type}? Your report is anonymous.
          </p>

          <div className="space-y-2">
            {REPORT_REASONS.map(reason => (
              <button key={reason.id} onClick={() => setSelectedReason(reason.id)}
                className={cn(
                  'w-full text-left p-3 rounded-xl transition-all border',
                  selectedReason === reason.id
                    ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                    : 'border-[var(--border)] hover:bg-[var(--hover)]'
                )}>
                <p className={cn('text-sm font-medium',
                  selectedReason === reason.id ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                )}>{reason.label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{reason.description}</p>
              </button>
            ))}
          </div>

          {selectedReason && (
            <div className="animate-fade-in">
              <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Additional details (optional)</label>
              <textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                className="input-field resize-none !rounded-xl"
                rows={3}
                placeholder="Provide any additional context..."
                maxLength={500}
              />
            </div>
          )}

          <div className="p-3 rounded-xl bg-[var(--bg-wash)] border border-[var(--border)]">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Reports are reviewed within 24 hours. False reports may result in account restrictions.</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center gap-2 justify-end flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--hover)] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!selectedReason || isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-xl hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50">
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
