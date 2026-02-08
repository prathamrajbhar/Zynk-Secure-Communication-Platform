# System Design
## Zynk — Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. System Overview

Zynk is a distributed, microservices-based communication platform designed for high availability, horizontal scalability, and end-to-end security. The system handles real-time messaging, voice/video calls, and file transfers across Flutter mobile apps and Next.js web application while maintaining zero-knowledge encryption architecture.

### 1.1 Design Principles

1. **Security First:** All communication encrypted end-to-end, zero-knowledge server design
2. **Scalability:** Horizontal scaling for 100M+ users, 1B+ messages/day
3. **Reliability:** 99.95% uptime, fault-tolerant design with graceful degradation
4. **Low Latency:** Sub-500ms message delivery, sub-200ms voice latency
5. **Privacy by Design:** Minimal metadata collection, no user tracking
6. **Simplicity:** Modular services with clear boundaries

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Flutter Mobile  │  │  Flutter Mobile  │  │   Next.js    │  │
│  │    (Android)     │  │      (iOS)       │  │  Web  App    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/WSS/WebRTC
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EDGE LAYER (CDN + WAF)                      │
│                      Cloudflare / CloudFront                     │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY LAYER                            │
│              Kong Gateway / Traefik + Load Balancer              │
│           (Rate Limiting, Auth, TLS Termination, Routing)        │
└─────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│ REST API Services│ │ WebSocket   │ │ WebRTC Signaling│
│   (HTTP/JSON)   │ │  Services   │ │     Service     │
└─────────────────┘ └─────────────┘ └─────────────────┘
              │             │             │
              └─────────────┼─────────────┘
                            │
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION SERVICES LAYER                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │   Auth   │ │ Messaging│ │   Call   │ │   File   │          │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │  ...     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Group   │ │ Presence │ │Proximity │ │ Notific- │          │
│  │ Service  │ │ Service  │ │ Service  │ │   ation  │  ...     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
│   PostgreSQL    │ │    Redis    │ │  Message Queue  │
│   (Metadata)    │ │   (Cache)   │ │     (Kafka)     │
└─────────────────┘ └─────────────┘ └─────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Object Storage (S3)   │
              │  (Encrypted Files/Media)│
              └─────────────────────────┘
