# Zynk — API Reference

**Base URL:** `/api/v1`  
**Last Updated:** February 12, 2026

---

## Authentication

All authenticated endpoints require:
```
Authorization: Bearer <session_token>
```

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Global (all `/api/`) | 100 requests / 15 min per IP |
| Login | 5 attempts / 15 min per IP |
| Registration | 3 attempts / 15 min per IP |
| Messages | 60 / min per user |
| File uploads | 20 / hour per user |

## Common Headers

| Header | Purpose |
|--------|---------|
| `X-Idempotency-Key` | Idempotency key for safe retries (8–128 chars) |
| `X-Correlation-ID` | Request tracing correlation ID (auto-assigned) |
| `X-RateLimit-Limit` | Rate limit ceiling |
| `X-RateLimit-Remaining` | Remaining requests in window |
| `X-RateLimit-Reset` | Window reset time (epoch seconds) |
| `X-PreKey-Warning` | `LOW_PREKEY_POOL` when <10 pre-keys remain |
| `X-Idempotent-Replayed` | `true` when response served from cache |

---

## Auth Endpoints

### `POST /auth/register`
Create a new account.

**Body:**
```json
{
  "username": "string (3-64 chars, alphanumeric + underscore)",
  "password": "string (8-128 chars)",
  "device_name": "string (default: 'Web Browser')",
  "device_fingerprint": "string",
  "public_key": "string (ECDH public key, base64)"
}
```

**Response (201):**
```json
{
  "user_id": "uuid",
  "username": "string",
  "session_token": "string",
  "refresh_token": "string",
  "expires_at": "number (epoch ms)"
}
```

**Errors:** `409` Username taken, `429` Rate limited

---

### `POST /auth/login`
Login to existing account.

**Body:**
```json
{
  "username": "string",
  "password": "string",
  "device_fingerprint": "string",
  "device_name": "string"
}
```

**Response (200):**
```json
{
  "user_id": "uuid",
  "session_token": "string",
  "refresh_token": "string",
  "device_id": "uuid",
  "expires_at": "number"
}
```

**Errors:** `401` Invalid credentials, `403` Max devices reached (returns device list), `429` Rate limited

---

### `POST /auth/force-login`
Remove a device and login when at max device limit.

**Body:**
```json
{
  "username": "string",
  "password": "string",
  "remove_device_id": "uuid",
  "device_fingerprint": "string",
  "device_name": "string"
}
```

---

### `POST /auth/refresh`
Refresh session token. 🔒 Authenticated

**Body:**
```json
{
  "refresh_token": "string"
}
```

**Response (200):**
```json
{
  "session_token": "string",
  "refresh_token": "string",
  "expires_at": "number"
}
```

---

### `POST /auth/logout` 🔒
Logout current session.

**Response:** `204 No Content`

---

### `POST /auth/logout-all` 🔒
Logout from all devices.

**Response:** `204 No Content`

---

### `GET /auth/me` 🔒
Get current user info.

**Response (200):** User object with profile

---

### `GET /auth/devices` 🔒
List connected devices.

**Response (200):**
```json
{
  "devices": [
    {
      "id": "uuid",
      "device_name": "string",
      "platform": "web|ios|android|desktop",
      "last_active_at": "datetime",
      "created_at": "datetime"
    }
  ]
}
```

---

### `DELETE /auth/devices/:deviceId` 🔒
Remove a device.

**Response:** `204 No Content`

---

## Message Endpoints

### `POST /messages` 🔒
Send an encrypted message.

**Headers:** `X-Idempotency-Key` (recommended)

**Body:**
```json
{
  "conversation_id": "uuid (optional for new 1:1)",
  "recipient_id": "uuid (for new 1:1 conversations)",
  "encrypted_content": "string (ciphertext)",
  "message_type": "text|image|file|audio|video",
  "reply_to_id": "uuid (optional)",
  "expires_in_seconds": "number (optional, self-destruct)"
}
```

**Response (201):**
```json
{
  "message_id": "uuid",
  "conversation_id": "uuid",
  "status": "sent",
  "created_at": "datetime"
}
```

---

### `GET /messages/conversations/list` 🔒
List all conversations with last message, unread counts, online status.

**Response (200):** Array of Conversation objects

---

### `GET /messages/:conversationId` 🔒
Get messages in a conversation.

**Query:** `limit` (1-100, default 50), `before` (cursor UUID)

**Response (200):**
```json
{
  "messages": [ /* Message objects */ ],
  "has_more": true
}
```

---

### `PUT /messages/:messageId` 🔒
Edit a message (own messages only).

**Body:**
```json
{
  "encrypted_content": "string"
}
```

---

