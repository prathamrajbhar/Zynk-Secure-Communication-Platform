'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, type Message } from '@/stores/chatStore';
import { useCallStore } from '@/stores/callStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useCryptoStore } from '@/stores/cryptoStore';
import { waitForCryptoReady } from '@/stores/cryptoStore';
import { isValidEncryptedMessage, isGroupEncryptedMessage } from '@/lib/crypto';
import { connectSocket, disconnectSocket, SOCKET_EVENTS } from '@/lib/socket';
import logger from '@/lib/logger';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import CallOverlay from '@/components/CallOverlay';
import NewChatModal from '@/components/NewChatModal';
import GroupCreateModal from '@/components/GroupCreateModal';
import SettingsPanel from '@/components/SettingsPanel';
import ProfilePanel from '@/components/ProfilePanel';
import UserInfoPanel from '@/components/UserInfoPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
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
  const { showSettings, showNewChat, showGroupCreate, showProfile, showUserInfo, setShowUserInfo } = useUIStore();
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

    // E2EE initialization is already handled by authStore.hydrate() / login().
    // The stores' fetch methods await crypto readiness internally via
    // waitForCryptoReady(), so no need for a separate initialize() call here.

    const socket = connectSocket(token);

    // Fetch conversations once on mount (not on every reconnect)
    const chatStore = useChatStore.getState();
    chatStore.fetchConversations();

    // Message events
    socket.on(SOCKET_EVENTS.MESSAGE_RECEIVED, async (message) => {
      let decryptedContent: string | undefined;
      const currentUser = useAuthStore.getState().user;

      if (message.sender_id === currentUser?.id) {
        // Own message echoed back — the optimistic message already has plaintext.
        // addMessage() will preserve it. No need to decrypt.
        decryptedContent = undefined;
      } else {
        // Incoming message from another user — wait for crypto readiness, then decrypt
        try {
          await waitForCryptoReady(5000);
          const cs = useCryptoStore.getState();
          if (message.encrypted_content) {
            if (cs.isInitialized && isGroupEncryptedMessage(message.encrypted_content)) {
              // Group E2EE (v4 envelope) — decrypt with sender key
              decryptedContent = await cs.decryptGroup(message.sender_id, message.conversation_id, message.encrypted_content);
            } else if (cs.isInitialized && isValidEncryptedMessage(message.encrypted_content)) {
              // 1:1 E2EE (v3 envelope)
              decryptedContent = await cs.decrypt(message.sender_id, message.encrypted_content);
            } else if (!isValidEncryptedMessage(message.encrypted_content) && !isGroupEncryptedMessage(message.encrypted_content)) {
              // Not encrypted — use raw content
              decryptedContent = message.encrypted_content;
            }
          }
        } catch (error) {
          logger.error('[E2EE] Decrypt failed:', error);
        }
      }

      const decryptedMessage = { ...message, content: decryptedContent ?? message.content };
      useChatStore.getState().addMessage(decryptedMessage);

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
                : decryptedContent || 'New message';
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
    socket.on(SOCKET_EVENTS.CALL_MEDIA_STATE, (data) => {
      useCallStore.getState().handleRemoteMediaState(data);
    });

    socket.on(SOCKET_EVENTS.CALL_RENEGOTIATE, (data) => {
      useCallStore.getState().handleRenegotiate(data);
    });

    socket.on(SOCKET_EVENTS.CALL_RENEGOTIATE_ANSWER, (data) => {
      useCallStore.getState().handleRenegotiateAnswer(data);
    });

    // Group E2EE sender key events
    socket.on(SOCKET_EVENTS.GROUP_SENDER_KEY_AVAILABLE, async (data) => {
      // Another member distributed a new sender key — fetch it
      const cs = useCryptoStore.getState();
      if (cs.isInitialized && data.conversation_id) {
        cs.fetchSenderKeyForUser(data.conversation_id, data.sender_id).catch(err => {
          logger.error('[E2EE] Failed to fetch new sender key:', err);
        });
      }
    });

    socket.on(SOCKET_EVENTS.GROUP_KEY_ROTATION_NEEDED, async (data) => {
      // A member change triggered key rotation — rotate own key and re-distribute
      const cs = useCryptoStore.getState();
      if (cs.isInitialized && data.conversation_id) {
        const currentUser = useAuthStore.getState().user;
        // Don't re-rotate if we triggered it
        if (data.triggered_by !== currentUser?.id) {
          cs.rotateGroupKey(data.conversation_id).catch(err => {
            logger.error('[E2EE] Key rotation failed:', err);
          });
        }
      }
    });

    return () => {
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Re-decrypt messages once crypto finishes initializing (may complete after socket connects)
  const cryptoReady = useCryptoStore((state) => state.isInitialized);
  useEffect(() => {
    if (!cryptoReady || !isAuthenticated) return;
    const { activeConversation, fetchMessages, fetchConversations, retryDecryptMessages } = useChatStore.getState();
    // Re-fetch conversation list with decrypted previews
    fetchConversations();
    // For the active conversation, retry decrypting any failed messages and
    // then re-fetch to fill anything still missing.
    if (activeConversation) {
      retryDecryptMessages(activeConversation).then(() => fetchMessages(activeConversation));
    }
  }, [cryptoReady, isAuthenticated]);

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
        <ErrorBoundary>
          <ChatArea />
        </ErrorBoundary>
        {/* User Info Panel — right sidebar for 1:1 chats */}
        {showUserInfo && (() => {
          const chatStore = useChatStore.getState();
          const conv = chatStore.conversations.find(c => c.id === chatStore.activeConversation);
          if (!conv || conv.type !== 'one_to_one' || !conv.other_user) return null;
          return (
            <UserInfoPanel
              userId={conv.other_user.user_id}
              conversationId={conv.id}
              onClose={() => setShowUserInfo(false)}
            />
          );
        })()}
      </div>

      <CallOverlay />
      {showNewChat && <NewChatModal />}
      {showGroupCreate && <GroupCreateModal />}
      {showSettings && <SettingsPanel />}
      {showProfile && <ProfilePanel />}
    </div>
  );
}
