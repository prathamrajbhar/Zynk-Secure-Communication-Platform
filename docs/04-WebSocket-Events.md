# WebSocket Events Documentation

Complete reference for real-time WebSocket events in Zynk.

## Table of Contents
- [Overview](#overview)
- [Connection & Authentication](#connection--authentication)
- [Message Events](#message-events)
- [Typing Indicators](#typing-indicators)
- [Presence Events](#presence-events)
- [Call Events (WebRTC Signaling)](#call-events-webrtc-signaling)
- [Group E2EE Events](#group-e2ee-events)
- [Conversation Events](#conversation-events)
- [Heartbeat & Connection Health](#heartbeat--connection-health)
- [Error Handling](#error-handling)
- [Event Summary Table](#event-summary-table)

---

## Overview

### WebSocket URL
```
Development: ws://localhost:8000
Production: wss://your-domain.com
```

### Transport
- **Primary**: WebSocket (preferred)
- **Fallback**: Long polling (automatic fallback by Socket.IO)

### Configuration
```typescript
{
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  timeout: 20000
}
```

### Security
- **Authentication**: JWT token in auth object (NEVER in query string or headers)
- **Session Validation**: Tokens validated against database on connection
- **Auto-Disconnect**: Invalid/expired tokens cause immediate disconnect
- **Room Isolation**: Users only receive events from their rooms

---

## Connection & Authentication

### Establishing Connection

**Client Side:**
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  auth: { token: sessionToken },
  transports: ['websocket']
});
```

**Authentication Flow:**
1. Client sends JWT token in `auth.token`
2. Server verifies JWT signature
3. Server validates session exists in database and not expired
4. Server attaches `userId` and `deviceId` to socket
5. Connection established or rejected

**Authentication Errors:**
- `Authentication required`: No token provided
- `Invalid token`: JWT signature invalid or malformed
- `Session expired or revoked`: Token valid but session doesn't exist in DB

---

### Connection Events

#### connect
Emitted when connection is established.

**Client receives:**
```javascript
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
});
```

---

#### disconnect
Emitted when connection is lost.

**Client receives:**
```javascript
socket.on('disconnect', (reason) => {
  // Reasons: 'io server disconnect', 'transport close', 'ping timeout', etc.
  console.log('Disconnected:', reason);
});
```

**Server behavior on disconnect:**
1. Removes socket from user's active sockets
2. If last socket for user, marks user offline
3. Broadcasts `user:offline` event
4. Updates `last_seen_at` in database
5. Sets Redis presence to offline
6. Ends active calls after 10-second grace period

---

#### connect_error
Emitted when connection fails.

**Client receives:**
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

---

#### reconnect
Emitted after successful reconnection.

**Client receives:**
```javascript
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
});
```

---

## Message Events

### message:send
Send a message to a conversation (alternative to HTTP POST).

**Client emits:**
```javascript
socket.emit('message:send', {
  conversation_id: 'uuid',      // Optional if recipient_id provided
  recipient_id: 'uuid',          // Optional if conversation_id provided
  encrypted_content: 'base64...',
  message_type: 'text',          // text, image, file, audio, video
  reply_to_id: 'msg_uuid',       // Optional
  temp_id: 'client_generated_id' // Optional, for deduplication
});
```

**Server broadcasts (to conversation room):**
```javascript
socket.on('message:received', (data) => {
  // data:
  {
    id: 'msg_uuid',
    conversation_id: 'conv_uuid',
    sender_id: 'user_uuid',
    encrypted_content: 'base64...',
    message_type: 'text',
    metadata: { reply_to_id: '...', temp_id: '...' },
    status: 'sent',
    created_at: '2026-02-11T10:00:00Z',
    sender_username: 'johndoe',
    sender_display_name: 'John Doe',
    sender_avatar: 'https://...',
    temp_id: 'client_generated_id'
  }
});
```

**Sender receives confirmation:**
```javascript
socket.on('message:sent', (data) => {
  // data:
  {
    message_id: 'uuid',
    conversation_id: 'conv_uuid',
    status: 'sent',
    created_at: '2026-02-11T10:00:00Z',
    temp_id: 'client_generated_id'
  }
});
```

**Automatic Behavior:**
- Creates conversation if doesn't exist (for DMs)
- Marks message as `delivered` if recipient is online
- Sends push notification if recipient is offline
- Updates conversation `updated_at` timestamp
- All participants joined to conversation room automatically

---

### message:delivered
Mark a message as delivered (sent when message arrives on client).

**Client emits:**
```javascript
socket.emit('message:delivered', {
  message_id: 'uuid',
  conversation_id: 'conv_uuid'
});
```

**Sender receives:**
```javascript
socket.on('message:status', (data) => {
  // data:
  {
    message_id: 'uuid',
    conversation_id: 'conv_uuid',
    status: 'delivered'
  }
});
```

---

### message:read
Mark a single message as read.

**Client emits:**
```javascript
socket.emit('message:read', {
  message_id: 'uuid',
  conversation_id: 'conv_uuid'
});
```

**Sender receives:**
```javascript
socket.on('message:status', (data) => {
  // data:
  {
    message_id: 'uuid',
    conversation_id: 'conv_uuid',
    status: 'read',
    read_by: 'reader_uuid'
  }
});
```

---

### conversation:read
Mark all messages in a conversation as read (more efficient than individual reads).

**Client emits:**
```javascript
socket.emit('conversation:read', {
  conversation_id: 'uuid'
});
```

**Other participants receive:**
```javascript
socket.on('conversation:read_receipt', (data) => {
  // data:
  {
    conversation_id: 'uuid',
    read_by: 'user_uuid',
    at: '2026-02-11T10:00:00Z'
  }
});
```

**Server behavior:**
- Marks ALL unread messages from others as `read`
- Updates `last_read_at` for the user in ConversationParticipant
- Single database transaction for consistency

---

## Typing Indicators

### typing:start
Notify conversation participants that user is typing.

**Client emits:**
```javascript
socket.emit('typing:start', {
  conversation_id: 'uuid'
});
```

**Other participants receive:**
```javascript
socket.on('typing:start', (data) => {
  // data:
  {
    conversation_id: 'uuid',
    user_id: 'typing_user_uuid'
  }
});
```

**Best Practice:** Auto-clear typing indicator after 3 seconds of inactivity.

---

### typing:stop
Notify conversation participants that user stopped typing.

**Client emits:**
```javascript
socket.emit('typing:stop', {
  conversation_id: 'uuid'
});
```

**Other participants receive:**
```javascript
socket.on('typing:stop', (data) => {
  // data:
  {
    conversation_id: 'uuid',
    user_id: 'user_uuid'
  }
});
```

---

## Presence Events

### user:online
Broadcast when a user comes online.

**All users receive:**
```javascript
socket.on('user:online', (data) => {
  // data:
  {
    user_id: 'uuid'
  }
});
```

**Triggered when:**
- User establishes first WebSocket connection
- User has at least one active socket connection

---

### user:offline
Broadcast when a user goes offline.

**All users receive:**
```javascript
socket.on('user:offline', (data) => {
  // data:
  {
    user_id: 'uuid',
    last_seen: '2026-02-11T10:00:00Z'
  }
});
```

**Triggered when:**
- User's last socket disconnects
- No active sockets remain for user

**Data Stored:**
- Redis presence set to `offline`
- Database `last_seen_at` updated in UserProfile

---

## Call Events (WebRTC Signaling)

Zynk uses WebSocket for WebRTC signaling (SDP offer/answer exchange and ICE candidate exchange).

### call:initiate
Initiate a voice or video call.

**Client emits:**
```javascript
socket.emit('call:initiate', {
  recipient_id: 'uuid',
  call_type: 'audio',  // 'audio' or 'video'
  sdp_offer: '...'     // WebRTC SDP offer
});
```

**Caller receives:**
```javascript
socket.on('call:initiated', (data) => {
  // data:
  {
    call_id: 'uuid',
    status: 'ringing',
    recipient_online: true,
    ice_servers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:...', username: '...', credential: '...' }
    ]
  }
});
```

**Recipient receives:**
```javascript
socket.on('call:incoming', (data) => {
  // data:
  {
    call_id: 'uuid',
    caller_id: 'uuid',
    caller_username: 'John Doe',
    caller_avatar: 'https://...',
    call_type: 'audio',
    sdp_offer: '...',
    ice_servers: [...]
  }
});
```

**Server behavior:**
- Creates Call record in database with status `ringing`
- Adds both users to CallParticipant table
- Tracks active call (prevents multiple simultaneous calls per user)
- Sets 30-second ring timeout (auto-marks as `missed` if not answered)
- Sends push notification if recipient offline
- Prevents call if either user already in a call (returns `USER_BUSY` error)

---

### call:answer
Answer an incoming call.

**Client emits:**
```javascript
socket.emit('call:answer', {
  call_id: 'uuid',
  sdp_answer: '...'  // WebRTC SDP answer
});
```

**Caller receives:**
```javascript
socket.on('call:answered', (data) => {
  // data:
  {
    call_id: 'uuid',
    sdp_answer: '...',
    answerer_id: 'uuid'
  }
});
```

**Server behavior:**
- Updates Call status to `in_progress`
- Sets `started_at` timestamp
- Clears ring timeout
- Stores call state in Redis with TTL

---

### call:ice-candidate
Exchange ICE candidates for WebRTC connection establishment.

**Client emits:**
```javascript
socket.emit('call:ice-candidate', {
  call_id: 'uuid',
  candidate: { /* ICE candidate object */ },
  target_id: 'uuid'  // User ID to send candidate to
});
```

**Target user receives:**
```javascript
socket.on('call:ice-candidate', (data) => {
  // data:
  {
    call_id: 'uuid',
    candidate: { ... },
    from_id: 'sender_uuid'
  }
});
```

**Note:** ICE candidates exchanged throughout call establishment for NAT traversal.

---

### call:media-state
Notify of media state changes (mute/unmute, camera on/off).

**Client emits:**
```javascript
socket.emit('call:media-state', {
  call_id: 'uuid',
  target_id: 'uuid',
  audio: true,         // Audio enabled/muted
  video: false,        // Video enabled/disabled
  screen_sharing: false
});
```

**Target user receives:**
```javascript
socket.on('call:media-state', (data) => {
  // data:
  {
    call_id: 'uuid',
    user_id: 'sender_uuid',
    audio: true,
    video: false,
    screen_sharing: false
  }
});
```

---

### call:renegotiate
Trigger WebRTC renegotiation (for screen sharing, quality changes, etc.).

**Client emits:**
```javascript
socket.emit('call:renegotiate', {
  call_id: 'uuid',
  sdp_offer: '...',
  target_id: 'uuid'
});
```

**Target receives:**
```javascript
socket.on('call:renegotiate', (data) => {
  // data:
  {
    call_id: 'uuid',
    sdp_offer: '...',
    from_id: 'sender_uuid'
  }
});
```

---

### call:renegotiate-answer
Respond to renegotiation offer.

**Client emits:**
```javascript
socket.emit('call:renegotiate-answer', {
  call_id: 'uuid',
  sdp_answer: '...',
  target_id: 'uuid'
});
```

**Target receives:**
```javascript
socket.on('call:renegotiate-answer', (data) => {
  // data:
  {
    call_id: 'uuid',
    sdp_answer: '...',
    from_id: 'sender_uuid'
  }
});
```

---

### call:end
End an active call.

**Client emits:**
```javascript
socket.emit('call:end', {
  call_id: 'uuid'
});
```

**All participants receive:**
```javascript
socket.on('call:ended', (data) => {
  // data:
  {
    call_id: 'uuid',
    status: 'ended',
    duration_seconds: 120,
    ended_by: 'user_uuid'
  }
});
```

**Server behavior:**
- Updates Call status to `ended`
- Sets `ended_at` timestamp
- Calculates `duration_seconds`
- Updates all CallParticipant records with `left_at`
- Cleans up call tracking (removes from active call maps)
- Deletes Redis call state

---

### call:decline
Decline an incoming call.

**Client emits:**
```javascript
socket.emit('call:decline', {
  call_id: 'uuid'
});
```

**Caller receives:**
```javascript
socket.on('call:declined', (data) => {
  // data:
  {
    call_id: 'uuid',
    declined_by: 'user_uuid'
  }
});
```

**Server behavior:**
- Updates Call status to `declined`
- Clears ring timeout
- Cleans up call tracking

---

### call:error
Error during call operations.

**Client receives:**
```javascript
socket.on('call:error', (data) => {
  // data:
  {
    message: 'User is busy on another call',
    code: 'USER_BUSY'  // Optional error code
  }
});
```

**Error Codes:**
- `USER_BUSY`: Recipient already in a call
- `INVALID_PARAMETERS`: Missing required fields
- `CALL_NOT_FOUND`: Call ID doesn't exist

---

## Group E2EE Events

### group:sender-key-distributed
Notify group members that a sender key has been distributed.

**Client emits (after distributing keys via API):**
```javascript
socket.emit('group:sender-key-distributed', {
  conversation_id: 'conv_uuid',
  key_id: 1
});
```

**Other group members receive:**
```javascript
socket.on('group:sender-key-available', (data) => {
  // data:
  {
    conversation_id: 'conv_uuid',
    sender_id: 'user_uuid',
    key_id: 1
  }
});
```

**Purpose:** Alerts group members to fetch new sender keys from server.

---

### group:request-key-rotation
Request all group members to rotate their sender keys.

**Client emits:**
```javascript
socket.emit('group:request-key-rotation', {
  conversation_id: 'conv_uuid',
  reason: 'member_added'  // 'member_added', 'member_removed', 'periodic'
});
```

**All group members receive:**
```javascript
socket.on('group:key-rotation-needed', (data) => {
  // data:
  {
    conversation_id: 'conv_uuid',
    triggered_by: 'user_uuid',
    reason: 'member_added'
  }
});
```

**Triggered When:**
- New member added to group (compromise previous forward secrecy)
- Member removed from group (prevent future access)
- Periodic rotation (security best practice)

**Client Action:**
- Generate new sender key
- Encrypt for all current group members
- Distribute via `/api/v1/keys/sender-keys/distribute`
- Emit `group:sender-key-distributed` when complete

---

## Conversation Events

### conversation:join
Join a conversation room (for receiving messages).

**Client emits:**
```javascript
socket.emit('conversation:join', {
  conversation_id: 'uuid'
});
```

**Note:** Users are automatically joined to all their conversation rooms on connect. This is only needed if joining a newly created conversation.

---

### conversation:created
Notification when a new conversation is created.

**Participant receives:**
```javascript
socket.on('conversation:created', (data) => {
  // data:
  {
    conversation_id: 'uuid'
  }
});
```

**Triggered When:**
- DM conversation created via `message:send` with recipient_id
- Client should fetch conversation details via HTTP API

---

## Heartbeat & Connection Health

### ping
Client sends periodic ping to check connection health.

**Client emits:**
```javascript
setInterval(() => {
  socket.emit('ping');
}, 25000);  // Every 25 seconds
```

**Client receives:**
```javascript
socket.on('pong', (data) => {
  // data:
  {
    timestamp: 1707649200000
  }
});
```

**Use Case:**
- Detect connection quality (measure latency)
- Detect stale connections (timeout if no pong after 10s)
- Update connection quality indicator in UI

**Client Implementation:**
```javascript
const pingStartTime = Date.now();
socket.emit('ping');

socket.on('pong', () => {
  const latency = Date.now() - pingStartTime;
  // Update UI: latency < 100ms = excellent, < 300ms = good, >= 300ms = poor
});
```

---

## Error Handling

### error
Generic error event.

**Client receives:**
```javascript
socket.on('error', (data) => {
  // data:
  {
    message: 'Error description'
  }
});
```

**Common Errors:**
- Input validation failures
- Authorization errors (not a participant, etc.)
- Business logic errors (conversation doesn't exist, etc.)

---

## Event Summary Table

### Client → Server Events (Emitted by Client)

| Event | Purpose | Required Fields |
|-------|---------|-----------------|
| `message:send` | Send message | `encrypted_content`, (`conversation_id` OR `recipient_id`) |
| `message:delivered` | Mark delivered | `message_id`, `conversation_id` |
| `message:read` | Mark read | `message_id`, `conversation_id` |
| `conversation:read` | Mark all read | `conversation_id` |
| `typing:start` | Start typing | `conversation_id` |
| `typing:stop` | Stop typing | `conversation_id` |
| `call:initiate` | Start call | `recipient_id`, `call_type`, `sdp_offer` |
| `call:answer` | Answer call | `call_id`, `sdp_answer` |
| `call:ice-candidate` | Exchange ICE | `call_id`, `candidate`, `target_id` |
| `call:media-state` | Media change | `call_id`, `target_id`, `audio`, `video` |
| `call:renegotiate` | Renegotiate | `call_id`, `sdp_offer`, `target_id` |
| `call:renegotiate-answer` | Answer renegotiation | `call_id`, `sdp_answer`, `target_id` |
| `call:end` | End call | `call_id` |
| `call:decline` | Decline call | `call_id` |
| `group:sender-key-distributed` | Notify key distributed | `conversation_id`, `key_id` |
| `group:request-key-rotation` | Request key rotation | `conversation_id`, `reason` |
| `conversation:join` | Join room | `conversation_id` |
| `ping` | Heartbeat | (none) |

---

### Server → Client Events (Received by Client)

| Event | Purpose | Triggered By |
|-------|---------|--------------|
| `connect` | Connection established | Successful auth |
| `disconnect` | Connection lost | Network/server issue |
| `message:received` | New message | Another user sends message |
| `message:sent` | Message confirmed | Own message sent successfully |
| `message:status` | Status update | Message delivered/read |
| `conversation:read_receipt` | Read receipt | Another user reads messages |
| `typing:start` | User typing | Another user starts typing |
| `typing:stop` | User stopped typing | Another user stops typing |
| `user:online` | User online | User connects |
| `user:offline` | User offline | User disconnects |
| `call:initiated` | Call created | Own call initiated |
| `call:incoming` | Incoming call | Another user calls you |
| `call:answered` | Call answered | Recipient answers |
| `call:ended` | Call ended | Call terminates |
| `call:declined` | Call declined | Recipient declines |
| `call:ice-candidate` | ICE candidate | WebRTC negotiation |
| `call:media-state` | Media changed | Participant mutes/unmutes |
| `call:renegotiate` | Renegotiate | Screen share toggle |
| `call:renegotiate-answer` | Renegotiation answer | Response to renegotiate |
| `call:error` | Call error | Call operation fails |
| `group:sender-key-available` | New sender key | Group member distributes key |
| `group:key-rotation-needed` | Rotate keys | Member added/removed |
| `conversation:created` | New conversation | Conversation created for you |
| `pong` | Heartbeat response | `ping` sent |
| `error` | Generic error | Various error conditions |

---

## WebSocket Rooms

### Automatic Room Joins
When a user connects, they are automatically joined to:
1. **Personal room**: `user:{userId}` - for private notifications
2. **Conversation rooms**: `conversation:{conversationId}` - for all their conversations
3. **Call room**: `call:{callId}` - when in an active call

### Room Broadcasting
- **Personal**: `io.to('user:{userId}').emit(...)` - Send only to specific user
- **Conversation**: `io.to('conversation:{convId}').emit(...)` - Send to all participants
- **Call**: `io.to('call:{callId}').emit(...)` - Send to all call participants
- **Broadcast**: `socket.broadcast.emit(...)` - Send to everyone except sender
- **Global**: `io.emit(...)` - Send to all connected users

---

## Connection Recovery

### Automatic Reconnection
Socket.IO handles reconnection automatically with exponential backoff:
- Initial delay: 1 second
- Max delay: 10 seconds
- Max attempts: 15

### Client Behavior on Reconnect
1. WebSocket automatically reconnects
2. User rejoins all conversation rooms automatically
3. Undelivered messages marked as delivered (catch-up mechanism)
4. Call state validated (calls ended if disconnected > 10s)

### Server Behavior on Reconnect
1. Validates session still valid
2. Sets user online (broadcasts `user:online`)
3. Joins user to all conversation rooms
4. Performs delivery catch-up (marks recent undelivered messages as delivered)

---

## Next Steps

For implementation details, see:
- [Frontend Architecture](./05-Frontend-Architecture.md) - Client-side Socket.IO integration
- [Backend API Reference](./02-Backend-API-Reference.md) - REST API endpoints
- [Encryption & Security](./06-Encryption-and-Security.md) - E2EE message encryption
