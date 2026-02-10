'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { X, Search, Loader2, Users, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { getInitials, cn, getAvatarColor } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useCryptoStore } from '@/stores/cryptoStore';

interface SearchUser { user_id: string; username: string; display_name: string | null; }

export default function GroupCreateModal() {
  const { showGroupCreate, setShowGroupCreate } = useUIStore();
  const { fetchConversations, setActiveConversation } = useChatStore();
  const [step, setStep] = useState<'details' | 'members'>('details');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!showGroupCreate) { setStep('details'); setGroupName(''); setGroupDescription(''); setQuery(''); setResults([]); setSelectedMembers([]); }
  }, [showGroupCreate]);

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

  const toggleMember = (user: SearchUser) => {
    setSelectedMembers(prev => prev.find(m => m.user_id === user.user_id) ? prev.filter(m => m.user_id !== user.user_id) : [...prev, user]);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { toast.error('Group name is required'); return; }
    if (selectedMembers.length === 0) { toast.error('Add at least one member'); return; }
    setIsCreating(true);
    try {
      const res = await api.post('/groups', { name: groupName.trim(), description: groupDescription.trim() || null, member_ids: selectedMembers.map(m => m.user_id) });
      await fetchConversations();
      if (res.data.conversation_id) {
        setActiveConversation(res.data.conversation_id);
        // Distribute sender key to all group members for E2EE
        useCryptoStore.getState().distributeGroupSenderKey(res.data.conversation_id).catch(() => {});
      }
      setShowGroupCreate(false);
      toast.success('Group created');
    } catch { toast.error('Failed to create group'); }
    finally { setIsCreating(false); }
  };

  if (!showGroupCreate) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={() => setShowGroupCreate(false)}>
      <div className="modal-content bg-[var(--bg-surface)] rounded-xl max-w-md w-full overflow-hidden border border-[var(--border)] shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
          {step === 'members' && (
            <button onClick={() => setStep('details')} className="btn-icon text-[var(--text-muted)]">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{step === 'details' ? 'New Group' : 'Add Members'}</h3>
          </div>
          {step === 'members' && selectedMembers.length > 0 && (
            <span className="text-xs font-semibold text-[var(--accent)] bg-[var(--accent-subtle)] px-2.5 py-1 rounded-full">{selectedMembers.length} selected</span>
          )}
          <button onClick={() => setShowGroupCreate(false)} className="btn-icon text-[var(--text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'details' ? (
          <div className="p-5 space-y-5">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20 transition-transform duration-300 hover:scale-105">
                <Users className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Group Name</label>
              <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)}
                className="input-modern" placeholder="Enter group name" maxLength={100} autoFocus />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Description</label>
              <textarea value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)}
                className="input-modern resize-none" placeholder="Optional description" rows={2} maxLength={500} />
            </div>
            <button onClick={() => setStep('members')} disabled={!groupName.trim()}
              className="btn-primary btn-shimmer w-full flex items-center justify-center gap-2 !rounded-xl py-3 font-bold">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div>
            {selectedMembers.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-2">
                {selectedMembers.map(m => (
                  <span key={m.user_id} className="inline-flex items-center gap-1.5 bg-[var(--accent-subtle)] text-[var(--accent)] px-3 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all duration-200 hover:shadow-md">
                    {m.display_name || m.username}
                    <button onClick={() => toggleMember(m)} className="hover:text-[var(--danger)] transition-colors"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}

            <div className="p-4">
              <div className="flex items-center gap-2.5 bg-[var(--bg-wash)] rounded-xl px-4 py-2.5 border border-transparent focus-within:border-[var(--accent-muted)] transition-colors">
                <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
                  placeholder="Search users..." />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto scroll-thin">
              {isSearching ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[var(--accent)]" /></div>
              ) : results.map(u => {
                const isSelected = selectedMembers.some(m => m.user_id === u.user_id);
                return (
                  <button key={u.user_id} onClick={() => toggleMember(u)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all duration-200 text-left group">
                    <div className="relative">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm transition-transform duration-200 group-hover:scale-105', getAvatarColor(u.username), isSelected && 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-surface)]')}>
                        {getInitials(u.display_name || u.username)}
                      </div>
                      {isSelected && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-[var(--accent)] flex items-center justify-center border-2 border-[var(--bg-surface)] shadow-sm">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{u.display_name || u.username}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">@{u.username}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-4 pt-2">
              <button onClick={handleCreate} disabled={isCreating || selectedMembers.length === 0}
                className="btn-primary btn-shimmer w-full flex items-center justify-center gap-2 !rounded-xl py-3 font-bold">
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Create Group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
