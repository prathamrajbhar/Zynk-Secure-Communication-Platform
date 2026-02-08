import { io, Socket } from 'socket.io-client';
import { useConnectionStore, getQualityFromLatency } from '@/stores/connectionStore';

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

  // Conversation
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_READ_RECEIPT: 'conversation:read_receipt',

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
        console.warn('Heartbeat timeout - connection may be stale');
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

export function connectSocket(token: string): Socket {
  const connectionStore = getConnectionStore();

  // If already connected with this token, return existing socket
  if (socket?.connected) {
    return socket;
  }

  // If socket exists but disconnected, clean it up first
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  connectionStore.setStatus('connecting');

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
    forceNew: true,
  });

  // Connection events
  socket.on(SOCKET_EVENTS.CONNECT, () => {
    console.log('✓ WebSocket connected');
    connectionStore.markConnected();
    startHeartbeat();
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
    console.log('✗ WebSocket disconnected:', reason);
    connectionStore.markDisconnected();
    stopHeartbeat();

    // If the server disconnected us, we won't auto-reconnect
    if (reason === 'io server disconnect') {
      connectionStore.setError('Server disconnected');
    }
  });

  socket.on(SOCKET_EVENTS.CONNECT_ERROR, (error) => {
    console.error('WebSocket connection error:', error.message);
    connectionStore.setError(error.message);
  });

  socket.on(SOCKET_EVENTS.RECONNECT_ATTEMPT, (attemptNumber) => {
    console.log(`↻ Reconnection attempt ${attemptNumber}/${MAX_RECONNECTION_ATTEMPTS}`);
    connectionStore.setStatus('reconnecting');
    connectionStore.incrementReconnectAttempts();
  });

  socket.on(SOCKET_EVENTS.RECONNECT, (attemptNumber) => {
    console.log(`✓ Reconnected after ${attemptNumber} attempts`);
    connectionStore.markConnected();
    startHeartbeat();
  });

  socket.on(SOCKET_EVENTS.RECONNECT_ERROR, (error) => {
    console.error('Reconnection error:', error.message);
  });

  socket.on(SOCKET_EVENTS.RECONNECT_FAILED, () => {
    console.error('✗ Reconnection failed after maximum attempts');
    connectionStore.setStatus('error');
    connectionStore.setError('Unable to reconnect. Please refresh the page.');
  });

  // Heartbeat response
  socket.on(SOCKET_EVENTS.PONG, handlePong);

  // Generic error handler
  socket.on(SOCKET_EVENTS.ERROR, (error: { message: string }) => {
    console.error('Socket error:', error.message);
  });

  return socket;
}

export function disconnectSocket() {
  stopHeartbeat();

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
