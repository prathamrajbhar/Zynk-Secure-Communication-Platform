'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { connectSocket, disconnectSocket, SOCKET_EVENTS } from '@/lib/socket';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import CallOverlay from '@/components/CallOverlay';
import NewChatModal from '@/components/NewChatModal';
import GroupCreateModal from '@/components/GroupCreateModal';
import SettingsPanel from '@/components/SettingsPanel';
import ProfilePanel from '@/components/ProfilePanel';
import { ConnectionBanner } from '@/components/ConnectionIndicator';
import { useUIStore } from '@/stores/uiStore';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { isAuthenticated, isLoading, hydrate } = useAuthStore();
  const { fetchConversations, addMessage, updateMessageStatus, updateConversationMessagesStatus, setTyping, setUserOnline, processMessageQueue, markMessageSent } = useChatStore();
  const { setIncomingCall, handleAnswer, handleIceCandidate, handleCallEnded } = useCallStore();
  const connectionStatus = useConnectionStore((state) => state.status);
  const { showSettings, showNewChat, showGroupCreate, showProfile } = useUIStore();
  const router = useRouter();

  // Track previous connection status for toasts
  const prevStatusRef = useRef(connectionStatus);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Connection status toasts
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    // Don't show toasts on initial load
    if (!hasConnectedOnceRef.current) {
      if (connectionStatus === 'connected') {
        hasConnectedOnceRef.current = true;
      }
      return;
    }

    if (prevStatus !== connectionStatus) {
      switch (connectionStatus) {
        case 'connected':
          if (prevStatus === 'reconnecting' || prevStatus === 'disconnected') {
            toast.success('Connection restored', { duration: 3000, id: 'connection' });
            // Process any queued messages
            processMessageQueue();
          }
          break;
        case 'disconnected':
          toast.error('Connection lost. Trying to reconnect...', { duration: 5000, id: 'connection' });
          break;
        case 'error':
          toast.error('Connection failed. Please check your internet.', { duration: 5000, id: 'connection' });
          break;
        case 'reconnecting':
          // Only show if it's been more than a few seconds
          break;
      }
    }
  }, [connectionStatus, processMessageQueue]);

  // Setup WebSocket and event handlers
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('session_token');
    if (!token) return;

    const socket = connectSocket(token);

    // Fetch conversations after connecting
    fetchConversations();

    // Message events
    socket.on(SOCKET_EVENTS.MESSAGE_RECEIVED, (message) => {
      addMessage(message);
      // Automatically mark as delivered if it's not our own message
      if (message.sender_id !== useAuthStore.getState().user?.id) {
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
          message_id: message.id,
          conversation_id: message.conversation_id
        });
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_SENT, (data) => {
      // Handle confirmation of sent message
      if (data.temp_id) {
        markMessageSent(data.temp_id, {
          id: data.message_id,
          conversation_id: data.conversation_id,
          status: 'sent',
          created_at: data.created_at,
        } as any);
      }
      updateMessageStatus(data.message_id, 'sent');
    });

    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, (data) => {
      updateMessageStatus(data.message_id, data.status);
    });

    // Typing events
    socket.on(SOCKET_EVENTS.TYPING_START, (data) => {
      setTyping(data.conversation_id, data.user_id, true);
      setTimeout(() => setTyping(data.conversation_id, data.user_id, false), 3000);
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (data) => {
      setTyping(data.conversation_id, data.user_id, false);
    });

    // Presence events
    socket.on(SOCKET_EVENTS.USER_ONLINE, (data) => {
      setUserOnline(data.user_id, true);
    });

    socket.on(SOCKET_EVENTS.USER_OFFLINE, (data) => {
      setUserOnline(data.user_id, false);
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_CREATED, () => {
      fetchConversations();
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_READ_RECEIPT, (data) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        updateConversationMessagesStatus(data.conversation_id, currentUser.id, 'read');
      }
    });

    // Call events
    socket.on(SOCKET_EVENTS.CALL_INCOMING, (data) => {
      setIncomingCall(data);
    });

    socket.on(SOCKET_EVENTS.CALL_ANSWERED, (data) => {
      handleAnswer(data);
    });

    socket.on(SOCKET_EVENTS.CALL_ICE_CANDIDATE, (data) => {
      handleIceCandidate(data);
    });

    socket.on(SOCKET_EVENTS.CALL_ENDED, (data) => {
      handleCallEnded(data);
    });

    socket.on(SOCKET_EVENTS.CALL_DECLINED, (data) => {
      handleCallEnded(data);
    });

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, fetchConversations, addMessage, updateMessageStatus, updateConversationMessagesStatus, setTyping, setUserOnline, setIncomingCall, handleAnswer, handleIceCandidate, handleCallEnded, markMessageSent]);

  // Update document title with unread count
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const count = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      document.title = count > 0 ? `(${count}) Zynk` : 'Zynk';
    });
    return () => unsub();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zynk-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      {/* Connection banner shows when disconnected/reconnecting */}
      <ConnectionBanner />

      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <ChatArea />
      </div>

      <CallOverlay />
      {showNewChat && <NewChatModal />}
      {showGroupCreate && <GroupCreateModal />}
      {showSettings && <SettingsPanel />}
      {showProfile && <ProfilePanel />}
    </div>
  );
}
