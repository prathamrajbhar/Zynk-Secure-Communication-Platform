# Zynk — System Architecture

**Last Updated:** February 12, 2026

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Web PWA  │  │ Mobile (WIP) │  │ Desktop  │  │  Admin Panel │ │
│  │ Next.js  │  │   Flutter    │  │ Electron │  │   (API-only) │ │
│  └────┬─────┘  └──────┬───────┘  └────┬─────┘  └──────┬───────┘ │
└───────┼────────────────┼───────────────┼───────────────┼─────────┘
        │                │               │               │
        └────────────────┴───────┬───────┴───────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │    Nginx Reverse Proxy   │
                    │  (SSL/TLS + WebSocket)   │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
     ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
     │   Server    │     │   Server    │     │   Server    │
     │  Replica 1  │     │  Replica 2  │     │  Replica N  │
     │  (Express)  │     │  (Express)  │     │  (Express)  │
     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
       ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
       │ PostgreSQL  │   │    Redis    │   │ Prometheus  │
       │    (Data)   │   │ (Cache/Pub) │   │  (Metrics)  │
       └─────────────┘   └─────────────┘   └──────┬──────┘
                                                   │
                                            ┌──────▼──────┐
                                            │   Grafana   │
                                            │ (Dashboards)│
                                            └─────────────┘
```

---

## Backend Architecture

### Server Stack

```
Express.js Application
├── Security Layer
│   ├── Helmet (CSP, HSTS, X-Frame-Options, Referrer-Policy)
│   ├── CORS (no wildcard in production)
│   ├── Rate Limiting (global + per-endpoint)
│   └── Input Validation (Zod schemas on all endpoints)
│
├── Middleware Pipeline
│   ├── requestLogging → Correlation ID + structured logging
│   ├── metricsMiddleware → Prometheus HTTP metrics
│   ├── compression → gzip/brotli (60-80% reduction)
│   ├── cookieParser → Cookie handling
│   ├── authenticate → JWT verify → Redis cache → DB session
│   ├── idempotency → Redis lock + response cache
│   └── errorHandler → Structured error responses
│
├── API Routes (/api/v1/)
│   ├── /auth → Register, Login, Session, Device management
│   ├── /users → Profile, Search, Contacts, Privacy, Blocking
│   ├── /messages → Conversations, Messages, Read receipts
│   ├── /groups → CRUD, Members, Roles
│   ├── /files → Upload, Download, Thumbnails
│   ├── /keys → Signal Protocol key bundles, Pre-keys
│   ├── /keys → Key backup, Archives, Ratchet state
│   ├── /polls → Create, Vote, Results
│   ├── /reports → Content moderation reports
│   ├── /admin → Stats, Users, Reports, Audit logs
│   ├── /account → Export, Delete, Password change
│   └── /calls → History, ICE servers, Active call check
│
├── WebSocket (Socket.IO)
│   ├── Authentication middleware (JWT + session)
│   ├── Connection management (userId ↔ socketId)
│   ├── Room management (auto-join conversation rooms)
│   ├── Message events (send, delivered, read)
│   ├── Typing indicators (start, stop)
│   ├── Presence (online/offline via Redis)
│   ├── Call signaling (initiate, answer, ICE, end, renegotiate)
│   ├── Key sync events (backup, epoch, ratchet)
│   └── Heartbeat (ping/pong, 25s interval)
│
├── Services
│   ├── CallManager → Redis-backed call state machine
│   └── PushNotification → FCM via HTTP (zero-content for E2EE)
│
├── Infrastructure Libraries
│   ├── Logger → Pino structured JSON logging
│   ├── Metrics → Prometheus (HTTP, WS, business, DB, Redis, runtime)
│   ├── Cache → L1 in-memory LRU + L2 Redis (stampede prevention)
│   ├── CircuitBreaker → 3-state (closed/open/half-open) per service
│   ├── Retry → Exponential backoff with jitter
│   ├── Audit → 50+ actions, dual-write (log + PostgreSQL)
│   └── HealthCheck → Simple, live, ready, deep probes
│
└── Data Layer
    ├── Prisma ORM → PostgreSQL (type-safe queries)
    └── ioredis → Redis (caching, sessions, call state, locks)
