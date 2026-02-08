'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, Conversation } from '@/stores/chatStore';
import { useUIStore } from '@/stores/uiStore';
import { formatTime, getInitials, truncate } from '@/lib/utils';
import {
  MessageCircle, Search, Settings, Plus, Users, LogOut,
  Moon, Sun, Shield, Phone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ConnectionIndicator from './ConnectionIndicator';
import CallLogsPanel from './CallLogsPanel';

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const { conversations, activeConversation, setActiveConversation, onlineUsers } = useChatStore();
  const { theme, toggleTheme, setShowSettings, setShowNewChat, setShowGroupCreate, setShowProfile, sidebarTab, setSidebarTab } = useUIStore();
  const [search, setSearch] = useState('');

  const filteredConversations = conversations.filter(conv => {
    if (!search) return true;
    const name = conv.type === 'one_to_one'
      ? (conv.other_user?.display_name || conv.other_user?.username || '')
      : (conv.group_info?.name || '');
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className={cn(
      'h-full flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border)]',
      'w-full lg:w-80 lg:min-w-[320px]',
      activeConversation ? 'hidden lg:flex' : 'flex'
    )}>
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-zynk-500" />
            <span className="text-lg font-bold text-[var(--text-primary)]">Zynk</span>
            <ConnectionIndicator />
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]" title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 py-2 text-sm"
            placeholder="Search conversations"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setSidebarTab('chats')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2',
            sidebarTab === 'chats'
              ? 'text-zynk-500 border-zynk-500'
              : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
          )}
        >
          <MessageCircle className="w-4 h-4" />
          Chats
        </button>
        <button
          onClick={() => setSidebarTab('calls')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2',
            sidebarTab === 'calls'
              ? 'text-zynk-500 border-zynk-500'
              : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]'
          )}
        >
          <Phone className="w-4 h-4" />
          Calls
        </button>
      </div>

      {/* Action buttons - Only show for chats tab */}
      {sidebarTab === 'chats' && (
        <div className="flex gap-2 p-3 border-b border-[var(--border)]">
          <button
            onClick={() => setShowNewChat(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-zynk-600 hover:bg-zynk-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
          <button
            onClick={() => setShowGroupCreate(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[var(--text-primary)] text-sm font-medium transition-colors"
          >
            <Users className="w-4 h-4" />
            New Group
          </button>
        </div>
      )}

      {/* Content area - conditionally render based on tab */}
      {sidebarTab === 'chats' ? (
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversation === conv.id}
                isOnline={conv.other_user ? onlineUsers.has(conv.other_user.user_id) : false}
                onClick={() => setActiveConversation(conv.id)}
              />
            ))
          )}
        </div>
      ) : (
        <CallLogsPanel />
      )}

      {/* User profile section */}
      <div className="p-3 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-3 flex-1 p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <div className="w-9 h-9 bg-zynk-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {getInitials(user?.display_name || user?.username || '?')}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {user?.display_name || user?.username}
              </p>
              <p className="text-xs text-green-500">Online</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  isActive,
  isOnline,
  onClick,
}: {
  conversation: Conversation;
  isActive: boolean;
  isOnline: boolean;
  onClick: () => void;
}) {
  const name = conversation.type === 'one_to_one'
    ? (conversation.other_user?.display_name || conversation.other_user?.username || 'Unknown')
    : (conversation.group_info?.name || 'Group');

  const lastMessage = conversation.last_message
    ? truncate(conversation.last_message, 40)
    : 'No messages yet';

  const time = conversation.last_message_at
    ? formatTime(conversation.last_message_at)
    : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 hover:bg-[var(--bg-tertiary)] transition-colors text-left',
        isActive && 'bg-[var(--bg-tertiary)] border-l-2 border-zynk-500'
      )}
    >
      <div className="relative">
        <div className={cn(
          'w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-medium',
          conversation.type === 'group' ? 'bg-purple-600' : 'bg-zynk-600'
        )}>
          {conversation.type === 'group'
            ? <Users className="w-5 h-5" />
            : getInitials(name)
          }
        </div>
        {conversation.type === 'one_to_one' && isOnline && (
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--bg-secondary)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</span>
          <span className="text-xs text-[var(--text-muted)] ml-2 whitespace-nowrap">{time}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-[var(--text-secondary)] truncate">{lastMessage}</span>
          {conversation.unread_count > 0 && (
            <span className="ml-2 min-w-[20px] h-5 bg-zynk-600 text-white text-xs font-medium rounded-full flex items-center justify-center px-1.5">
              {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
