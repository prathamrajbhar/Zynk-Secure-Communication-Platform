'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { X, Search, MessageCircle, Loader2 } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SearchUser {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export default function NewChatModal() {
  const { showNewChat: showNewChatModal, setShowNewChat: setShowNewChatModal } = useUIStore();
  const { startConversation, setActiveConversation, fetchConversations } = useChatStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (showNewChatModal) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [showNewChatModal]);

  const handleSearch = (value: string) => {
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get('/users/search', { params: { query: value.trim() } });
        setResults(res.data.users || res.data || []);
      } catch {
        toast.error('Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleStartChat = async (targetUser: SearchUser) => {
    setIsStarting(true);
    try {
      const conversationId = await startConversation(targetUser.user_id);
      if (conversationId) {
        await fetchConversations();
        setActiveConversation(conversationId);
        setShowNewChatModal(false);
      }
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setIsStarting(false);
    }
  };

  if (!showNewChatModal) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowNewChatModal(false)}>
      <div
        className="bg-[var(--bg-secondary)] rounded-xl max-w-md w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">New Chat</h3>
          <button
            onClick={() => setShowNewChatModal(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="input-field pl-10"
              placeholder="Search by username..."
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {isSearching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-zynk-500" />
            </div>
          ) : results.length > 0 ? (
            <div className="px-2 pb-2">
              {results.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => handleStartChat(u)}
                  disabled={isStarting}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-zynk-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {getInitials(u.display_name || u.username)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {u.display_name || u.username}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">@{u.username}</p>
                  </div>
                  <MessageCircle className="w-5 h-5 text-zynk-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <p className="text-center text-sm text-[var(--text-muted)] py-8">No users found</p>
          ) : (
            <p className="text-center text-sm text-[var(--text-muted)] py-8">
              Type a username to search
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