### `DELETE /messages/:messageId` 🔒
Delete a message.

**Query:** `for_everyone` (boolean, default false)

---

### `PUT /messages/:messageId/read` 🔒
Mark message as read.

---

### `POST /messages/:messageId/react` 🔒
Toggle reaction on a message.

**Body:**
```json
{
  "emoji": "string"
}
```

---

### `POST /messages/search` 🔒
Search messages.

**Body:**
```json
{
  "query": "string",
  "conversation_id": "uuid (optional)",
  "limit": 20
}
```

---

## Group Endpoints

### `POST /groups` 🔒
Create a group.

**Body:**
```json
{
  "name": "string (1-255 chars)",
  "description": "string (max 500)",
  "avatar_url": "string (optional)",
  "member_ids": ["uuid"] // 1-31 members
}
```

**Response (201):** Group object with conversation_id

---

### `GET /groups/:groupId` 🔒
Get group details with members.

---

### `PUT /groups/:groupId` 🔒 (Admin only)
Update group info.

**Body:**
```json
{
  "name": "string",
  "description": "string",
  "avatar_url": "string"
}
```

---

### `POST /groups/:groupId/members` 🔒 (Admin only)
Add members to group.

**Body:**
```json
{
  "member_ids": ["uuid"]
}
```

---

### `DELETE /groups/:groupId/members/:userId` 🔒 (Admin only)
Remove a member from group.

---

### `POST /groups/:groupId/leave` 🔒
Leave a group.

---

### `DELETE /groups/:groupId` 🔒 (Admin only)
Delete a group (cascading).

---

## File Endpoints

### `POST /files/upload` 🔒
Upload a file (multipart/form-data, 50MB max).

**Body:** `file` (binary), `conversation_id` (UUID)

**Response (201):**
```json
{
  "file_id": "uuid",
  "filename": "string",
  "file_size": "number",
  "mime_type": "string",
  "content_hash": "string (SHA-256)",
  "thumbnail_path": "string|null",
  "created_at": "datetime"
}
```

---

### `GET /files/:fileId/download` 🔒
Download a file (access control: conversation member only).

**Response:** Binary content with ETag caching

---

### `GET /files/:fileId/thumbnail` 🔒
Get image thumbnail (200×200 JPEG, 24h cache).

---

### `GET /files/conversation/:conversationId` 🔒
List files in a conversation (cursor-based pagination).

---

### `DELETE /files/:fileId` 🔒
Soft-delete a file.

---

## Key Management Endpoints

### `POST /keys/bundle` 🔒
Upload Signal Protocol key bundle.

**Body:**
```json
{
  "identity_key": "string (base64)",
  "signed_pre_key": {
    "key_id": "number",
    "public_key": "string (base64)",
    "signature": "string (base64)"
  },
  "one_time_pre_keys": [
    { "key_id": "number", "public_key": "string (base64)" }
  ]
}
```

---

### `GET /keys/bundle/:userId` 🔒
Fetch user's key bundle for session establishment. Atomically consumes one pre-key.

---

### `POST /keys/prekeys/replenish` 🔒
Upload additional one-time pre-keys.

---

### `GET /keys/prekeys/count` 🔒
Get remaining pre-key count for current device.

---

### `GET /keys/identity/:userId` 🔒
Get user's identity key for safety number verification.

---

## Key Backup Endpoints

### `POST /keys/backup` 🔒
Store encrypted private key backup.

**Body:**
```json
{
  "encrypted_private_key": "string",
  "public_key": "string",
  "salt": "string (base64)",
  "iv": "string (base64)"
}
```

---

### `GET /keys/backup` 🔒
Retrieve encrypted key backup.

---

### `POST /keys/backup/message-keys` 🔒
Store encrypted message key archives (batch).

---

### `GET /keys/backup/message-keys` 🔒
Retrieve all message key archives (for new device setup).

---

### `PUT /keys/backup/ratchet-state/:conversationId` 🔒
Update encrypted ratchet state for a conversation.

---

### `GET /keys/backup/ratchet-state/:conversationId` 🔒
Get encrypted ratchet state for a conversation.

---

## Poll Endpoints

### `POST /polls` 🔒
Create a poll in a conversation.

**Body:**
```json
{
  "conversation_id": "uuid",
  "question": "string (max 500)",
  "options": ["string (max 200)"],
  "allow_multiple": false,
  "is_anonymous": false,
  "closes_at": "datetime (optional)"
}
```

---

### `GET /polls/:pollId` 🔒
Get poll with results.

---

### `POST /polls/:pollId/vote` 🔒
Vote on a poll option.

**Body:**
```json
{
  "option_id": "uuid"
}
```

---

## Report Endpoints