```

---

## 3. Client Architecture

### 3.1 Flutter Mobile App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Screens    │  │   Widgets    │  │   Dialogs    │          │
│  │  (UI Pages)  │  │ (Components) │  │  (Modals)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STATE MANAGEMENT LAYER                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     BLoC     │  │     BLoC     │  │     BLoC     │          │
│  │  (Auth)      │  │ (Messaging)  │  │   (Calls)    │  ...     │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DOMAIN LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Use Cases   │  │  Entities    │  │ Repositories │          │
│  │ (Bus. Logic) │  │  (Models)    │  │ (Interfaces) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  API Client  │  │  Local DB    │  │  WebSocket   │          │
│  │   (Dio)      │  │ (SQLCipher)  │  │   Client     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   WebRTC     │  │  Encryption  │  │ Push Service │          │
│  │   Service    │  │  (libsodium) │  │  (FCM/APNs)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components:**

**Presentation Layer:**
- Material Design widgets for Android
- Cupertino widgets for iOS (adaptive)
- Responsive layouts for tablets
- Custom theme system

**State Management (BLoC Pattern):**
- **AuthBloc:** User authentication, session management
- **MessagingBloc:** Message list, send/receive, sync
- **CallBloc:** Call state, WebRTC management
- **ContactsBloc:** Contact list, search
- **GroupsBloc:** Group management
- Event-driven architecture with streams

**Domain Layer:**
- **Use Cases:** Business logic (SendMessage, InitiateCall, etc.)
- **Entities:** Core models (User, Message, Call, Group)
- **Repository Interfaces:** Abstract data access

**Data Layer:**
- **API Client (Dio):** HTTP requests to backend
- **Local Database:** SQLCipher for encrypted storage
- **WebSocket Client:** Real-time messaging
- **WebRTC Service:** flutter_webrtc for calls
- **Encryption Service:** Signal Protocol implementation
- **Push Service:** Firebase Messaging integration

### 3.2 Next.js Web App Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEXT.JS APP ROUTER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Routes     │  │   Layouts    │  │   Pages      │          │
│  │ (app/*)      │  │ (layout.tsx) │  │ (page.tsx)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
┌───────────────────┐ ┌───────────────────┐ ┌──────────────────┐
│ Server Components │ │ Client Components │ │   API Routes     │
│  (RSC - default)  │ │  ('use client')   │ │ (app/api/*)      │
└───────────────────┘ └───────────────────┘ └──────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      STATE MANAGEMENT                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Zustand    │  │ React Query  │  │ React Context│          │
│  │ (Client)     │  │(Server State)│  │ (Auth/Theme) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVICES LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  API Client  │  │  WebSocket   │  │   WebRTC     │          │
│  │   (Axios)    │  │ (Socket.io)  │  │   Service    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Encryption  │  │  IndexedDB   │  │Service Worker│          │
│  │  (libsignal) │  │  (Storage)   │  │    (PWA)     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

**Key Components:**

**App Router:**
- **Server Components:** Landing, marketing pages (SSR)
- **Client Components:** Interactive features (messaging, calls)
- **API Routes:** Backend-for-Frontend pattern
- **Layouts:** Nested layouts for consistent UI
- **Middleware:** Authentication, redirects

**State Management:**
- **Zustand:** Global client state (user, settings)
- **React Query:** Server state caching and synchronization
- **React Context:** Theme, auth context

**Services Layer:**
- **API Client:** Axios for HTTP requests
- **WebSocket:** Socket.io-client for real-time messaging
- **WebRTC Service:** Native WebRTC API for calls
- **Encryption:** libsignal-protocol-typescript for E2EE
- **IndexedDB:** Encrypted local storage (via idb wrapper)
- **Service Worker:** Offline support, push notifications

---

## 4. Backend Services Architecture

### 4.1 Authentication Service

**Responsibility:** User registration, login, session management, device management

**Technology:** Express.js + TypeScript + PostgreSQL + Redis

**API Endpoints:**
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
POST   /api/v1/auth/devices/register
DELETE /api/v1/auth/devices/{device_id}
GET    /api/v1/auth/devices
POST   /api/v1/auth/verify-device
```

**Registration Flow:**
1. Client generates keypair (Signal Protocol identity key)
2. Client derives encryption key from passphrase (PBKDF2, 100K iterations)
3. Client sends username + public key + password hash
4. Server stores user record
5. Server returns user_id + session token (JWT)

**Login Flow:**
1. Client sends username + password hash
2. Server verifies credentials
3. Server generates new device record if new device
4. Server returns session token + device_id
5. Client stores session securely

**Data Storage:**
- PostgreSQL: User accounts, device metadata
- Redis: Active sessions (key: session_token, TTL: 30 days)

**Security:**
- Passwords hashed with PBKDF2-SHA256 (100K iterations)
- Rate limiting: 5 attempts per IP per 5 minutes
- Session tokens: JWT with 30-day expiration, refresh tokens for 90 days

---

### 4.2 Messaging Service

**Responsibility:** Message routing, delivery, storage

**Technology:** Node.js (WebSocket) + Go (REST API) + PostgreSQL + Kafka + Redis

**Architecture:**
```
Flutter/Next.js Client
         │
         ▼
    WebSocket Connection (Socket.io)
         │
         ▼
   Messaging Gateway (Node.js)
    │               │
    ▼               ▼
  Redis           Kafka
(Routing)      (Persistence)
    │               │
    └───────┬───────┘
            ▼
      PostgreSQL
   (Message Metadata)
```

