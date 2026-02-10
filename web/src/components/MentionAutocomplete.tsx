'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface MentionUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

interface MentionAutocompleteProps {
  members: MentionUser[];
  query: string;
  position: { top: number; left: number };
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
}

export default function MentionAutocomplete({ members, query, position, onSelect, onClose }: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = members.filter(m => {
    const q = query.toLowerCase();
    return m.username.toLowerCase().includes(q) ||
           (m.display_name || '').toLowerCase().includes(q);
  }).slice(0, 6);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selectedIndex]) onSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIndex, filtered, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-overlay py-1 min-w-[200px] max-w-[280px] animate-scale-in"
      style={{ bottom: position.top, left: position.left }}
    >
      {filtered.map((user, idx) => (
        <button
          key={user.id}
          onClick={() => onSelect(user)}
          onMouseEnter={() => setSelectedIndex(idx)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
            idx === selectedIndex ? 'bg-[var(--hover)]' : ''
          )}
        >
          <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[10px] font-bold text-[var(--accent)] flex-shrink-0">
            {(user.display_name || user.username).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--text-primary)] truncate">
              {user.display_name || user.username}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] truncate">@{user.username}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
