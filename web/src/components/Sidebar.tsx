import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Conversation } from '@/stores/chatStore';
import { useUIStore, SidebarFilter } from '@/stores/uiStore';
import { formatTime, getInitials, formatLastMessage, getAvatarColor } from '@/lib/utils';
import logger from '@/lib/logger';
import {
  Search, Settings, Plus, Users, LogOut,
  Moon, Sun, MoreVertical, X, File as FileIcon, Image as ImageIcon,
  MessageSquare, Pin, BellOff, Archive, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CallLogsPanel from './CallLogsPanel';
import ContactsPanel from './ContactsPanel';
import ChatContextMenu from './ChatContextMenu';
import { SkeletonConversationList } from './Skeletons';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Fuse from 'fuse.js';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { conversations, activeConversation, setActiveConversation, onlineUsers,
    pinnedChats, mutedChats, archivedChats,
    togglePinChat, toggleMuteChat, toggleArchiveChat,
    markConversationRead, markConversationUnread, deleteConversation, clearChatHistory,
    drafts, isLoadingConversations,
  } = useChatStore();
  const { theme, toggleTheme, setShowSettings, setShowNewChat, setShowGroupCreate, setShowProfile, sidebarTab, setSidebarTab, sidebarFilter, setSidebarFilter } = useUIStore();
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
    keys: ['other_user.display_name', 'other_user.username', 'group_info.name', 'last_message_decrypted'],
    threshold: 0.4, distance: 100,
  }), [conversations]);

  const filteredConversations = useMemo(() => {
    let result = search ? fuseConversations.search(search).map(result => result.item) : conversations;
    if (!showArchived) {
      result = result.filter(c => !archivedChats.has(c.id));
    } else {
      result = result.filter(c => archivedChats.has(c.id));
    }
    if (sidebarFilter === 'unread') result = result.filter(c => (c.unread_count || 0) > 0);
    else if (sidebarFilter === 'groups') result = result.filter(c => c.type === 'group');
    result = [...result].sort((a, b) => {
      const aPinned = pinnedChats.has(a.id) ? 1 : 0;
      const bPinned = pinnedChats.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aTime = a.last_message_at || a.updated_at;
      const bTime = b.last_message_at || b.updated_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
    return result;
  }, [search, conversations, fuseConversations, pinnedChats, archivedChats, showArchived, sidebarFilter]);

  const archivedCount = useMemo(() => conversations.filter(c => archivedChats.has(c.id)).length, [conversations, archivedChats]);

  const handleChatContextMenu = (e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setChatContextMenu({ conversation: conv, x: e.clientX, y: e.clientY });
  };

  const handleDeleteChat = (convId: string, convName: string) => setConfirmAction({ type: 'delete', convId, convName });
  const handleClearHistory = (convId: string, convName: string) => setConfirmAction({ type: 'clear', convId, convName });

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
        const peopleRes = await api.get(`/users/search?query=${search}`);
        const existingUserIds = new Set(conversations.map(c => c.other_user?.user_id).filter(Boolean));
        setSearchPeople((peopleRes.data.users || []).filter((u: { user_id: string }) => !existingUserIds.has(u.user_id)));
        const allMessages = useChatStore.getState().messages;
        const query = search.toLowerCase();
        const localResults: typeof searchGlobalMessages = [];
        for (const convId in allMessages) {
          for (const m of allMessages[convId]) {
            const text = (m.content || '').toLowerCase();
            if (text.includes(query)) {
              localResults.push({
                message_id: m.id, conversation_id: m.conversation_id,
                snippet: (m.content || '').slice(0, 100), message_type: m.message_type,
                sender_username: m.sender_username || '', sender_display_name: m.sender_display_name,
                created_at: m.created_at,
              });
            }
          }
        }
        setSearchGlobalMessages(localResults.slice(0, 20));
      } catch (error) { logger.error('Search failed:', error); }
      finally { setIsSearching(false); }
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [search, conversations]);

  const searchFiles = useMemo(() => searchGlobalMessages.filter(m => m.message_type === 'file' || m.message_type === 'image'), [searchGlobalMessages]);
  const searchTextMessages = useMemo(() => searchGlobalMessages.filter(m => m.message_type === 'text'), [searchGlobalMessages]);

  const handleStartConversation = async (userId: string) => {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      logger.error('[Sidebar.handleStartConversation] Invalid userId:', userId);
      toast.error('Invalid user selected');
      return;
    }
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
    <nav aria-label="Chat navigation" className={cn(
      'h-full flex flex-col bg-[var(--sidebar-bg)] relative',
      'w-full lg:w-[380px] lg:min-w-[320px] lg:max-w-[420px]',
      'border-r border-[var(--border)]',
      activeConversation ? 'hidden lg:flex' : 'flex'
    )}>
      {/* Header */}
      <div className="h-[60px] px-4 flex items-center justify-between flex-shrink-0 sidebar-header backdrop-blur-xl bg-[var(--sidebar-bg)]/95 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowProfile(true)} className="relative group" aria-label="Your profile">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold',
              'transition-all duration-300 group-hover:shadow-lg group-hover:scale-105',
              'ring-2 ring-transparent group-hover:ring-[var(--accent)]/30',
              getAvatarColor(user?.username || 'U')
            )}>
              {getInitials(user?.display_name || user?.username || '?')}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[var(--success)] rounded-full border-[2.5px] border-[var(--sidebar-bg)]" />
          </button>
          <div>
            <h1 className="text-base font-bold text-[var(--text-primary)] tracking-tight">Zynk</h1>
            <p className="text-[10px] text-[var(--text-muted)] font-medium -mt-0.5">Encrypted messaging</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="btn-icon hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all" title={theme === 'dark' ? 'Light mode' : 'Dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="btn-icon hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all" aria-label="Menu" aria-expanded={showMenu} aria-haspopup="menu">
              <MoreVertical className="w-[18px] h-[18px]" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 z-40 bg-[var(--bg-elevated)] rounded-xl shadow-2xl border border-[var(--border)] py-1.5 min-w-[200px] animate-scale-up" role="menu">
                  {[
                    { icon: Plus, label: 'New chat', action: () => setShowNewChat(true) },
                    { icon: Users, label: 'New group', action: () => setShowGroupCreate(true) },
                    { icon: Settings, label: 'Settings', action: () => setShowSettings(true) },
                  ].map(item => (
                    <button key={item.label} onClick={() => { item.action(); setShowMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors" role="menuitem">
                      <item.icon className="w-4 h-4 text-[var(--text-muted)]" /> {item.label}
                    </button>
                  ))}
                  <div className="my-1.5 mx-3 h-px bg-[var(--separator)]" />
                  <button onClick={() => { handleLogout(); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--danger)] hover:bg-red-500/5 transition-colors" role="menuitem">
                    <LogOut className="w-4 h-4" /> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-2.5 bg-[var(--bg-wash)] rounded-xl px-3.5 h-10 transition-all duration-200 focus-within:bg-[var(--bg-surface)] focus-within:ring-2 focus-within:ring-[var(--accent-ring)] focus-within:shadow-sm">
          <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"
            placeholder="Search chats, contacts..." aria-label="Search chats and contacts" />
          {isSearching && <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" role="status" aria-label="Searching" />}
          {search && !isSearching && (
            <button onClick={() => setSearch('')} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover)] transition-all" aria-label="Clear search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] flex-shrink-0 px-2" role="tablist" aria-label="Navigation">
        {(['chats', 'contacts', 'calls'] as const).map(tab => (
          <button key={tab} onClick={() => setSidebarTab(tab)} role="tab" aria-selected={sidebarTab === tab}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-all relative rounded-t-lg mx-0.5',
              sidebarTab === tab
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            )}>
            {tab === 'chats' ? 'Chats' : tab === 'contacts' ? 'Contacts' : 'Calls'}
            {tab === 'chats' && totalUnread > 0 && sidebarTab !== 'chats' && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
            {sidebarTab === tab && (
              <div className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-[var(--accent)] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Filter pills */}
      {sidebarTab === 'chats' && !search && (
        <div className="flex gap-2 px-3 py-2 flex-shrink-0" role="radiogroup" aria-label="Filter conversations">
          {([
            { key: 'all' as SidebarFilter, label: 'All' },
            { key: 'unread' as SidebarFilter, label: 'Unread' },
            { key: 'groups' as SidebarFilter, label: 'Groups' },
          ]).map(f => (
            <button key={f.key} onClick={() => setSidebarFilter(f.key)} role="radio" aria-checked={sidebarFilter === f.key}
              className={cn(
                'px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200',
                sidebarFilter === f.key
                  ? 'bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/20'
                  : 'bg-[var(--bg-wash)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              )}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {sidebarTab === 'chats' ? (
        <div className="flex-1 overflow-y-auto scroll-thin" role="tabpanel" aria-label="Chats">
          {isLoadingConversations && conversations.length === 0 ? (
            <SkeletonConversationList />
          ) : search && filteredConversations.length === 0 && searchPeople.length === 0 && searchFiles.length === 0 && searchTextMessages.length === 0 ? (
            <EmptySearch isSearching={isSearching} />
          ) : (
            <div className="pb-20">
              {filteredConversations.length > 0 && (
                <>
                  {search && <SectionHeader label="Chats" />}
                  {filteredConversations.map((conv) => (
                    <ConversationItem key={conv.id} conversation={conv}
                      isActive={activeConversation === conv.id}
                      isOnline={conv.other_user ? onlineUsers.has(conv.other_user.user_id) : false}
                      isPinned={pinnedChats.has(conv.id)}
                      isMuted={mutedChats.has(conv.id)}
                      draft={drafts[conv.id]}
                      onClick={() => { setActiveConversation(conv.id); setSearch(''); }}
                      onContextMenu={(e) => handleChatContextMenu(e, conv)} />
                  ))}
                </>
              )}
              {!search && !showArchived && archivedCount > 0 && (
                <button onClick={() => setShowArchived(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--hover)] transition-colors text-left group">
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center group-hover:bg-[var(--accent)] transition-all">
                    <Archive className="w-5 h-5 text-[var(--accent)] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-[var(--accent)]">Archived</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)] bg-[var(--bg-wash)] px-2 py-0.5 rounded-full">{archivedCount}</span>
                  </div>
                </button>
              )}
              {showArchived && (
                <button onClick={() => setShowArchived(false)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--hover)] transition-colors">
                  ← Back to chats
                </button>
              )}
              {searchPeople.length > 0 && (
                <>
                  <SectionHeader label="People" />
                  {searchPeople.map((person) => (
                    <button key={person.user_id} onClick={() => handleStartConversation(person.user_id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left">
                      <div className={cn('w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold', getAvatarColor(person.display_name || person.username))}>
                        {getInitials(person.display_name || person.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[var(--text-primary)] truncate">{person.display_name || person.username}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{person.bio || 'Available'}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {searchTextMessages.length > 0 && (
                <>
                  <SectionHeader label="Messages" />
                  {searchTextMessages.map((msg) => (
                    <button key={msg.message_id} onClick={() => { setActiveConversation(msg.conversation_id); setSearch(''); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left">
                      <div className="w-12 h-12 rounded-full bg-[var(--bg-wash)] flex items-center justify-center text-[var(--text-muted)]">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{msg.sender_display_name || msg.sender_username}</span>
                          <span className="text-[11px] text-[var(--text-muted)]">{new Date(msg.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{msg.snippet}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {searchFiles.length > 0 && (
                <>
                  <SectionHeader label="Files" />
                  {searchFiles.map((file) => (
                    <button key={file.message_id} onClick={() => { setActiveConversation(file.conversation_id); setSearch(''); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--hover)] transition-colors text-left">
                      <div className="w-12 h-12 rounded-lg bg-[var(--bg-wash)] flex items-center justify-center text-[var(--text-muted)]">
                        {file.message_type === 'image' ? <ImageIcon className="w-5 h-5" /> : <FileIcon className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate block">
                          {(() => { try { return JSON.parse(file.snippet).filename; } catch { return file.snippet; } })()}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">{file.sender_display_name || file.sender_username}</span>
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

      {/* Chat Context Menu */}
      {chatContextMenu && (
        <ChatContextMenu
          x={chatContextMenu.x} y={chatContextMenu.y}
          isPinned={pinnedChats.has(chatContextMenu.conversation.id)}
          isMuted={mutedChats.has(chatContextMenu.conversation.id)}
          isArchived={archivedChats.has(chatContextMenu.conversation.id)}
          unreadCount={chatContextMenu.conversation.unread_count || 0}
          onClose={() => setChatContextMenu(null)}
          onPin={() => { togglePinChat(chatContextMenu.conversation.id); toast.success(pinnedChats.has(chatContextMenu.conversation.id) ? 'Unpinned' : 'Pinned'); }}
          onMute={() => { toggleMuteChat(chatContextMenu.conversation.id); toast.success(mutedChats.has(chatContextMenu.conversation.id) ? 'Unmuted' : 'Muted'); }}
          onMuteDuration={(duration: string) => { useChatStore.getState().muteChat(chatContextMenu.conversation.id, duration); toast.success(`Muted for ${duration}`); }}
          onArchive={() => { toggleArchiveChat(chatContextMenu.conversation.id); toast.success(archivedChats.has(chatContextMenu.conversation.id) ? 'Unarchived' : 'Archived'); }}
          onMarkReadUnread={() => {
            const conv = chatContextMenu.conversation;
            if (conv.unread_count > 0) { markConversationRead(conv.id); toast.success('Marked as read'); }
            else { markConversationUnread(conv.id); toast.success('Marked as unread'); }
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

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setConfirmAction(null)} role="dialog" aria-modal="true" aria-labelledby="sidebar-confirm-title">
          <div className="bg-[var(--bg-surface)] rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-[var(--border)] mx-4 animate-scale-up"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              {confirmAction.type === 'delete' ? (
                <LogOut className="w-6 h-6 text-[var(--danger)]" />
              ) : (
                <Archive className="w-6 h-6 text-[var(--danger)]" />
              )}
            </div>
            <h3 id="sidebar-confirm-title" className="text-lg font-bold text-[var(--text-primary)] mb-2 text-center">
              {confirmAction.type === 'delete' ? 'Delete chat?' : 'Clear chat history?'}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6 text-center leading-relaxed">
              {confirmAction.type === 'delete'
                ? `Delete your chat with "${confirmAction.convName}"? This cannot be undone.`
                : `Clear all messages in "${confirmAction.convName}"? This cannot be undone.`}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] rounded-xl border border-[var(--border)] hover:bg-[var(--hover)] transition-all active:scale-[0.98]">
                Cancel
              </button>
              <button onClick={confirmActionHandler}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-[var(--danger)] rounded-xl hover:brightness-110 active:scale-[0.98] transition-all shadow-md">
                {confirmAction.type === 'delete' ? 'Delete' : 'Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      {sidebarTab === 'chats' && (
        <div className="absolute bottom-5 right-4 z-20">
          <button onClick={() => setShowNewChat(true)} aria-label="New chat"
            className="w-14 h-14 rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-white flex items-center justify-center shadow-lg shadow-[var(--accent)]/25 hover:shadow-xl hover:shadow-[var(--accent)]/30 transition-all hover:scale-105 active:scale-95">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      )}
    </nav>
  );
}

/* Sub-components */

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-2 mt-1">
      <span className="text-[11px] font-semibold text-[var(--accent)] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function EmptySearch({ isSearching }: { isSearching: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] px-8" role="status" aria-label={isSearching ? 'Searching' : 'No results found'}>
      {isSearching ? (
        <div className="w-8 h-8 border-[3px] border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-wash)] flex items-center justify-center mb-4">
            <Search className="w-7 h-7 opacity-30" />
          </div>
          <p className="text-sm font-semibold text-[var(--text-secondary)]">No results found</p>
          <p className="text-xs mt-1.5 text-center leading-relaxed">Try a different search term or check your spelling</p>
        </>
      )}
    </div>
  );
}

function ConversationItem({ conversation, isActive, isOnline, isPinned, isMuted, draft, onClick, onContextMenu }: {
  conversation: Conversation; isActive: boolean; isOnline: boolean;
  isPinned: boolean; isMuted: boolean; draft?: string;
  onClick: () => void; onContextMenu: (e: React.MouseEvent) => void;
}) {
  const name = conversation.type === 'one_to_one'
    ? (conversation.other_user?.display_name || conversation.other_user?.username || 'Unknown')
    : (conversation.group_info?.name || 'Group');
  const lastMessage = draft ? undefined : formatLastMessage(conversation.last_message_decrypted || conversation.last_message || '', 40) || 'No messages yet';
  const time = conversation.last_message_at ? formatTime(conversation.last_message_at) : '';
  const hasUnread = conversation.unread_count > 0;
  const color = conversation.type === 'group' ? 'bg-violet-500' : getAvatarColor(name);

  return (
    <button onClick={onClick} onContextMenu={onContextMenu} className={cn(
      'conv-item w-full flex items-center gap-3 px-4 py-[11px] text-left transition-all',
      'hover:bg-[var(--hover)]',
      isActive && 'active bg-[var(--accent-subtle)]'
    )}>
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={cn(
          'w-[50px] h-[50px] rounded-full flex items-center justify-center text-white text-sm font-bold',
          'shadow-sm transition-transform',
          color
        )}>
          {conversation.type === 'group' ? <Users className="w-5 h-5" /> : getInitials(name)}
        </div>
        {conversation.type === 'one_to_one' && isOnline && (
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[var(--success)] rounded-full border-[2.5px] border-[var(--sidebar-bg)] shadow-sm" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 border-b border-[var(--border)]/60 pb-[11px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('text-[14px] truncate', hasUnread ? 'font-bold text-[var(--text-primary)]' : 'font-medium text-[var(--text-primary)]')}>
              {name}
            </span>
            {isPinned && <Pin className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0 rotate-45" />}
            {isMuted && <BellOff className="w-3 h-3 text-[var(--text-muted)] flex-shrink-0" />}
          </div>
          <span className={cn('text-[11px] whitespace-nowrap flex-shrink-0 font-medium', hasUnread ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]')}>
            {time}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          {draft ? (
            <span className="text-[13px] truncate text-[var(--danger)] flex items-center gap-1.5 font-medium">
              <Pencil className="w-3 h-3 flex-shrink-0" />
              {draft.length > 40 ? draft.slice(0, 40) + '...' : draft}
            </span>
          ) : (
            <span className={cn('text-[13px] truncate leading-relaxed', hasUnread ? 'text-[var(--text-secondary)] font-medium' : 'text-[var(--text-muted)]')}>
              {lastMessage}
            </span>
          )}
          {hasUnread && (
            <span className={cn(
              'flex-shrink-0 min-w-[20px] h-[20px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1.5 shadow-sm',
              isMuted ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent)]'
            )}>
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}