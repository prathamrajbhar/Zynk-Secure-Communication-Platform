'use client';

import { useState } from 'react';
import { X, Plus, Trash2, BarChart3, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface PollCreateModalProps {
  conversationId: string;
  onClose: () => void;
  onCreated: (poll: Record<string, unknown>) => void;
}

export default function PollCreateModal({ conversationId, onClose, onCreated }: PollCreateModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>('none');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addOption = () => {
    if (options.length < 10) setOptions([...options, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, value: string) => {
    const updated = [...options];
    updated[idx] = value;
    setOptions(updated);
  };

  const handleSubmit = async () => {
    const trimmedQ = question.trim();
    const validOptions = options.map(o => o.trim()).filter(Boolean);
    if (!trimmedQ) return toast.error('Please enter a question');
    if (validOptions.length < 2) return toast.error('At least 2 options required');

    setIsSubmitting(true);
    try {
      const expiresMap: Record<string, number | null> = {
        none: null,
        '1h': 3600,
        '24h': 86400,
        '3d': 259200,
        '7d': 604800,
      };
      const body = {
        conversation_id: conversationId,
        question: trimmedQ,
        options: validOptions,
        allow_multiple: allowMultiple,
        is_anonymous: isAnonymous,
        expires_in_seconds: expiresMap[expiresIn],
      };
      const { data } = await api.post('/polls', body);
      onCreated(data);
      onClose();
      toast.success('Poll created');
    } catch {
      toast.error('Failed to create poll');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md shadow-overlay border border-[var(--border)] animate-scale-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Create Poll</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--hover)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Question */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className="input-field resize-none !py-2.5"
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Options</label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)] w-5 text-center">{idx + 1}</span>
                  <input
                    value={opt}
                    onChange={e => updateOption(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="input-field flex-1 !py-2"
                    maxLength={200}
                  />
                  {options.length > 2 && (
                    <button onClick={() => removeOption(idx)} className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button onClick={addOption} className="mt-2 flex items-center gap-1.5 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            )}
          </div>

          {/* Settings */}
          <div className="flex flex-col gap-3 pt-2 border-t border-[var(--border)]">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-[var(--text-secondary)]">Allow multiple answers</span>
              <div className={cn('w-9 h-5 rounded-full transition-colors relative cursor-pointer', allowMultiple ? 'bg-[var(--accent)]' : 'bg-[var(--bg-wash)]')} onClick={() => setAllowMultiple(!allowMultiple)}>
                <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm', allowMultiple ? 'translate-x-4' : 'translate-x-0.5')} />
              </div>
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-[var(--text-secondary)]">Anonymous voting</span>
              <div className={cn('w-9 h-5 rounded-full transition-colors relative cursor-pointer', isAnonymous ? 'bg-[var(--accent)]' : 'bg-[var(--bg-wash)]')} onClick={() => setIsAnonymous(!isAnonymous)}>
                <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm', isAnonymous ? 'translate-x-4' : 'translate-x-0.5')} />
              </div>
            </label>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <Clock className="w-3.5 h-3.5" /> Auto-close after
              </div>
              <select value={expiresIn} onChange={e => setExpiresIn(e.target.value)}
                className="text-xs bg-[var(--bg-wash)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[var(--text-primary)]">
                <option value="none">Never</option>
                <option value="1h">1 hour</option>
                <option value="24h">24 hours</option>
                <option value="3d">3 days</option>
                <option value="7d">7 days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)] rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting || !question.trim() || options.filter(o => o.trim()).length < 2}
            className="px-4 py-2 text-xs font-medium bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {isSubmitting ? 'Creating...' : 'Create Poll'}
          </button>
        </div>
      </div>
    </div>
  );
}
