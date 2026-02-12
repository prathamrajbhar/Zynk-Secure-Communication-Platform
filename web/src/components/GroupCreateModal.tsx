// ═══════════════════════════════════════════════════════
// ZYNK UI — Group Create Modal (Discord-style)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { Avatar as ZAvatar } from '@/components/ui';
import { Search, Users, Camera, ArrowRight, ArrowLeft, X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { showToast } from '@/components/ui';

interface UserResult {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export default function GroupCreateModal() {
  const { showGroupCreate, setShowGroupCreate } = useUIStore();
  const { fetchConversations, setActiveConversation } = useChatStore();
  const [step, setStep] = useState<'members' | 'info'>('members');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
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

  const toggleUser = (user: UserResult) => {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selected.length === 0) {
      showToast('error', 'Enter a group name and select members');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post('/groups', {
        name: groupName.trim(),
        member_ids: selected.map((u) => u.id),
      });
      await fetchConversations();
      if (res.data.conversation_id) setActiveConversation(res.data.conversation_id);
      showToast('success', 'Group created!');
      setShowGroupCreate(false);
    } catch {
      showToast('error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowGroupCreate(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setShowGroupCreate]);

  if (!showGroupCreate) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-appear"
      onClick={(e) => { if (e.target === backdropRef.current) setShowGroupCreate(false); }}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          {step === 'info' && (
            <button
              onClick={() => setStep('members')}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-foreground">
              {step === 'members' ? 'Add Members' : 'Group Info'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {step === 'members' ? `${selected.length} selected` : 'Name your group'}
            </p>
          </div>
          <button
            onClick={() => setShowGroupCreate(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {step === 'members' ? (
          <>
            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                {selected.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => toggleUser(u)}
                  >
                    {u.display_name || u.username}
                    <X className="w-3 h-3" />
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Search users..."
                  className="w-full h-9 pl-9 pr-4 bg-secondary border-0 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
            </div>

            {/* User list */}
            <div className="max-h-[280px] overflow-y-auto chat-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : results.length > 0 ? (
                results.map((u) => {
                  const isSelected = selected.some((s) => s.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUser(u)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent transition-colors text-left"
                    >
                      <ZAvatar name={u.display_name || u.username} src={u.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{u.display_name || u.username}</p>
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      </div>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-border'}`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {query ? 'No users found' : 'Search for users to add'}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => setStep('info')}
                disabled={selected.length === 0}
                className="w-full h-10 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="group-name" className="text-sm font-medium text-foreground">Group Name</label>
                  <input
                    id="group-name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Enter group name"
                    maxLength={64}
                    autoFocus
                    className="w-full h-10 px-3 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Members ({selected.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {selected.map((u) => (
                    <div key={u.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ZAvatar name={u.display_name || u.username} src={u.avatar_url} size="xs" />
                      <span>{u.display_name || u.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={handleCreate}
                disabled={creating || !groupName.trim()}
                className="w-full h-10 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                ) : (
                  'Create Group'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
