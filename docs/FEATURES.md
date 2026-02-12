# Zynk — Feature List & Status

**Last Updated:** February 12, 2026

> Complete inventory of every feature implemented in Zynk, organized by module.  
> ✅ = Working | 🔄 = In Progress | ❌ = Planned

---

## 1. Authentication & Sessions

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | User registration | ✅ | Username + password, Zod validation, bcrypt hashing |
| 2 | Strong password policy | ✅ | Uppercase, lowercase, number, special char required in production |
| 3 | User login | ✅ | Returns JWT session + refresh token pair |
| 4 | JWT session tokens | ✅ | 15-minute expiry, auto-refresh |
| 5 | Refresh tokens | ✅ | 7-day expiry, stored in DB per device |
| 6 | Multi-device support | ✅ | Up to 5 concurrent devices per account |
| 7 | Device fingerprinting | ✅ | Unique device identification |
| 8 | Device list management | ✅ | View all connected devices |
| 9 | Remove device | ✅ | Revoke a specific device's sessions |
| 10 | Force login | ✅ | Remove a device + login when at max limit |
| 11 | Device limit modal | ✅ | UI to pick which device to remove when at limit |
| 12 | Logout (current session) | ✅ | Invalidates current JWT + refresh |
| 13 | Logout all devices | ✅ | Invalidates every session for the user |
| 14 | Get current user (`/auth/me`) | ✅ | Returns user info + profile + device |
| 15 | Session validation middleware | ✅ | JWT verify → DB session check → Redis cache (5min TTL) |
| 16 | Redis session caching | ✅ | SHA-256 token hash key, graceful fallback to DB |
| 17 | Rate limiting: login | ✅ | 5 attempts per 15 minutes per IP |
| 18 | Rate limiting: registration | ✅ | 3 attempts per 15 minutes per IP |
| 19 | Constant-time auth errors | ✅ | Prevents username enumeration via timing attacks |
| 20 | Audit logging for auth events | ✅ | Login, register, logout, password change, device actions |

---

## 2. Messaging

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Send encrypted 1:1 messages | ✅ | AES-256-GCM via ECDH shared secret |
| 2 | Send encrypted group messages | ✅ | AES-256 sender key protocol |
| 3 | Text messages | ✅ | Default message type |
| 4 | Image messages | ✅ | With thumbnail generation |
| 5 | File messages | ✅ | Arbitrary file attachments |
| 6 | Audio messages | ✅ | Voice notes |
| 7 | Video messages | ✅ | Video attachments |
| 8 | Location messages | ✅ | Schema-supported |
| 9 | Contact messages | ✅ | Schema-supported |
| 10 | Poll messages | ✅ | In-chat polls with system message creation |
| 11 | Message delivery status: sent | ✅ | Confirmed via Socket acknowledgment |
| 12 | Message delivery status: delivered | ✅ | Bulk-marked on recipient connect (last 24h, cap 200) |
| 13 | Message delivery status: read | ✅ | Via `message:read` and `conversation:read` events |
| 14 | Status icons in UI | ✅ | ✓ sent, ✓✓ delivered, ✓✓ (accent) read, ⚠ failed, 🕐 optimistic |
| 15 | Typing indicators | ✅ | Animated dots with avatar, debounced emission |
| 16 | Message editing | ✅ | Own messages only, via context menu |
| 17 | Delete for me | ✅ | Per-user soft delete via `message_deleted_for` table |
| 18 | Delete for everyone | ✅ | Global soft delete via `deleted_at` timestamp |
| 19 | Reply to message | ✅ | Metadata-based reply_to_id |
| 20 | Emoji reactions | ✅ | Toggle reaction on/off per message |
| 21 | Forward message | ✅ | Via context menu action |
| 22 | Star/bookmark messages | ✅ | Per-conversation starred messages |
| 23 | Self-destructing messages | ✅ | `expires_at` field + index for cleanup |
| 24 | Message search | ✅ | Full-text search within conversations |
| 25 | Cursor-based pagination | ✅ | Infinite scroll on chat, before-cursor pagination |
| 26 | Idempotent sends | ✅ | `X-Idempotency-Key` header, Redis lock + 24h response cache |
| 27 | Draft persistence | ✅ | Per-conversation draft saved in store |
| 28 | Optimistic rendering | ✅ | Shows message instantly, confirms on server ACK |
| 29 | Message queue | ✅ | Queues messages when offline, sends on reconnect |
| 30 | Conversation creation (1:1) | ✅ | Auto-creates on first message, deduplication |
| 31 | Conversation listing | ✅ | Sorted by last activity, batched queries (no N+1) |
| 32 | Conversation pinning | ✅ | Pin to top of chat list |
| 33 | Conversation muting | ✅ | Suppress notifications |
| 34 | Conversation archiving | ✅ | Hide from main list |
| 35 | Clear chat history | ✅ | Soft-delete all messages, keep conversation |
| 36 | Delete conversation (leave) | ✅ | Delete-for-user all messages, remove as participant |
| 37 | Unread count badges | ✅ | Per-conversation unread count via groupBy |
| 38 | Date separators | ✅ | Messages grouped by date in UI |
| 39 | Consecutive message compaction | ✅ | Same-sender messages compact (no avatar repeat) |
| 40 | E2EE banner | ✅ | "Messages are end-to-end encrypted" notice |
| 41 | Context menu | ✅ | Right-click: reply, copy, forward, star, edit, delete |