**WebSocket Protocol:**
```json
// Client → Server: Send Message
{
  "type": "message.send",
  "payload": {
    "conversation_id": "conv_uuid",
    "recipient_id": "user_123",
    "encrypted_content": "base64_encrypted_payload",
    "message_id": "msg_uuid",
    "timestamp": 1706000000,
    "content_hash": "sha256_hash"
  }
}

// Server → Client: Receive Message
{
  "type": "message.received",
  "payload": {
    "conversation_id": "conv_uuid",
    "sender_id": "user_456",
    "encrypted_content": "base64_encrypted_payload",
    "message_id": "msg_uuid",
    "timestamp": 1706000000
  }
}

// Client → Server: Delivery Confirmation
{
  "type": "message.delivered",
  "payload": {
    "message_id": "msg_uuid",
    "delivered_at": 1706000010
  }
}

// Client → Server: Read Receipt
{
  "type": "message.read",
  "payload": {
    "message_id": "msg_uuid",
    "read_at": 1706000020
  }
}
```

**Message Flow:**
1. Sender encrypts message with recipient's public key (E2EE)
2. Sender sends encrypted message via WebSocket
3. Messaging Gateway validates sender session
4. Gateway stores message metadata in PostgreSQL
5. Gateway publishes message to Kafka topic
6. If recipient online: Gateway delivers via WebSocket immediately
7. If recipient offline: Message queued in Kafka, push notification sent
8. Recipient acknowledges delivery
9. Read receipt sent when message opened

**REST API Endpoints:**
```
GET    /api/v1/messages/{conversation_id}?limit=50&before={timestamp}
POST   /api/v1/messages (alternative to WebSocket)
DELETE /api/v1/messages/{message_id}
PUT    /api/v1/messages/{message_id}/edit
GET    /api/v1/messages/search?query={text}&conversation_id={id}
```

**Data Storage:**
- PostgreSQL: Message metadata (sender, recipient, timestamp, status)
- PostgreSQL: Encrypted message content (30-day retention for undelivered)
- Kafka: Message delivery queue (7-day retention)
- Redis: Online user presence, message routing cache

**Scalability:**
- WebSocket gateway scales horizontally
- Redis Pub/Sub for cross-server message routing
- Kafka partitioned by recipient_id (sticky routing)
- Message table partitioned by month

---

### 4.3 Call Service (WebRTC Signaling)

**Responsibility:** WebRTC signaling, call setup, SFU coordination

**Technology:** Node.js + Socket.io + Redis + Janus Gateway (SFU)

**Architecture for One-to-One Calls:**
```
Caller (Flutter/Next.js)
         │
         ▼ (WebSocket: SDP Offer)
   Signaling Service
         │
         ▼ (WebSocket: SDP Offer)
Callee (Flutter/Next.js)
         │
         ▼ (WebSocket: SDP Answer)
   Signaling Service
         │
         ▼ (WebSocket: SDP Answer)
Caller
         │
         ▼ (WebRTC P2P Connection Established)
      Callee
```

**Architecture for Group Calls:**
```
Participant 1 ──┐
                ├───▶ Janus SFU ───▶ Distribute Streams
Participant 2 ──┤            │
Participant 3 ──┘            ▼
                      ┌─────────────┐
                      │   Redis     │
                      │(Call State) │
                      └─────────────┘
```

**Signaling Protocol:**
```json
// Initiate Call
{
  "type": "call.initiate",
  "payload": {
    "call_id": "call_uuid",
    "recipient_id": "user_123",
    "call_type": "video", // or "audio"
    "sdp_offer": "..."
  }
}

// Answer Call
{
  "type": "call.answer",
  "payload": {
    "call_id": "call_uuid",
    "sdp_answer": "..."
  }
}

// ICE Candidate Exchange
{
  "type": "ice.candidate",
  "payload": {
    "call_id": "call_uuid",
    "candidate": "..."
  }
}

// End Call
{
  "type": "call.end",
  "payload": {
    "call_id": "call_uuid",
    "reason": "user_hangup"
  }
}
```

**REST API Endpoints:**
```
POST   /api/v1/calls/initiate
POST   /api/v1/calls/{call_id}/answer
POST   /api/v1/calls/{call_id}/end
GET    /api/v1/calls/{call_id}/status
POST   /api/v1/calls/{call_id}/mute
GET    /api/v1/calls/history
```

**Media Routing:**
- **P2P (Peer-to-Peer):** Direct connection for one-to-one calls
- **TURN Relay:** Fallback for restrictive NATs
- **SFU (Janus):** Group calls, scalable media distribution

