import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Conversation } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { formatTime, getInitials, formatLastMessage, getAvatarColor } from '@/lib/utils';
import logger from '@/lib/logger';
import {
  MessageCircle, Search, Settings, Plus, Users, LogOut,
  Moon, Sun, MoreVertical, X, File as FileIcon, Image as ImageIcon,
  MessageSquare, Pin, BellOff, Archive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CallLogsPanel from './CallLogsPanel';
import ContactsPanel from './ContactsPanel';
import ChatContextMenu from './ChatContextMenu';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Fuse from 'fuse.js';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { conversations, activeConversation, setActiveConversation, onlineUsers,
    pinnedChats, mutedChats, archivedChats,
    togglePinChat, toggleMuteChat, toggleArchiveChat,
    markConversationRead, markConversationUnread, deleteConversation, clearChatHistory,
  } = useChatStore();
  const { theme, toggleTheme, setShowSettings, setShowNewChat, setShowGroupCreate, setShowProfile, sidebarTab, setSidebarTab } = useUIStore();
  const [search, setSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [chatContextMenu, setChatContextMenu] = useState<{ conversation: Conversation; x: number; y: number } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'clear'; convId: string; convName: string } | null>(null);
  const [searchPeople, setSearchPeople] = useState<{ user_id: string; username: string; display_name?: string; bio?: string }[]>([]);
  const [searchGlobalMessages, setSearchGlobalMessages] = useState<{ message_id: string; conversation_id: string; snippet: string; message_type: string; sender_username: string; sender_display_name?: string; created_at: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fuseConversations = useMemo(() => new Fuse(conversations, {
    keys: ['other_user.display_name', 'other_user.username', 'group_info.name', 'last_message'],
    threshold: 0.4, distance: 100,
  }), [conversations]);

  const filteredConversations = useMemo(() => {
    let result = search ? fuseConversations.search(search).map(result => result.item) : conversations;

    // Filter out archived unless explicitly showing
    if (!showArchived) {
      result = result.filter(c => !archivedChats.has(c.id));
    } else {
      result = result.filter(c => archivedChats.has(c.id));
    }

    // Sort: pinned first, then by last message time
    result = [...result].sort((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.last_message_at || a.updated_at;
      const bTime = b.last_message_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    return result;
  }, [search, conversations, fuseConversations, pinnedChats, archivedChats, showArchived]);

  const archivedCount = useMemo(() => conversations.filter(c => archivedChats.has(c.id)).length, [conversations, archivedChats]);

  const handleChatContextMenu = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setChatContextMenu({ conversation: conv, x: e.clientX, y: e.clientY });
  };

  const handleDeleteChat = (convId: string, convName: string) => {
    setConfirmAction({ type: 'delete', convId, convName });
  };

  const handleClearHistory = (convId: string, convName: string) => {
    setConfirmAction({ type: 'clear', convId, convName });
  };

  const confirmActionHandler = () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete') {
      deleteConversation(confirmAction.convId);
      toast.success('Chat deleted');
    } else {
      clearChatHistory(confirmAction.convId);
      toast.success('Chat history cleared');
    }
    setConfirmAction(null);
  };

  useEffect(() => {
    if (!search || search.length < 2) { setSearchPeople([]); setSearchGlobalMessages([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const [peopleRes, messagesRes] = await Promise.all([
          api.get(`/users/search?query=${search}`),
          api.post('/messages/search', { query: search })
        ]);
        const existingUserIds = new Set(conversations.map(c => c.other_user?.user_id).filter(Boolean));
        setSearchPeople((peopleRes.data.users || []).filter((u: { user_id: string }) => !existingUserIds.has(u.user_id)));
        setSearchGlobalMessages(messagesRes.data.results || []);
      } catch (error) { logger.error('Search failed:', error); }
      finally { setIsSearching(false); }
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search, conversations]);

  const searchFiles = useMemo(() => searchGlobalMessages.filter(m => m.message_type === 'file' || m.message_type === 'image'), [searchGlobalMessages]);
  const searchTextMessages = useMemo(() => searchGlobalMessages.filter(m => m.message_type === 'text'), [searchGlobalMessages]);

  const handleStartConversation = async (userId: string) => {
    // Defensive validation - prevent empty body requests
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      logger.error('[Sidebar.handleStartConversation] Invalid userId:', userId);
      toast.error('Invalid user selected');
      return;
    }
    // Prevent rapid double-clicks
    if (isStartingChat) return;
    setIsStartingChat(true);
    try {
      const convId = await useChatStore.getState().startConversation(userId);
      setActiveConversation(convId);
      setSearch('');
    } catch { toast.error('Failed to start conversation'); }
    finally { setIsStartingChat(false); }
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const handleLogout = async () => { await logout(); window.location.href = '/login'; };

  return (
    <div className={cn(
      'h-full flex flex-col bg-[var(--sidebar-bg)] relative',
      'w-full lg:w-[360px] lg:min-w-[320px] lg:max-w-[380px]',
      'border-r border-[var(--border)]',
      activeConversation ? 'hidden lg:flex' : 'flex'
    )}>
      {/* ── Header ── */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 sidebar-header">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowProfile(true)} className="relative group">
            <div className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold',
              'transition-transform duration-150 group-hover:scale-105',
              getAvatarColor(user?.username || 'U')
            )}>
              {getInitials(user?.display_name || user?.username || '?')}
            </div>
          </button>
          <div>
            <h1 className="text-sm font-extrabold text-[var(--text-primary)] tracking-tight leading-none">Zynk</h1>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={toggleTheme} className="btn-icon" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="btn-icon">
              <MoreVertical className="w-[18px] h-[18px]" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-[var(--bg-elevated)] rounded-xl shadow-overlay border border-[var(--border)] py-1 min-w-[200px] animate-scale-in">
                  {[
                    { icon: Plus, label: 'New chat', action: () => setShowNewChat(true), color: 'text-[var(--accent)]' },
                    { icon: Users, label: 'New group', action: () => setShowGroupCreate(true), color: 'text-[var(--accent)]' },
                    { icon: Settings, label: 'Settings', action: () => setShowSettings(true), color: 'text-[var(--accent)]' },
                  ].map(item => (
                    <button key={item.label} onClick={() => { item.action(); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors">
                      <item.icon className={cn('w-4 h-4', item.color)} /> {item.label}
                    </button>
                  ))}
                  <div className="my-1 mx-3 h-px bg-[var(--separator)]" />
                  <button onClick={() => { handleLogout(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium text-[var(--danger)] hover:bg-red-500/5 transition-colors">
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-2 bg-[var(--bg-wash)] rounded-xl px-3 py-2 transition-all duration-200 focus-within:bg-[var(--bg-surface)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            placeholder="Search chats, people, messages..." />
          {isSearching && <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />}
          {search && !isSearching && (
            <button onClick={() => setSearch('')} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors p-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex mx-3 mb-1 p-0.5 bg-[var(--bg-wash)] rounded-lg flex-shrink-0">
        {(['chats', 'contacts', 'calls'] as const).map(tab => (
          <button key={tab} onClick={() => setSidebarTab(tab)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-200',
              sidebarTab === tab
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-soft'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}>
            {tab === 'chats' ? 'Chats' : tab === 'contacts' ? 'Contacts' : 'Calls'}
            {tab === 'chats' && totalUnread > 0 && sidebarTab !== 'chats' && (
              <span className="min-w-[16px] h-[16px] rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center px-1">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {sidebarTab === 'chats' ? (
        <div className="flex-1 overflow-y-auto scroll-thin">
          {search && filteredConversations.length === 0 && searchPeople.length === 0 && searchFiles.length === 0 && searchTextMessages.length === 0 ? (
            <EmptySearch isSearching={isSearching} />
          ) : (
            <div className="pb-20">
              {/* Conversations */}
              {filteredConversations.length > 0 && (
                <>
                  {search && <SectionHeader label="Chats & Contacts" />}
                  {filteredConversations.map((conv) => (
                    <ConversationItem key={conv.id} conversation={conv}
                      isActive={activeConversation === conv.id}
                      isOnline={conv.other_user ? onlineUsers.has(conv.other_user.user_id) : false}
                      isPinned={pinnedChats.has(conv.id)}
                      isMuted={mutedChats.has(conv.id)}
                      onClick={() => { setActiveConversation(conv.id); setSearch(''); }}
                      onContextMenu={(e) => handleChatContextMenu(e, conv)} />
                  ))}
                </>
              )}
              {/* Archived chats button */}
              {!search && !showArchived && archivedCount > 0 && (
                <button onClick={() => setShowArchived(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-colors text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-wash)] flex items-center justify-center">
                    <Archive className="w-4 h-4 text-[var(--text-muted)]" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-[var(--text-secondary)]">Archived</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{archivedCount}</span>
                  </div>
                </button>
              )}
              {showArchived && (
                <button onClick={() => setShowArchived(false)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--hover)] transition-colors">
                  ← Back to chats
                </button>
              )}
              {/* People */}
              {searchPeople.length > 0 && (
                <>
                  <SectionHeader label="People" />
                  {searchPeople.map((person) => (
                    <button key={person.user_id} onClick={() => handleStartConversation(person.user_id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold', getAvatarColor(person.display_name || person.username))}>
                        {getInitials(person.display_name || person.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{person.display_name || person.username}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{person.bio || 'Available'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {/* Messages */}
              {searchTextMessages.length > 0 && (
                <>
                  <SectionHeader label="Messages" />
                  {searchTextMessages.map((msg) => (
                    <button key={msg.message_id} onClick={() => { setActiveConversation(msg.conversation_id); setSearch(''); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left group">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-wash)] flex items-center justify-center text-[var(--text-muted)] flex-shrink-0 group-hover:bg-[var(--accent-subtle)] group-hover:text-[var(--accent)] transition-colors">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{msg.sender_display_name || msg.sender_username}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">{new Date(msg.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{msg.snippet}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {/* Files */}
              {searchFiles.length > 0 && (
                <>
                  <SectionHeader label="Files" />
                  {searchFiles.map((file) => (
                    <button key={file.message_id} onClick={() => { setActiveConversation(file.conversation_id); setSearch(''); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left group">
                      <div className="w-10 h-10 rounded-lg bg-[var(--bg-wash)] flex items-center justify-center text-[var(--text-muted)] flex-shrink-0 group-hover:bg-[var(--accent-subtle)] group-hover:text-[var(--accent)] transition-colors">
                        {file.message_type === 'image' ? <ImageIcon className="w-4 h-4" /> : <FileIcon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate block">
                          {(() => { try { return JSON.parse(file.snippet).filename; } catch { return file.snippet; } })()}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-[var(--text-muted)]">{file.sender_display_name || file.sender_username}</span>
                          <span className="w-0.5 h-0.5 rounded-full bg-[var(--text-muted)]" />
                          <span className="text-[11px] text-[var(--text-muted)]">{new Date(file.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ) : sidebarTab === 'contacts' ? (
        <ContactsPanel />
      ) : (
        <CallLogsPanel />
      )}

      {/* ── Chat Context Menu ── */}
      {chatContextMenu && (
        <ChatContextMenu
          x={chatContextMenu.x}
          y={chatContextMenu.y}
          isPinned={pinnedChats.has(chatContextMenu.conversation.id)}
          isMuted={mutedChats.has(chatContextMenu.conversation.id)}
          isArchived={archivedChats.has(chatContextMenu.conversation.id)}
          unreadCount={chatContextMenu.conversation.unread_count || 0}
          onClose={() => setChatContextMenu(null)}
          onPin={() => { togglePinChat(chatContextMenu.conversation.id); toast.success(pinnedChats.has(chatContextMenu.conversation.id) ? 'Unpinned' : 'Pinned'); }}
          onMute={() => { toggleMuteChat(chatContextMenu.conversation.id); toast.success(mutedChats.has(chatContextMenu.conversation.id) ? 'Unmuted' : 'Muted'); }}
          onArchive={() => { toggleArchiveChat(chatContextMenu.conversation.id); toast.success(archivedChats.has(chatContextMenu.conversation.id) ? 'Unarchived' : 'Archived'); }}
          onMarkReadUnread={() => {
            const conv = chatContextMenu.conversation;
            if (conv.unread_count > 0) {
              markConversationRead(conv.id);
              toast.success('Marked as read');
            } else {
              markConversationUnread(conv.id);
              toast.success('Marked as unread');
            }
          }}
          onDeleteChat={() => {
            const conv = chatContextMenu.conversation;
            const name = conv.type === 'one_to_one' ? (conv.other_user?.display_name || conv.other_user?.username || 'Unknown') : (conv.group_info?.name || 'Group');
            handleDeleteChat(conv.id, name);
          }}
          onClearHistory={() => {
            const conv = chatContextMenu.conversation;
            const name = conv.type === 'one_to_one' ? (conv.other_user?.display_name || conv.other_user?.username || 'Unknown') : (conv.group_info?.name || 'Group');
            handleClearHistory(conv.id, name);
          }}
        />
      )}

      {/* ── Confirm Action Dialog ── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 animate-fade-in" onClick={() => setConfirmAction(null)}>
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-sm p-6 shadow-overlay border border-[var(--border)] animate-scale-in mx-4"
            onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
              {confirmAction.type === 'delete' ? 'Delete chat?' : 'Clear chat history?'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-5">
              {confirmAction.type === 'delete'
                ? `Delete your chat with "${confirmAction.convName}"? This cannot be undone.`
                : `Clear all messages in "${confirmAction.convName}"? This cannot be undone.`}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] rounded-xl hover:bg-[var(--hover)] transition-colors">
                Cancel
              </button>
              <button onClick={confirmActionHandler}
                className="px-4 py-2 text-sm font-semibold text-white bg-[var(--danger)] rounded-xl hover:brightness-110 transition-all active:scale-[0.98]">
                {confirmAction.type === 'delete' ? 'Delete' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB ── */}
      {sidebarTab === 'chats' && (
        <div className="absolute bottom-5 right-4 z-20 animate-fab">
          <button onClick={() => setShowNewChat(true)}
            className="w-12 h-12 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center shadow-float hover:shadow-overlay transition-all duration-200 hover:bg-[var(--accent-hover)] active:scale-90">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 mt-1">
      <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-widest uppercase">{label}</span>
    </div>
  );
}

function EmptySearch({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] px-8">
      {isSearching ? (
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mb-3">
            <MessageCircle className="w-6 h-6 opacity-30" />
          </div>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">No results</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </>
      )}
    </div>
  );
}

function ConversationItem({ conversation, isActive, isOnline, isPinned, isMuted, onClick, onContextMenu }: {
  conversation: Conversation; isActive: boolean; isOnline: boolean;
  isPinned: boolean; isMuted: boolean;
  onClick: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const name = conversation.type === 'one_to_one'
    ? (conversation.other_user?.display_name || conversation.other_user?.username || 'Unknown')
    : (conversation.group_info?.name || 'Group');
  const lastMessage = formatLastMessage(conversation.last_message_decrypted || conversation.last_message || '', 36) || 'No messages yet';
  const time = conversation.last_message_at ? formatTime(conversation.last_message_at) : '';
  const hasUnread = conversation.unread_count > 0;
  const color = conversation.type === 'group' ? 'bg-violet-500' : getAvatarColor(name);

  return (
    <button onClick={onClick} onContextMenu={onContextMenu} className={cn(
      'conv-item w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150',
      isActive && 'active'
    )}>
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={cn('w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold', color)}>
          {conversation.type === 'group' ? <Users className="w-[18px] h-[18px]" /> : getInitials(name)}
        </div>
        {conversation.type === 'one_to_one' && isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-[var(--success)] rounded-full border-2 border-[var(--sidebar-bg)] online-pulse" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('text-[13.5px] truncate', hasUnread ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]')}>
              {name}
            </span>
            {isPinned && <Pin className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />}
            {isMuted && <BellOff className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />}
          </div>
          <span className={cn('text-[11px] whitespace-nowrap flex-shrink-0', hasUnread ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]')}>
            {time}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={cn('text-[12.5px] truncate', hasUnread ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]')}>
            {lastMessage}
          </span>
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[20px] h-[20px] bg-[var(--accent)] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
