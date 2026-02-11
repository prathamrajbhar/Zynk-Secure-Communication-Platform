# Zynk - Overview and Architecture

## Table of Contents
- [Introduction](#introduction)
- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Design Principles](#design-principles)

---

## Introduction

**Zynk** is a secure, end-to-end encrypted communication platform that enables private messaging, voice/video calling, group chats, file sharing, and polls. Built with modern web technologies and security-first design principles, Zynk ensures that all user communications remain private and encrypted.

### Key Highlights
- ✅ **End-to-End Encryption (E2EE)**: All messages, calls, and files are encrypted using Signal Protocol-inspired cryptography
- ✅ **Real-time Communication**: WebSocket-based instant messaging and presence tracking
- ✅ **Voice/Video Calls**: WebRTC-powered audio and video calling with peer-to-peer connections
- ✅ **Group Chats**: Support for encrypted group conversations with member management
- ✅ **File Sharing**: Secure file uploads with automatic thumbnail generation
- ✅ **Multi-Device Support**: Up to 5 devices per user with synchronized sessions
- ✅ **Offline Support**: Message queuing and retry mechanism for unreliable connections
- ✅ **Modern UI**: Responsive Next.js frontend with real-time updates

---

## Project Overview

Zynk consists of three main components:

### 1. Backend Server (`/server`)
- **Framework**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (via Prisma ORM)
- **Cache**: Redis (for session caching and presence tracking)
- **Real-time**: Socket.IO for WebSocket connections
- **Purpose**: Handles API requests, WebSocket events, authentication, and data persistence

### 2. Web Frontend (`/web`)
- **Framework**: Next.js 14 + React 18 + TypeScript
- **State Management**: Zustand (lightweight state management)
- **Styling**: Tailwind CSS
- **Real-time**: Socket.IO client
- **Purpose**: Provides the user interface for web browsers

### 3. Infrastructure (`docker-compose.yml`)
- **PostgreSQL 16**: Primary database for all application data
- **Redis 7**: In-memory cache for sessions and presence tracking
- **Purpose**: Containerized development environment

---

## Technology Stack

### Backend Technologies
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | v18+ | JavaScript runtime |
| TypeScript | 5.3+ | Type-safe JavaScript |
| Express | 4.18 | Web framework |
| Prisma | 7.3 | ORM and database migrations |
| PostgreSQL | 16 | Relational database |
| Redis | 4.6 | Session cache and presence |
| Socket.IO | 4.7 | WebSocket server |
| bcryptjs | 2.4 | Password hashing |
| jsonwebtoken | 9.0 | JWT authentication |
| multer | 1.4 | File upload handling |
| sharp | 0.34 | Image processing |
| helmet | 7.1 | Security headers |
| zod | 3.22 | Schema validation |

### Frontend Technologies
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14.1 | React framework |
| React | 18.2 | UI library |
| TypeScript | 5.3+ | Type safety |
| Tailwind CSS | 3.4 | Utility-first CSS |
| Zustand | 4.4 | State management |
| Socket.IO Client | 4.7 | WebSocket client |
| Axios | 1.6 | HTTP client |
| emoji-mart | 5.5 | Emoji picker |
| Giphy SDK | 5.7 | GIF integration |
| date-fns | 3.3 | Date formatting |
| Fuse.js | 7.1 | Fuzzy search |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  Web Browser (Next.js)                                          │
│  ├─ React Components (UI)                                       │
│  ├─ Zustand Stores (State Management)                           │
│  ├─ Crypto Layer (E2EE Encryption/Decryption)                   │
│  ├─ Socket.IO Client (WebSocket)                                │
│  └─ Axios (HTTP API Client)                                     │
└─────────────────────────────────────────────────────────────────┘
                            ↕ HTTPS/WSS
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION SERVER                          │
├─────────────────────────────────────────────────────────────────┤
│  Node.js + Express + TypeScript                                 │
│  ├─ API Routes (REST endpoints)                                 │
│  ├─ WebSocket Handler (Real-time events)                        │
│  ├─ Middleware (Auth, Validation, Error Handling)               │
│  ├─ Services (Push Notifications, File Processing)              │
│  └─ Security Layer (Helmet, CORS, Rate Limiting)                │
└─────────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Persistent Data)      Redis (Cache & Presence)     │
│  ├─ Users & Profiles                ├─ Session Cache            │
│  ├─ Conversations & Messages        ├─ User Presence            │
│  ├─ Groups & Members                └─ Online Status            │
│  ├─ Files & Calls                                               │
│  ├─ E2EE Keys                                                   │
│  └─ Polls & Votes                                               │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

