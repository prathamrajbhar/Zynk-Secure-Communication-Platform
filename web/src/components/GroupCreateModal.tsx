'use client';

import { useState, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore } from '@/stores/chatStore';
import { X, Search, Loader2, Users, Check } from 'lucide-react';
import { getInitials, cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SearchUser {
  id: string;
  username: string;
  display_name: string | null;
}

export default function GroupCreateModal() {
  const { showGroupCreate: showGroupCreateModal, setShowGroupCreate: setShowGroupCreateModal } = useUIStore();
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
    if (!showGroupCreateModal) {
      setStep('details');
      setGroupName('');
      setGroupDescription('');
      setQuery('');
      setResults([]);
      setSelectedMembers([]);
    }
  }, [showGroupCreateModal]);

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

  const toggleMember = (user: SearchUser) => {
    setSelectedMembers(prev => {
      const exists = prev.find(m => m.id === user.id);
      if (exists) return prev.filter(m => m.id !== user.id);
      return [...prev, user];
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error('Group name is required');
      return;
    }
    if (selectedMembers.length === 0) {
      toast.error('Add at least one member');
      return;
    }

    setIsCreating(true);
    try {
      const res = await api.post('/groups', {
        name: groupName.trim(),
        description: groupDescription.trim() || null,
        member_ids: selectedMembers.map(m => m.id),
      });

      await fetchConversations();
      if (res.data.conversation_id) {
        setActiveConversation(res.data.conversation_id);
      }
      setShowGroupCreateModal(false);
      toast.success('Group created');
    } catch {
      toast.error('Failed to create group');
    } finally {
      setIsCreating(false);
    }
  };

  if (!showGroupCreateModal) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowGroupCreateModal(false)}>
      <div
        className="bg-[var(--bg-secondary)] rounded-xl max-w-md w-full shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            {step === 'details' ? 'New Group' : 'Add Members'}
          </h3>
          <button
            onClick={() => setShowGroupCreateModal(false)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'details' ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Group Name*</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="input-field"
                placeholder="Enter group name"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Description</label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="input-field resize-none"
                placeholder="Optional description"
                rows={3}
                maxLength={500}
              />
            </div>
            <button
              onClick={() => setStep('members')}
              disabled={!groupName.trim()}
              className="btn-primary w-full"
            >
              Next: Add Members
            </button>
          </div>
        ) : (
          <div>
            {/* Selected members */}
            {selectedMembers.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-2">
                {selectedMembers.map(m => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1 bg-zynk-100 dark:bg-zynk-900/30 text-zynk-700 dark:text-zynk-300 px-2.5 py-1 rounded-full text-xs"
                  >
                    {m.display_name || m.username}
                    <button onClick={() => toggleMember(m)} className="hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="input-field pl-10"
                  placeholder="Search users to add..."
                />
              </div>
            </div>

            {/* Search results */}
            <div className="max-h-48 overflow-y-auto px-2">
              {isSearching ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-zynk-500" />
                </div>
              ) : results.map(u => {
                const isSelected = selectedMembers.some(m => m.id === u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleMember(u)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                      isSelected ? 'bg-zynk-50 dark:bg-zynk-900/20' : 'hover:bg-[var(--bg-tertiary)]'
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-zynk-600 flex items-center justify-center text-white text-sm font-medium">
                      {getInitials(u.display_name || u.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {u.display_name || u.username}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">@{u.username}</p>
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-zynk-500" />}
                  </button>
                );
              })}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-[var(--border)] flex gap-2">
              <button onClick={() => setStep('details')} className="btn-secondary flex-1">
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={isCreating || selectedMembers.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Create Group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