```

### Database Schema (PostgreSQL)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CORE ENTITIES                             │
├─────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│    users     │  │ user_profiles│  │         devices             │ │
│  (accounts)  │──│  (1:1 ext)   │  │ (multi-device, push tokens)│ │
└──────┬───────┘  └──────────────┘  └─────────────┬──────────────┘ │
       │                                           │                │
       │  ┌──────────────┐                         │                │
       ├──│   sessions   │─────────────────────────┘                │
       │  │ (JWT + device)│                                         │
       │  └──────────────┘                                          │
       │                                                            │
├──────┼────────────── CONVERSATIONS ──────────────────────────────┤
│      │  ┌───────────────────┐  ┌──────────────────────────────┐ │
│      ├──│   conversations   │──│ conversation_participants    │ │
│      │  │ (1:1 or group)    │  │ (users ↔ conversations)     │ │
│      │  └────────┬──────────┘  └──────────────────────────────┘ │
│      │           │                                               │
│      │  ┌────────▼──────────┐  ┌──────────────────────────────┐ │
│      ├──│     messages      │──│    message_deleted_for       │ │
│      │  │ (E2EE ciphertext) │  │    (per-user deletion)       │ │
│      │  └───────────────────┘  └──────────────────────────────┘ │
│      │                                                           │
├──────┼────────────── GROUPS ─────────────────────────────────────┤
│      │  ┌───────────────────┐  ┌──────────────────────────────┐ │
│      ├──│      groups       │──│      group_members           │ │
│      │  │ (name, desc, etc) │  │  (role, invited_by)          │ │
│      │  └───────────────────┘  └──────────────────────────────┘ │
│      │                                                           │
├──────┼────────────── E2EE KEYS ──────────────────────────────────┤
│      │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│      ├──│ identity_keys│  │signed_pre_keys│  │   pre_keys    │  │
│      │  │(per device)  │  │(rotating key) │  │(one-time, OT) │  │
│      │  └──────────────┘  └──────────────┘  └───────────────┘  │
│      │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │
│      ├──│  key_backups │  │msg_key_archive│  │ratchet_states│  │
│      │  │(PBKDF2 enc)  │  │(epoch history)│  │(fwd secrecy) │  │
│      │  └──────────────┘  └───────────────┘  └──────────────┘  │
│      │  ┌──────────────────────┐                                │
│      ├──│  group_sender_keys   │                                │
│      │  │ (sender key per pair)│                                │
│      │  └──────────────────────┘                                │
│      │                                                           │
├──────┼────────────── OTHER ──────────────────────────────────────┤
│      │  ┌──────────┐  ┌────────┐  ┌───────────┐  ┌──────────┐ │
│      ├──│  files    │  │contacts│  │   polls   │  │  calls   │ │
│      │  │(metadata) │  │(block) │  │(+ options)│  │(+ parts) │ │
│      │  └──────────┘  └────────┘  └───────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Total Models:** 22 (User, UserProfile, Device, Session, Conversation, ConversationParticipant, Messages, Group, GroupMember, File, Contact, IdentityKey, SignedPreKey, PreKey, Poll, PollOption, PollVote, GroupSenderKey, KeyBackup, MessageKeyArchive, RatchetState, MessageDeletedFor, Call, CallParticipant)

---

## Frontend Architecture

```
Next.js 14 (App Router)
├── app/
│   ├── layout.tsx → Root layout, theme system, PWA meta
│   ├── page.tsx → Landing page (auth-aware redirect)
│   ├── login/ → Login page
│   ├── register/ → Registration page
│   └── chat/ → Main chat application
│
├── components/
│   ├── Sidebar → Chat list, Calls tab, Contacts tab, search, filters
│   ├── ChatArea → Messages, input, attachments, typing, infinite scroll
│   ├── CallOverlay → Full-screen call UI, PiP, controls, quality
│   ├── ProfilePanel → View/edit profile, avatar upload
│   ├── SettingsPanel → Appearance, notifications, privacy, devices
│   ├── GroupCreateModal → Two-step group creation flow
│   ├── NewChatModal → User search + start conversation
│   ├── UserInfoPanel → Contact info, quick actions, media sections
│   ├── ConnectionIndicator → Banner + dot status indicators
│   ├── DeviceLimitModal → Device removal when at max limit
│   └── ErrorBoundary → Catch render errors with fallback
│
├── stores/ (Zustand)
│   ├── authStore → Auth state, login/register/logout, profile
│   ├── chatStore → Conversations, messages, typing, drafts, queue
│   ├── callStore → Call state machine, WebRTC managers
│   ├── callHistoryStore → Call history list
│   ├── connectionStore → WebSocket status, quality, latency
│   ├── cryptoStore → E2EE keys, backup, epochs, sender keys
│   ├── decryptionQueue → Background message decryption
│   └── uiStore → Theme, colors, fonts, sounds, sidebar, modals
│
├── lib/
│   ├── api.ts → Axios HTTP client (auth interceptors)
│   ├── crypto.ts → E2EE: ECDH, AES-256-GCM, HKDF, PBKDF2, Sender Keys
│   ├── socket.ts → Socket.IO client (78 event types)
│   ├── notifications.ts → Browser notifications, sounds, badge
│   ├── utils.ts → Formatters, helpers
│   ├── logger.ts → Client-side logging
│   └── webrtc/
│       ├── RTCManager.ts → PeerConnection lifecycle
│       ├── MediaManager.ts → getUserMedia, tracks, audio levels
│       └── QualityMonitor.ts → Stats polling, quality rating
│
└── public/
    ├── sw.js → Service Worker (caching, push)
    ├── manifest.json → PWA manifest
    ├── icons/ → App icons (192, 512, maskable)
    └── sounds/ → Notification + ringtone audio