#### 1. HTTP API Request Flow
```
User Action → Next.js Component → API Client (axios)
    ↓
HTTP Request (with JWT token in Authorization header)
    ↓
Express Server → Middleware Chain:
    ├─ Rate Limiting (express-rate-limit)
    ├─ Security Headers (helmet)
    ├─ CORS Check
    ├─ Body Parsing
    ├─ Authentication (JWT verification + session validation)
    └─ Input Validation (zod)
    ↓
Route Handler → Database Query (Prisma) → Response
    ↓
JSON Response → Client → State Update (Zustand) → UI Update
```

#### 2. WebSocket Event Flow
```
User Action → Zustand Store → Socket.emit(event, data)
    ↓
WebSocket Connection (authenticated via JWT)
    ↓
Socket.IO Server → Event Handler:
    ├─ Authentication Check
    ├─ Input Validation
    ├─ Business Logic
    └─ Database Update (Prisma)
    ↓
Broadcast Event to Room/User:
    ├─ io.to(`conversation:${id}`).emit(...)
    └─ io.to(`user:${id}`).emit(...)
    ↓
Client Socket.on(event) → State Update → UI Update
```

#### 3. End-to-End Encryption Flow
```
Sender Side:
User Types Message → Plaintext
    ↓
Fetch Recipient's Public Key (if not cached)
    ↓
Derive AES-256-GCM Key via ECDH:
    sharedSecret = ECDH(myprivatekey, theirpublickey)
    aesKey = HKDF(sharedSecret, "zynk-e2ee-v3")
    ↓
Encrypt: ciphertext = AES-GCM.encrypt(plaintext, aesKey, randomIV)
    ↓
Send EncryptedEnvelope { ct, iv, sk } → Server
    ↓
Server stores encrypted_content (cannot read it)
    ↓
Broadcast to recipient

Recipient Side:
Receive EncryptedEnvelope
    ↓
Derive same AES key via ECDH:
    sharedSecret = ECDH(myprivatekey, senderpublickey)
    aesKey = HKDF(sharedSecret, "zynk-e2ee-v3")
    ↓
Decrypt: plaintext = AES-GCM.decrypt(ciphertext, aesKey, iv)
    ↓
Display Message
```

---

## Project Structure

### Server Directory Structure
```
server/
├── prisma/
│   ├── schema.prisma          # Database schema (21 models, all relations)
│   └── seed.ts                # Database seeding script
├── src/
│   ├── index.ts               # Application entry point
│   ├── config/
│   │   └── index.ts           # Configuration (env vars, secrets)
│   ├── db/
│   │   ├── client.ts          # Prisma client instance
│   │   └── redis.ts           # Redis connection
│   ├── middleware/
│   │   ├── auth.ts            # JWT + session validation
│   │   ├── error.ts           # Error handling
│   │   └── validate.ts        # Zod schema validation
│   ├── routes/
│   │   ├── auth.ts            # Registration, login, logout, refresh
│   │   ├── users.ts           # User profile, search, contacts
│   │   ├── messages.ts        # Send, receive, edit, delete messages
│   │   ├── groups.ts          # Group CRUD, members, roles
│   │   ├── calls.ts           # Call initiation, history
│   │   ├── files.ts           # File upload, download, thumbnails
│   │   ├── keys.ts            # E2EE key upload, bundle fetching
│   │   ├── reports.ts         # User/message reporting
│   │   └── polls.ts           # Poll creation, voting
│   ├── services/
│   │   └── pushNotification.ts # Push notification service
│   └── websocket/
│       └── index.ts           # WebSocket event handlers (967 lines)
├── uploads/                   # File storage directory
│   └── thumbnails/            # Generated thumbnails
├── data/
│   └── reports.json           # Report type definitions
├── package.json
├── tsconfig.json
└── prisma.config.ts
```

