'use client';

import { useState, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { X, Search, Loader2, MessageCircle } from 'lucide-react';
import { getInitials, cn, getAvatarColor } from '@/lib/utils';
import api from '@/lib/api';
import logger from '@/lib/logger';
import toast from 'react-hot-toast';

interface SearchUser { user_id: string; username: string; display_name: string | null; }

export default function NewChatModal() {
  const { showNewChat, setShowNewChat } = useUIStore();
  const { setActiveConversation } = useChatStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try { const res = await api.get('/users/search', { params: { query: value.trim() } }); setResults(res.data.users || res.data || []); }
      catch { toast.error('Search failed'); }
      finally { setIsSearching(false); }
    }, 300);
  };

  const handleStartConversation = async (userId: string) => {
    // Defensive validation - prevent empty body requests
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      logger.error('[NewChatModal] Invalid userId:', userId);
      toast.error('Invalid user selected');
      return;
    }
    // Prevent rapid double-clicks
    if (isStarting) return;
    setIsStarting(true);
    try {
      const convId = await useChatStore.getState().startConversation(userId);
      setActiveConversation(convId);
      setShowNewChat(false); setQuery(''); setResults([]);
    } catch { toast.error('Failed to start conversation'); }
    finally { setIsStarting(false); }
  };

  if (!showNewChat) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
      <div className="modal-content bg-[var(--bg-surface)] rounded-xl max-w-sm w-full overflow-hidden border border-[var(--border)] shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">New Chat</h3>
          <button onClick={() => setShowNewChat(false)} className="btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2.5 bg-[var(--bg-wash)] rounded-xl px-4 py-2.5 border border-transparent focus-within:border-[var(--accent-muted)] transition-colors">
            <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
            <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              placeholder="Search by username..." autoFocus />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto scroll-thin">
          {isSearching ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
          ) : results.length > 0 ? (
            results.map(u => (
              <button key={u.user_id} onClick={() => handleStartConversation(u.user_id)}
                disabled={isStarting}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all duration-200 text-left group disabled:opacity-50 disabled:pointer-events-none">
                <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm transition-transform duration-200 group-hover:scale-105', getAvatarColor(u.username))} key={`avatar-${u.user_id}`}>
                  {getInitials(u.display_name || u.username)}
                </div>
                <div className="flex-1 min-w-0" key={`content-${u.user_id}`}>
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{u.display_name || u.username}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">@{u.username}</p>
                </div>
              </button>
            ))
          ) : query.length >= 2 && !isSearching ? (
            <div className="text-center py-10 text-[var(--text-muted)]">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">No users found</p>
              <p className="text-xs mt-1">Try a different username</p>
            </div>
          ) : (
            <div className="text-center py-10 text-[var(--text-muted)]">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6 opacity-40" />
              </div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Find someone to chat with</p>
              <p className="text-xs mt-1">Type a username to search</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
