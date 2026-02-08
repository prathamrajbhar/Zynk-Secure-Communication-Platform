# API Overview
## Zynk — Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. API Standards

**Base URL:** `https://api.zynk.com/v1`

**Protocol:** HTTPS only (TLS 1.3)

**Format:** JSON

**Authentication:** JWT Bearer tokens

**Rate Limiting:** 
- Unauthenticated: 10 requests/minute
- Authenticated: 1000 requests/hour

---

## 2. Authentication API

### 2.1 Register User
```
POST /auth/register
Content-Type: application/json

Request:
{
  "username": "alice",
  "password_hash": "pbkdf2_sha256_hash",
  "public_key": "base64_identity_key",
  "device_name": "Alice's iPhone",
  "device_fingerprint": "device_unique_id"
}

Response: 201 Created
{
  "user_id": "uuid",
  "session_token": "jwt_token",
  "refresh_token": "refresh_token",
  "expires_at": 1706000000
}
```

### 2.2 Login
```
POST /auth/login
Content-Type: application/json

Request:
{
  "username": "alice",
  "password_hash": "pbkdf2_sha256_hash",
  "device_fingerprint": "device_unique_id"
}

Response: 200 OK
{
  "user_id": "uuid",
  "session_token": "jwt_token",
  "refresh_token": "refresh_token",
  "device_id": "uuid",
  "expires_at": 1706000000
}
```

### 2.3 Refresh Token
```
POST /auth/refresh
Authorization: Bearer {refresh_token}

Response: 200 OK
{
  "session_token": "new_jwt_token",
  "refresh_token": "new_refresh_token",
  "expires_at": 1706000000
}
```

### 2.4 Logout
```
POST /auth/logout
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 2.5 List Devices
```
GET /auth/devices
Authorization: Bearer {session_token}

Response: 200 OK
{
  "devices": [
    {
      "id": "uuid",
      "device_name": "Alice's iPhone",
      "platform": "ios",
      "last_active_at": 1706000000,
      "created_at": 1705000000
    }
  ]
}
```

### 2.6 Delete Device
```
DELETE /auth/devices/{device_id}
Authorization: Bearer {session_token}

Response: 204 No Content
```

---

## 3. Messaging API

### 3.1 Send Message (REST Alternative to WebSocket)
```
POST /messages
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "conversation_id": "uuid",
  "recipient_id": "uuid",
  "encrypted_content": "base64_encrypted_data",
  "message_id": "uuid",
  "message_type": "text",
  "reply_to_id": "uuid (optional)",
  "expires_in_seconds": 3600 (optional)
}

Response: 201 Created
{
  "message_id": "uuid",
  "conversation_id": "uuid",
  "status": "sent",
  "created_at": 1706000000
}
```

### 3.2 Get Messages
```
GET /messages/{conversation_id}?limit=50&before=1706000000
Authorization: Bearer {session_token}

Response: 200 OK
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_id": "uuid",
      "encrypted_content": "base64_data",
      "message_type": "text",
      "status": "read",
      "created_at": 1706000000
    }
  ],
  "has_more": true
}
```

### 3.3 Delete Message
```
DELETE /messages/{message_id}?for_everyone=true
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 3.4 Edit Message
```
PUT /messages/{message_id}
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "encrypted_content": "base64_updated_encrypted_data"
}

Response: 200 OK
{
  "message_id": "uuid",
  "updated_at": 1706000000
}
```

### 3.5 Mark Message as Read
```
PUT /messages/{message_id}/read
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 3.6 Search Messages
```
POST /messages/search
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "conversation_id": "uuid (optional)",
  "query": "search term",
  "limit": 20,
  "offset": 0
}

Response: 200 OK
{
  "results": [
    {
      "message_id": "uuid",
      "conversation_id": "uuid",
      "sender_id": "uuid",
      "snippet": "...matched text...",
      "created_at": 1706000000
    }
  ],
  "total": 45
}
```

---

## 4. Call API

### 4.1 Initiate Call
```
POST /calls/initiate
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "recipient_id": "uuid",
  "call_type": "video",
  "sdp_offer": "base64_sdp"
}