### Web Directory Structure
```
web/
├── src/
│   ├── app/                   # Next.js 14 App Router
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page
│   │   ├── globals.css        # Global styles
│   │   ├── chat/
│   │   │   └── page.tsx       # Main chat interface
│   │   ├── login/
│   │   │   └── page.tsx       # Login page
│   │   └── register/
│   │       └── page.tsx       # Registration page
│   ├── components/            # 29 React components
│   │   ├── ChatArea.tsx       # Message display and input
│   │   ├── Sidebar.tsx        # Conversation list
│   │   ├── ContactsPanel.tsx  # Contact management
│   │   ├── GroupCreateModal.tsx
│   │   ├── CallOverlay.tsx    # WebRTC call UI
│   │   ├── VoiceRecorder.tsx  # Audio recording
│   │   ├── PollCreateModal.tsx
│   │   ├── MessageContextMenu.tsx
│   │   └── ... (20 more)
│   ├── lib/                   # Utility libraries
│   │   ├── api.ts             # Axios API client
│   │   ├── socket.ts          # Socket.IO client setup
│   │   ├── crypto.ts          # E2EE encryption layer (379 lines)
│   │   ├── notifications.ts   # Browser notifications
│   │   ├── logger.ts          # Console logging utility
│   │   └── utils.ts           # Helper functions
│   └── stores/                # Zustand state stores
│       ├── authStore.ts       # Authentication state
│       ├── chatStore.ts       # Messages & conversations (1292 lines)
│       ├── callStore.ts       # Call state & WebRTC
│       ├── cryptoStore.ts     # E2EE key management
│       ├── uiStore.ts         # UI state (modals, panels)
│       ├── connectionStore.ts # WebSocket connection state
│       ├── callHistoryStore.ts# Call history
│       └── decryptionQueue.ts # Background decryption queue
├── public/
│   ├── icons/                 # PWA icons
│   ├── sounds/                # Notification sounds
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Core Features

### 1. Authentication & Security
- **JWT-based authentication** with session tokens
- **Refresh token rotation** (15-minute access tokens, 7-day refresh tokens)
- **Multi-device support** (up to 5 devices per user)
- **Device fingerprinting** for session tracking
- **Rate limiting** on all endpoints (strict limits on auth routes)
- **Bcrypt password hashing** (cost factor 12 in production)
- **HTTPS/WSS only** in production
- **Helmet security headers** (CSP, HSTS, XSS protection)
- **Session revocation** support via database validation

### 2. End-to-End Encryption
- **ECDH P-256** key agreement (Web Crypto API)
- **HKDF-SHA256** key derivation
- **AES-256-GCM** authenticated encryption
- **Per-message random IVs** (12 bytes)
- **Public key infrastructure** stored on server
- **Group encryption** via sender keys (each member generates AES key)
- **Key rotation** support for groups
- **Encrypted file uploads** (client-side encryption before upload)

### 3. Real-time Messaging
- **WebSocket-based** instant delivery (Socket.IO)
- **Delivery receipts** (sent → delivered → read)
- **Typing indicators** (debounced, auto-clear after 3s)
- **Optimistic updates** (instant UI feedback)
- **Message retry** on failure
- **Offline message queue** (send when reconnected)
- **Conversation threading** (reply-to support)
- **Message editing** and deletion
- **Reactions** (via metadata)
- **Mentions** (@username in groups)
- **Read receipts** (privacy-respecting)

### 4. Voice & Video Calls
- **WebRTC peer-to-peer** connections
- **STUN/TURN server** support
- **Audio and video** calling
- **ICE candidate exchange** via WebSocket signaling
- **Call states**: initiated → ringing → in_progress → ended
- **Call history** tracking
- **Automatic timeout** (30s ring timeout)
- **Mute/unmute** controls
- **Camera on/off** controls
- **Call decline** and missed call notifications

### 5. Group Chats
- **Group creation** with name, avatar, description
- **Member management** (add, remove, roles)
- **Admin privileges** (admins can add/remove members)
- **Max 256 members** per group (configurable)
- **Group E2EE** via sender keys
- **Group info panel** with member list
- **Leave group** functionality

### 6. File Sharing
- **File upload** (max 50MB per file)
- **Image thumbnails** (auto-generated via Sharp)
- **File types**: images, videos, audio, documents
- **Content-type detection** (MIME types)
- **SHA-256 content hashing** for integrity
- **Secure download** (authenticated endpoints)
- **Expiring files** support
- **Soft delete** (deleted_at timestamp)

### 7. Polls
- **Poll creation** in conversations
- **Multiple choice** or single choice
- **Anonymous voting** option
- **Poll expiration** (optional)
- **Real-time vote updates**
- **Vote count display**

### 8. User Features
- **User profiles** (display name, bio, avatar)
- **Privacy settings** (last seen, online status, read receipts)
- **User search** with fuzzy matching
- **Contact management** (add, remove, block)
- **Last seen** tracking
- **Online presence** (via Redis)
- **User blocking** (prevents messaging)

---

## Design Principles

### Security-First Design
1. **Zero-knowledge architecture**: Server cannot read message content
2. **Defense in depth**: Multiple security layers (JWT + DB validation + rate limiting)
3. **Minimal data exposure**: Generic error messages to prevent information disclosure
4. **Secure defaults**: Production mode enforces strong passwords, HTTPS, etc.
5. **Input validation**: All inputs validated with Zod schemas
6. **SQL injection protection**: Prisma ORM with parameterized queries
7. **XSS protection**: React auto-escaping + CSP headers

### Performance Optimization
1. **Database indexing**: All foreign keys and frequent queries indexed
2. **Redis caching**: Session validation cached (5-minute TTL)
3. **Batch operations**: Multiple database operations in transactions
4. **Query optimization**: No N+1 queries (use includes and batch fetches)
5. **Message pagination**: Load messages in batches (50 per page)
6. **Connection pooling**: Prisma connection pool for PostgreSQL
7. **WebSocket rooms**: Efficient broadcasting to conversation participants

### Developer Experience
1. **TypeScript everywhere**: Full type safety across frontend and backend
2. **Zod schemas**: Runtime validation + TypeScript types
3. **Prisma ORM**: Type-safe database queries
4. **Hot reload**: Development mode with live reloading
5. **Environment variables**: Dotenv configuration
6. **Docker Compose**: One-command infrastructure setup
7. **Comprehensive logging**: Structured logs for debugging

### User Experience
1. **Optimistic updates**: Instant UI feedback before server confirmation
2. **Offline support**: Message queuing and automatic retry
3. **Real-time updates**: WebSocket for instant message delivery
4. **Responsive design**: Works on desktop and mobile browsers
5. **Keyboard shortcuts**: Efficient navigation
6. **Emoji picker**: Rich text input with emojis and GIFs
7. **Sound notifications**: Audio alerts for new messages and calls

---

## Next Steps

For detailed information on specific aspects of the system, refer to:

- **[Backend API Reference](./02-Backend-API-Reference.md)** - Complete API endpoint documentation
- **[Database Schema](./03-Database-Schema.md)** - Detailed database structure
- **[WebSocket Events](./04-WebSocket-Events.md)** - Real-time event reference
- **[Frontend Architecture](./05-Frontend-Architecture.md)** - React components and state management
- **[Encryption & Security](./06-Encryption-and-Security.md)** - E2EE implementation details
- **[Setup & Deployment](./07-Setup-and-Deployment.md)** - Installation and configuration
- **[Configuration Guide](./08-Configuration-Guide.md)** - Environment variables and settings