---

## 3. Group Chats

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Create group | ✅ | Transaction: conversation + group + admin + members |
| 2 | Group name & description | ✅ | Editable by admins |
| 3 | Group avatar | ✅ | Upload via file API |
| 4 | Two-step creation flow | ✅ | Step 1: select members, Step 2: name group |
| 5 | User search for adding members | ✅ | Debounced API search with chip selection |
| 6 | Member limit (32 MVP / 256 max) | ✅ | Enforced on add |
| 7 | Roles: admin, moderator, member | ✅ | Different permissions per role |
| 8 | Admin-only actions | ✅ | Edit group, add/remove members, delete group |
| 9 | Promote/demote members | ✅ | Admin can change roles, self-demotion prevention |
| 10 | Remove/kick members | ✅ | Admin-only, syncs conversation participants |
| 11 | Leave group | ✅ | Self-removal from group + conversation |
| 12 | Delete group | ✅ | Admin-only, cascading delete |
| 13 | Group listing | ✅ | Sorted by last activity, member counts |
| 14 | Group details view | ✅ | Members with roles, ordered by role then join date |
| 15 | Group E2EE (Sender Key) | ✅ | Per-member AES-256 sender key, ECDH-encrypted distribution |
| 16 | Sender key rotation | ✅ | Auto-rotated on member changes |

---

## 4. Voice & Video Calls

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | 1:1 audio call | ✅ | WebRTC peer connection |
| 2 | 1:1 video call | ✅ | WebRTC with camera access |
| 3 | Call initiation | ✅ | Via header buttons (1:1 chats only) |
| 4 | Incoming call notification | ✅ | Full-screen overlay with accept/decline |
| 5 | Multi-device ring | ✅ | Rings all recipient devices, dismisses others on answer |
| 6 | Call accept/decline | ✅ | Accept starts ICE, decline notifies caller |
| 7 | Ring timeout (30s) | ✅ | Auto-missed after 30 seconds |
| 8 | Max call duration (1hr) | ✅ | Redis TTL enforcement |
| 9 | Mute/unmute microphone | ✅ | Toggle with UI indicator |
| 10 | Camera on/off | ✅ | Toggle with UI indicator |
| 11 | Switch camera (front/back) | ✅ | For mobile devices |
| 12 | Full-screen call overlay | ✅ | Dark gradient, status indicators |
| 13 | Remote video (full-screen) | ✅ | Full viewport rendering |
| 14 | Local video (PiP self-view) | ✅ | Picture-in-picture, mirrored |
| 15 | PiP minimized mode | ✅ | Draggable mini-window while chatting |
| 16 | Call timer | ✅ | Live MM:SS counter |
| 17 | Call state machine | ✅ | idle → initiating → ringing → connecting → connected → ended |
| 18 | Connection quality indicator | ✅ | Signal strength icons: excellent/good/poor |
| 19 | Quality monitoring | ✅ | Latency, packet loss, bitrate, jitter polled every 3s |
| 20 | Quality history buffer | ✅ | ~10 minutes of stats history |
| 21 | Auto-reconnect | ✅ | 3 reconnection attempts on ICE failure |
| 22 | Mid-call renegotiation | ✅ | For camera/audio changes during call |
| 23 | Busy detection | ✅ | Prevents calling user already in a call |
| 24 | Call history | ✅ | Paginated list with type, duration, status |
| 25 | Call history in sidebar | ✅ | Calls tab with incoming/outgoing/missed indicators |
| 26 | End-of-call metrics | ✅ | Avg/max latency, packet loss %, avg bitrate persisted to DB |
| 27 | STUN/TURN configuration | ✅ | `/calls/ice-servers` endpoint |
| 28 | Disconnect grace period | ✅ | 10s before auto-ending on disconnect |
| 29 | Audio config | ✅ | Echo cancellation, noise suppression, auto gain, 48kHz |
| 30 | Video config | ✅ | 720p ideal, 1080p max, 30fps |
| 31 | Audio level monitoring | ✅ | RMS analysis → silent/low/medium/high |
| 32 | Reconnecting state UI | ✅ | Spinner + "Reconnecting..." text |

