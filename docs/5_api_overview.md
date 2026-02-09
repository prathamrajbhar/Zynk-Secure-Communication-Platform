# API Overview
## Zynk – Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. API Architecture

### 1.1 Base URL

```
Production:  https://api.zynk.app
Staging:     https://api-staging.zynk.app
```

### 1.2 Authentication

**JWT Bearer Token:**
```
Authorization: Bearer <jwt_token>
```

**Token Lifetime:** 30 days  
**Refresh:** Rolling refresh with refresh tokens (90 days)

### 1.3 Rate Limiting

- **Free Tier:** 1000 requests/hour per user
- **Premium:** 5000 requests/hour
- **Business:** 20000 requests/hour

**Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## 2. Authentication APIs

### 2.1 Register

```
POST /api/v1/auth/register

Request:
{
  "username": "alice",
  "password_hash": "pbkdf2_sha256...",
  "public_key": "base64_encoded_key",
  "device_fingerprint": "unique_device_id"
}

Response: 201
{
  "user_id": "uuid",
  "session_token": "jwt",
  "refresh_token": "jwt",
  "expires_at": "2026-03-07T00:00:00Z"
}
```

### 2.2 Login

```
POST /api/v1/auth/login

Request:
{
  "username": "alice",
  "password_hash": "pbkdf2_sha256...",
  "device_fingerprint": "unique_device_id"
}

Response: 200
{
  "user_id": "uuid",
  "session_token": "jwt",
  "refresh_token": "jwt",
  "device_id": "uuid",
  "expires_at": "2026-03-07T00:00:00Z"
}
```

### 2.3 Refresh Token

```
POST /api/v1/auth/refresh

Request:
{
  "refresh_token": "jwt"
}

Response: 200
{
  "session_token": "jwt",
  "refresh_token": "jwt",
  "expires_at": "2026-03-07T00:00:00Z"
}
```

### 2.4 Logout

```
POST /api/v1/auth/logout

Response: 204
```

---

## 3. Messaging APIs

### 3.1 Get Conversations

```
GET /api/v1/conversations?limit=50&offset=0

Response: 200
{
  "conversations": [
    {
      "id": "uuid",
      "type": "one_to_one",
      "participants": ["uuid1", "uuid2"],
      "last_message": {
        "id": "uuid",
        "sender_id": "uuid",
        "timestamp": "2026-02-09T12:00:00Z",
        "preview": "Encrypted preview..."
      },
      "unread_count": 5,
      "updated_at": "2026-02-09T12:00:00Z"
    }
  ],
  "total": 100
}
```

### 3.2 Get Messages

```
GET /api/v1/conversations/{conversation_id}/messages?limit=50&before={timestamp}

Response: 200
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_id": "uuid",
      "encrypted_content": "base64_encoded",
      "content_hash": "sha256_hash",
      "message_type": "text",
      "status": "delivered",
      "created_at": "2026-02-09T12:00:00Z"
    }
  ],
  "has_more": true
}
```

### 3.3 Send Message (REST)

```
POST /api/v1/conversations/{conversation_id}/messages

Request:
{
  "encrypted_content": "base64_encoded",
  "content_hash": "sha256_hash",
  "message_type": "text",
  "expires_at": "2026-02-09T13:00:00Z"  // Optional
}

Response: 201
{
  "message_id": "uuid",
  "created_at": "2026-02-09T12:00:00Z",
  "status": "sent"
}
```

### 3.4 Delete Message

```
DELETE /api/v1/conversations/{conversation_id}/messages/{message_id}?delete_for=everyone

Response: 204
```

---

## 4. File APIs

### 4.1 Request Upload URL

```
POST /api/v1/files/upload-url

Request:
{
  "conversation_id": "uuid",
  "filename": "document.pdf",
  "file_size": 1048576,
  "mime_type": "application/pdf",
  "expires_at": "2026-02-10T12:00:00Z"
}

Response: 200
{
  "file_id": "uuid",
  "upload_url": "https://s3.amazonaws.com/...",
  "upload_fields": {
    "key": "path/to/file",
    "policy": "base64_encoded"
  }
}
```

### 4.2 Finalize Upload

```
POST /api/v1/files/{file_id}/finalize

Request:
{
  "content_hash": "sha256_hash",
  "encryption_key_encrypted": "base64_encoded"
}

Response: 200
{
  "file_id": "uuid",
  "status": "ready"
}
```

### 4.3 Request Download URL

```
GET /api/v1/files/{file_id}/download-url

Response: 200
{
  "download_url": "https://s3.amazonaws.com/...",
  "expires_at": "2026-02-09T13:00:00Z"
}
```

