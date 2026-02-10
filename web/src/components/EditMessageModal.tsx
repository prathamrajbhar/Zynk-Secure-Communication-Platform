'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';

interface EditMessageModalProps {
  isOpen: boolean;
  originalContent: string;
  onClose: () => void;
  onSave: (newContent: string) => void;
}

export default function EditMessageModal({ isOpen, originalContent, onClose, onSave }: EditMessageModalProps) {
  const [content, setContent] = useState(originalContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(originalContent);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, originalContent]);

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed || trimmed === originalContent) {
      onClose();
      return;
    }
    onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-md shadow-overlay border border-[var(--border)] animate-scale-in overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)]">Edit message</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--hover)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-[var(--bg-wash)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none resize-none focus:ring-2 focus:ring-[var(--accent-ring)] transition-all"
            rows={4}
            placeholder="Edit your message..."
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-2">
            Press Enter to save, Shift+Enter for new line
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-4 flex items-center gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--hover)] transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            disabled={!content.trim() || content.trim() === originalContent}
            className="px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] rounded-xl hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-1.5 active:scale-[0.98]">
            <Check className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
