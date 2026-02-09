import { create } from 'zustand';
import api from '@/lib/api';
import { getSocket, isConnected, SOCKET_EVENTS } from '@/lib/socket';
import { useCryptoStore } from '@/stores/cryptoStore';
import { isValidEncryptedMessage } from '@/lib/crypto';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  encrypted_content: string;
  message_type: string;
  metadata?: Record<string, unknown>;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
  edited_at?: string;
  sender_username?: string;
  sender_display_name?: string;
  sender_avatar?: string;
  // For optimistic updates
  tempId?: string;
  isOptimistic?: boolean;
}

export interface PendingMessage {
  tempId: string;
  conversationId: string;
  recipientId: string | null;
  content: string;
  messageType: string;
  replyToId?: string;
  createdAt: string;
  retryCount: number;
}

export interface Conversation {
  id: string;
  type: 'one_to_one' | 'group';
  updated_at: string;
  last_read_at?: string;
  unread_count: number;
  last_message?: string;
  last_message_at?: string;
  last_message_sender_id?: string;
  other_user?: {
    user_id: string;
    username: string;
    display_name?: string;
    avatar_url?: string;
    last_seen_at?: string;
  };
  is_online?: boolean;
  group_info?: {
    group_id: string;
    name: string;
    avatar_url?: string;
  };
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  onlineUsers: Set<string>;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;

  // Message queue for offline/failed messages
  pendingMessages: Map<string, PendingMessage>;
  failedMessages: Map<string, PendingMessage>;

  // Actions
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;

  // Enhanced message sending with optimistic updates
  sendMessage: (conversationId: string | null, recipientId: string | null, content: string, messageType?: string) => void;
  sendMessageOptimistic: (conversationId: string, content: string, messageType?: string, replyToId?: string) => string;
  markMessageSent: (tempId: string, realMessage: Message) => void;
  markMessageFailed: (tempId: string) => void;
  retryMessage: (tempId: string) => void;

  // Process queued messages when reconnected
  processMessageQueue: () => void;

  addMessage: (message: Message) => void;
  updateMessageStatus: (messageId: string, status: Message['status']) => void;
  updateConversationMessagesStatus: (conversationId: string, senderId: string, status: Message['status']) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  setUserOnline: (userId: string, online: boolean) => void;
  startConversation: (recipientId: string) => Promise<string>;
  markConversationRead: (conversationId: string) => void;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

// Generate temporary ID for optimistic messages
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: {},
  typingUsers: {},
  onlineUsers: new Set(),
  isLoadingConversations: false,
  isLoadingMessages: false,
  pendingMessages: new Map(),
  failedMessages: new Map(),
  lastTypingSent: 0,
  isTypingSent: false,

  fetchConversations: async () => {
    set({ isLoadingConversations: true });
    try {
      const res = await api.get('/messages/conversations/list');
      const convs = res.data.conversations || [];
      set({ conversations: convs });

      // Update online users status from initial payload
      const onlineIds = new Set<string>();
      convs.forEach((c: Conversation) => {
        if (c.is_online && c.other_user) {
          onlineIds.add(c.other_user.user_id);
        }
      });
      set({ onlineUsers: onlineIds });
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  fetchMessages: async (conversationId: string) => {
    set({ isLoadingMessages: true });
    try {
      const res = await api.get(`/messages/${conversationId}?limit=50`);
      set(state => ({
        messages: { ...state.messages, [conversationId]: res.data.messages || [] },
      }));
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  setActiveConversation: (id) => {
    set({ activeConversation: id });
    if (id) {
      const socket = getSocket();
      socket?.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversation_id: id });
      get().fetchMessages(id);
    }
  },

  // Legacy sendMessage for compatibility — now with E2EE
  sendMessage: (conversationId, recipientId, content, messageType = 'text') => {
    const socket = getSocket();
    if (!socket || !isConnected()) {
      // Queue the message if not connected
      const tempId = generateTempId();
      const pendingMessage: PendingMessage = {
        tempId,
        conversationId: conversationId || '',
        recipientId,
        content,
        messageType,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };
      set(state => {
        const updated = new Map(state.pendingMessages);
        updated.set(tempId, pendingMessage);
        return { pendingMessages: updated };
      });
      return;
    }

    // Encrypt before sending
    const encryptAndSend = async () => {
      let encryptedContent = content;
      try {
        const cryptoStore = useCryptoStore.getState();
        if (cryptoStore.isInitialized && recipientId) {
          encryptedContent = await cryptoStore.encrypt(recipientId, content);
        }
      } catch (error) {
        console.error('Encryption failed, message not sent:', error);
        return;
      }

      socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
        conversation_id: conversationId,
        recipient_id: recipientId,
        encrypted_content: encryptedContent,
        message_type: messageType,
      });
    };

    encryptAndSend().catch(console.error);
  },