**TURN/STUN Servers:**
- Self-hosted Coturn servers in each region
- Twilio TURN as backup

**Data Storage:**
- Redis: Active call state (ephemeral, 1-hour TTL)
- PostgreSQL: Call history (metadata only: participants, duration, timestamp)

---

### 4.4 File Service

**Responsibility:** Encrypted file upload, download, lifecycle management

**Technology:** Express.js + S3 (MinIO) + PostgreSQL

**Architecture:**
```
Client (Flutter/Next.js)
         │
         ▼ (1. Request upload)
   File Service (Go)
         │
         ▼ (2. Generate presigned URL)
      Client
         │
         ▼ (3. Direct upload encrypted chunks)
        S3
         │
         ▼ (4. Finalize upload)
   File Service
         │
         ▼ (5. Store metadata)
    PostgreSQL
```

**Upload Flow:**
1. Client: Request upload → `POST /api/v1/files/upload/initiate`
2. Server: Generate upload_id, presigned S3 URLs
3. Client: Encrypt file chunks with AES-256-GCM
4. Client: Upload encrypted chunks directly to S3 (multipart upload)
5. Client: Finalize → `POST /api/v1/files/upload/complete`
6. Server: Verify integrity (check SHA-256 hash)
7. Server: Store metadata in PostgreSQL

**Download Flow:**
1. Client: Request download → `GET /api/v1/files/{file_id}/download`
2. Server: Verify permission (is user in conversation?)
3. Server: Generate presigned S3 URL (1-hour expiration)
4. Client: Download encrypted file from S3
5. Client: Decrypt file locally with stored key

**API Endpoints:**
```
POST   /api/v1/files/upload/initiate
PUT    /api/v1/files/upload/chunk/{upload_id}/{chunk_index}
POST   /api/v1/files/upload/complete/{upload_id}
GET    /api/v1/files/{file_id}/download
GET    /api/v1/files/{file_id}/thumbnail
DELETE /api/v1/files/{file_id}
GET    /api/v1/files/conversation/{conversation_id}
```

**File Lifecycle:**
- **Expiration:** Cron job checks PostgreSQL daily for expired files
- **Deletion:** Marks file as deleted in PostgreSQL, deletes from S3
- **Orphan Cleanup:** Weekly scan for S3 objects without metadata

**Data Storage:**
- S3: Encrypted file chunks (server-side encryption at rest)
- PostgreSQL: File metadata (id, name, size, hash, expiration, owner)
- Redis: Upload session state (1-hour TTL)

---

### 4.5 Group Service

**Responsibility:** Group management, membership, permissions

**Technology:** Express.js + TypeScript + PostgreSQL + Redis

**API Endpoints:**
```
POST   /api/v1/groups
GET    /api/v1/groups/{group_id}
PUT    /api/v1/groups/{group_id}
DELETE /api/v1/groups/{group_id}
POST   /api/v1/groups/{group_id}/members
DELETE /api/v1/groups/{group_id}/members/{user_id}
PUT    /api/v1/groups/{group_id}/members/{user_id}/role
GET    /api/v1/groups/my-groups
```

**Group Encryption (Sender Keys):**
- Each member has a sender key shared with all other members
- Key rotation on member addition/removal
- New members cannot decrypt old messages

**Data Storage:**
- PostgreSQL: Group metadata, membership, roles
- Redis: Group member cache for fast access

---

### 4.6 Presence Service

**Responsibility:** Online status, typing indicators, last seen

**Technology:** Express.js + Redis + WebSocket

**WebSocket Events:**
```json
// User comes online
{
  "type": "presence.online",
  "user_id": "user_123"
}

// Typing indicator
{
  "type": "typing.start",
  "conversation_id": "conv_456",
  "user_id": "user_123"
}
```

**Data Storage:**
- Redis: Online users set (TTL: 60 seconds, refreshed on heartbeat)
- Redis: Typing indicators (TTL: 5 seconds)

---

### 4.7 Proximity Service

**Responsibility:** Location-based discovery