Response: 201 Created
{
  "call_id": "uuid",
  "status": "ringing",
  "created_at": 1706000000
}
```

### 4.2 Answer Call
```
POST /calls/{call_id}/answer
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "sdp_answer": "base64_sdp"
}

Response: 200 OK
{
  "call_id": "uuid",
  "status": "in_progress"
}
```

### 4.3 End Call
```
POST /calls/{call_id}/end
Authorization: Bearer {session_token}

Response: 200 OK
{
  "call_id": "uuid",
  "duration_seconds": 345,
  "ended_at": 1706000000
}
```

### 4.4 Get Call Status
```
GET /calls/{call_id}/status
Authorization: Bearer {session_token}

Response: 200 OK
{
  "call_id": "uuid",
  "status": "in_progress",
  "participants": [
    {"user_id": "uuid", "joined_at": 1706000000}
  ]
}
```

### 4.5 Mute/Unmute
```
POST /calls/{call_id}/mute
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "audio": true,
  "video": false
}

Response: 204 No Content
```

### 4.6 Call History
```
GET /calls/history?limit=20&offset=0
Authorization: Bearer {session_token}

Response: 200 OK
{
  "calls": [
    {
      "call_id": "uuid",
      "call_type": "video",
      "participants": ["uuid1", "uuid2"],
      "duration_seconds": 345,
      "created_at": 1706000000
    }
  ],
  "total": 123
}
```

---

## 5. File API

### 5.1 Initiate Upload
```
POST /files/upload/initiate
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "filename": "document.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "conversation_id": "uuid",
  "expires_in_days": 30
}

Response: 200 OK
{
  "upload_id": "uuid",
  "file_id": "uuid",
  "chunk_size": 5242880,
  "total_chunks": 1,
  "presigned_urls": [
    "https://s3.amazonaws.com/..."
  ]
}
```

### 5.2 Complete Upload
```
POST /files/upload/complete/{upload_id}
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "file_hash": "sha256_hash"
}

Response: 200 OK
{
  "file_id": "uuid",
  "status": "uploaded",
  "download_url": "/files/{file_id}/download"
}
```

### 5.3 Download File
```
GET /files/{file_id}/download
Authorization: Bearer {session_token}

Response: 302 Redirect
Location: https://s3.amazonaws.com/presigned_url
```

### 5.4 Get File Metadata
```
GET /files/{file_id}
Authorization: Bearer {session_token}

Response: 200 OK
{
  "file_id": "uuid",
  "filename": "document.pdf",
  "file_size": 2048576,
  "mime_type": "application/pdf",
  "uploader_id": "uuid",
  "conversation_id": "uuid",
  "expires_at": 1709000000,
  "created_at": 1706000000
}
```

### 5.5 Get Thumbnail
```
GET /files/{file_id}/thumbnail
Authorization: Bearer {session_token}

Response: 302 Redirect
Location: https://s3.amazonaws.com/thumbnail_presigned_url
```

### 5.6 Delete File
```
DELETE /files/{file_id}
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 5.7 List Files in Conversation
```
GET /files/conversation/{conversation_id}?limit=20&offset=0
Authorization: Bearer {session_token}

Response: 200 OK
{
  "files": [
    {
      "file_id": "uuid",
      "filename": "image.jpg",
      "file_size": 512000,
      "created_at": 1706000000
    }
  ],
  "total": 34
}
```

---

## 6. Group API

### 6.1 Create Group
```
POST /groups
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "name": "Project Team",
  "description": "Team collaboration group",
  "avatar_url": "https://...",
  "member_ids": ["uuid1", "uuid2", "uuid3"]
}

Response: 201 Created
{
  "group_id": "uuid",
  "name": "Project Team",
  "created_at": 1706000000
}
```

### 6.2 Get Group Details
```
GET /groups/{group_id}
Authorization: Bearer {session_token}

Response: 200 OK
{
  "group_id": "uuid",
  "name": "Project Team",
  "description": "Team collaboration group",
  "avatar_url": "https://...",
  "created_by": "uuid",
  "members": [
    {
      "user_id": "uuid",
      "role": "admin",
      "joined_at": 1706000000
    }
  ],
  "created_at": 1706000000
}
```

