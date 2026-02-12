// ═══════════════════════════════════════════════════════
// ZYNK UI — New Chat Modal (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { Avatar as ZAvatar } from '@/components/ui';
import { Search, MessageCircle, UserPlus, X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/components/ui';

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export default function NewChatModal() {
  const { showNewChat, setShowNewChat } = useUIStore();
  const { startConversation, setActiveConversation } = useChatStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const backdropRef = useRef<HTMLDivElement>(null);

  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setResults(res.data.users || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleStartChat = async (userId: string) => {
    setStarting(userId);
    try {
      const conversationId = await startConversation(userId);
      setActiveConversation(conversationId);
      setShowNewChat(false);
    } catch {
      showToast('error', 'Failed to start conversation');
    } finally {
      setStarting(null);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewChat(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setShowNewChat]);

  if (!showNewChat) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-appear"
      onClick={(e) => { if (e.target === backdropRef.current) setShowNewChat(false); }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">New Chat</h2>
            <p className="text-xs text-muted-foreground">Start a conversation</p>
          </div>
          <button
            onClick={() => setShowNewChat(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by username..."
              className="w-full h-9 pl-9 pr-4 bg-secondary border-0 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
              aria-label="Search users"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto chat-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="py-1">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartChat(u.id)}
                  disabled={starting === u.id}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors text-left disabled:opacity-60"
                >
                  <ZAvatar name={u.display_name || u.username} src={u.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                  </div>
                  {starting === u.id ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <UserPlus className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {query ? 'No users found' : 'Search for a user to start chatting'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