**Technology:** Express.js + Redis Geospatial + PostgreSQL

**API Endpoints:**
```
POST   /api/v1/proximity/update-location
GET    /api/v1/proximity/nearby?radius=1000&lat={lat}&lon={lon}
POST   /api/v1/proximity/rooms
GET    /api/v1/proximity/rooms/{room_id}
```

**Location Handling:**
- Client sends GPS coordinates
- Server stores in Redis GEOADD (5-minute TTL)
- Queries use GEORADIUS
- Location never persisted to PostgreSQL

---

### 4.8 Notification Service

**Responsibility:** Push notifications

**Technology:** Go + FCM + APNs + Kafka

**Flow:**
1. Messaging Service publishes `message.undelivered` to Kafka
2. Notification Service consumes event
3. Looks up device tokens from PostgreSQL
4. Sends encrypted push notification
5. Client receives push, fetches actual message via WebSocket

**Push Payload:**
```json
{
  "type": "message",
  "encrypted_preview": "base64_data",
  "sender_id": "user_123",
  "timestamp": 1706000000
}
```

---

## 5. Data Models

### 5.1 PostgreSQL Schema

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    push_token TEXT,
    platform VARCHAR(20), -- 'android', 'ios', 'web'
    last_active_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL, -- 'one_to_one', 'group'
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    encrypted_content BYTEA NOT NULL,
    content_hash VARCHAR(64),
    message_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    reply_to_id UUID REFERENCES messages(id),
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Groups
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Files
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES users(id),
    conversation_id UUID REFERENCES conversations(id),
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    storage_path TEXT NOT NULL,
    encryption_key_encrypted BYTEA,
    content_hash VARCHAR(64),
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 5.2 Redis Data Structures

```
// Sessions
SET session:{token} {user_id} EX 2592000  // 30 days

// Online Users
ZADD online_users {timestamp} {user_id}

// Typing Indicators
SETEX typing:{conversation_id}:{user_id} 5 "1"

// Location (Geospatial)
GEOADD locations {lon} {lat} {user_id}

// Message Queue
LPUSH queue:messages:{recipient_id} {message_json}
```

---

## 6. Security Architecture

### 6.1 End-to-End Encryption

**Protocol:** Signal Protocol (Double Ratchet + X3DH)

**Key Exchange:**
1. User generates identity key pair (long-term)
2. User uploads public identity key to server
3. For first message to contact:
   - Fetch recipient's public identity key
   - Perform X3DH key agreement
   - Establish shared secret
4. Use Double Ratchet for ongoing communication

**Message Encryption:**
1. Derive message key from ratchet state
2. Encrypt content with AES-256-GCM
3. Attach message authentication code (MAC)
4. Send encrypted payload + ratchet public key

**Group Encryption:**
- Sender Keys protocol
- Each member distributes their sender key to all members
- Messages encrypted with sender's chain key
- Key rotation on membership change

### 6.2 Transport Security

- **TLS 1.3** for all client-server communication
- **Certificate Pinning** in mobile apps
- **WebSocket Secure (WSS)**
- **DTLS-SRTP** for WebRTC media

### 6.3 Authentication Security

- Passwords never stored (only PBKDF2-SHA256 hash)
- Rate limiting on login attempts
- Device-level trust (new device requires verification)
- Session tokens: JWT with 30-day expiration
- Refresh tokens: 90-day expiration, rotated on use

### 6.4 Data at Rest

- **Client-Side:** SQLCipher with AES-256 encryption
- **Server-Side:** PostgreSQL with pgcrypto for sensitive fields
- **Object Storage:** S3 server-side encryption (SSE-S3)

---

## 7. Scalability Design

### 7.1 Horizontal Scaling

**Stateless Services:**
- All application services are stateless
- Scale with Kubernetes HPA (CPU/memory based)

**Database:**
- PostgreSQL read replicas (3 replicas per region)
- PgBouncer for connection pooling
- Table partitioning (messages by month)

**Cache:**
- Redis Cluster with 6 nodes (3 masters, 3 replicas)
- Consistent hashing for key distribution