### `POST /reports` 🔒
Submit a content report.

**Body:**
```json
{
  "reported_user_id": "uuid",
  "reason": "spam|harassment|hate_speech|inappropriate|impersonation|other",
  "details": "string (optional)"
}
```

---

## Account Endpoints

### `GET /account/export` 🔒
GDPR data export — returns all user data as JSON download.

---

### `POST /account/delete` 🔒
Delete account (GDPR Article 17).

**Body:**
```json
{
  "password": "string",
  "confirmation": "DELETE MY ACCOUNT"
}
```

---

### `POST /account/change-password` 🔒
Change password (invalidates all other sessions).

**Body:**
```json
{
  "current_password": "string",
  "new_password": "string (8+ chars, complexity required)"
}
```

---

### `POST /account/avatar` 🔒
Upload profile avatar (multipart/form-data).

---

## Admin Endpoints (requires ADMIN_USERNAMES)

### `GET /admin/stats` 🔒🛡️
Platform statistics (users, messages, groups, files, sessions).

### `GET /admin/users` 🔒🛡️
Paginated user list with search.

### `GET /admin/users/:userId` 🔒🛡️
Detailed user info.

### `DELETE /admin/users/:userId/sessions` 🔒🛡️
Force-logout a user.

### `GET /admin/reports` 🔒🛡️
List content reports.

### `PUT /admin/reports/:reportId` 🔒🛡️
Resolve a report.

### `GET /admin/audit-logs` 🔒🛡️
View audit trail.

---

## Call Endpoints

### `GET /calls/history` 🔒
Paginated call history (cursor-based, max 100).

### `GET /calls/ice-servers` 🔒
Get STUN/TURN server configuration for WebRTC.

### `GET /calls/active` 🔒
Check if user is in an active call.

---

## Health Endpoints (Public)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Simple health check (load balancer) |
| `GET /api/health/live` | Liveness probe (Kubernetes) |
| `GET /api/health/ready` | Readiness probe (Kubernetes) |
| `GET /api/health/deep` | Deep diagnostics (DB, Redis, disk, memory) |
| `GET /metrics` | Prometheus metrics scrape endpoint |

---

## WebSocket Events

**Connection:** `wss://<host>/` with `auth: { token: session_token }` query

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `message:send` | `{ conversation_id, recipient_id, encrypted_content, message_type }` | Send encrypted message |
| `typing:start` | `{ conversationId }` | Start typing indicator |
| `typing:stop` | `{ conversationId }` | Stop typing indicator |
| `conversation:read` | `{ conversationId }` | Mark all messages as read |
| `message:read` | `{ messageId, conversationId }` | Mark specific message as read |
| `call:initiate` | `{ recipientId, callType, conversationId }` | Start a call |
| `call:answer` | `{ callId }` | Answer incoming call |
| `call:decline` | `{ callId }` | Decline incoming call |
| `call:end` | `{ callId, reason, quality }` | End active call |
| `call:ice-candidate` | `{ callId, targetUserId, candidate }` | Forward ICE candidate |
| `call:renegotiate` | `{ callId, targetUserId, sdp }` | SDP renegotiation |
| `call:media-state` | `{ callId, targetUserId, audioEnabled, videoEnabled }` | Toggle media |
| `call:heartbeat` | `{ callId }` | Keep call alive |
| `call:connected` | `{ callId }` | ICE connection established |
| `ping` | — | Heartbeat ping |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `message:received` | `{ message }` | New message received |
| `message:sent` | `{ message_id, conversation_id, status }` | Send confirmation |
| `message:status` | `{ messageId, status }` | Status update |
| `message:delivered` | `{ messageIds }` | Bulk delivery confirmation |
| `read_receipt` | `{ conversationId, userId, timestamp }` | Read receipt |
| `typing:start` | `{ userId, conversationId }` | User started typing |
| `typing:stop` | `{ userId, conversationId }` | User stopped typing |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId, lastSeen }` | User went offline |
| `call:initiated` | `{ callId, callType }` | Call created (to caller) |
| `call:incoming` | `{ callId, callerId, callType, iceServers }` | Incoming call (to callee) |
| `call:answered` | `{ callId }` | Call answered (to caller) |
| `call:declined` | `{ callId }` | Call declined (to caller) |
| `call:ended` | `{ callId, reason, duration }` | Call ended |
| `call:ice-candidate` | `{ callId, candidate }` | ICE candidate relay |
| `conversation:created` | `{ conversation }` | New conversation |
| `sender-key:distributed` | `{ conversationId, senderId }` | Group key available |
| `epoch:rotated` | `{ conversationId, epoch }` | Key epoch changed |
| `pong` | — | Heartbeat response |