```

---

## Encryption Architecture

```
1:1 Message Encryption Flow
═══════════════════════════

  Alice                          Server                         Bob
    │                              │                              │
    │  1. Generate ECDH key pair   │   1. Generate ECDH key pair  │
    │  2. Upload key bundle ──────►│◄────── Upload key bundle  2. │
    │                              │                              │
    │  3. Fetch Bob's bundle ─────►│                              │
    │◄── (identity + signed +      │                              │
    │     one-time pre-key)        │                              │
    │                              │                              │
    │  4. ECDH shared secret       │                              │
    │  5. HKDF → AES-256 key      │                              │
    │  6. AES-GCM encrypt ───────►│──── forward ciphertext ─────►│
    │     (random IV per msg)      │                              │
    │                              │      7. ECDH shared secret   │
    │                              │      8. HKDF → AES-256 key   │
    │                              │      9. AES-GCM decrypt      │


Group Message Encryption (Sender Key Protocol)
═══════════════════════════════════════════════

  Alice (member)                 Server                    Bob, Carol (members)
    │                              │                              │
    │  1. Generate AES-256         │                              │
    │     sender key               │                              │
    │  2. For each member:         │                              │
    │     encrypt sender key       │                              │
    │     via 1:1 ECDH channel     │                              │
    │  3. Distribute keys ────────►│──── forward to each ────────►│
    │                              │     member                   │
    │  4. Encrypt message with     │                              │
    │     own sender key           │                              │
    │  5. Send ciphertext ────────►│──── broadcast ──────────────►│
    │                              │                              │
    │                              │      6. Decrypt with Alice's │
    │                              │         sender key           │


Key Backup & Multi-Device
═════════════════════════

  ┌─────────────────────────────────────────────────────────────┐
  │                    User's Password                           │
  │                         │                                    │
  │                    PBKDF2 (100k iterations)                  │
  │                         │                                    │
  │                    AES-256 Key                               │
  │                    ┌────┴────┐                               │
  │            ┌───────▼───┐  ┌──▼──────────┐                   │
  │            │  Encrypt   │  │  Encrypt    │                   │
  │            │  Private   │  │  Message    │                   │
  │            │  Key       │  │  Key Archive│                   │
  │            └──────┬─────┘  └──────┬──────┘                   │
  │                   │               │                          │
  │            ┌──────▼───────────────▼──────┐                   │
  │            │     Server (encrypted)      │                   │
  │            │   Cannot decrypt anything   │                   │
  │            └──────┬───────────────┬──────┘                   │
  │                   │               │                          │
  │            ┌──────▼─────┐  ┌──────▼──────┐                  │
  │            │  Device 1   │  │  Device 2   │                  │
  │            │  (restore)  │  │  (restore)  │                  │
  │            └─────────────┘  └─────────────┘                  │
  └─────────────────────────────────────────────────────────────┘
