# Zynk — Product Requirements Document (PRD)

**Version:** 1.0  
**Last Updated:** February 12, 2026  
**Status:** Active Development  

---

## 1. Executive Summary

Zynk is a **production-grade, end-to-end encrypted (E2EE) communication platform** offering secure messaging, voice/video calling, file sharing, and group collaboration. It targets privacy-conscious users and organizations who require zero-knowledge architecture where the server never has access to plaintext message content.

Zynk is available as a **Progressive Web App (PWA)** with plans for native mobile (Flutter) and desktop (Electron) clients.

---

## 2. Vision & Mission

**Vision:** To be the most trusted, open, and user-friendly secure communication platform.

**Mission:** Provide individuals and teams with an encrypted messaging experience that matches the usability of mainstream apps (WhatsApp, Telegram) while guaranteeing true end-to-end encryption with forward secrecy.

---

## 3. Target Users

| Persona | Description | Key Needs |
|---------|-------------|-----------|
| **Privacy-Conscious Individual** | Everyday user who values privacy | Easy-to-use encrypted messaging, seamless multi-device |
| **Remote Team** | Small to mid-size teams | Secure group chats, file sharing, voice/video calls |
| **Enterprise / Regulated Industry** | Healthcare, legal, finance | Audit logging, GDPR compliance, data export, admin controls |
| **Developer / Open-Source Advocate** | Technically literate user | Transparent encryption, open protocol, self-hostable |

---

## 4. Product Requirements

### 4.1 Authentication & Account Management

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| AUTH-01 | User registration with username/password | ✅ Done | P0 |
| AUTH-02 | Strong password enforcement (uppercase, lowercase, number, special char) | ✅ Done | P0 |
| AUTH-03 | JWT dual-token auth (15-min session + 7-day refresh) | ✅ Done | P0 |
| AUTH-04 | Multi-device support (up to 5 devices) | ✅ Done | P0 |
| AUTH-05 | Device management (list, remove, force-login) | ✅ Done | P0 |
| AUTH-06 | Session management with per-device rotation | ✅ Done | P0 |
| AUTH-07 | Logout (single session & all devices) | ✅ Done | P0 |
| AUTH-08 | Password change with session invalidation | ✅ Done | P0 |
| AUTH-09 | Rate limiting on auth endpoints (5 login / 3 register per 15 min) | ✅ Done | P0 |
| AUTH-10 | Constant-time auth responses (prevents user enumeration) | ✅ Done | P0 |
| AUTH-11 | Two-Factor Authentication (TOTP) | ❌ Planned | P1 |
| AUTH-12 | Email verification on signup | ❌ Planned | P1 |

### 4.2 Messaging

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| MSG-01 | End-to-end encrypted 1:1 messaging | ✅ Done | P0 |
| MSG-02 | End-to-end encrypted group messaging (Sender Key protocol) | ✅ Done | P0 |
| MSG-03 | Message types: text, image, file, audio, video, location, contact, poll | ✅ Done | P0 |
| MSG-04 | Message statuses: sent → delivered → read | ✅ Done | P0 |
| MSG-05 | Read receipts (configurable per user) | ✅ Done | P0 |
| MSG-06 | Typing indicators (real-time) | ✅ Done | P0 |
| MSG-07 | Message editing (own messages) | ✅ Done | P0 |
| MSG-08 | Message deletion (for me / for everyone, soft-delete) | ✅ Done | P0 |
| MSG-09 | Reply to messages | ✅ Done | P0 |
| MSG-10 | Message reactions (emoji) | ✅ Done | P0 |
| MSG-11 | Message forwarding | ✅ Done | P0 |
| MSG-12 | Starred/bookmarked messages | ✅ Done | P1 |
| MSG-13 | Self-destructing messages (expires_at TTL) | ✅ Done | P1 |
| MSG-14 | Message search (full-text) | ✅ Done | P1 |
| MSG-15 | Cursor-based pagination (infinite scroll) | ✅ Done | P0 |
| MSG-16 | Idempotent message sends (X-Idempotency-Key) | ✅ Done | P0 |
| MSG-17 | Draft persistence per conversation | ✅ Done | P1 |
| MSG-18 | Optimistic message rendering | ✅ Done | P0 |
| MSG-19 | Conversation pinning, muting, archiving | ✅ Done | P1 |
| MSG-20 | Clear chat history | ✅ Done | P1 |
| MSG-21 | Unread count badges | ✅ Done | P0 |