### 6.3 Update Group
```
PUT /groups/{group_id}
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "name": "Updated Team Name",
  "description": "New description"
}

Response: 200 OK
{
  "group_id": "uuid",
  "updated_at": 1706000000
}
```

### 6.4 Delete Group
```
DELETE /groups/{group_id}
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 6.5 Add Members
```
POST /groups/{group_id}/members
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "user_ids": ["uuid1", "uuid2"]
}

Response: 200 OK
{
  "added": ["uuid1", "uuid2"]
}
```

### 6.6 Remove Member
```
DELETE /groups/{group_id}/members/{user_id}
Authorization: Bearer {session_token}

Response: 204 No Content
```

### 6.7 Update Member Role
```
PUT /groups/{group_id}/members/{user_id}/role
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "role": "admin"
}

Response: 200 OK
```

### 6.8 List My Groups
```
GET /groups/my-groups?limit=50&offset=0
Authorization: Bearer {session_token}

Response: 200 OK
{
  "groups": [
    {
      "group_id": "uuid",
      "name": "Project Team",
      "member_count": 5,
      "last_activity": 1706000000
    }
  ],
  "total": 12
}
```

---

## 7. Proximity API

### 7.1 Update Location
```
POST /proximity/update-location
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "latitude": 37.7749,
  "longitude": -122.4194,
  "accuracy": 10
}

Response: 204 No Content
```

### 7.2 Discover Nearby Users
```
GET /proximity/nearby?radius=1000&lat=37.7749&lon=-122.4194
Authorization: Bearer {session_token}

Response: 200 OK
{
  "users": [
    {
      "anonymous_id": "temp_uuid",
      "distance_meters": 245,
      "last_seen": 1706000000
    }
  ]
}
```

### 7.3 Create Proximity Room
```
POST /proximity/rooms
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "name": "Coffee Shop Chat",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "radius_meters": 100,
  "expires_in_hours": 24
}

Response: 201 Created
{
  "room_id": "uuid",
  "name": "Coffee Shop Chat",
  "expires_at": 1706086400
}
```

### 7.4 Join Proximity Room
```
POST /proximity/rooms/{room_id}/join
Authorization: Bearer {session_token}

Response: 200 OK
{
  "room_id": "uuid",
  "participant_count": 5
}
```

### 7.5 Get Proximity Room
```
GET /proximity/rooms/{room_id}
Authorization: Bearer {session_token}

Response: 200 OK
{
  "room_id": "uuid",
  "name": "Coffee Shop Chat",
  "participant_count": 5,
  "created_at": 1706000000,
  "expires_at": 1706086400
}
```

---

## 8. User API

### 8.1 Get User Profile
```
GET /users/{user_id}
Authorization: Bearer {session_token}

Response: 200 OK
{
  "user_id": "uuid",
  "username": "alice",
  "display_name": "Alice Smith",
  "avatar_url": "https://...",
  "bio": "Product Manager",
  "public_key": "base64_key",
  "created_at": 1706000000
}
```

### 8.2 Update My Profile
```
PUT /users/me
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "display_name": "Alice Smith",
  "bio": "Product Manager at TechCo",
  "avatar_url": "https://..."
}

Response: 200 OK
{
  "user_id": "uuid",
  "updated_at": 1706000000
}
```

### 8.3 Search Users
```
GET /users/search?query=alice&limit=10
Authorization: Bearer {session_token}

Response: 200 OK
{
  "users": [
    {
      "user_id": "uuid",
      "username": "alice",
      "display_name": "Alice Smith",
      "avatar_url": "https://..."
    }
  ]
}
```

### 8.4 Get User Public Key
```
GET /users/{user_id}/public-key
Authorization: Bearer {session_token}

Response: 200 OK
{
  "user_id": "uuid",
  "public_key": "base64_identity_key",
  "key_id": "uuid"
}
```

### 8.5 Update Privacy Settings
```
PUT /users/me/privacy
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "show_online_status": false,
  "show_last_seen": true,
  "allow_read_receipts": true,
  "allow_proximity_discovery": false
}