```

---

## Call Architecture (WebRTC)

```
  Caller                    Server (Signaling)              Callee
    │                              │                          │
    │  call:initiate ─────────────►│                          │
    │◄── call:initiated            │──── call:incoming ──────►│
    │                              │     (+ ICE servers)      │
    │           ┌──── 30s ring timeout ────┐                  │
    │           │                          │                  │
    │                              │◄──── call:answer ────────│
    │◄── call:answered ────────────│                          │
    │                              │                          │
    │  ═══════ WebRTC P2P Negotiation ═══════                │
    │  SDP Offer ─────────────────►│──── SDP Offer ──────────►│
    │◄── SDP Answer ───────────────│◄─── SDP Answer ──────────│
    │  ICE Candidates ◄────────────│────► ICE Candidates      │
    │                              │                          │
    │  ════════ Direct P2P Media ═══════                      │
    │◄────────── Audio/Video ────────────────────────────────►│
    │                              │                          │
    │  call:end ──────────────────►│──── call:ended ─────────►│
    │     (+ quality metrics)      │     (+ duration)         │

Quality Monitoring (every 3s):
  ├── Latency (RTT)
  ├── Packet Loss %
  ├── Bitrate (kbps)
  ├── Jitter
  └── Rating: Excellent (<100ms, <1%) / Good (<300ms, <5%) / Poor
```

---

## Infrastructure (Production)

```
docker-compose.prod.yml
├── nginx (reverse proxy)
│   ├── SSL termination
│   ├── WebSocket upgrade support
│   └── Static file serving
│
├── server × 2 replicas
│   ├── 1 CPU / 1GB RAM limit
│   ├── Health check: /api/health
│   └── Prometheus metrics: /metrics
│
├── web × 2 replicas
│   ├── 0.5 CPU / 512MB RAM limit
│   └── Next.js production server
│
├── postgres (PostgreSQL 16)
│   ├── Custom postgresql.conf
│   ├── Data checksums enabled
│   ├── 2 CPU / 4GB RAM limit
│   └── Persistent volume
│
├── redis (Redis 7)
│   ├── 512MB maxmemory (LRU eviction)
│   ├── AOF persistence
│   ├── Password auth
│   └── Persistent volume
│
├── prometheus
│   ├── 30-day retention / 10GB storage
│   ├── Custom alert rules
│   └── Scrapes server /metrics
│
└── grafana
    ├── Pre-provisioned dashboards
    ├── Prometheus datasource
    └── Zynk overview dashboard
```

---

## Data Flow: Message Send

```
1. User types message in ChatArea
2. chatStore.sendMessage() called
3. cryptoStore encrypts content:
   ├── 1:1: ECDH → HKDF → AES-256-GCM(plaintext, random IV)
   └── Group: AES-256-GCM(plaintext, sender key, random IV)
4. Optimistic message rendered in UI (clock icon)
5. Socket emits "message:send" with ciphertext
6. Server receives via WebSocket:
   a. Validates session + conversation membership
   b. Saves encrypted message to PostgreSQL (transaction)
   c. Broadcasts to conversation room
   d. Sends "message:sent" ACK to sender
   e. Async: push notification to offline members
7. Sender receives ACK → updates status to "sent" (✓)
8. Recipients receive message:
   a. decryptionQueue processes ciphertext
   b. Decrypted content rendered in ChatArea
   c. "delivered" status sent back → (✓✓)
9. On read → "read" status → (✓✓ accent color)
```

---

## Security Layers

```
Layer 1: Transport → HTTPS/WSS (TLS 1.2+)
Layer 2: Authentication → JWT (15 min) + Refresh (7 day)
Layer 3: Authorization → Session validation + conversation membership
Layer 4: Rate Limiting → Per-IP and per-user limits
Layer 5: Input Validation → Zod schemas on all endpoints
Layer 6: Encryption → E2EE (AES-256-GCM + ECDH P-256)
Layer 7: Data Protection → Zero-knowledge (server sees only ciphertext)
Layer 8: Audit → 50+ action types logged to DB + structured logs
Layer 9: Headers → CSP, HSTS, X-Frame-Options, Referrer-Policy
```
