'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { getInitials, cn, formatTime, getAvatarColor } from '@/lib/utils';
import {
  Users, Search, Loader2, X, Trash2,
  MessageCircle, MoreVertical, Ban
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Contact {
  contact_id: string;
  nickname: string | null;
  blocked: boolean;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  last_seen_at: string | null;
}

export default function ContactsPanel() {
  const { onlineUsers, setActiveConversation, startConversation } = useChatStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ contact: Contact; x: number; y: number } | null>(null);

  const fetchContacts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get('/users/contacts/list');
      setContacts(res.data.contacts || []);
    } catch {
      setError('Failed to load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchContacts(); }, []);

  // Close context menu on click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.display_name?.toLowerCase().includes(q) || c.username.toLowerCase().includes(q));
  });

  const handleStartChat = async (contactId: string) => {
    if (isStartingChat) return;
    setIsStartingChat(true);
    try {
      const convId = await startConversation(contactId);
      setActiveConversation(convId);
    } catch {
      toast.error('Failed to start conversation');
    }
    finally { setIsStartingChat(false); }
  };

  const handleRemoveContact = async (contactId: string) => {
    try {
      await api.delete(`/users/contacts/${contactId}`);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      toast.success('Contact removed');
    } catch {
      toast.error('Failed to remove contact');
    }
    setContextMenu(null);
  };

  const handleBlockContact = async (contactId: string) => {
    try {
      await api.put(`/users/contacts/${contactId}/block`);
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      toast.success('Contact blocked');
    } catch {
      toast.error('Failed to block contact');
    }
    setContextMenu(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-4">
        <p className="text-sm font-medium text-[var(--text-secondary)]">{error}</p>
        <button onClick={fetchContacts} className="mt-3 text-xs text-[var(--accent)] font-bold hover:underline underline-offset-2">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[var(--bg-wash)] rounded-xl px-3 py-2 transition-all duration-200 focus-within:bg-[var(--bg-surface)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            placeholder="Search contacts..."
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contacts count */}
      <div className="px-4 py-1.5">
        <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest uppercase">
          {filteredContacts.length} Contact{filteredContacts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-y-auto scroll-thin">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] p-8">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mb-4">
              <Users className="w-7 h-7 opacity-40" />
            </div>
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              {search ? 'No contacts found' : 'No contacts yet'}
            </p>
            <p className="text-xs mt-1.5">
              {search ? 'Try a different search' : 'Start a chat to add people to your contacts'}
            </p>
          </div>
        ) : (
          <div className="pb-20">
            {filteredContacts.map((contact) => {
              const name = contact.display_name || contact.username;
              const isOnline = onlineUsers.has(contact.contact_id);

              return (
                <div
                  key={contact.contact_id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all duration-200 cursor-pointer group"
                  onClick={() => handleStartChat(contact.contact_id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ contact, x: e.clientX, y: e.clientY });
                  }}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {contact.avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={contact.avatar_url} alt={name} className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className={cn('w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold', getAvatarColor(name))}>
                        {getInitials(name)}
                      </div>
                    )}
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--success)] rounded-full border-2 border-[var(--sidebar-bg)] online-pulse" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">{name}</span>
                      {isOnline ? (
                        <span className="text-[10px] text-[var(--success)] font-semibold flex-shrink-0">Online</span>
                      ) : contact.last_seen_at ? (
                        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">{formatTime(contact.last_seen_at)}</span>
                      ) : null}
                    </div>
                    <p className="text-[12px] text-[var(--text-muted)] truncate mt-0.5">
                      {contact.bio || `@${contact.username}`}
                    </p>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartChat(contact.contact_id); }}
                      className="btn-icon w-8 h-8"
                      title="Message"
                    >
                      <MessageCircle className="w-4 h-4 text-[var(--accent)]" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContextMenu({ contact, x: e.clientX, y: e.clientY });
                      }}
                      className="btn-icon w-8 h-8"
                    >
                      <MoreVertical className="w-4 h-4 text-[var(--text-muted)]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-40 bg-[var(--bg-elevated)] rounded-xl shadow-overlay border border-[var(--border)] py-1 min-w-[180px] animate-scale-in"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={() => { handleStartChat(contextMenu.contact.contact_id); setContextMenu(null); }}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-[var(--accent)]" /> Message
            </button>
            <div className="my-1 mx-3 h-px bg-[var(--separator)]" />
            <button
              onClick={() => handleRemoveContact(contextMenu.contact.contact_id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors"
            >
              <Trash2 className="w-4 h-4 text-[var(--text-muted)]" /> Remove contact
            </button>
            <button
              onClick={() => handleBlockContact(contextMenu.contact.contact_id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-[var(--danger)] hover:bg-red-500/5 transition-colors"
            >
              <Ban className="w-4 h-4" /> Block
            </button>
          </div>
        </>
      )}
    </div>
  );
}