---

## 5. End-to-End Encryption

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | ECDH P-256 key generation | ✅ | Per-user identity key pair |
| 2 | AES-256-GCM encryption | ✅ | Per-message random 12-byte IV |
| 3 | HKDF-SHA256 key derivation | ✅ | Shared secret → AES key |
| 4 | Signal Protocol key bundles | ✅ | Identity + signed pre-key + one-time pre-keys |
| 5 | One-time pre-key consumption | ✅ | Atomic transaction, prevents race conditions |
| 6 | Pre-key batch upload | ✅ | Up to 100 pre-keys per upload |
| 7 | Pre-key replenishment | ✅ | Batch insert with skip-duplicates |
| 8 | Low pre-key warning | ✅ | `X-PreKey-Warning: LOW_PREKEY_POOL` header when <10 |
| 9 | Encrypted key backup | ✅ | PBKDF2 (100k iterations) derived AES key |
| 10 | Multi-device key restore | ✅ | Full key archive restore for new devices |
| 11 | Forward secrecy (epochs) | ✅ | Per-epoch HKDF key derivation, old keys archived |
| 12 | Message key archiving | ✅ | Historical keys encrypted and stored per conversation |
| 13 | Double Ratchet state sync | ✅ | Encrypted ratchet state stored server-side per conversation |
| 14 | Group Sender Key protocol | ✅ | Each member generates AES-256 sender key |
| 15 | Sender key distribution | ✅ | Encrypted 1:1 to each group member via ECDH |
| 16 | Sender key rotation | ✅ | On member add/remove, epoch increment |
| 17 | Safety number generation | ✅ | SHA-256 hash of sorted public keys |
| 18 | Key rotation | ✅ | `generateRotatedKeyPair()` for identity rotation |
| 19 | Envelope validation | ✅ | `isEncryptedMessage()`, version detection (v3/v4/v5) |
| 20 | Zero-knowledge server | ✅ | Server stores only ciphertext, cannot derive keys |

---

## 6. File Sharing

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | File upload | ✅ | Multipart/form-data, 50MB max |
| 2 | MIME type whitelist | ✅ | Only allowed types accepted |
| 3 | Dangerous extension blocking | ✅ | .exe, .sh, .php, .bat, etc. blocked |
| 4 | Random filename generation | ✅ | Prevents path traversal |
| 5 | Image thumbnail generation | ✅ | 200×200 JPEG via Sharp |
| 6 | Image auto-compression | ✅ | For images >1MB |
| 7 | SHA-256 content hashing | ✅ | Streaming hash for integrity |
| 8 | File download | ✅ | With access control (conversation member only) |
| 9 | ETag caching | ✅ | 304 Not Modified support |
| 10 | Thumbnail serving | ✅ | 24h cache headers |
| 11 | Conversation file listing | ✅ | Cursor-based pagination |
| 12 | Soft delete | ✅ | `deleted_at` timestamp |
| 13 | Upload rate limiting | ✅ | Per-user upload limits |
| 14 | Attachment menu in UI | ✅ | Photos, camera, documents buttons |

---

## 7. Polls

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Create poll | ✅ | Question + 2–10 options |
| 2 | Multi-vote polls | ✅ | Optional `allow_multiple` setting |
| 3 | Anonymous polls | ✅ | Voter info hidden when enabled |
| 4 | Poll expiration | ✅ | Optional time limit |
| 5 | Vote toggling | ✅ | Change/remove vote |
| 6 | Poll results with voter info | ✅ | Respects anonymity setting |
| 7 | System message on poll creation | ✅ | Auto-created in conversation |

