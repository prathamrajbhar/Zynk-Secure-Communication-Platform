'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, type Message } from '@/stores/chatStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useCryptoStore } from '@/stores/cryptoStore';
import { useCallStore } from '@/stores/callStore';
import { startDecryptionQueueProcessor, stopDecryptionQueueProcessor } from '@/stores/decryptionQueue';
import { isEncryptedMessage } from '@/lib/crypto';
import { connectSocket, disconnectSocket, SOCKET_EVENTS } from '@/lib/socket';
import logger from '@/lib/logger';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import NewChatModal from '@/components/NewChatModal';
import GroupCreateModal from '@/components/GroupCreateModal';
import SettingsPanel from '@/components/SettingsPanel';
import ProfilePanel from '@/components/ProfilePanel';
import UserInfoPanel from '@/components/UserInfoPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConnectionBanner } from '@/components/ConnectionIndicator';
import CallOverlay from '@/components/CallOverlay';
import { useUIStore } from '@/stores/uiStore';
import { Spinner } from '@heroui/react';
import { showToast } from '@/components/ui';
import {
  requestNotificationPermission,
  notifyIncomingMessage,
  updateAppBadge,
  playMessageSound,
} from '@/lib/notifications';

export default function ChatPage() {
  const { isAuthenticated, isLoading, hydrate } = useAuthStore();
  const connectionStatus = useConnectionStore((state) => state.status);
  const { showSettings, showNewChat, showGroupCreate, showProfile, showUserInfo, setShowUserInfo } = useUIStore();
  const router = useRouter();

  const prevStatusRef = useRef(connectionStatus);
  const hasConnectedOnceRef = useRef(false);

  useEffect(() => {
    hydrate();
    useUIStore.getState().hydrateUI();
  }, [hydrate]);

  useEffect(() => { requestNotificationPermission(); }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, isLoading, router]);

  // Connection status toasts
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;
    if (!hasConnectedOnceRef.current) {
      if (connectionStatus === 'connected') hasConnectedOnceRef.current = true;
      return;
    }
    if (prevStatus !== connectionStatus) {
      switch (connectionStatus) {
        case 'connected':
          if (prevStatus === 'reconnecting' || prevStatus === 'disconnected') {
            showToast('success', 'Connection restored');
            useChatStore.getState().processMessageQueue();
          }
          break;
        case 'disconnected':
          showToast('error', 'Connection lost', 'Trying to reconnect...');
          break;
        case 'error':
          showToast('error', 'Connection failed', 'Please check your internet.');
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
    startDecryptionQueueProcessor();

    const chatStore = useChatStore.getState();
    chatStore.fetchConversations();

    // Message events
    socket.on(SOCKET_EVENTS.MESSAGE_RECEIVED, async (message) => {
      let decryptedContent: string | undefined;
      const currentUser = useAuthStore.getState().user;

      if (message.sender_id === currentUser?.id) {
        decryptedContent = undefined;
      } else {
        try {
          if (message.encrypted_content) {
            if (isEncryptedMessage(message.encrypted_content)) {
              const chatStore = useChatStore.getState();
              decryptedContent = await chatStore.safeDecryptMessage(
                message.id, message.conversation_id, message.sender_id,
                message.encrypted_content,
                isEncryptedMessage(message.encrypted_content) && message.encrypted_content.includes('"v":4')
              );
            } else {
              decryptedContent = message.encrypted_content;
            }
          }
        } catch (error) {
          logger.error('[E2EE] Message decryption failed:', error);
        }
      }

      const decryptedMessage = { ...message, content: decryptedContent ?? message.content };
      useChatStore.getState().addMessage(decryptedMessage);

      if (message.sender_id !== currentUser?.id) {
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, {
          message_id: message.id, conversation_id: message.conversation_id,
        });
        const activeConv = useChatStore.getState().activeConversation;
        const setActiveConvFn = useChatStore.getState().setActiveConversation;
        if (activeConv !== message.conversation_id || document.hidden) {
          const senderName = message.sender_display_name || message.sender_username || 'Someone';
          const preview = message.message_type === 'image' ? '📷 Photo'
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
      if (data.temp_id) {
        useChatStore.getState().markMessageSent(data.temp_id, {
          id: data.message_id, conversation_id: data.conversation_id,
          status: 'sent', created_at: data.created_at,
        } as Message);
      }
      useChatStore.getState().updateMessageStatus(data.message_id, 'sent');
    });

    socket.on(SOCKET_EVENTS.MESSAGE_STATUS, (data) => {
      useChatStore.getState().updateMessageStatus(data.message_id, data.status);
    });

    socket.on(SOCKET_EVENTS.TYPING_START, (data) => {
      useChatStore.getState().setTyping(data.conversation_id, data.user_id, true);
      setTimeout(() => useChatStore.getState().setTyping(data.conversation_id, data.user_id, false), 3000);
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, (data) => {
      useChatStore.getState().setTyping(data.conversation_id, data.user_id, false);
    });

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

    socket.on(SOCKET_EVENTS.GROUP_SENDER_KEY_AVAILABLE, async (data) => {
      const cs = useCryptoStore.getState();
      if (cs.isInitialized && data.conversation_id) {
        cs.fetchSenderKeyForUser(data.conversation_id, data.sender_id).catch(err => {
          logger.error('[E2EE] Failed to fetch new sender key:', err);
        });
      }
    });

    socket.on(SOCKET_EVENTS.GROUP_KEY_ROTATION_NEEDED, async (data) => {
      const cs = useCryptoStore.getState();
      if (cs.isInitialized && data.conversation_id) {
        const currentUser = useAuthStore.getState().user;
        if (data.triggered_by !== currentUser?.id) {
          cs.rotateGroupKey(data.conversation_id).catch(err => {
            logger.error('[E2EE] Key rotation failed:', err);
          });
        }
      }
    });

    const callStore = useCallStore.getState();
    socket.on(SOCKET_EVENTS.CALL_INCOMING, (data) => callStore.handleIncomingCall(data));
    socket.on(SOCKET_EVENTS.CALL_ANSWERED, (data) => callStore.handleCallAnswered(data));
    socket.on(SOCKET_EVENTS.CALL_ICE_CANDIDATE, (data) => callStore.handleIceCandidate(data));
    socket.on(SOCKET_EVENTS.CALL_ENDED, (data) => callStore.handleCallEnded(data));
    socket.on(SOCKET_EVENTS.CALL_DECLINED, (data) => callStore.handleCallDeclined(data));
    socket.on(SOCKET_EVENTS.CALL_ERROR, (data) => callStore.handleCallError(data));
    socket.on(SOCKET_EVENTS.CALL_MEDIA_STATE, (data) => callStore.handleMediaState(data));
    socket.on(SOCKET_EVENTS.CALL_RENEGOTIATE, (data) => callStore.handleRenegotiate(data));
    socket.on(SOCKET_EVENTS.CALL_RENEGOTIATE_ANSWER, (data) => callStore.handleRenegotiateAnswer(data));
    socket.on(SOCKET_EVENTS.CALL_INITIATED, (data) => {
      const cs = useCallStore.getState();
      if (cs.status === 'ringing' || cs.status === 'initiating') {
        useCallStore.setState({ callId: data.callId });
      }
    });

    const handleBeforeUnload = () => {
      const cs = useCallStore.getState();
      if (cs.status !== 'idle' && cs.status !== 'ended') cs.endCall();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      disconnectSocket();
      stopDecryptionQueueProcessor();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Re-decrypt after crypto ready
  const cryptoReady = useCryptoStore((state) => state.isInitialized);
  useEffect(() => {
    if (!cryptoReady || !isAuthenticated) return;
    const { activeConversation, fetchMessages, fetchConversations, retryDecryptMessages } = useChatStore.getState();
    fetchConversations();
    if (activeConversation) {
      retryDecryptMessages(activeConversation).then(() => fetchMessages(activeConversation));
    }
  }, [cryptoReady, isAuthenticated]);

  // Badge & title
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" color="primary" />
          <span className="text-sm text-default-400 font-medium animate-pulse">Loading Zynk...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Call overlay */}
      <CallOverlay />
      {/* Connection banner */}
      <ConnectionBanner />

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Chat Area */}
        <ErrorBoundary>
          <ChatArea />
        </ErrorBoundary>

        {/* User Info Panel */}
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

      {showNewChat && <NewChatModal />}
      {showGroupCreate && <GroupCreateModal />}
      {showSettings && <SettingsPanel />}
      {showProfile && <ProfilePanel />}
    </div>
  );
}