---

## 5. Call APIs

### 5.1 Initiate Call

```
POST /api/v1/calls

Request:
{
  "recipient_id": "uuid",
  "call_type": "video"
}

Response: 201
{
  "call_id": "uuid",
  "signaling_server": "wss://signal.zynk.app",
  "ice_servers": [
    {
      "urls": "stun:stun.zynk.app:3478"
    },
    {
      "urls": "turn:turn.zynk.app:3478",
      "username": "temp_user",
      "credential": "temp_pass"
    }
  ]
}
```

### 5.2 End Call

```
POST /api/v1/calls/{call_id}/end

Response: 200
{
  "call_id": "uuid",
  "duration_seconds": 300,
  "ended_at": "2026-02-09T12:05:00Z"
}
```

---

## 6. Group APIs

### 6.1 Create Group

```
POST /api/v1/groups

Request:
{
  "name": "Team Alpha",
  "description": "Project team",
  "member_ids": ["uuid1", "uuid2"]
}

Response: 201
{
  "group_id": "uuid",
  "conversation_id": "uuid",
  "created_at": "2026-02-09T12:00:00Z"
}
```

### 6.2 Add Members

```
POST /api/v1/groups/{group_id}/members

Request:
{
  "member_ids": ["uuid3", "uuid4"]
}

Response: 200
{
  "group_id": "uuid",
  "members": ["uuid1", "uuid2", "uuid3", "uuid4"]
}
```

### 6.3 Remove Member

```
DELETE /api/v1/groups/{group_id}/members/{user_id}

Response: 204
```

---

## 7. Presence APIs

### 7.1 Get Online Status

```
GET /api/v1/presence/users/{user_id}

Response: 200
{
  "user_id": "uuid",
  "status": "online",
  "last_seen": "2026-02-09T12:00:00Z"
}
```

### 7.2 Update Status

```
POST /api/v1/presence/status

Request:
{
  "status": "online"
}

Response: 200
```

---

## 8. Proximity APIs

### 8.1 Update Location

```
POST /api/v1/proximity/location

Request:
{
  "latitude": 23.0225,
  "longitude": 72.5714,
  "accuracy": 10
}

Response: 200
```

### 8.2 Discover Nearby Users

```
GET /api/v1/proximity/nearby?radius=1000

Response: 200
{
  "users": [
    {
      "user_id": "uuid",
      "distance_meters": 250,
      "direction": "NE",
      "is_anonymous": true
    }
  ]
}
```

---

## 9. Blockchain APIs

### 9.1 Get DID

```
GET /api/v1/blockchain/identity/{user_id}

Response: 200
{
  "did": "did:zynk:uuid",
  "public_key": "base64_encoded",
  "trust_score": 75,
  "is_verified": true,
  "transaction_hash": "0x...",
  "block_number": 12345
}
```

### 9.2 Verify Message

```
GET /api/v1/blockchain/verify-message/{message_id}

Response: 200
{
  "message_id": "uuid",
  "content_hash": "sha256_hash",
  "merkle_root": "sha256_hash",
  "merkle_proof": ["hash1", "hash2"],
  "transaction_hash": "0x...",
  "block_number": 12345,
  "verified": true
}
```

---

## 10. WebSocket API

### Connection

```
wss://ws.zynk.app/v1/messaging?token=<jwt>
```

### Events

**Incoming Message:**
```json
{
  "type": "message.new",
  "data": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "encrypted_content": "base64",
    "timestamp": "2026-02-09T12:00:00Z"
  }
}
```

**Typing Indicator:**
```json
{
  "type": "typing.start",
  "data": {
    "conversation_id": "uuid",
    "user_id": "uuid"
  }
}
```

**Presence Update:**
```json
{
  "type": "presence.update",
  "data": {
    "user_id": "uuid",
    "status": "online"
  }
}
```

**Call Signal:**
```json
{
  "type": "call.incoming",
  "data": {
    "call_id": "uuid",
    "caller_id": "uuid",
    "call_type": "video"
  }
}
```

---

## 11. Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Authentication token is invalid or expired",
    "details": {
      "field": "token",
      "reason": "expired"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_TOKEN | 401 | Token invalid or expired |
| UNAUTHORIZED | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| RATE_LIMITED | 429 | Too many requests |
| VALIDATION_ERROR | 400 | Invalid request data |
| SERVER_ERROR | 500 | Internal server error |

---

## 12. Versioning

**Current Version:** v1

**Version Strategy:**
- Major version in URL path (/api/v1/)
- Backward compatible changes within version
- Deprecation notices 6 months before removal

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Product Teams  
Review Cycle: With API changes