### 4.3 Group Chats

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| GRP-01 | Group creation with up to 32 members | ✅ Done | P0 |
| GRP-02 | Group name, description, avatar | ✅ Done | P0 |
| GRP-03 | Role-based access: admin, moderator, member | ✅ Done | P0 |
| GRP-04 | Admin-only operations (edit group, add/remove/kick members) | ✅ Done | P0 |
| GRP-05 | Role promotion/demotion | ✅ Done | P0 |
| GRP-06 | Leave group (self-removal) | ✅ Done | P0 |
| GRP-07 | Group deletion (admin, cascading) | ✅ Done | P0 |
| GRP-08 | Group E2EE via Sender Key distribution | ✅ Done | P0 |
| GRP-09 | Sender key rotation on member changes | ✅ Done | P0 |
| GRP-10 | Group member limit enforcement (max 256 configurable) | ✅ Done | P0 |

### 4.4 Voice & Video Calls

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| CALL-01 | 1:1 audio calls via WebRTC | ✅ Done | P0 |
| CALL-02 | 1:1 video calls via WebRTC | ✅ Done | P0 |
| CALL-03 | Call lifecycle: initiate → ring → answer → connect → end | ✅ Done | P0 |
| CALL-04 | Call decline & missed call tracking | ✅ Done | P0 |
| CALL-05 | 30-second ring timeout | ✅ Done | P0 |
| CALL-06 | 1-hour max call duration | ✅ Done | P0 |
| CALL-07 | In-call controls: mute/unmute, camera on/off, switch camera | ✅ Done | P0 |
| CALL-08 | Picture-in-Picture (PiP) mode | ✅ Done | P1 |
| CALL-09 | Connection quality monitoring (latency, packet loss, bitrate, jitter) | ✅ Done | P1 |
| CALL-10 | Quality indicator (excellent/good/poor) | ✅ Done | P1 |
| CALL-11 | Auto-reconnect on connection loss (3 attempts) | ✅ Done | P0 |
| CALL-12 | Mid-call renegotiation (media changes) | ✅ Done | P0 |
| CALL-13 | Busy detection (prevent double calls) | ✅ Done | P0 |
| CALL-14 | Call history with duration, type, status | ✅ Done | P0 |
| CALL-15 | STUN/TURN server configuration | ✅ Done | P0 |
| CALL-16 | Call quality metrics persisted to DB | ✅ Done | P1 |
| CALL-17 | Disconnect grace period (10s) before auto-end | ✅ Done | P0 |
| CALL-18 | Multi-device incoming call notification | ✅ Done | P0 |

### 4.5 End-to-End Encryption

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| E2E-01 | ECDH P-256 key pair generation per user | ✅ Done | P0 |
| E2E-02 | AES-256-GCM message encryption with per-message IV | ✅ Done | P0 |
| E2E-03 | HKDF-SHA256 key derivation | ✅ Done | P0 |
| E2E-04 | Signal Protocol key bundles (identity, signed pre-key, one-time pre-keys) | ✅ Done | P0 |
| E2E-05 | Atomic one-time pre-key consumption (race-condition safe) | ✅ Done | P0 |
| E2E-06 | Pre-key replenishment & low-pool warnings | ✅ Done | P0 |
| E2E-07 | Encrypted key backup (PBKDF2, 100k iterations) | ✅ Done | P0 |
| E2E-08 | Multi-device key sync via encrypted server backup | ✅ Done | P0 |
| E2E-09 | Forward secrecy via epoch-based key rotation | ✅ Done | P0 |
| E2E-10 | Message key archiving for historical decryption | ✅ Done | P0 |
| E2E-11 | Double Ratchet state sync across devices | ✅ Done | P0 |
| E2E-12 | Group E2EE via Sender Key protocol | ✅ Done | P0 |
| E2E-13 | Safety number generation (SHA-256 fingerprint) | ✅ Done | P1 |
| E2E-14 | Zero-knowledge server (never sees plaintext) | ✅ Done | P0 |

