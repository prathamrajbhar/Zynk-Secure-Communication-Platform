// ═══════════════════════════════════════════════════════
// ZYNK UI — Sidebar (HeroUI v7)
// ═══════════════════════════════════════════════════════

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useChatStore, type Conversation } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCallHistoryStore, type CallHistoryEntry } from '@/stores/callHistoryStore';
import { ConversationListSkeleton } from '@/components/ui';
import { cn, formatTime, formatLastMessage } from '@/lib/utils';
import {
  Avatar, Input, Button, Tabs, Tab, Chip, Badge,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection,
} from '@heroui/react';
import {
  Search, X, MessageCircle, Phone, Users, Plus, Settings,
  MoreVertical, Edit3, Archive, Pin, BellOff,
  PhoneIncoming, PhoneOutgoing, Video,
} from 'lucide-react';

export default function Sidebar() {
  const { conversations, activeConversation, setActiveConversation, isLoadingConversations,
    pinnedChats, mutedChats, archivedChats, typingUsers } = useChatStore();
  const user = useAuthStore((s) => s.user);
  const {
    sidebarOpen, setSidebarOpen, sidebarTab, setSidebarTab,
    setShowNewChat, setShowGroupCreate, setShowSettings, setShowProfile,
    sidebarFilter, setSidebarFilter,
  } = useUIStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);

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

  const initials = (user?.display_name || user?.username || 'U').slice(0, 2).toUpperCase();

  return (
    <aside className={cn(
      'flex flex-col bg-content1 border-r border-divider transition-all duration-200 h-full',
      'w-full lg:w-[380px] lg:min-w-[340px] lg:max-w-[420px]',
      sidebarOpen ? 'flex' : 'hidden lg:flex',
      activeConversation && 'hidden lg:flex',
    )}>
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-divider">
        <button onClick={() => setShowProfile(true)} className="flex-shrink-0" aria-label="View profile">
          <Avatar
            name={initials}
            src={user?.avatar_url}
            size="sm"
            isBordered
            color="primary"
            classNames={{ base: 'ring-2 ring-offset-2 ring-offset-content1 ring-primary/30' }}
          />
        </button>
        <div className="flex-1 min-w-0 ml-0.5">
          <h1 className="text-sm font-bold text-foreground truncate">
            {user?.display_name || user?.username || 'Zynk'}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Button isIconOnly variant="light" size="sm" radius="full" onPress={() => setShowSearch(!showSearch)} aria-label="Search">
            <Search className="w-4.5 h-4.5 text-default-500" />
          </Button>
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <Button isIconOnly variant="light" size="sm" radius="full" aria-label="Menu">
                <MoreVertical className="w-4.5 h-4.5 text-default-500" />
              </Button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Sidebar actions" onAction={(key) => {
              switch (key) {
                case 'new-chat': setShowNewChat(true); break;
                case 'new-group': setShowGroupCreate(true); break;
                case 'archived': setSidebarFilter('all'); break;
                case 'settings': setShowSettings(true); break;
              }
            }}>
              <DropdownSection showDivider>
                <DropdownItem key="new-chat" startContent={<Edit3 className="w-4 h-4" />}>New Chat</DropdownItem>
                <DropdownItem key="new-group" startContent={<Users className="w-4 h-4" />}>New Group</DropdownItem>
                <DropdownItem key="archived" startContent={<Archive className="w-4 h-4" />}>Archived</DropdownItem>
              </DropdownSection>
              <DropdownSection>
                <DropdownItem key="settings" startContent={<Settings className="w-4 h-4" />}>Settings</DropdownItem>
              </DropdownSection>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {/* ─── Search Bar ─── */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-divider animate-appear">
          <Input
            ref={searchRef}
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search conversations..."
            variant="flat"
            size="sm"
            radius="lg"
            startContent={<Search className="w-4 h-4 text-default-400" />}
            endContent={searchQuery ? (
              <button onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }} aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-default-400 hover:text-foreground" />
              </button>
            ) : null}
            classNames={{ inputWrapper: 'bg-content2' }}
            aria-label="Search conversations"
          />
        </div>
      )}

      {/* ─── Tab Bar ─── */}
      <Tabs
        selectedKey={sidebarTab}
        onSelectionChange={(key) => setSidebarTab(key as 'chats' | 'calls' | 'contacts')}
        variant="underlined"
        fullWidth
        size="sm"
        color="primary"
        classNames={{
          tabList: 'gap-0 border-b border-divider px-2',
          tab: 'h-10',
          cursor: 'bg-primary',
          tabContent: 'text-default-400 group-data-[selected=true]:text-primary font-semibold text-xs',
        }}
      >
        <Tab key="chats" title={
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Chats</span>
          </div>
        } />
        <Tab key="calls" title={
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" />
            <span>Calls</span>
          </div>
        } />
        <Tab key="contacts" title={
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>Contacts</span>
          </div>
        } />
      </Tabs>

      {/* ─── Filter Chips ─── */}
      {sidebarTab === 'chats' && (
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
          {(['all', 'unread', 'groups'] as const).map((f) => (
            <Chip
              key={f}
              variant={sidebarFilter === f ? 'solid' : 'flat'}
              color={sidebarFilter === f ? 'primary' : 'default'}
              size="sm"
              classNames={{
                base: `cursor-pointer transition-all ${sidebarFilter !== f ? 'bg-content2 hover:bg-content3' : ''}`,
                content: 'text-xs font-semibold capitalize',
              }}
              onClick={() => setSidebarFilter(f)}
            >
              {f}
            </Chip>
          ))}
        </div>
      )}

      {/* ─── Conversation List ─── */}
      <div className="conversation-list" role="listbox" aria-label="Conversations">
        {sidebarTab === 'chats' && (
          <>
            {isLoadingConversations ? (
              <ConversationListSkeleton count={10} />
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <MessageCircle className="w-7 h-7 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {searchQuery ? 'No results' : 'No conversations yet'}
                </p>
                <p className="text-xs text-default-400">
                  {searchQuery ? 'Try a different search' : 'Start a new chat to get going'}
                </p>
                {!searchQuery && (
                  <Button color="primary" size="sm" radius="lg" className="mt-4 font-semibold" startContent={<Plus className="w-3.5 h-3.5" />} onPress={() => setShowNewChat(true)}>
                    New Chat
                  </Button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversation}
                  isPinned={pinnedChats.has(conv.id)}
                  isMuted={mutedChats.has(conv.id)}
                  typingUserIds={typingUsers[conv.id] || []}
                  currentUserId={user?.id}
                  onClick={() => handleConversationClick(conv.id)}
                />
              ))
            )}
          </>
        )}

        {sidebarTab === 'calls' && <CallsTab />}
        {sidebarTab === 'contacts' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Contacts</p>
            <p className="text-xs text-default-400">Your contacts from conversations</p>
          </div>
        )}
      </div>

      {/* ─── FAB ─── */}
      {sidebarTab === 'chats' && (
        <div className="p-3 border-t border-divider">
          <Button
            color="primary"
            fullWidth
            radius="lg"
            className="font-semibold shadow-lg shadow-primary/20"
            startContent={<Edit3 className="w-4 h-4" />}
            onPress={() => setShowNewChat(true)}
          >
            New Chat
          </Button>
        </div>
      )}
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
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150',
        isActive
          ? 'bg-primary/10 border-l-3 border-l-primary'
          : 'hover:bg-content2 border-l-3 border-l-transparent',
      )}
      onClick={onClick}
      role="option"
      aria-selected={isActive}
      aria-label={`${name}${conv.unread_count > 0 ? `, ${conv.unread_count} unread` : ''}`}
    >
      <div className="relative flex-shrink-0">
        <Avatar
          name={initials}
          src={avatarSrc}
          size="md"
          classNames={{ base: conv.type === 'group' ? 'bg-secondary' : 'bg-primary/20' }}
        />
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full status-online" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold truncate text-foreground">{name}</span>
            {isPinned && <Pin className="w-3 h-3 text-default-400 flex-shrink-0 rotate-45" />}
            {isMuted && <BellOff className="w-3 h-3 text-default-400 flex-shrink-0" />}
          </div>
          <span className={cn('text-2xs flex-shrink-0 tabular-nums', conv.unread_count > 0 ? 'text-primary font-semibold' : 'text-default-400')}>
            {formatTime(time)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          {isTyping ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-primary font-medium">typing</span>
              <div className="flex items-center gap-0.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          ) : (
            <p className={cn('text-xs truncate', conv.unread_count > 0 ? 'text-default-500 font-medium' : 'text-default-400')}>
              {formatLastMessage(lastMessage)}
            </p>
          )}

          {conv.unread_count > 0 && (
            <Badge
              content={conv.unread_count > 99 ? '99+' : conv.unread_count}
              color={isMuted ? 'default' : 'primary'}
              size="sm"
              shape="circle"
              variant="solid"
            >
              <span />
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}


/* ─── Calls Tab ─── */
function CallsTab() {
  const { calls, isLoading, fetchCalls } = useCallHistoryStore();
  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  if (isLoading) return <ConversationListSkeleton count={6} />;

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Phone className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">No calls yet</p>
        <p className="text-xs text-default-400">Your call history will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-divider">
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
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-content2 transition-colors cursor-pointer">
      <Avatar name={initials} src={call.other_user?.avatar_url} size="sm" />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold truncate', isMissed ? 'text-danger' : 'text-foreground')}>{name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <DirectionIcon className={cn('w-3 h-3', isMissed ? 'text-danger' : 'text-default-400')} />
          <span className="text-xs text-default-400">
            {call.status === 'missed' ? 'Missed' : call.status === 'declined' ? 'Declined' : duration || 'Answered'}
          </span>
          <span className="text-xs text-default-400">·</span>
          <span className="text-xs text-default-400">{formatTime(call.created_at)}</span>
        </div>
      </div>
      <Button isIconOnly variant="flat" color="primary" size="sm" radius="full" aria-label={`Call ${name}`}>
        <TypeIcon className="w-4 h-4" />
      </Button>
    </div>
  );
}
