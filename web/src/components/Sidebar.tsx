// ═══════════════════════════════════════════════════════
// ZYNK UI — Sidebar (Discord-style Icon Rail + List)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useChatStore, type Conversation } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCallHistoryStore, type CallHistoryEntry } from '@/stores/callHistoryStore';
import { ConversationListSkeleton, Avatar as ZAvatar, Tooltip } from '@/components/ui';
import { cn, formatTime, formatLastMessage, getInitials } from '@/lib/utils';
import {
  Search, X, MessageCircle, Phone, Users, Plus, Settings,
  MoreVertical, Edit3, Archive, Pin, BellOff, Shield, LogOut,
  PhoneIncoming, PhoneOutgoing, Video, Lock,
} from 'lucide-react';
import api from '@/lib/api';

export default function Sidebar() {
  const { conversations, activeConversation, setActiveConversation, isLoadingConversations,
    pinnedChats, mutedChats, archivedChats, typingUsers } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const {
    sidebarOpen, setSidebarOpen, sidebarTab, setSidebarTab,
    setShowNewChat, setShowGroupCreate, setShowSettings, setShowProfile,
    sidebarFilter, setSidebarFilter,
  } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  // Filter & sort conversations
  const filteredConversations = useMemo(() => {
    let list = conversations.filter((c) => !archivedChats.has(c.id));
    if (sidebarFilter === 'unread') list = list.filter((c) => c.unread_count > 0);
    else if (sidebarFilter === 'groups') list = list.filter((c) => c.type === 'group');

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => {
        const name = c.type === 'group' ? c.group_info?.name : (c.other_user?.display_name || c.other_user?.username);
        return name?.toLowerCase().includes(q);
      });
    }

    return list.sort((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return new Date(b.last_message_at || b.updated_at).getTime() - new Date(a.last_message_at || a.updated_at).getTime();
    });
  }, [conversations, searchQuery, sidebarFilter, pinnedChats, archivedChats]);

  const handleConversationClick = useCallback((id: string) => {
    setActiveConversation(id);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [setActiveConversation, setSidebarOpen]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const tabs = [
    { key: 'chats' as const, icon: MessageCircle, label: 'Chats', badge: totalUnread },
    { key: 'calls' as const, icon: Phone, label: 'Calls', badge: 0 },
    { key: 'contacts' as const, icon: Users, label: 'Contacts', badge: 0 },
  ];

  return (
    <aside className={cn(
      'flex h-full transition-all duration-200',
      'w-full lg:w-[380px] lg:min-w-[340px] lg:max-w-[420px]',
      sidebarOpen ? 'flex' : 'hidden lg:flex',
      activeConversation && 'hidden lg:flex',
    )}>
      {/* ─── Icon Rail ─── */}
      <div className="w-16 flex flex-col items-center py-4 bg-card border-r border-border shrink-0">
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-5">
          <Shield className="w-5 h-5 text-white" />
        </div>

        {/* User Avatar */}
        <button onClick={() => setShowProfile(true)} className="mb-5" aria-label="View profile">
          <ZAvatar
            name={user?.display_name || user?.username || 'U'}
            src={user?.avatar_url}
            size="sm"
            isOnline
            showStatus
          />
        </button>

        {/* New Chat Button */}
        <Tooltip label="New Chat" position="right">
          <button
            onClick={() => setShowNewChat(true)}
            className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-5 hover:bg-primary/90 transition-colors"
            aria-label="New Chat"
          >
            <Plus className="w-5 h-5 text-white" />
          </button>
        </Tooltip>

        {/* Tab Icons */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {tabs.map(({ key, icon: Icon, label, badge }) => (
            <Tooltip key={key} label={label} position="right">
              <button
                onClick={() => setSidebarTab(key)}
                className={cn(
                  'relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200',
                  sidebarTab === key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-label={label}
                aria-pressed={sidebarTab === key}
              >
                <Icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            </Tooltip>
          ))}
        </nav>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-1 mt-auto">
          <Tooltip label="New Group" position="right">
            <button
              onClick={() => setShowGroupCreate(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
              aria-label="New Group"
            >
              <Edit3 className="w-5 h-5" />
            </button>
          </Tooltip>

          <Tooltip label="Settings" position="right">
            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-200"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </Tooltip>

          <Tooltip label="Sign Out" position="right">
            <button
              onClick={() => logout()}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
              aria-label="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ─── Conversation List Panel ─── */}
      <div className="flex-1 flex flex-col min-w-0 bg-background border-r border-border">
        {/* Panel Header */}
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-foreground capitalize">{sidebarTab}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  showSearch ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                aria-label="Search"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* More actions dropdown */}
              <div className="relative" ref={moreMenuRef}>
                <button
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  aria-label="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg py-1 z-50 animate-appear">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                      onClick={() => { setShowNewChat(true); setShowMoreMenu(false); }}
                    >
                      <Edit3 className="w-4 h-4 text-muted-foreground" /> New Chat
                    </button>
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                      onClick={() => { setShowGroupCreate(true); setShowMoreMenu(false); }}
                    >
                      <Users className="w-4 h-4 text-muted-foreground" /> New Group
                    </button>
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                      onClick={() => { setSidebarFilter('all'); setShowMoreMenu(false); }}
                    >
                      <Archive className="w-4 h-4 text-muted-foreground" /> Archived
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Bar */}
          {showSearch && (
            <div className="mb-3 animate-appear">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full h-9 pl-9 pr-8 bg-secondary border-0 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  aria-label="Search conversations"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter Chips */}
          {sidebarTab === 'chats' && (
            <div className="flex items-center gap-1.5">
              {(['all', 'unread', 'groups'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setSidebarFilter(f)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-colors capitalize',
                    sidebarFilter === f
                      ? 'bg-primary text-white'
                      : 'bg-secondary text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto chat-scrollbar" role="listbox" aria-label="Conversations">
          {sidebarTab === 'chats' && (
            <>
              {isLoadingConversations ? (
                <ConversationListSkeleton />
              ) : filteredConversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <MessageCircle className="w-7 h-7 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {searchQuery ? 'No results' : 'No conversations yet'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {searchQuery ? 'Try a different search' : 'Start a new chat to get going'}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={() => setShowNewChat(true)}
                      className="mt-4 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Chat
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {filteredConversations.some((c) => pinnedChats.has(c.id)) && (
                    <div className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pinned</span>
                    </div>
                  )}
                  {filteredConversations.filter((c) => pinnedChats.has(c.id)).map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversation}
                      isPinned
                      isMuted={mutedChats.has(conv.id)}
                      typingUserIds={typingUsers[conv.id] || []}
                      currentUserId={user?.id}
                      onClick={() => handleConversationClick(conv.id)}
                    />
                  ))}
                  {filteredConversations.some((c) => !pinnedChats.has(c.id)) && (
                    <div className="px-4 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {filteredConversations.some((c) => pinnedChats.has(c.id)) ? 'Recent' : 'All Chats'}
                      </span>
                    </div>
                  )}
                  {filteredConversations.filter((c) => !pinnedChats.has(c.id)).map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversation}
                      isPinned={false}
                      isMuted={mutedChats.has(conv.id)}
                      typingUserIds={typingUsers[conv.id] || []}
                      currentUserId={user?.id}
                      onClick={() => handleConversationClick(conv.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}

          {sidebarTab === 'calls' && <CallsTab />}
          {sidebarTab === 'contacts' && <ContactsTab onStartConversation={handleConversationClick} />}
        </div>
      </div>
    </aside>
  );
}


/* ─── Conversation Item ─── */
function ConversationItem({
  conversation: conv, isActive, isPinned, isMuted, typingUserIds, currentUserId, onClick,
}: {
  conversation: Conversation; isActive: boolean; isPinned: boolean; isMuted: boolean;
  typingUserIds: string[]; currentUserId?: string; onClick: () => void;
}) {
  const name = conv.type === 'group'
    ? conv.group_info?.name || 'Group'
    : conv.other_user?.display_name || conv.other_user?.username || 'User';
  const avatarSrc = conv.type === 'group' ? conv.group_info?.avatar_url : conv.other_user?.avatar_url;
  const isOnline = conv.type === 'one_to_one' && conv.is_online;
  const isTyping = typingUserIds.length > 0 && !typingUserIds.includes(currentUserId || '');
  const lastMessage = conv.last_message_decrypted || conv.last_message || '';
  const time = conv.last_message_at || conv.updated_at;

  return (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left',
        isActive ? 'bg-accent' : 'hover:bg-accent/50',
      )}
      onClick={onClick}
      role="option"
      aria-selected={isActive}
      aria-label={`${name}${conv.unread_count > 0 ? `, ${conv.unread_count} unread` : ''}`}
    >
      {conv.type === 'group' ? (
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold">
            {getInitials(name)}
          </div>
        </div>
      ) : (
        <ZAvatar name={name} src={avatarSrc} size="md" isOnline={isOnline} showStatus />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-sm truncate text-foreground">{name}</span>
            {<Lock className="w-3 h-3 text-success flex-shrink-0" />}
            {isPinned && <Pin className="w-3 h-3 text-muted-foreground flex-shrink-0 rotate-45" />}
            {isMuted && <BellOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
          </div>
          <span className={cn('text-[11px] flex-shrink-0 tabular-nums', conv.unread_count > 0 ? 'text-primary font-medium' : 'text-muted-foreground')}>
            {formatTime(time)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isTyping ? (
              <span className="text-xs text-success italic">typing...</span>
            ) : (
              <p className={cn('text-xs truncate', conv.unread_count > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground')}>
                {formatLastMessage(lastMessage)}
              </p>
            )}
          </div>

          {conv.unread_count > 0 && (
            <span className={cn(
              'ml-2 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0',
              isMuted ? 'bg-muted text-muted-foreground' : 'bg-primary text-white',
            )}>
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}


/* ─── Contacts Tab ─── */
function ContactsTab({ onStartConversation }: { onStartConversation: (convId: string) => void }) {
  const [contacts, setContacts] = useState<{ id: string; user_id: string; username: string; display_name?: string; avatar_url?: string; nickname?: string; is_online?: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { startConversation } = useChatStore();

  useEffect(() => {
    const fetchContacts = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/users/contacts/list');
        setContacts(res.data.contacts || res.data || []);
      } catch {
        // Fallback: derive contacts from conversations
        const convs = useChatStore.getState().conversations;
        const derived = convs
          .filter(c => c.type === 'one_to_one' && c.other_user)
          .map(c => ({
            id: c.other_user!.user_id,
            user_id: c.other_user!.user_id,
            username: c.other_user!.username,
            display_name: c.other_user!.display_name,
            avatar_url: c.other_user!.avatar_url,
            is_online: c.is_online,
          }));
        setContacts(derived);
      } finally {
        setIsLoading(false);
      }
    };
    fetchContacts();
  }, []);

  const filtered = contacts.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.display_name || c.username).toLowerCase().includes(q);
  });

  const handleContactClick = async (userId: string) => {
    try {
      const convId = await startConversation(userId);
      onStartConversation(convId);
    } catch {
      console.error('Failed to start conversation with contact');
    }
  };

  if (isLoading) return <ConversationListSkeleton />;

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Users className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">No contacts yet</p>
        <p className="text-xs text-muted-foreground">Start chatting to build your contact list</p>
      </div>
    );
  }

  return (
    <div>
      {contacts.length > 5 && (
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="w-full h-8 pl-9 pr-3 bg-secondary border-0 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>
      )}
      <div className="px-4 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {filtered.length} contact{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>
      {filtered.map(contact => (
        <button
          key={contact.id || contact.user_id}
          onClick={() => handleContactClick(contact.user_id)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
        >
          <ZAvatar
            name={contact.display_name || contact.username}
            src={contact.avatar_url}
            size="sm"
            isOnline={contact.is_online}
            showStatus
          />
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-foreground truncate">{contact.display_name || contact.username}</p>
            <p className="text-xs text-muted-foreground truncate">@{contact.username}</p>
          </div>
          {contact.is_online && (
            <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}


/* ─── Calls Tab ─── */
function CallsTab() {
  const { calls, isLoading, fetchCalls } = useCallHistoryStore();
  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  if (isLoading) return <ConversationListSkeleton />;

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Phone className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">No calls yet</p>
        <p className="text-xs text-muted-foreground">Your call history will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {calls.map((call) => <CallItem key={call.id} call={call} />)}
    </div>
  );
}


function CallItem({ call }: { call: CallHistoryEntry }) {
  const name = call.other_user?.display_name || call.other_user?.username || 'Unknown';
  const isMissed = call.status === 'missed' || call.status === 'declined';
  const isIncoming = call.direction === 'incoming';
  const DirectionIcon = isIncoming ? PhoneIncoming : PhoneOutgoing;
  const TypeIcon = call.call_type === 'video' ? Video : Phone;
  const duration = call.duration_seconds
    ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
      <ZAvatar name={name} src={call.other_user?.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold truncate', isMissed ? 'text-destructive' : 'text-foreground')}>{name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <DirectionIcon className={cn('w-3 h-3', isMissed ? 'text-destructive' : 'text-muted-foreground')} />
          <span className="text-xs text-muted-foreground">
            {call.status === 'missed' ? 'Missed' : call.status === 'declined' ? 'Declined' : duration || 'Answered'}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{formatTime(call.created_at)}</span>
        </div>
      </div>
      <button
        className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
        aria-label={`Call ${name}`}
      >
        <TypeIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
