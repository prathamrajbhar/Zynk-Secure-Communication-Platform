'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, type Message } from '@/stores/chatStore';
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
import {
  requestNotificationPermission,
  notifyIncomingMessage,
  notifyIncomingCall,
  notifyMissedCall,
  dismissNotificationByTag,
  updateAppBadge,
  playMessageSound,
  playRingtone,
  stopRingtone,
} from '@/lib/notifications';

export default function ChatPage() {
  const { isAuthenticated, isLoading, hydrate } = useAuthStore();
  const connectionStatus = useConnectionStore((state) => state.status);
  const { showSettings, showNewChat, showGroupCreate, showProfile } = useUIStore();
  const router = useRouter();

  // Track previous connection status for toasts
  const prevStatusRef = useRef(connectionStatus);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    hydrate();
    useUIStore.getState().hydrateUI();
  }, [hydrate]);

  // Request browser notification permission once on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed silently
      });
    }
  }, []);

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
            useChatStore.getState().processMessageQueue();
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
  }, [connectionStatus]);

  // Setup WebSocket and event handlers
  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('session_token');
    if (!token) return;

    const socket = connectSocket(token);

    // Fetch conversations once on mount (not on every reconnect)
    const chatStore = useChatStore.getState();
    chatStore.fetchConversations();

    // Message events
    socket.on(SOCKET_EVENTS.MESSAGE_RECEIVED, (message) => {
      useChatStore.getState().addMessage(message);
      const currentUser = useAuthStore.getState().user;
      // Automatically mark as delivered if it's not our own message
      if (message.sender_id !== currentUser?.id) {
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
          message_id: message.id,
          conversation_id: message.conversation_id
        });

        // Browser notification — skip if user is viewing this conversation
        const activeConv = useChatStore.getState().activeConversation;
        const setActiveConvFn = useChatStore.getState().setActiveConversation;
        if (activeConv !== message.conversation_id || document.hidden) {
          const senderName = message.sender_display_name || message.sender_username || 'Someone';
          const preview =
            message.message_type === 'image' ? '📷 Photo'
              : message.message_type === 'file' ? '📎 File'
                : message.encrypted_content || 'New message';
          notifyIncomingMessage(senderName, preview, message.conversation_id, () => {
            setActiveConvFn(message.conversation_id);
          });
          playMessageSound();
        }
      }
    });

    socket.on(SOCKET_EVENTS.MESSAGE_SENT, (data) => {
      // Handle confirmation of sent message
      if (data.temp_id) {
        useChatStore.getState().markMessageSent(data.temp_id, {
          id: data.message_id,
          conversation_id: data.conversation_id,
          status: 'sent',
          created_at: data.created_at,
        } as Message);
      }
      useChatStore.getState().updateMessageStatus(data.message_id, 'sent');
    });

    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, (data) => {
      useChatStore.getState().updateMessageStatus(data.message_id, data.status);
    });

    // Typing events
    socket.on(SOCKET_EVENTS.TYPING_START, (data) => {
      useChatStore.getState().setTyping(data.conversation_id, data.user_id, true);
      setTimeout(() => useChatStore.getState().setTyping(data.conversation_id, data.user_id, false), 3000);
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (data) => {
      useChatStore.getState().setTyping(data.conversation_id, data.user_id, false);
    });

    // Presence events
    socket.on(SOCKET_EVENTS.USER_ONLINE, (data) => {
      useChatStore.getState().setUserOnline(data.user_id, true);
    });

    socket.on(SOCKET_EVENTS.USER_OFFLINE, (data) => {
      useChatStore.getState().setUserOnline(data.user_id, false);
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_CREATED, () => {
      useChatStore.getState().fetchConversations();
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_READ_RECEIPT, (data) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useChatStore.getState().updateConversationMessagesStatus(data.conversation_id, currentUser.id, 'read');
      }
    });

    // Call events
    socket.on(SOCKET_EVENTS.CALL_INCOMING, (data) => {
      useCallStore.getState().setIncomingCall(data);
      playRingtone();
      // Browser notification for incoming call (always shown, even when focused)
      notifyIncomingCall(
        data.caller_username || 'Unknown',
        data.call_type || 'audio',
        data.call_id,
        () => { /* clicking focuses the window — call UI is already shown */ }
      );
    });

    socket.on(SOCKET_EVENTS.CALL_ANSWERED, (data) => {
      useCallStore.getState().handleAnswer(data);
      stopRingtone();
      // Dismiss call notification once answered
      dismissNotificationByTag(`call-${data.call_id}`);
    });

    socket.on(SOCKET_EVENTS.CALL_ICE_CANDIDATE, (data) => {
      useCallStore.getState().handleIceCandidate(data);
    });

    socket.on(SOCKET_EVENTS.CALL_ENDED, (data) => {
      // Check if this was a missed call (ringing state when ended)
      const currentCall = useCallStore.getState().activeCall;
      if (currentCall?.status === 'ringing' && currentCall.isIncoming) {
        notifyMissedCall(
          currentCall.remoteUsername || 'Unknown',
          currentCall.callType
        );
      }
      useCallStore.getState().handleCallEnded(data);
      stopRingtone();
      dismissNotificationByTag(`call-${data.call_id}`);
    });

    socket.on(SOCKET_EVENTS.CALL_DECLINED, (data) => {
      useCallStore.getState().handleCallDeclined(data);
      stopRingtone();
      dismissNotificationByTag(`call-${data.call_id}`);
    });

    // Media state & renegotiation events
    socket.on('call:media-state', (data) => {
      useCallStore.getState().handleRemoteMediaState(data);
    });

    socket.on('call:renegotiate', (data) => {
      useCallStore.getState().handleRenegotiate(data);
    });

    socket.on('call:renegotiate-answer', (data) => {
      useCallStore.getState().handleRenegotiateAnswer(data);
    });

    return () => {
      disconnectSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Update document title and app badge with unread count
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const count = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      document.title = count > 0 ? `(${count}) Zynk` : 'Zynk';
      updateAppBadge(count);
    });
    return () => unsub();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-zynk-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-app)] overflow-hidden">
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
