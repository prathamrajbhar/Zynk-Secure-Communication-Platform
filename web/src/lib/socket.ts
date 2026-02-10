import { io, Socket } from 'socket.io-client';
import { useConnectionStore, getQualityFromLatency } from '@/stores/connectionStore';
import logger from '@/lib/logger';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:8000';

// Socket event constants for type safety
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt',
  RECONNECT_ERROR: 'reconnect_error',
  RECONNECT_FAILED: 'reconnect_failed',

  // Messages
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_SENT: 'message:sent',
  MESSAGE_STATUS: 'message:status',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELIVERED: 'message:delivered',

  // Typing
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Presence
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',

  // Calls
  CALL_INITIATE: 'call:initiate',
  CALL_INITIATED: 'call:initiated',
  CALL_INCOMING: 'call:incoming',
  CALL_ANSWER: 'call:answer',
  CALL_ANSWERED: 'call:answered',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_DECLINE: 'call:decline',
  CALL_DECLINED: 'call:declined',
  CALL_RENEGOTIATE: 'call:renegotiate',
  CALL_RENEGOTIATE_ANSWER: 'call:renegotiate-answer',
  CALL_MEDIA_STATE: 'call:media-state',
  CALL_ERROR: 'call:error',

  // Conversation
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_READ_RECEIPT: 'conversation:read_receipt',

  // Group E2EE
  GROUP_SENDER_KEY_DISTRIBUTED: 'group:sender-key-distributed',
  GROUP_SENDER_KEY_AVAILABLE: 'group:sender-key-available',
  GROUP_KEY_ROTATION_NEEDED: 'group:key-rotation-needed',
  GROUP_REQUEST_KEY_ROTATION: 'group:request-key-rotation',

  // Heartbeat
  PING: 'ping',
  PONG: 'pong',

  // Error
  ERROR: 'error',
} as const;

// Configuration
const HEARTBEAT_INTERVAL = 25000; // 25 seconds
const HEARTBEAT_TIMEOUT = 10000; // 10 seconds to wait for pong
const MAX_RECONNECTION_ATTEMPTS = 15;

let socket: Socket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
let pingStartTime: number | null = null;

// Connection store accessor
const getConnectionStore = () => useConnectionStore.getState();

// Heartbeat functions
function startHeartbeat() {
  stopHeartbeat(); // Clear any existing heartbeat

  heartbeatInterval = setInterval(() => {
    if (socket?.connected) {
      pingStartTime = Date.now();
      socket.emit(SOCKET_EVENTS.PING);

      // Set timeout for pong response
      heartbeatTimeout = setTimeout(() => {
        logger.warn('Heartbeat timeout - connection may be stale');
        getConnectionStore().setQuality('poor', -1);
      }, HEARTBEAT_TIMEOUT);
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }
  pingStartTime = null;
}

function handlePong() {
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }

  if (pingStartTime) {
    const latency = Date.now() - pingStartTime;
    const quality = getQualityFromLatency(latency);
    getConnectionStore().setQuality(quality, latency);
    pingStartTime = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

let isConnecting = false;

export function connectSocket(token: string): Socket {
  const connectionStore = getConnectionStore();

  // If already connected, return existing socket
  if (socket?.connected) {
    return socket;
  }

  // Prevent concurrent connection attempts
  if (isConnecting && socket) {
    return socket;
  }

  // If socket exists but disconnected, clean it up first
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  isConnecting = true;
  connectionStore.setStatus('connecting');

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket'], // SECURITY: WebSocket only - polling sends tokens in HTTP headers
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  // Connection events
  socket.on(SOCKET_EVENTS.CONNECT, () => {
    logger.debug('WebSocket connected');
    isConnecting = false;
    connectionStore.markConnected();
    startHeartbeat();
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
    logger.debug('WebSocket disconnected:', reason);
    isConnecting = false;
    connectionStore.markDisconnected();
    stopHeartbeat();

    // If the server disconnected us, we won't auto-reconnect
    if (reason === 'io server disconnect') {
      connectionStore.setError('Server disconnected');
    }
  });

  socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
    logger.error('WebSocket connection error:', error.message);
    isConnecting = false;
    connectionStore.setError(error.message);
  });

  socket.on(SOCKET_EVENTS.RECONNECT_ATTEMPT, (attemptNumber) => {
    logger.debug(`Reconnection attempt ${attemptNumber}/${MAX_RECONNECTION_ATTEMPTS}`);
    connectionStore.setStatus('reconnecting');
    connectionStore.incrementReconnectAttempts();
  });

  socket.on(SOCKET_EVENTS.RECONNECT, (attemptNumber) => {
    logger.debug(`Reconnected after ${attemptNumber} attempts`);
    connectionStore.markConnected();
    startHeartbeat();

    // Rejoin active conversation room after reconnect
    (async () => {
      try {
        // Dynamic import avoids a hard circular dependency with chatStore -> socket
        const mod = await import('@/stores/chatStore');
        const chatState = mod.useChatStore.getState();
        if (chatState.activeConversation) {
          socket?.emit(SOCKET_EVENTS.CONVERSATION_JOIN, { conversation_id: chatState.activeConversation });
        }
        // Re-fetch conversations and process queued messages
        chatState.fetchConversations();
        chatState.processMessageQueue();
        // Re-fetch active conversation messages
        if (chatState.activeConversation) {
          chatState.fetchMessages(chatState.activeConversation);
        }
      } catch (e) {
        logger.error('Failed to rejoin rooms after reconnect:', e);
      }
    })();
  });

  socket.on(SOCKET_EVENTS.RECONNECT_ERROR, (error) => {
    logger.error('Reconnection error:', error.message);
  });

  socket.on(SOCKET_EVENTS.RECONNECT_FAILED, () => {
    logger.error('Reconnection failed after maximum attempts');
    connectionStore.setStatus('error');
    connectionStore.setError('Unable to reconnect. Please refresh the page.');
  });

  // Heartbeat response
  socket.on(SOCKET_EVENTS.PONG, handlePong);

  // Generic error handler
  socket.on(SOCKET_EVENTS.ERROR, (error: { message: string }) => {
    logger.error('Socket error:', error.message);
  });

  return socket;
}

export function disconnectSocket() {
  stopHeartbeat();
  isConnecting = false;

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  getConnectionStore().markDisconnected();
}

// Manual reconnection attempt
export function attemptReconnect(): void {
  if (socket && !socket.connected) {
    getConnectionStore().setStatus('reconnecting');
    socket.connect();
  }
}