---

## 8. User Management

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Profile editing (display name, bio) | ✅ | Via settings or profile panel |
| 2 | Avatar upload | ✅ | Click-to-upload with camera overlay |
| 3 | User search | ✅ | Case-insensitive by username or display name |
| 4 | Public key retrieval | ✅ | For E2EE session establishment |
| 5 | Contact list | ✅ | Add/remove contacts with nicknames |
| 6 | Contact blocking | ✅ | Block/unblock with list |
| 7 | Privacy: last seen | ✅ | Configurable visibility |
| 8 | Privacy: online status | ✅ | Configurable visibility |
| 9 | Privacy: read receipts | ✅ | Configurable per user |
| 10 | Privacy: proximity discovery | ✅ | Toggle for nearby user search |
| 11 | Online presence (real-time) | ✅ | Redis-backed, broadcast via WebSocket |
| 12 | Last seen tracking | ✅ | Updated on disconnect |

---

## 9. Notifications

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Browser (native) notifications | ✅ | Permission management, tag dedup, auto-close |
| 2 | Message notification sound | ✅ | WAV file, 50% volume, lazy-loaded |
| 3 | Call ringtone | ✅ | MP3 file, 70% volume, looping |
| 4 | Sound toggle (messages) | ✅ | Configurable in settings |
| 5 | Sound toggle (calls) | ✅ | Configurable in settings |
| 6 | App badge count | ✅ | Chrome/Edge Badging API + favicon fallback |
| 7 | Push notifications (FCM) | ✅ | Firebase Cloud Messaging via HTTP API |
| 8 | Zero-content push | ✅ | Never includes plaintext (E2EE), generic "New message" |
| 9 | Multi-device push | ✅ | Sends to all registered push tokens |
| 10 | Invalid token cleanup | ✅ | Auto-removes stale FCM tokens |
| 11 | Service worker push handling | ✅ | JSON/plaintext parsing, vibration, click-to-open |

---

## 10. UI/UX Features

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Dark/Light theme | ✅ | Toggle in settings |
| 2 | 7 accent color schemes | ✅ | Azure, violet, ocean, emerald, rose, amber, crimson |
| 3 | 7 chat backgrounds | ✅ | Default, dots, grid, waves, gradient, bubbles, doodle |
| 4 | 3 bubble styles | ✅ | Gradient, solid, minimal |
| 5 | Font size control | ✅ | Small, medium, large |
| 6 | Compact mode | ✅ | Reduced spacing |
| 7 | Animation toggle | ✅ | Enable/disable UI animations |
| 8 | Sidebar tabs | ✅ | Chats, Calls, Contacts |
| 9 | Chat filters | ✅ | All, Unread, Groups |
| 10 | Debounced search | ✅ | Across conversations and users |
| 11 | Responsive design | ✅ | Mobile-first with adaptive layouts |
| 12 | Mobile back button | ✅ | Navigate sidebar ↔ chat |
| 13 | Floating action button | ✅ | New Chat quick action |
| 14 | User info side panel | ✅ | 320px right panel with profile, actions, media sections |
| 15 | Connection status banner | ✅ | Disconnected/reconnecting/error states |
| 16 | Connection quality dot | ✅ | Green/yellow/red with pulse animation |
| 17 | Error boundary | ✅ | Catches render errors with fallback UI |
| 18 | Landing page | ✅ | Animated marketing page with feature highlights |
| 19 | Auto-redirect (auth-aware) | ✅ | Logged-in users → /chat, logged-out → landing |
| 20 | No-flash theme loading | ✅ | Inline script loads theme before first paint |
| 21 | Toast notifications | ✅ | Global toast provider |
| 22 | Emoji support | ✅ | Emoji Mart picker |
| 23 | GIF support | ✅ | Giphy SDK integration |

---

## 11. Administration

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Platform statistics dashboard | ✅ | User counts, messages, groups, files, sessions |
| 2 | User list (paginated, searchable) | ✅ | With profile info, device/session counts |
| 3 | User detail view | ✅ | Devices, sessions, message count, report count |
| 4 | Force logout user | ✅ | Delete all sessions for a user |
| 5 | Content reports list | ✅ | Status filter + pagination |
| 6 | Report resolution | ✅ | reviewed/resolved/dismissed with admin notes |
| 7 | Audit log viewer | ✅ | Filter by user/action |
| 8 | Report types | ✅ | Spam, harassment, hate speech, inappropriate, impersonation, other |

