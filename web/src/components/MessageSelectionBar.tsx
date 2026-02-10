'use client';

import { cn } from '@/lib/utils';
import { X, Trash2, Forward, Star, Copy, CheckSquare } from 'lucide-react';

interface MessageSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  onClose: () => void;
  onDelete: () => void;
  onForward: () => void;
  onStar: () => void;
  onCopy: () => void;
  onSelectAll: () => void;
}

export default function MessageSelectionBar({
  selectedCount, totalCount, onClose, onDelete, onForward, onStar, onCopy, onSelectAll,
}: MessageSelectionBarProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="h-[64px] px-4 flex items-center justify-between bg-[var(--accent)] flex-shrink-0 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90">
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-[15px] font-bold text-white">
          {selectedCount} selected
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onSelectAll} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90" title={allSelected ? 'Deselect all' : 'Select all'}>
          <CheckSquare className={cn('w-[18px] h-[18px] text-white', allSelected && 'opacity-60')} />
        </button>
        <button onClick={onCopy} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90" title="Copy">
          <Copy className="w-[18px] h-[18px] text-white" />
        </button>
        <button onClick={onStar} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90" title="Star">
          <Star className="w-[18px] h-[18px] text-white" />
        </button>
        <button onClick={onForward} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90" title="Forward">
          <Forward className="w-[18px] h-[18px] text-white" />
        </button>
        <button onClick={onDelete} className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-90" title="Delete">
          <Trash2 className="w-[18px] h-[18px] text-white" />
        </button>
      </div>
    </div>
  );
}
