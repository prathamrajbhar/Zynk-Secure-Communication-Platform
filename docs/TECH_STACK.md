# Zynk — Technology Stack

**Last Updated:** February 12, 2026

---

## Backend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | 18+ | JavaScript runtime |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Framework** | Express.js | 4.x | HTTP API server |
| **Real-time** | Socket.IO | 4.x | WebSocket communication |
| **ORM** | Prisma | 6.x | Type-safe database queries |
| **Database** | PostgreSQL | 16 | Primary data store (22 models) |
| **Cache/Store** | Redis | 7 | Sessions, call state, locks, caching |
| **Auth** | jsonwebtoken | — | JWT session + refresh tokens |
| **Password** | bcrypt | — | Password hashing (12 rounds) |
| **Validation** | Zod | — | Schema validation on all endpoints |
| **Image Processing** | Sharp | — | Thumbnails, compression |
| **File Upload** | Multer | — | Multipart form handling |
| **Security** | Helmet | — | HTTP security headers |
| **Compression** | compression | — | Gzip/Brotli (60-80% reduction) |
| **Logging** | Pino | — | Structured JSON logging |
| **Metrics** | prom-client | — | Prometheus metrics |
| **Redis Client** | ioredis | — | Advanced Redis operations |
| **Rate Limiting** | express-rate-limit | — | Per-IP/user rate control |
| **CORS** | cors | — | Cross-origin request handling |

## Frontend

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Framework** | Next.js | 14 | React meta-framework (App Router) |
| **Library** | React | 18 | UI component library |
| **Language** | TypeScript | — | Type-safe development |
| **State** | Zustand | — | Lightweight state management (8 stores) |
| **Styling** | Tailwind CSS | — | Utility-first CSS framework |
| **CSS Utilities** | clsx, tailwind-merge, CVA | — | Class merging, variants |
| **HTTP Client** | Axios | — | API communication |
| **Real-time** | socket.io-client | — | WebSocket client |
| **Icons** | Lucide React | — | Icon library |
| **Emoji** | Emoji Mart | — | Emoji picker |
| **GIFs** | Giphy SDK | — | GIF search and sharing |
| **Dates** | date-fns | — | Date formatting/manipulation |
| **Search** | Fuse.js | — | Client-side fuzzy search |
| **Encryption** | Web Crypto API | — | Native browser cryptography |

## Encryption Stack

| Algorithm | Spec | Purpose |
|-----------|------|---------|
| **ECDH** | P-256 (NIST) | Key agreement (Diffie-Hellman) |
| **AES-256-GCM** | NIST SP 800-38D | Message encryption (authenticated) |
| **HKDF** | SHA-256 (RFC 5869) | Key derivation from shared secret |
| **PBKDF2** | SHA-256, 100k iterations | Password-based key backup encryption |
| **SHA-256** | FIPS 180-4 | Content hashing, safety numbers |
| **Signal Protocol** | Custom implementation | Key bundles, pre-keys, ratcheting |
| **Sender Key** | Custom implementation | Group E2EE (per-member distribution) |

## Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Reverse Proxy** | Nginx | SSL termination, load balancing, WebSocket |
| **Containerization** | Docker | Application packaging |
| **Orchestration** | Docker Compose | Multi-container deployment |
| **Orchestration** | Kubernetes | Production orchestration (manifests) |
| **Monitoring** | Prometheus | Metrics collection & alerting |
| **Dashboards** | Grafana | Visualization & dashboards |
| **Push** | Firebase Cloud Messaging | Push notifications via FCM HTTP API |
| **CI/CD** | GitHub Actions | Automated lint → test → build → deploy |

## Testing

| Tool | Type | Purpose |
|------|------|---------|
| **Jest** | Unit/Integration | Server-side test runner |
| **ts-jest** | Integration | TypeScript support for Jest |
| **Supertest** | Integration | HTTP endpoint testing |
| **Playwright** | E2E | Browser automation testing |
| **k6** | Load | Performance/load testing |

## Development Tools

| Tool | Purpose |
|------|---------|
| **tsx** | TypeScript execution with hot reload |
| **Prisma Studio** | Database GUI |
| **pino-pretty** | Human-readable log output (dev) |
| **Morgan** | HTTP access logging (dev) |
| **ESLint** | Code linting |
| **PostCSS** | CSS processing |

---

## Architecture Patterns

| Pattern | Implementation | Where Used |
|---------|---------------|-----------|
| **Circuit Breaker** | 3-state (closed/open/half-open) | External service calls |
| **Retry with Backoff** | Exponential + jitter | Network failures |
| **Idempotency Keys** | Redis lock + 24h response cache | Message sends |
| **Two-Tier Cache** | L1 in-memory LRU + L2 Redis | User profiles, keys, sessions |
| **CQRS-lite** | Optimized read queries | Conversation list (batched, no N+1) |
| **Audit Trail** | Dual-write (log + DB) | All sensitive operations |
| **Graceful Degradation** | Redis fallback to DB | Session validation |
| **Optimistic Updates** | Render before ACK | Message sending |
| **Cursor Pagination** | Before-cursor with limits | Messages, files, call history |
| **Soft Delete** | `deleted_at` timestamp | Messages, files |

---

## Ports & Endpoints

| Service | Default Port | Purpose |
|---------|-------------|---------|
| Server API | 8000 | REST API + WebSocket |
| Web Frontend | 3000 | Next.js application |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & state |
| Prometheus | 9090 | Metrics |
| Grafana | 3001 | Dashboards |
| Nginx | 80/443 | Reverse proxy (prod) |

---

## Environment Variables

### Server (Critical)

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | JWT signing secret (≥32 chars in prod) | Yes |
| `REFRESH_TOKEN_SECRET` | Refresh token secret (≥32 chars in prod) | Yes |
| `CORS_ORIGINS` | Comma-separated allowed origins | Yes |
| `NODE_ENV` | `development` / `production` / `test` | Yes |
| `PORT` | Server port (default: 8000) | No |
| `ADMIN_USERNAMES` | Comma-separated admin usernames | No |
| `FCM_SERVER_KEY` | Firebase Cloud Messaging key | No |
| `STUN_URLS` | STUN server URLs | No |
| `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` | TURN server config | No |

---

## Data Model Summary

**22 PostgreSQL models** across 6 domains:

| Domain | Models | Count |
|--------|--------|-------|
| **Users** | User, UserProfile, Device, Session, Contact | 5 |
| **Messaging** | Conversation, ConversationParticipant, Messages, MessageDeletedFor | 4 |
| **Groups** | Group, GroupMember | 2 |
| **E2EE Keys** | IdentityKey, SignedPreKey, PreKey, GroupSenderKey, KeyBackup, MessageKeyArchive, RatchetState | 7 |
| **Features** | File, Poll, PollOption, PollVote | 4 |
| **Calls** | Call, CallParticipant | 2 |

**8 Enums:** Platform, ConversationType, EncryptionType, MessageType, MessageStatus, ParticipantRole, CallType, CallStatus, CallAction, CallEndReason