**Message Queue:**
- Kafka with 10 partitions per topic
- Partition by recipient_id for message ordering

### 7.2 Geographic Distribution

**Regions:**
- US-East (Virginia)
- EU-West (Ireland)
- Asia-Pacific (Singapore)

**Routing:**
- GeoDNS routes users to nearest region
- WebSocket sticky sessions to same region
- Cross-region replication for disaster recovery

---

## 8. Reliability & Fault Tolerance

### 8.1 High Availability

**Service Level:**
- Kubernetes runs 3+ replicas per service
- Health checks and automatic restart
- Rolling updates with zero downtime

**Database Level:**
- PostgreSQL streaming replication
- Automatic failover with Patroni

**Message Queue:**
- Kafka replication factor: 3
- In-sync replicas (ISR): 2

### 8.2 Disaster Recovery

**Backup Strategy:**
- PostgreSQL: Continuous WAL archiving + daily full backup
- Redis: RDB snapshots every 6 hours + AOF
- S3: Cross-region replication

**Recovery Objectives:**
- RPO (Recovery Point Objective): < 1 hour
- RTO (Recovery Time Objective): < 4 hours

---

## 9. Monitoring & Observability

### 9.1 Metrics

**Infrastructure:**
- CPU, memory, disk, network per service
- Kubernetes pod health

**Application:**
- Request rate, latency (p50, p95, p99)
- Error rate per endpoint
- WebSocket connections (active, total)
- Message delivery latency
- Call quality metrics (MOS, packet loss, jitter)

**Business:**
- Daily/Monthly Active Users
- Messages sent per day
- Call minutes per day
- File uploads per day

**Tools:**
- Prometheus for collection
- Grafana for visualization

### 9.2 Logging

**Structure:**
- JSON format with timestamp, service, level, trace_id
- Centralized logging with Loki
- Log retention: 30 days

**Log Levels:**
- ERROR: Critical issues requiring attention
- WARN: Potential problems
- INFO: Normal operations
- DEBUG: Detailed debugging (disabled in production)

### 9.3 Tracing

- Distributed tracing with Jaeger
- Trace ID propagation across services
- Latency breakdown per service

### 9.4 Alerting

**Critical Alerts:**
- Service down (PagerDuty)
- Database failover
- High error rate (> 5%)
- API latency > 2 seconds (p95)

**Warning Alerts:**
- High memory usage (> 80%)
- High disk usage (> 85%)
- Certificate expiring (< 30 days)

---

## 10. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Message Delivery Latency | < 500ms (p95) | End-to-end |
| API Response Time | < 200ms (p95) | Server-side |
| WebSocket Connection Setup | < 2s | Client-side |
| Call Setup Time | < 3s (p95) | Client-side |
| Voice Latency | < 200ms (p95) | End-to-end |
| Video Latency | < 300ms (p95) | End-to-end |
| File Upload Speed | 80% of bandwidth | Client-side |
| Database Query | < 50ms (p95) | Server-side |

---

## 11. Cost Optimization

### 11.1 Compute
- Auto-scaling based on load
- Spot instances for batch jobs
- Reserved instances for baseline

### 11.2 Storage
- S3 Intelligent-Tiering for files
- Lifecycle policies for automatic cleanup
- Compression for stored data

### 11.3 Networking
- CDN for static assets
- WebRTC P2P to reduce bandwidth costs
- Compression for API responses

---

## Appendix A: API Gateway Configuration

**Kong Gateway Configuration:**
```yaml
services:
  - name: auth-service
    url: http://auth-service:8080
    routes:
      - paths: [/api/v1/auth]
    plugins:
      - name: rate-limiting
        config:
          minute: 100
      - name: cors

  - name: messaging-service
    url: http://messaging-service:8080
    routes:
      - paths: [/api/v1/messages]
    plugins:
      - name: jwt
      - name: rate-limiting
        config:
          minute: 1000
```

---

## Appendix B: Database Connection Pooling

**PgBouncer Configuration:**
```ini
[databases]
zynk = host=postgres-master port=5432 dbname=zynk

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, DevOps, Architecture Teams  
Review Cycle: Quarterly
