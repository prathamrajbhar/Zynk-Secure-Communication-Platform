# Backend API Reference

Complete REST API documentation for the Zynk server.

## Table of Contents
- [Base URL & Authentication](#base-url--authentication)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Authentication Routes](#authentication-routes)
- [User Routes](#user-routes)
- [Message Routes](#message-routes)
- [Group Routes](#group-routes)
- [Call Routes](#call-routes)
- [File Routes](#file-routes)
- [Key Management Routes](#key-management-routes)
- [Poll Routes](#poll-routes)
- [Report Routes](#report-routes)

---

## Base URL & Authentication

### Base URL
```
Development: http://localhost:8000/api/v1
Production: https://your-domain.com/api/v1
```

### Authentication Header
All authenticated endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

**SECURITY**: Never send tokens in query strings or POST bodies. Always use the Authorization header to prevent token leakage in logs.

### Session Management
- **Access tokens** expire in 15 minutes
- **Refresh tokens** expire in 7 days
- Sessions are validated against the database (supports revocation)
- Sessions are cached in Redis for 5 minutes to reduce database load

---

## Error Handling

### Standard Error Response
```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate resource or business logic conflict) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |

### Validation Errors
Input validation is performed using Zod schemas. Invalid inputs return 400 with error details.

---

## Rate Limiting

### Global Rate Limits
- **Window**: 15 minutes
- **Max requests**: 100 requests per window (disabled in development)
- **Headers**:
  ```
  RateLimit-Limit: 100
  RateLimit-Remaining: 95
  RateLimit-Reset: 1234567890
  ```

### Authentication Rate Limits (Stricter)
- **Login**: 5 attempts per 15 minutes
- **Register**: 3 attempts per 15 minutes
- Prevents brute-force attacks

---

## Authentication Routes

Base path: `/api/v1/auth`

### POST /register
Register a new user account.

**Request Body:**
```json
{
  "username": "johndoe",          // 3-64 chars, alphanumeric + underscore
  "password": "SecureP@ss123",    // Production: min 8 chars, uppercase, lowercase, number, special char
  "device_name": "Chrome Browser", // Optional, default: "Web Browser"
  "device_fingerprint": "abc123",  // Optional, auto-generated if not provided
  "public_key": "base64_public_key" // Optional, E2EE identity key
}
```

**Response (201):**
```json
{
  "user_id": "uuid",
  "username": "johndoe",
  "session_token": "jwt_token",
  "refresh_token": "jwt_refresh_token",
  "expires_at": 1234567890         // Unix timestamp
}
```

**Errors:**
- 409: Username already taken
- 400: Validation error (weak password, invalid username, etc.)

---

### POST /login
Login with existing credentials.

**Request Body:**
```json
{
  "username": "johndoe",
  "password": "SecureP@ss123",
  "device_fingerprint": "abc123",  // Optional
  "device_name": "Chrome Browser"  // Optional
}
```

**Response (200):**
```json
{
  "user_id": "uuid",
  "username": "johndoe",
  "session_token": "jwt_token",
  "refresh_token": "jwt_refresh_token",
  "expires_at": 1234567890
}
```

**Special Response (403) - Max Devices Reached:**
```json
{
  "error": "Maximum of 5 devices reached. Remove a device to sign in on this one.",
  "code": "MAX_DEVICES_REACHED",
  "max_devices": 5,
  "devices": [
    {
      "id": "device_uuid",
      "device_name": "iPhone 13",
      "platform": "ios",
      "last_active_at": "2026-02-10T12:00:00Z",
      "created_at": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**Errors:**
- 401: Invalid credentials (same error for non-existent user or wrong password to prevent username enumeration)
- 403: Max devices reached

---

### POST /refresh
Refresh an expired access token using a refresh token.

**Request Body:**
```json
{
  "refresh_token": "jwt_refresh_token"
}
```

**Response (200):**
```json
{
  "session_token": "new_jwt_token",
  "refresh_token": "new_jwt_refresh_token",
  "expires_at": 1234567890
}
```

**Errors:**
- 401: Invalid or expired refresh token
- 404: Session not found

---

### POST /logout
Logout and invalidate current session.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (204):** No content

**Errors:**
- 401: Not authenticated

---

### GET /me
Get current user profile.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user_id": "uuid",
  "username": "johndoe",
  "created_at": "2026-01-01T00:00:00Z",
  "public_key": "base64_public_key",
  "profile": {
    "display_name": "John Doe",
    "avatar_url": "https://...",
    "bio": "Software engineer",
    "privacy_settings": {
      "show_last_seen": true,
      "show_online_status": true,
      "allow_read_receipts": true,
      "allow_proximity_discovery": true
    }
  }
}
```

---

### GET /devices
Get list of active devices.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "devices": [
    {
      "id": "uuid",
      "device_name": "Chrome Browser",
      "platform": "web",
      "last_active_at": "2026-02-11T10:00:00Z",
      "created_at": "2026-02-01T08:00:00Z"
    }
  ]
}
```

---

### DELETE /devices/:deviceId
Remove a device (revoke all sessions for that device).

**Headers:** Requires `Authorization: Bearer <token>`

**Response (204):** No content

**Errors:**
- 400: Cannot remove current device (logout instead)
- 404: Device not found

---

## User Routes

Base path: `/api/v1/users`

### PUT /me
Update current user's profile.

**Headers:** Requires `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "display_name": "John Doe", // Optional, max 255 chars, nullable
  "bio": "Software engineer",  // Optional, max 500 chars, nullable
  "avatar_url": "https://..."  // Optional, valid URL, nullable
}
```

**Response (200):**
```json
{
  "user_id": "uuid",
  "updated_at": "2026-02-11T10:30:00Z"
}
```

---

### PUT /me/privacy
Update privacy settings.

**Headers:** Requires `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "show_online_status": true,       // Optional
  "show_last_seen": true,            // Optional
  "allow_read_receipts": true,       // Optional
  "allow_proximity_discovery": true  // Optional
}
```

**Response (200):**
```json
{
  "privacy_settings": {
    "show_online_status": true,
    "show_last_seen": true,
    "allow_read_receipts": true,
    "allow_proximity_discovery": true
  }
}
```

---

### GET /search
Search for users by username or display name.

**Headers:** Requires `Authorization: Bearer <token>`

**Query Parameters:**
- `query` (required): Search string (min 2 chars)
- `limit` (optional): Max results, default 20, max 50

**Example:** `GET /users/search?query=john&limit=10`

**Response (200):**
```json
{
  "users": [
    {
      "user_id": "uuid",
      "username": "johndoe",
      "display_name": "John Doe",
      "avatar_url": "https://...",
      "bio": "Software engineer"
    }
  ]
}
```

**Errors:**
- 400: Query too short (< 2 chars)

---

### GET /:userId
Get a specific user's profile.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user_id": "uuid",
  "username": "johndoe",
  "public_key": "base64_public_key",
  "created_at": "2026-01-01T00:00:00Z",
  "display_name": "John Doe",
  "avatar_url": "https://...",
  "bio": "Software engineer",
  "last_seen_at": "2026-02-11T10:00:00Z", // Only if privacy allows
  "privacy_settings": { ... }
}
```

**Note:** `last_seen_at` respects user's privacy settings.

---

### GET /:userId/public-key
Get a user's E2EE public key.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "user_id": "uuid",
  "public_key": "base64_encoded_ecdh_p256_public_key"
}
```

---

### Contact Management

#### POST /contacts
Add a user to contacts.

**Request Body:**
```json
{
  "contact_id": "uuid",
  "nickname": "Johnny" // Optional
}
```

**Response (201):**
```json
{
  "message": "Contact added"
}
```

**Errors:**
- 400: Cannot add yourself
- 404: User not found

---

#### GET /contacts/list
Get contact list.

**Query Parameters:**
- `limit` (optional): Max 100, default 50
- `offset` (optional): Pagination offset, default 0

**Response (200):**
```json
{
  "contacts": [
    {
      "contact_id": "uuid",
      "nickname": "Johnny",
      "blocked": false,
      "created_at": "2026-01-01T00:00:00Z",
      "username": "johndoe",
      "display_name": "John Doe",
      "avatar_url": "https://...",
      "bio": "...",
      "last_seen_at": "2026-02-11T10:00:00Z"
    }
  ],
  "offset": 0,
  "limit": 50
}
```

---

#### DELETE /contacts/:contactId
Remove a contact.

**Response (204):** No content

---

#### PUT /contacts/:contactId/block
Block a user.

**Response (200):**
```json
{
  "message": "User blocked"
}
```

---

#### PUT /contacts/:contactId/unblock
Unblock a user.

**Response (200):**
```json
{
  "message": "User unblocked"
}
```

---

#### GET /contacts/blocked
Get list of blocked users.

**Response (200):**
```json
{
  "blocked": [
    {
      "contact_id": "uuid",
      "username": "blockeduser",
      "display_name": "Blocked User",
      "avatar_url": "https://..."
    }
  ]
}
```

---

## Message Routes

Base path: `/api/v1/messages`

### GET /conversations
Get list of user's conversations.

**Headers:** Requires `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "conversations": [
    {
      "id": "conv_uuid",
      "type": "one_to_one",
      "updated_at": "2026-02-11T10:00:00Z",
      "last_read_at": "2026-02-11T09:30:00Z",
      "unread_count": 3,
      "last_message": "encrypted_content_base64",
      "last_message_at": "2026-02-11T10:00:00Z",
      "last_message_sender_id": "uuid",
      "other_user": {
        "user_id": "uuid",
        "username": "johndoe",
        "display_name": "John Doe",
        "avatar_url": "https://...",
        "last_seen_at": "2026-02-11T09:45:00Z"
      },
      "is_online": true,
      "group_info": null
    },
    {
      "id": "conv_uuid_2",
      "type": "group",
      "updated_at": "2026-02-11T09:00:00Z",
      "unread_count": 0,
      "group_info": {
        "group_id": "group_uuid",
        "name": "Team Chat",
        "avatar_url": "https://..."
      }
    }
  ]
}
```

**Performance:** Optimized batch query with no N+1 issues. Fetches online status from Redis.

---

### POST /conversations
Create a one-to-one conversation.

**Request Body:**
```json
{
  "participant_id": "uuid"  // Can also use recipient_id or user_id
}
```

**Response (201):**
```json
{
  "conversation_id": "uuid",
  "type": "one_to_one",
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Errors:**
- 400: Missing participant_id
- 409: Conversation already exists (returns existing conversation_id)

---

### GET /:conversationId/messages
Get messages in a conversation (paginated).

**Query Parameters:**
- `limit` (optional): Default 50, max 100
- `before` (optional): Message ID for pagination (load older messages)

**Response (200):**
```json
{
  "messages": [
    {
      "id": "msg_uuid",
      "conversation_id": "conv_uuid",
      "sender_id": "uuid",
      "encrypted_content": "base64_encrypted_envelope",
      "message_type": "text",
      "metadata": {
        "reply_to_id": "msg_uuid",
        "edited": false
      },
      "status": "delivered",
      "created_at": "2026-02-11T10:00:00Z",
      "edited_at": null,
      "sender_username": "johndoe",
      "sender_display_name": "John Doe",
      "sender_avatar": "https://..."
    }
  ],
  "has_more": true
}
```

---

### POST /:conversationId/messages
Send a message (alternative to WebSocket for reliability).

**Request Body:**
```json
{
  "encrypted_content": "base64_encrypted_envelope",
  "message_type": "text",          // text, image, file, audio, video
  "reply_to_id": "msg_uuid"        // Optional
}
```

**Response (201):**
```json
{
  "message_id": "uuid",
  "conversation_id": "conv_uuid",
  "status": "sent",
  "created_at": "2026-02-11T10:00:00Z"
}
```

---

### PUT /messages/:messageId
Edit a message.

**Request Body:**
```json
{
  "encrypted_content": "new_encrypted_content"
}
```

**Response (200):**
```json
{
  "message_id": "uuid",
  "edited_at": "2026-02-11T10:01:00Z"
}
```

**Errors:**
- 403: Can only edit your own messages
- 404: Message not found

---

### DELETE /messages/:messageId
Delete a message.

**Query Parameters:**
- `for_everyone` (optional): true/false, default false

**Response (204):** No content

**Behavior:**
- `for_everyone=false`: Soft delete for current user only (MessageDeletedFor table)
- `for_everyone=true`: Sets `deleted_at` timestamp (visible to all)

**Errors:**
- 403: Can only delete your own messages

---

### POST /messages/:messageId/read
Mark a message (and all previous messages in conversation) as read.

**Response (200):**
```json
{
  "message_id": "uuid",
  "conversation_id": "conv_uuid",
  "marked_read": 15
}
```

---

### GET /search
Search messages across all conversations.

**Query Parameters:**
- `query` (required): Search term (min 2 chars)
- `conversation_id` (optional): Limit to specific conversation
- `limit` (optional): Default 20, max 50

**Response (200):**
```json
{
  "results": [
    {
      "message_id": "uuid",
      "conversation_id": "conv_uuid",
      "sender_id": "uuid",
      "encrypted_content": "...",
      "created_at": "2026-02-11T10:00:00Z",
      "sender_username": "johndoe"
    }
  ]
}
```

**Note:** Server searches encrypted content (returns matches in ciphertext, not plaintext). Client must decrypt and re-filter results.

---

## Group Routes

Base path: `/api/v1/groups`

### POST /
Create a new group.

**Request Body:**
```json
{
  "name": "Team Chat",                 // 1-255 chars
  "description": "Our team's chat",    // Optional, max 500 chars
  "avatar_url": "https://...",         // Optional
  "member_ids": ["uuid1", "uuid2"]     // 1-31 members (creator is 32nd)
}
```

**Response (201):**
```json
{
  "group_id": "uuid",
  "conversation_id": "conv_uuid",
  "name": "Team Chat",
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Limits:** Max 32 members in MVP (configurable via `max_members` field).

---

### GET /my/list
Get list of user's groups.

**Response (200):**
```json
{
  "groups": [
    {
      "group_id": "uuid",
      "name": "Team Chat",
      "avatar_url": "https://...",
      "conversation_id": "conv_uuid",
      "created_at": "2026-02-11T10:00:00Z",
      "member_count": 5,
      "last_activity": "2026-02-11T12:00:00Z"
    }
  ]
}
```

---

### GET /:groupId
Get group details and member list.

**Response (200):**
```json
{
  "group_id": "uuid",
  "name": "Team Chat",
  "description": "Our team's chat",
  "avatar_url": "https://...",
  "conversation_id": "conv_uuid",
  "created_by": "creator_uuid",
  "created_at": "2026-02-11T10:00:00Z",
  "max_members": 32,
  "members": [
    {
      "user_id": "uuid",
      "role": "admin",
      "joined_at": "2026-02-11T10:00:00Z",
      "username": "johndoe",
      "display_name": "John Doe",
      "avatar_url": "https://..."
    }
  ]
}
```

**Errors:**
- 404: Group not found
- 403: Not a group member

---

### PUT /:groupId
Update group details (admin only).

**Request Body:**
```json
{
  "name": "New Group Name",       // Optional
  "description": "New desc",      // Optional
  "avatar_url": "https://..."     // Optional
}
```

**Response (200):**
```json
{
  "group_id": "uuid",
  "updated_at": "2026-02-11T10:30:00Z"
}
```

**Errors:**
- 403: Admin access required

---

### DELETE /:groupId
Delete a group (admin only).

**Response (204):** No content

**Errors:**
- 403: Admin access required
- 404: Group not found

---

### POST /:groupId/members
Add members to group (admin only).

**Request Body:**
```json
{
  "user_ids": ["uuid1", "uuid2"]
}
```

**Response (201):**
```json
{
  "added": 2
}
```

**Errors:**
- 403: Admin access required
- 400: Group is full

---

### DELETE /:groupId/members/:userId
Remove a member from group (admin only, or user can remove themselves).

**Response (204):** No content

**Errors:**
- 403: Admin access required (unless removing self)

---

### PUT /:groupId/members/:userId/role
Change member role (admin only).

**Request Body:**
```json
{
  "role": "admin" // admin, moderator, or member
}
```

**Response (200):**
```json
{
  "user_id": "uuid",
  "role": "admin"
}
```

**Errors:**
- 403: Admin access required

---

### POST /:groupId/leave
Leave a group.

**Response (204):** No content

---

## Call Routes

Base path: `/api/v1/calls`

### GET /ice-servers
Get ICE server configuration for WebRTC.

**Response (200):**
```json
{
  "ice_servers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    {
      "urls": ["turn:turn.example.com:3478"],
      "username": "turnuser",
      "credential": "turnpass"
    }
  ],
  "ttl": 86400
}
```

---

### POST /initiate
Initiate a voice or video call.

**Request Body:**
```json
{
  "recipient_id": "uuid",
  "call_type": "audio"  // "audio" or "video"
}
```

**Response (201):**
```json
{
  "call_id": "uuid",
  "status": "ringing",
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Errors:**
- 404: Recipient not found
- 409: User is busy on another call (code: "USER_BUSY")
- 400: Invalid call type

---

### POST /:callId/answer
Answer an incoming call.

**Response (200):**
```json
{
  "call_id": "uuid",
  "status": "in_progress"
}
```

**Errors:**
- 403: Not a participant in this call

---

### POST /:callId/end
End an active call.

**Response (200):**
```json
{
  "call_id": "uuid",
  "duration_seconds": 120,
  "ended_at": "2026-02-11T10:02:00Z"
}
```

---

### POST /:callId/decline
Decline an incoming call.

**Response (200):**
```json
{
  "call_id": "uuid",
  "status": "declined"
}
```

---

### GET /history
Get call history.

**Query Parameters:**
- `limit` (optional): Default 50, max 100
- `offset` (optional): Pagination offset, default 0

**Response (200):**
```json
{
  "calls": [
    {
      "call_id": "uuid",
      "call_type": "audio",
      "status": "ended",
      "initiator_id": "uuid",
      "started_at": "2026-02-11T10:00:00Z",
      "ended_at": "2026-02-11T10:02:00Z",
      "duration_seconds": 120,
      "participants": [
        {
          "user_id": "uuid",
          "username": "johndoe",
          "display_name": "John Doe"
        }
      ]
    }
  ],
  "offset": 0,
  "limit": 50
}
```

---

## File Routes

Base path: `/api/v1/files`

### POST /upload
Upload a file.

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file` (required): File data
- `conversation_id` (optional): Associate with conversation

**Max File Size:** 50MB (configurable)

**Allowed Types:**
- Images: jpeg, png, gif, webp, svg
- Documents: pdf, txt, markdown, doc, docx, xls, xlsx
- Audio: mp3, ogg, wav, webm, aac
- Video: mp4, webm, ogg
- Archives: zip, gzip
- Encrypted: application/octet-stream

**Response (201):**
```json
{
  "file_id": "uuid",
  "filename": "document.pdf",
  "file_size": 1024000,
  "mime_type": "application/pdf",
  "content_hash": "sha256_hex",
  "thumbnail_path": "thumb_1234.jpg",
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Errors:**
- 400: No file provided
- 403: Not a participant in conversation
- 413: File too large
- 415: File type not allowed

**Security Features:**
- Random server-side filenames (prevents overwriting)
- Blocked executable extensions (.exe, .bat, .sh, etc.)
- MIME type validation
- SHA-256 content hashing
- Automatic image thumbnail generation (200x200px JPEG)
- Image compression for large files (>1MB)

---

### GET /:fileId/thumbnail
Get file thumbnail.

**Response:** Image binary data (JPEG)

**Headers:**
- `Cache-Control: private, max-age=86400`
- `Content-Type: image/jpeg`

**Errors:**
- 403: Access denied (not in conversation)
- 404: Thumbnail not found

---

### GET /:fileId/download
Download a file.

**Response:** File binary data

**Headers:**
- `Content-Disposition: attachment; filename="original_name.pdf"`
- `Content-Type: application/pdf`
- `ETag: sha256_hash`
- `Cache-Control: private, max-age=3600`

**Errors:**
- 403: Access denied
- 404: File not found or deleted

---

### GET /:fileId/metadata
Get file metadata without downloading.

**Response (200):**
```json
{
  "file_id": "uuid",
  "filename": "document.pdf",
  "file_size": 1024000,
  "mime_type": "application/pdf",
  "content_hash": "sha256_hex",
  "created_at": "2026-02-11T10:00:00Z",
  "uploader": {
    "user_id": "uuid",
    "username": "johndoe"
  }
}
```

---

### DELETE /:fileId
Delete a file (soft delete).

**Response (204):** No content

**Errors:**
- 403: Only uploader can delete
- 404: File not found

---

### GET /
List files in a conversation.

**Query Parameters:**
- `conversation_id` (required): Conversation UUID
- `limit` (optional): Default 20, max 50
- `offset` (optional): Pagination offset

**Response (200):**
```json
{
  "files": [ ... ],
  "offset": 0,
  "limit": 20
}
```

---

## Key Management Routes

Base path: `/api/v1/keys`

### POST /upload
Upload E2EE key bundle (identity key, signed pre-key, one-time pre-keys).

**Request Body:**
```json
{
  "identity_key": "base64_public_key",
  "registration_id": 12345,
  "signed_pre_key": {
    "key_id": 1,
    "public_key": "base64_spk",
    "signature": "base64_signature"
  },
  "pre_keys": [
    {
      "key_id": 1,
      "public_key": "base64_pk"
    }
    // ... up to 100 pre-keys
  ]
}
```

**Response (201):**
```json
{
  "success": true
}
```

**Behavior:**
- Upserts identity key
- Replaces signed pre-key (only latest kept)
- Batch inserts one-time pre-keys (skips duplicates)
- Updates user's public_key field

---

### POST /replenish
Add more one-time pre-keys when running low.

**Request Body:**
```json
{
  "pre_keys": [
    {
      "key_id": 101,
      "public_key": "base64_pk"
    }
    // ... up to 100 pre-keys
  ]
}
```

**Response (200):**
```json
{
  "added": 50
}
```

---

### GET /:userId/bundle
Fetch a pre-key bundle to initiate an encrypted session.

**Query Parameters:**
- `device_id` (optional): Specific device ID

**Response (200):**
```json
{
  "user_id": "uuid",
  "device_id": "device_uuid",
  "identity_key": "base64_ik",
  "registration_id": 12345,
  "signed_pre_key": {
    "key_id": 1,
    "public_key": "base64_spk",
    "signature": "base64_signature"
  },
  "pre_key": {
    "key_id": 42,
    "public_key": "base64_opk"
  }
}
```

**Behavior:**
- Atomically consumes one one-time pre-key (marks as used)
- Prevents race conditions using database transactions
- Returns 200 even if no one-time pre-key available (client can still establish session with signed pre-key)

**Headers (custom):**
- `X-PreKey-Count: 25` - Remaining pre-key count
- `X-PreKey-Warning: true` - Appears when count < 10

---

### GET /:userId/count
Get remaining pre-key count.

**Response (200):**
```json
{
  "count": 25,
  "should_replenish": false
}
```

---

### POST /sender-keys/distribute
Distribute group sender key to members (for group E2EE).

**Request Body:**
```json
{
  "conversation_id": "conv_uuid",
  "key_id": 1,
  "encrypted_keys": [
    {
      "recipient_id": "uuid",
      "encrypted_key": "base64_encrypted_sender_key"
    }
  ]
}
```

**Response (201):**
```json
{
  "distributed": 5
}
```

---

### GET /sender-keys/:conversationId
Get sender keys for a group conversation.

**Response (200):**
```json
{
  "keys": [
    {
      "sender_id": "uuid",
      "key_id": 1,
      "encrypted_key": "base64_encrypted_key"
    }
  ]
}
```

---

## Poll Routes

Base path: `/api/v1/polls`

### POST /
Create a poll in a conversation.

**Request Body:**
```json
{
  "conversation_id": "conv_uuid",
  "question": "What's your favorite color?",
  "options": ["Red", "Green", "Blue"],        // 2-10 options
  "allow_multiple": false,
  "is_anonymous": false,
  "expires_in_seconds": 86400                  // Optional
}
```

**Response (201):**
```json
{
  "id": "poll_uuid",
  "question": "What's your favorite color?",
  "options": [
    {
      "id": "option_uuid",
      "text": "Red",
      "votes": 0,
      "voters": [],
      "voted": false
    }
  ],
  "allow_multiple": false,
  "is_anonymous": false,
  "total_votes": 0,
  "closes_at": "2026-02-12T10:00:00Z",
  "is_closed": false,
  "creator_id": "uuid"
}
```

**Behavior:** Also creates a message of type "poll" in the conversation.

---

### GET /:pollId
Get poll with current results.

**Response (200):**
```json
{
  "id": "poll_uuid",
  "question": "What's your favorite color?",
  "options": [
    {
      "id": "option_uuid",
      "text": "Red",
      "votes": 5,
      "voters": [
        { "user_id": "uuid", "username": "johndoe" }
      ],
      "voted": true
    }
  ],
  "allow_multiple": false,
  "is_anonymous": false,
  "total_votes": 12,
  "closes_at": null,
  "is_closed": false,
  "creator_id": "uuid"
}
```

**Note:** If `is_anonymous=true`, `voters` array is empty.

---

### POST /:pollId/vote
Vote on a poll.

**Request Body:**
```json
{
  "option_id": "option_uuid"
}
```

**Response (201):**
```json
{
  "poll_id": "poll_uuid",
  "option_id": "option_uuid",
  "voted_at": "2026-02-11T10:00:00Z"
}
```

**Errors:**
- 400: Poll is closed
- 400: Already voted (if not allow_multiple)
- 404: Poll or option not found
- 403: Not a conversation participant

---

### DELETE /:pollId/vote
Remove vote from a poll.

**Response (204):** No content

---

## Report Routes

Base path: `/api/v1/reports`

### POST /
Report a user or message.

**Request Body:**
```json
{
  "reported_user_id": "uuid",        // Optional
  "reported_message_id": "uuid",      // Optional
  "type": "spam",                     // spam, harassment, inappropriate, other
  "description": "This user is..."    // Optional, max 1000 chars
}
```

**Response (201):**
```json
{
  "report_id": "uuid",
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Errors:**
- 400: Must provide either reported_user_id or reported_message_id

---

### GET /types
Get available report types.

**Response (200):**
```json
{
  "types": [
    {
      "id": "spam",
      "label": "Spam",
      "description": "Unwanted promotional content"
    },
    {
      "id": "harassment",
      "label": "Harassment",
      "description": "Bullying or threatening behavior"
    },
    {
      "id": "inappropriate",
      "label": "Inappropriate Content",
      "description": "Adult or offensive content"
    },
    {
      "id": "other",
      "label": "Other",
      "description": "Other violation not listed"
    }
  ]
}
```

---

## Health Check

### GET /api/health
Simple health check endpoint (no authentication required).

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-02-11T10:00:00.000Z"
}
```

---

## Next Steps

For detailed information on WebSocket real-time events, see [WebSocket Events Documentation](./04-WebSocket-Events.md).