### 4.6 File Sharing

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| FILE-01 | File upload (50MB max, multipart/form-data) | ✅ Done | P0 |
| FILE-02 | MIME type whitelist & dangerous extension blocking | ✅ Done | P0 |
| FILE-03 | Auto-thumbnail generation (200×200 JPEG) for images | ✅ Done | P1 |
| FILE-04 | Image compression for files >1MB | ✅ Done | P1 |
| FILE-05 | SHA-256 content hashing for integrity | ✅ Done | P0 |
| FILE-06 | ETag-based caching (304 Not Modified) | ✅ Done | P1 |
| FILE-07 | Conversation membership verification for downloads | ✅ Done | P0 |
| FILE-08 | Conversation file listing (paginated) | ✅ Done | P1 |
| FILE-09 | Soft delete support | ✅ Done | P0 |
| FILE-10 | Rate limiting on uploads | ✅ Done | P0 |

### 4.7 Polls

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| POLL-01 | Create polls within conversations (2-10 options) | ✅ Done | P1 |
| POLL-02 | Single and multi-vote polls | ✅ Done | P1 |
| POLL-03 | Anonymous polls | ✅ Done | P1 |
| POLL-04 | Poll expiration (optional time limit) | ✅ Done | P1 |
| POLL-05 | Vote toggling (change vote) | ✅ Done | P1 |

### 4.8 User Features

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| USR-01 | Profile management (display name, bio, avatar) | ✅ Done | P0 |
| USR-02 | Avatar upload via file API | ✅ Done | P0 |
| USR-03 | User search (case-insensitive, by username/display name) | ✅ Done | P0 |
| USR-04 | Contact list with nicknames | ✅ Done | P0 |
| USR-05 | User blocking/unblocking | ✅ Done | P0 |
| USR-06 | Privacy settings (last seen, online status, read receipts, proximity) | ✅ Done | P0 |
| USR-07 | Online/offline presence (real-time via WebSocket) | ✅ Done | P0 |
| USR-08 | Last seen tracking | ✅ Done | P0 |

### 4.9 Administration

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| ADM-01 | Admin dashboard with platform statistics | ✅ Done | P1 |
| ADM-02 | User management (search, view, force-logout) | ✅ Done | P1 |
| ADM-03 | Content moderation (reports: spam, harassment, hate speech, etc.) | ✅ Done | P1 |
| ADM-04 | Report resolution workflow (reviewed → resolved → dismissed) | ✅ Done | P1 |
| ADM-05 | Audit log viewing (filterable by user/action) | ✅ Done | P1 |
| ADM-06 | Admin authentication via ADMIN_USERNAMES env var | ✅ Done | P1 |

### 4.10 Compliance & Data Privacy

| ID | Requirement | Status | Priority |
|----|-------------|--------|----------|
| GDPR-01 | Full data export (GDPR Article 20) | ✅ Done | P0 |
| GDPR-02 | Account deletion (GDPR Article 17, cascading, with confirmation) | ✅ Done | P0 |
| GDPR-03 | Audit logging for all sensitive operations | ✅ Done | P0 |
| GDPR-04 | No plaintext content stored on server | ✅ Done | P0 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric | Target | Status |
|--------|--------|--------|
| API latency (p99) | < 200ms | ✅ Tracked |
| WebSocket message delivery | < 100ms | ✅ Tracked |
| Message send success rate | > 99.99% | ✅ Tracked |
| Error rate | < 0.1% | ✅ Tracked |
| Concurrent WebSocket connections | 10,000+ | 🔄 Planned |

