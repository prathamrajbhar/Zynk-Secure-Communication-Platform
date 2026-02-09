'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { getInitials, cn } from '@/lib/utils';
import {
  X, Users, UserPlus, Crown, Loader2,
  Trash2, LogOut, Search, Edit3, Check
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface GroupMember {
  user_id: string;
  role: string;
  joined_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface GroupInfo {
  group_id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  conversation_id: string;
  created_by: string;
  created_at: string;
  max_members: number;
  members: GroupMember[];
}

const avatarColors = [
  'bg-rose-500', 'bg-violet-500', 'bg-blue-500', 'bg-cyan-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-zynk-500', 'bg-red-500',
];
function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return avatarColors[Math.abs(h) % avatarColors.length];
}

interface GroupInfoPanelProps {
  groupId: string;
  onClose: () => void;
}

export default function GroupInfoPanel({ groupId, onClose }: GroupInfoPanelProps) {
  const { user } = useAuthStore();
  const { fetchConversations } = useChatStore();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ user_id: string; username: string; display_name?: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);

  const isAdmin = group?.members.some(m => m.user_id === user?.id && m.role === 'admin') || false;

  const fetchGroup = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/groups/${groupId}`);
      setGroup(res.data);
      setName(res.data.name);
      setDescription(res.data.description || '');
    } catch {
      toast.error('Failed to load group info');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchGroup(); }, [groupId]);

  const handleSaveName = async () => {
    if (!name.trim()) { toast.error('Name cannot be empty'); return; }
    setIsSaving(true);
    try {
      await api.put(`/groups/${groupId}`, { name: name.trim() });
      setGroup(prev => prev ? { ...prev, name: name.trim() } : prev);
      setEditingName(false);
      fetchConversations(); // Refresh sidebar
      toast.success('Group name updated');
    } catch {
      toast.error('Failed to update name');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    setIsSaving(true);
    try {
      await api.put(`/groups/${groupId}`, { description: description.trim() || null });
      setGroup(prev => prev ? { ...prev, description: description.trim() || null } : prev);
      setEditingDescription(false);
      toast.success('Description updated');
    } catch {
      toast.error('Failed to update description');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try {
      const res = await api.get(`/users/search?query=${query}`);
      const existingIds = new Set(group?.members.map(m => m.user_id) || []);
      setSearchResults(
        (res.data.users || []).filter((u: { user_id: string }) => !existingIds.has(u.user_id))
      );
    } catch { setSearchResults([]); }
    finally { setIsSearching(false); }
  };

  const handleAddMember = async (userId: string) => {
    setIsAddingMember(true);
    try {
      await api.post(`/groups/${groupId}/members`, { user_ids: [userId] });
      await fetchGroup();
      setSearchQuery('');
      setSearchResults([]);
      toast.success('Member added');
    } catch {
      toast.error('Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await api.delete(`/groups/${groupId}/members/${userId}`);
      setGroup(prev => prev ? { ...prev, members: prev.members.filter(m => m.user_id !== userId) } : prev);
      fetchConversations();
      toast.success('Member removed');
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handleLeaveGroup = async () => {
    if (!user?.id) return;
    try {
      await api.delete(`/groups/${groupId}/members/${user.id}`);
      fetchConversations();
      toast.success('Left group');
      onClose();
    } catch {
      toast.error('Failed to leave group');
    }
  };

  const handleDeleteGroup = async () => {
    try {
      await api.delete(`/groups/${groupId}`);
      fetchConversations();
      toast.success('Group deleted');
      onClose();
    } catch {
      toast.error('Failed to delete group');
    }
  };

  if (isLoading) {
    return (
      <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
        <div className="modal-content glass-card rounded-2xl max-w-md w-full p-8 flex items-center justify-center" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        </div>
      </div>
    );
  }

  if (!group) return null;

  return (
    <div className="modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-content glass-card rounded-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-violet-500" />
            </div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Group Info</h3>
          </div>
          <button onClick={onClose} className="btn-icon text-[var(--text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin">
          {/* Group avatar & name */}
          <div className="p-6 pb-4 text-center">
            <div className="w-20 h-20 rounded-full bg-violet-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg">
              <Users className="w-8 h-8" />
            </div>

            {editingName ? (
              <div className="flex items-center gap-2 justify-center">
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  className="input-modern text-center text-lg font-bold max-w-[200px]"
                  autoFocus maxLength={255}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                />
                <button onClick={handleSaveName} disabled={isSaving}
                  className="btn-icon text-[var(--success)]">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button onClick={() => { setEditingName(false); setName(group.name); }}
                  className="btn-icon text-[var(--text-muted)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-lg font-bold text-[var(--text-primary)]">{group.name}</h2>
                {isAdmin && (
                  <button onClick={() => setEditingName(true)} className="btn-icon w-7 h-7">
                    <Edit3 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </button>
                )}
              </div>
            )}

            {/* Description */}
            {editingDescription ? (
              <div className="mt-3 flex flex-col items-center gap-2">
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  className="input-modern text-center text-sm w-full max-w-[280px] resize-none" rows={2}
                  placeholder="Add a group description" maxLength={500}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveDescription} disabled={isSaving}
                    className="text-xs text-[var(--accent)] font-bold hover:underline">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingDescription(false); setDescription(group.description || ''); }}
                    className="text-xs text-[var(--text-muted)] hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1 mt-1">
                <p className="text-sm text-[var(--text-muted)]">
                  {group.description || (isAdmin ? 'Add a description' : 'No description')}
                </p>
                {isAdmin && (
                  <button onClick={() => setEditingDescription(true)} className="btn-icon w-6 h-6">
                    <Edit3 className="w-3 h-3 text-[var(--text-muted)]" />
                  </button>
                )}
              </div>
            )}

            <p className="text-xs text-[var(--text-muted)] mt-2">
              Created {new Date(group.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="h-px bg-[var(--separator)] mx-5" />

          {/* Members section */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                Members ({group.members.length})
              </span>
              {isAdmin && (
                <button onClick={() => setShowAddMember(!showAddMember)}
                  className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline underline-offset-2">
                  <UserPlus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>

            {/* Add member search */}
            {showAddMember && (
              <div className="mb-3 space-y-2">
                <div className="flex items-center gap-2 bg-[var(--bg-wash)] rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-[var(--text-muted)]" />
                  <input type="text" value={searchQuery}
                    onChange={e => handleSearchUsers(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
                    placeholder="Search users to add..."
                    autoFocus
                  />
                  {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />}
                </div>
                {searchResults.map(u => (
                  <button key={u.user_id} onClick={() => handleAddMember(u.user_id)}
                    disabled={isAddingMember}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--hover)] rounded-xl transition-colors">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold', getAvatarColor(u.display_name || u.username))}>
                      {getInitials(u.display_name || u.username)}
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{u.display_name || u.username}</span>
                    <UserPlus className="w-4 h-4 text-[var(--accent)] ml-auto" />
                  </button>
                ))}
                {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-2">No users found</p>
                )}
              </div>
            )}

            {/* Member list */}
            <div className="space-y-1">
              {group.members.map(member => {
                const memberName = member.display_name || member.username;
                const isMe = member.user_id === user?.id;

                return (
                  <div key={member.user_id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--hover)] transition-colors group">
                    {member.avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={member.avatar_url} alt={memberName} className="w-9 h-9 rounded-full object-cover" />
                    ) : (
                      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold', getAvatarColor(memberName))}>
                        {getInitials(memberName)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {memberName}{isMe ? ' (You)' : ''}
                        </span>
                        {member.role === 'admin' && (
                          <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)]">@{member.username}</span>
                    </div>
                    {isAdmin && !isMe && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="btn-icon w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[var(--danger)]" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-[var(--separator)] mx-5" />

          {/* Actions */}
          <div className="p-5 space-y-2">
            <button onClick={handleLeaveGroup}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--danger)] hover:bg-red-500/5 transition-colors text-sm font-medium">
              <LogOut className="w-4 h-4" /> Leave group
            </button>
            {isAdmin && (
              <button onClick={handleDeleteGroup}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--danger)] hover:bg-red-500/5 transition-colors text-sm font-medium">
                <Trash2 className="w-4 h-4" /> Delete group
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
