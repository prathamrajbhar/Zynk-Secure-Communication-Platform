'use client';

import { useState, useMemo } from 'react';
import { useChatStore, Conversation, Message } from '@/stores/chatStore';
import { cn, getInitials, getAvatarColor } from '@/lib/utils';
import { X, Search, Send, Users, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Fuse from 'fuse.js';

interface ForwardMessageModalProps {
  isOpen: boolean;
  messages: Message[];
  onClose: () => void;
}

export default function ForwardMessageModal({ isOpen, messages, onClose }: ForwardMessageModalProps) {
  const { conversations, sendMessageOptimistic } = useChatStore();
  const [search, setSearch] = useState('');
  const [selectedConvs, setSelectedConvs] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  const fuse = useMemo(() => new Fuse(conversations, {
    keys: ['other_user.display_name', 'other_user.username', 'group_info.name'],
    threshold: 0.4,
  }), [conversations]);

  const filteredConversations = useMemo(() => {
    if (!search) return conversations;
    return fuse.search(search).map(r => r.item);
  }, [search, conversations, fuse]);

  const toggleConversation = (convId: string) => {
    setSelectedConvs(prev => {
      if (prev.includes(convId)) return prev.filter(id => id !== convId);
      if (prev.length >= 5) { toast.error('You can forward to max 5 chats'); return prev; }
      return [...prev, convId];
    });
  };

  const handleForward = async () => {
    if (selectedConvs.length === 0 || messages.length === 0) return;
    setIsSending(true);

    try {
      for (const convId of selectedConvs) {
        for (const msg of messages) {
          const content = msg.content || '';
          if (!content) continue; // Skip messages that couldn't be decrypted
          const prefix = messages.length > 1 ? '' : '↪ Forwarded:\n';
          const forwardContent = `${prefix}${content}`;
          sendMessageOptimistic(convId, forwardContent, msg.message_type);
        }
      }
      toast.success(`Forwarded to ${selectedConvs.length} chat${selectedConvs.length > 1 ? 's' : ''}`);
      onClose();
    } catch {
      toast.error('Failed to forward messages');
    } finally {
      setIsSending(false);
    }
  };

  const getConvName = (conv: Conversation) =>
    conv.type === 'one_to_one'
      ? (conv.other_user?.display_name || conv.other_user?.username || 'Unknown')
      : (conv.group_info?.name || 'Group');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-[var(--bg-surface)] rounded-xl w-full max-w-md max-h-[80vh] flex flex-col shadow-overlay border border-[var(--border)] animate-scale-in overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">Forward message</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {messages.length} message{messages.length > 1 ? 's' : ''} selected
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--hover)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2 bg-[var(--bg-wash)] rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
              placeholder="Search conversations..." autoFocus
            />
          </div>
        </div>

        {/* Selected chips */}
        {selectedConvs.length > 0 && (
          <div className="px-4 py-2 border-b border-[var(--border)] flex flex-wrap gap-1.5 flex-shrink-0">
            {selectedConvs.map(convId => {
              const conv = conversations.find(c => c.id === convId);
              if (!conv) return null;
              return (
                <button key={convId} onClick={() => toggleConversation(convId)}
                  className="flex items-center gap-1.5 bg-[var(--accent-subtle)] text-[var(--accent)] rounded-full px-2.5 py-1 text-xs font-medium hover:bg-[var(--accent-muted)] transition-colors">
                  {getConvName(conv)}
                  <X className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.map(conv => {
            const name = getConvName(conv);
            const isSelected = selectedConvs.includes(conv.id);
            const color = conv.type === 'group' ? 'bg-violet-500' : getAvatarColor(name);

            return (
              <button
                key={conv.id}
                onClick={() => toggleConversation(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  isSelected ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--hover)]'
                )}
              >
                <div className="relative flex-shrink-0">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold', color)}>
                    {conv.type === 'group' ? <Users className="w-4 h-4" /> : getInitials(name)}
                  </div>
                  {isSelected && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[var(--accent)] rounded-full flex items-center justify-center border-2 border-[var(--bg-surface)]">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</p>
                  {conv.type === 'group' && (
                    <p className="text-xs text-[var(--text-muted)]">Group</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Send button */}
        {selectedConvs.length > 0 && (
          <div className="px-4 py-3 border-t border-[var(--border)] flex-shrink-0">
            <button
              onClick={handleForward} disabled={isSending}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              Forward to {selectedConvs.length} chat{selectedConvs.length > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