### 5.2 Security

- End-to-end encryption (AES-256-GCM + ECDH P-256 + HKDF-SHA256)
- Forward secrecy via epoch-based ratcheting
- Zero-knowledge architecture
- Strict CSP headers via Helmet
- CORS enforcement (no wildcard in production)
- Rate limiting on all endpoints
- Constant-time auth responses (prevents enumeration)
- HSTS with preload
- No-cache headers on API responses
- bcrypt password hashing (12 rounds)
- JWT never transmitted via query parameters

### 5.3 Reliability

- Circuit breaker pattern for external service calls
- Exponential backoff retry logic
- Idempotency keys for message sends
- Graceful shutdown with connection draining
- Database connection pooling
- WebSocket auto-reconnect with exponential backoff (15 attempts max)
- Redis session cache with DB fallback

### 5.4 Observability

- Structured JSON logging (Pino) with correlation IDs
- Prometheus metrics endpoint (`/metrics`)
- Health check endpoints (simple, live, ready, deep)
- Grafana dashboards
- Alert rules for critical thresholds
- 50+ audit action types
- Request ID tracking

### 5.5 Scalability

| Component | Small (10K users) | Medium (100K) | Large (1M) |
|-----------|-------------------|---------------|------------|
| Compute | $150–300/mo | $600–1,200/mo | $3,000–6,000/mo |
| Database | $100–200/mo | $400–800/mo | $2,000–4,000/mo |
| Redis | $50–100/mo | $200–400/mo | $800–1,600/mo |
| Total | $410–840/mo | $1,650–3,700/mo | $8,000–20,100/mo |

---

## 6. Technical Constraints

- **Backend:** Node.js + Express + TypeScript + Prisma + PostgreSQL + Redis + Socket.IO
- **Frontend:** Next.js 14 + React 18 + TypeScript + Zustand + Tailwind CSS
- **Encryption:** Web Crypto API (ECDH P-256, AES-256-GCM, HKDF-SHA256, PBKDF2)
- **Real-time:** WebSocket-only transport (no HTTP long-polling for security)
- **Calls:** WebRTC with STUN/TURN (configurable)
- **PWA:** Service Worker with network-first HTML, cache-first static assets
- **Deployment:** Docker Compose (dev + prod), Kubernetes manifests available

---

## 7. Future Roadmap

| Feature | Priority | Timeline |
|---------|----------|----------|
| Two-Factor Authentication (TOTP) | P1 | Weeks 5–10 |
| Email verification on signup | P1 | Weeks 5–10 |
| Redis pub/sub for WebSocket horizontal scaling | P1 | Weeks 5–10 |
| Message queue (Redis Streams) for async processing | P1 | Weeks 5–10 |
| CDN integration for media files | P1 | Weeks 5–10 |
| Database read replicas | P1 | Weeks 5–10 |
| Kubernetes multi-region deployment | P2 | Weeks 11–18 |
| Admin panel UI | P2 | Weeks 11–18 |
| Webhook/Bot API framework | P2 | Weeks 11–18 |
| Desktop app (Electron) | P2 | Weeks 11–18 |
| Push notification delivery tracking | P2 | Weeks 11–18 |
| Group video calls | P2 | Weeks 11–18 |

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Uptime | 99.9% (8.7h downtime/year) |
| API Latency (p99) | < 200ms |
| WebSocket Delivery | < 100ms |
| Error Rate | < 0.1% |
| Message Send Success | > 99.99% |
| User Retention (30-day) | > 60% |
| Encryption Coverage | 100% of messages |

---

*This PRD is a living document and will be updated as the product evolves.*