---

## 12. GDPR & Compliance

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Data export (Article 20) | ✅ | Full account data as downloadable JSON |
| 2 | Account deletion (Article 17) | ✅ | Cascading deletion with password + confirmation |
| 3 | Password change | ✅ | 8+ chars, complexity requirements, session invalidation |
| 4 | Audit trail | ✅ | 50+ action types, dual-write (log + DB) |
| 5 | No plaintext storage | ✅ | Zero-knowledge architecture |

---

## 13. PWA & Offline

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Service worker registration | ✅ | Cache-first static, network-first HTML |
| 2 | App shell caching | ✅ | /, /chat, /login, /register precached |
| 3 | PWA manifest | ✅ | Standalone mode, icons, dark theme |
| 4 | Add to home screen | ✅ | Installable PWA |
| 5 | Offline message queue | ✅ | Queues messages when offline, sends on reconnect |
| 6 | API bypass in SW | ✅ | Never caches /api/ or /socket.io |

---

## 14. Infrastructure & DevOps

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Docker Compose (dev) | ✅ | PostgreSQL 16 + Redis 7 |
| 2 | Docker Compose (prod) | ✅ | Nginx + Server (2 replicas) + Web (2 replicas) + PG + Redis + Prometheus + Grafana |
| 3 | Nginx reverse proxy | ✅ | SSL termination, WebSocket sticky sessions |
| 4 | Multi-stage Docker builds | ✅ | Optimized production images |
| 5 | Health checks | ✅ | Simple, live, ready, deep endpoints |
| 6 | Prometheus metrics | ✅ | HTTP, WebSocket, business, DB, Redis, circuit breaker, runtime |
| 7 | Grafana dashboards | ✅ | Pre-provisioned with datasources |
| 8 | Alert rules | ✅ | Critical threshold alerts |
| 9 | Kubernetes manifests | ✅ | Server deployment YAML |
| 10 | Operational runbooks | ✅ | 8 runbooks with investigation + resolution |
| 11 | PostgreSQL tuning | ✅ | Custom config for production |
| 12 | Redis configuration | ✅ | 512MB maxmemory, LRU eviction, AOF persistence |
| 13 | Backup scripts | ✅ | Database backup automation |
| 14 | Response compression | ✅ | Gzip/Brotli, 60–80% bandwidth reduction |
| 15 | Resource limits | ✅ | CPU/memory limits on all containers |

---

## 15. Reliability Patterns

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | Circuit breaker | ✅ | 3-state machine (closed/open/half-open), per-service |
| 2 | Exponential backoff retry | ✅ | Configurable retries with jitter |
| 3 | Idempotency middleware | ✅ | Redis lock + response cache (24h) |
| 4 | Graceful shutdown | ✅ | SIGTERM/SIGINT → drain connections → close DB → exit |
| 5 | Two-tier cache | ✅ | L1 in-memory LRU + L2 Redis, stampede prevention |
| 6 | Session cache fallback | ✅ | Redis → DB with graceful degradation |
| 7 | WebSocket auto-reconnect | ✅ | 15 attempts, 1–10s exponential backoff |
| 8 | Connection heartbeat | ✅ | 25s ping, 10s pong timeout |

---

## Summary

| Category | Total Features | Working (✅) | Planned (❌) |
|----------|---------------|-------------|-------------|
| Authentication | 20 | 20 | 0 |
| Messaging | 41 | 41 | 0 |
| Group Chats | 16 | 16 | 0 |
| Voice/Video Calls | 32 | 32 | 0 |
| E2E Encryption | 20 | 20 | 0 |
| File Sharing | 14 | 14 | 0 |
| Polls | 7 | 7 | 0 |
| User Management | 12 | 12 | 0 |
| Notifications | 11 | 11 | 0 |
| UI/UX | 23 | 23 | 0 |
| Administration | 8 | 8 | 0 |
| GDPR & Compliance | 5 | 5 | 0 |
| PWA & Offline | 6 | 6 | 0 |
| Infrastructure | 15 | 15 | 0 |
| Reliability | 8 | 8 | 0 |
| **TOTAL** | **238** | **238** | **0** |