  // Optimistic send - adds message to UI immediately, ENCRYPTS before transmission
  sendMessageOptimistic: (conversationId, content, messageType = 'text', replyToId) => {
    const tempId = generateTempId();
    const socket = getSocket();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    // Get recipient from conversation
    const conversation = get().conversations.find(c => c.id === conversationId);
    const recipientId = conversation?.type === 'one_to_one' ? conversation.other_user?.user_id : null;

    // Create optimistic message
    const optimisticMessage: Message = {
      id: tempId,
      tempId,
      conversation_id: conversationId,
      sender_id: user.id || '',
      encrypted_content: content,
      message_type: messageType,
      status: 'pending',
      created_at: new Date().toISOString(),
      sender_username: user.username,
      sender_display_name: user.display_name,
      isOptimistic: true,
      metadata: replyToId ? { reply_to_id: replyToId } : undefined,
    };

    // Add to messages immediately
    set(state => {
      const existing = state.messages[conversationId] || [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, optimisticMessage],
        },
      };
    });

    // Track pending message
    const pendingMessage: PendingMessage = {
      tempId,
      conversationId,
      recipientId: recipientId || null,
      content,
      messageType,
      replyToId,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    set(state => {
      const updated = new Map(state.pendingMessages);
      updated.set(tempId, pendingMessage);
      return { pendingMessages: updated };
    });

    // Send via socket if connected — ENCRYPT before sending
    if (socket && isConnected()) {
      // Encrypt the message content before transmission
      const encryptAndSend = async () => {
        let encryptedContent = content;
        try {
          const cryptoStore = useCryptoStore.getState();
          if (cryptoStore.isInitialized && recipientId) {
            encryptedContent = await cryptoStore.encrypt(recipientId, content);
          } else if (cryptoStore.isInitialized && conversation?.type === 'group') {
            // For groups, encrypt with a shared group key
            // (simplified: encrypt per-member in production Signal Protocol)
            encryptedContent = await cryptoStore.encrypt(conversationId, content);
          }
          // If crypto not initialized, this is a security failure
          if (!cryptoStore.isInitialized) {
            console.error('E2EE not initialized — refusing to send plaintext');
            get().markMessageFailed(tempId);
            return;
          }
        } catch (error) {
          console.error('Encryption failed, message not sent:', error);
          get().markMessageFailed(tempId);
          return;
        }

        socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
          conversation_id: conversationId,
          recipient_id: recipientId,
          encrypted_content: encryptedContent,
          message_type: messageType,
          reply_to_id: replyToId,
          temp_id: tempId,
        });
      };

      encryptAndSend().catch((error) => {
        console.error('Send failed:', error);
        get().markMessageFailed(tempId);
      });

      // Set timeout for marking as failed if no response
      setTimeout(() => {
        const pending = get().pendingMessages.get(tempId);
        if (pending) {
          get().markMessageFailed(tempId);
        }
      }, 30000); // 30 second timeout
    } else {
      // Mark as pending/queued since we're offline
      get().updateMessageStatus(tempId, 'pending');
    }

    return tempId;
  },

  markMessageSent: (tempId, realMessage) => {
    set(state => {
      const convId = realMessage.conversation_id;
      const existing = state.messages[convId] || [];

      // Replace optimistic message with real one
      const updatedMessages = existing.map(m => {
        if (m.tempId === tempId || m.id === tempId) {
          // If already not optimistic, it was likely already updated by a broadcast
          if (!m.isOptimistic && m.id === realMessage.id) return m;
          return { ...m, ...realMessage, isOptimistic: false };
        }
        return m;
      });

      // Remove from pending
      const updatedPending = new Map(state.pendingMessages);
      updatedPending.delete(tempId);

      return {
        messages: { ...state.messages, [convId]: updatedMessages },
        pendingMessages: updatedPending,
      };
    });
  },

  markMessageFailed: (tempId) => {
    set(state => {
      // Move from pending to failed
      const pending = state.pendingMessages.get(tempId);
      if (!pending) return state;

      const updatedPending = new Map(state.pendingMessages);
      updatedPending.delete(tempId);

      const updatedFailed = new Map(state.failedMessages);
      updatedFailed.set(tempId, pending);

      // Update message status in UI
      const convId = pending.conversationId;
      const existing = state.messages[convId] || [];
      const updatedMessages = existing.map(m =>
        m.tempId === tempId || m.id === tempId
          ? { ...m, status: 'failed' as const }
          : m
      );

      return {
        messages: { ...state.messages, [convId]: updatedMessages },
        pendingMessages: updatedPending,
        failedMessages: updatedFailed,
      };
    });
  },

  retryMessage: (tempId) => {
    const failed = get().failedMessages.get(tempId);
    if (!failed) return;

    const socket = getSocket();
    if (!socket || !isConnected()) return;

    // Move back to pending
    set(state => {
      const updatedFailed = new Map(state.failedMessages);
      updatedFailed.delete(tempId);

      const updatedPending = new Map(state.pendingMessages);
      updatedPending.set(tempId, { ...failed, retryCount: failed.retryCount + 1 });

      // Update status to pending
      const convId = failed.conversationId;
      const existing = state.messages[convId] || [];
      const updatedMessages = existing.map(m =>
        m.tempId === tempId || m.id === tempId
          ? { ...m, status: 'pending' as const }
          : m
      );

      return {
        messages: { ...state.messages, [convId]: updatedMessages },
        pendingMessages: updatedPending,
        failedMessages: updatedFailed,
      };
    });

    // Retry sending with encryption
    const encryptAndRetry = async () => {
      try {
        let encryptedContent = failed.content;
        const cryptoStore = useCryptoStore.getState();
        if (cryptoStore.isInitialized && failed.recipientId) {
          encryptedContent = await cryptoStore.encrypt(failed.recipientId, failed.content);
        }

        socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
          conversation_id: failed.conversationId,
          recipient_id: failed.recipientId,
          encrypted_content: encryptedContent,
          message_type: failed.messageType,
          reply_to_id: failed.replyToId,
          temp_id: tempId,
        });
      } catch (error) {
        console.error('Retry encryption failed:', error);
        get().markMessageFailed(tempId);
      }
    };

    encryptAndRetry().catch(console.error);
  },

  processMessageQueue: () => {
    const socket = getSocket();
    if (!socket || !isConnected()) return;

    const pending = get().pendingMessages;
    pending.forEach(async (msg, tempId) => {
      try {
        // Encrypt queued messages before sending
        let encryptedContent = msg.content;
        const cryptoStore = useCryptoStore.getState();
        if (cryptoStore.isInitialized && msg.recipientId) {
          encryptedContent = await cryptoStore.encrypt(msg.recipientId, msg.content);
        }

        socket.emit(SOCKET_EVENTS.MESSAGE_SEND, {
          conversation_id: msg.conversationId,
          recipient_id: msg.recipientId,
          encrypted_content: encryptedContent,
          message_type: msg.messageType,
          reply_to_id: msg.replyToId,
          temp_id: tempId,
        });
      } catch (error) {
        console.error('Failed to encrypt queued message:', error);
        get().markMessageFailed(tempId);
      }
    });
  },

  addMessage: (message) => {
    set(state => {
      const convId = message.conversation_id;
      const existing = state.messages[convId] || [];

      // Check if this is a confirmation of an optimistic message
      const tempId = (message.metadata as { temp_id?: string })?.temp_id || (message as Message & { temp_id?: string }).temp_id;

      // Robust deduplication: Check if we already have this message by ID or tempId
      const isDuplicate = existing.some(m =>
        (m.id === message.id && !m.isOptimistic) ||
        (tempId && m.tempId === tempId && !m.isOptimistic)
      );

      if (isDuplicate) {
        return state;
      }

      // Check for replacement: If we have an optimistic message, replace it
      const optimisticIndex = existing.findIndex(m =>
        (tempId && m.tempId === tempId) || m.id === message.id
      );

      if (optimisticIndex !== -1) {
        // Replace optimistic with real message
        const updatedMessagesList = [...existing];
        const oldMsg = updatedMessagesList[optimisticIndex];
        updatedMessagesList[optimisticIndex] = {
          ...oldMsg,
          ...message,
          isOptimistic: false,
          tempId: tempId || oldMsg.tempId // Preserve tempId for future deduplication
        };

        const updatedPending = new Map(state.pendingMessages);
        if (tempId) updatedPending.delete(tempId);

        return {
          messages: { ...state.messages, [convId]: updatedMessagesList },
          pendingMessages: updatedPending,
        };
      }

      const updatedMessages = {
        ...state.messages,
        [convId]: [...existing, message],
      };

      // Update conversation's last message or refetch if new
      if (!state.conversations.some(c => c.id === convId)) {
        // Trigger a refetch for new conversations
        get().fetchConversations();
        return { messages: updatedMessages };
      }

      const updatedConversations = state.conversations.map(c => {
        if (c.id === convId) {
          return {
            ...c,
            last_message: message.encrypted_content,
            last_message_at: message.created_at,
            last_message_sender_id: message.sender_id,
            unread_count: state.activeConversation === convId ? c.unread_count : (c.unread_count || 0) + 1,
          };
        }
        return c;
      });

      // Sort conversations by last message
      updatedConversations.sort((a, b) => {
        const aTime = a.last_message_at || a.updated_at;
        const bTime = b.last_message_at || b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      return { messages: updatedMessages, conversations: updatedConversations };
    });
  },

  updateMessageStatus: (messageId, status) => {
    set(state => {
      let changed = false;
      const updatedMessages = { ...state.messages };

      for (const convId in updatedMessages) {
        const currentMessages = updatedMessages[convId];
        const newMessages = currentMessages.map(m => {
          if (m.id === messageId || m.tempId === messageId) {
            if (m.status === status) return m;
            changed = true;
            return { ...m, status };
          }
          return m;
        });

        if (newMessages !== currentMessages) {
          updatedMessages[convId] = newMessages;
        }
      }

      if (!changed) return state;
      return { messages: updatedMessages };
    });
  },

  updateConversationMessagesStatus: (conversationId, senderId, status) => {
    set(state => {
      const existing = state.messages[conversationId] || [];
      const updatedMessages = existing.map(m =>
        m.sender_id === senderId && m.status !== status ? { ...m, status } : m
      );

      return {
        messages: {
          ...state.messages,
          [conversationId]: updatedMessages,
        },
      };
    });
  },

  setTyping: (conversationId, userId, isTyping) => {
    set(state => {
      const current = state.typingUsers[conversationId] || [];
      const updated = isTyping
        ? Array.from(new Set([...current, userId]))
        : current.filter(id => id !== userId);
      return { typingUsers: { ...state.typingUsers, [conversationId]: updated } };
    });
  },

  setUserOnline: (userId, online) => {
    set(state => {
      const updated = new Set(state.onlineUsers);
      if (online) updated.add(userId);
      else updated.delete(userId);
      return { onlineUsers: updated };
    });
  },

  markConversationRead: (conversationId) => {
    const socket = getSocket();
    if (!socket || !isConnected()) return;

    socket.emit('conversation:read', { conversation_id: conversationId });

    // Optimistically update local state
    set(state => {
      const existing = state.messages[conversationId] || [];
      const updatedMessages = existing.map(m =>
        m.status !== 'read' && m.sender_id !== (JSON.parse(localStorage.getItem('user') || '{}').id)
          ? { ...m, status: 'read' as const }
          : m
      );

      const updatedConversations = state.conversations.map(c =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      );

      return {
        messages: { ...state.messages, [conversationId]: updatedMessages },
        conversations: updatedConversations,
      };
    });
  },

  sendTyping: (conversationId, isTyping) => {
    const socket = getSocket();
    if (!socket || !isConnected()) return;

    const now = Date.now();
    const state = get() as ChatState & { isTypingSent?: boolean; lastTypingSent?: number };

    if (isTyping) {
      // Throttle typing:start to once every 3 seconds
      if (!state.isTypingSent || now - (state.lastTypingSent ?? 0) > 3000) {
        socket.emit(SOCKET_EVENTS.TYPING_START, { conversation_id: conversationId });
        set({ lastTypingSent: now, isTypingSent: true } as Partial<ChatState & { lastTypingSent: number; isTypingSent: boolean }>);
      }
    } else if (state.isTypingSent) {
      socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversation_id: conversationId });
      set({ isTypingSent: false } as Partial<ChatState & { isTypingSent: boolean }>);
    }
  },

  startConversation: async (recipientId: string) => {
    // Defensive validation - prevent empty body requests
    if (!recipientId || typeof recipientId !== 'string' || recipientId.trim() === '') {
      console.error('[chatStore.startConversation] Invalid recipientId:', recipientId);
      throw new Error('Invalid recipient ID');
    }

    // Check if conversation already exists
    const existing = get().conversations.find(c =>
      c.type === 'one_to_one' && c.other_user?.user_id === recipientId
    );
    if (existing) return existing.id;

    // Create or find conversation via conversations endpoint
    try {
      const res = await api.post('/messages/conversations', {
        recipient_id: recipientId,
      });
      await get().fetchConversations();
      return res.data.conversation_id;
    } catch (error) {
      console.error('Failed to start conversation:', error);
      throw error;
    }
  },
}));