Response: 200 OK
```

---

## 9. WebSocket API

**Connection:** `wss://ws.zynk.com/v1`

**Authentication:** Send JWT token in first message after connection

```json
{
  "type": "auth",
  "token": "jwt_session_token"
}
```

### 9.1 Message Events

**Send Message:**
```json
{
  "type": "message.send",
  "payload": {
    "conversation_id": "uuid",
    "recipient_id": "uuid",
    "encrypted_content": "base64_data",
    "message_id": "uuid",
    "timestamp": 1706000000
  }
}
```

**Receive Message:**
```json
{
  "type": "message.received",
  "payload": {
    "conversation_id": "uuid",
    "sender_id": "uuid",
    "encrypted_content": "base64_data",
    "message_id": "uuid",
    "timestamp": 1706000000
  }
}
```

**Delivery Confirmation:**
```json
{
  "type": "message.delivered",
  "payload": {
    "message_id": "uuid",
    "delivered_at": 1706000010
  }
}
```

**Read Receipt:**
```json
{
  "type": "message.read",
  "payload": {
    "message_id": "uuid",
    "read_at": 1706000020
  }
}
```

### 9.2 Presence Events

**User Online:**
```json
{
  "type": "presence.online",
  "payload": {
    "user_id": "uuid"
  }
}
```

**User Offline:**
```json
{
  "type": "presence.offline",
  "payload": {
    "user_id": "uuid",
    "last_seen": 1706000000
  }
}
```

**Typing Indicator:**
```json
{
  "type": "typing.start",
  "payload": {
    "conversation_id": "uuid",
    "user_id": "uuid"
  }
}
```

### 9.3 Call Signaling Events

**Call Initiate:**
```json
{
  "type": "call.initiate",
  "payload": {
    "call_id": "uuid",
    "recipient_id": "uuid",
    "call_type": "video",
    "sdp_offer": "base64_sdp"
  }
}
```

**Call Answer:**
```json
{
  "type": "call.answer",
  "payload": {
    "call_id": "uuid",
    "sdp_answer": "base64_sdp"
  }
}
```

**ICE Candidate:**
```json
{
  "type": "ice.candidate",
  "payload": {
    "call_id": "uuid",
    "candidate": "ice_candidate_string"
  }
}
```

**Call End:**
```json
{
  "type": "call.end",
  "payload": {
    "call_id": "uuid",
    "reason": "user_hangup"
  }
}
```

---

## 10. Error Responses

**Standard Error Format:**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

**HTTP Status Codes:**
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict (e.g., username taken)
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily down

**Error Codes:**
- `INVALID_REQUEST`: Request validation failed
- `AUTHENTICATION_REQUIRED`: No auth token provided
- `INVALID_TOKEN`: Token expired or invalid
- `INSUFFICIENT_PERMISSIONS`: User lacks permission
- `RESOURCE_NOT_FOUND`: Requested resource doesn't exist
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server-side error

---

## 11. Rate Limiting

**Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1706003600
```

**Limits by Endpoint:**
- `/auth/login`: 5 requests / 5 minutes
- `/auth/register`: 3 requests / hour
- `/messages/*`: 1000 requests / hour
- `/files/upload/*`: 100 requests / hour
- Default: 1000 requests / hour

---

## 12. Pagination

**Query Parameters:**
- `limit`: Number of items per page (default: 50, max: 100)
- `offset`: Number of items to skip (default: 0)
- `before`: Timestamp cursor for time-based pagination

**Response:**
```json
{
  "items": [...],
  "total": 1234,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

---

## 13. Webhooks (Future)

**Event Types:**
- `message.sent`
- `call.initiated`
- `file.uploaded`
- `group.created`

**Webhook Payload:**
```json
{
  "event_type": "message.sent",
  "event_id": "uuid",
  "timestamp": 1706000000,
  "data": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "sender_id": "uuid"
  }
}
```

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Product Teams  
Review Cycle: With every API version change

---

## 10. Blockchain API (Post-MVP)

### 10.1 Identity Registration

```
POST /api/v1/blockchain/identity/register
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "did": "did:zynk:user_uuid",
  "public_key": "base64_public_key"
}

Response: 201 Created
{
  "transaction_hash": "0x...",
  "block_number": 12345,
  "did": "did:zynk:user_uuid",
  "trust_score": 50
}
```

### 10.2 Verify Identity

```
GET /api/v1/blockchain/identity/{did}/verify
Authorization: Bearer {session_token}

Response: 200 OK
{
  "did": "did:zynk:user_uuid",
  "is_verified": true,
  "trust_score": 75,
  "public_key": "base64_public_key",
  "registered_at": 1706000000
}
```

### 10.3 Get Trust Score

```
GET /api/v1/blockchain/identity/{did}/trust-score
Authorization: Bearer {session_token}

Response: 200 OK
{
  "did": "did:zynk:user_uuid",
  "trust_score": 75,
  "last_updated": 1706000000,
  "factors": {
    "account_age_days": 180,
    "messages_sent": 5000,
    "reports_received": 0,
    "verifications": 3
  }
}
```

### 10.4 Anchor Message Hash

```
POST /api/v1/blockchain/audit/anchor
Authorization: Bearer {session_token}
Content-Type: application/json

Request:
{
  "message_hashes": [
    "sha256_hash1",
    "sha256_hash2",
    "sha256_hash3"
  ]
}

Response: 200 OK
{
  "merkle_root": "sha256_merkle_root",
  "transaction_hash": "0x...",
  "block_number": 12346,
  "anchored_at": 1706000000
}
```

### 10.5 Verify Message Integrity

```
GET /api/v1/blockchain/audit/{message_id}/verify
Authorization: Bearer {session_token}

Response: 200 OK
{
  "message_id": "uuid",
  "content_hash": "sha256_hash",
  "is_anchored": true,
  "merkle_root": "sha256_merkle_root",
  "merkle_proof": ["hash1", "hash2", "hash3"],
  "block_number": 12346,
  "anchored_at": 1706000000
}
```

### 10.6 Get Proof of Inclusion

```
GET /api/v1/blockchain/audit/proof/{message_id}
Authorization: Bearer {session_token}

Response: 200 OK
{
  "message_id": "uuid",
  "content_hash": "sha256_hash",
  "merkle_proof": [
    {
      "position": "left",
      "hash": "hash1"
    },
    {
      "position": "right",
      "hash": "hash2"
    }
  ],
  "merkle_root": "sha256_merkle_root",
  "block_number": 12346
}
```

### 10.7 Get Blockchain Stats

```
GET /api/v1/blockchain/stats
Authorization: Bearer {session_token}

Response: 200 OK
{
  "current_block": 12500,
  "total_transactions": 450000,
  "total_identities": 15000,
  "total_anchored_messages": 1200000,
  "network_hash_rate": "1.5 GH/s",
  "active_validators": 10
}
```

---

## 11. Blockchain WebSocket Events

**Connection:** Same WebSocket endpoint as main messaging

### 11.1 Identity Events

**Identity Registered:**
```json
{
  "type": "blockchain.identity.registered",
  "payload": {
    "did": "did:zynk:user_uuid",
    "transaction_hash": "0x...",
    "block_number": 12345,
    "timestamp": 1706000000
  }
}
```

**Trust Score Updated:**
```json
{
  "type": "blockchain.trust_score.updated",
  "payload": {
    "did": "did:zynk:user_uuid",
    "old_score": 50,
    "new_score": 75,
    "reason": "verified_by_community",
    "timestamp": 1706000000
  }
}
```

### 11.2 Audit Events

**Messages Anchored:**
```json
{
  "type": "blockchain.audit.anchored",
  "payload": {
    "merkle_root": "sha256_merkle_root",
    "message_count": 1000,
    "block_number": 12346,
    "transaction_hash": "0x...",
    "timestamp": 1706000000
  }
}
```

**Block Mined:**
```json
{
  "type": "blockchain.block.mined",
  "payload": {
    "block_number": 12347,
    "block_hash": "0x...",
    "validator": "validator_address",
    "transaction_count": 150,
    "timestamp": 1706000000
  }
}
```

---

