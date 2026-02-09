# Architecture
## Zynk – Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. Architecture Overview

Zynk follows a microservices architecture with clear service boundaries, event-driven communication, and polyglot persistence. The system prioritizes security, scalability, and maintainability.

### 1.1 Architectural Principles

1. **Separation of Concerns** - Single responsibility per service
2. **Loose Coupling** - API and message queue communication
3. **Security by Design** - E2EE, zero-knowledge architecture
4. **Observability** - Comprehensive logging, metrics, tracing
5. **Resilience** - Graceful degradation, circuit breakers

---

## 2. Architecture Layers

```
CLIENT LAYER
├── Flutter Mobile (Android/iOS)
└── Next.js Web App

EDGE LAYER
└── Cloudflare (CDN, WAF, DDoS Protection)

GATEWAY LAYER
└── Kong API Gateway (Routing, Auth, Rate Limiting)

APPLICATION LAYER
├── Express.js Services (Auth, Messaging, Calls, Files, Groups, Presence, Proximity, Notifications)
└── Go Services (Blockchain Identity, Audit, Node)

DATA LAYER
├── PostgreSQL (Relational data)
├── Redis (Cache, sessions, presence)
├── Kafka (Message queue)
├── S3 (File storage)
└── LevelDB (Blockchain data)
```

---

## 3. Client Architecture

### 3.1 Flutter Mobile App

**Architecture Pattern:** Clean Architecture + BLoC

**Layers:**
1. **Presentation** - Screens, widgets, dialogs
2. **State Management** - BLoC components
3. **Domain** - Use cases, entities, repository interfaces
4. **Data** - API client, local database, WebSocket, encryption

**Key Features:**
- Platform-adaptive UI (Material/Cupertino)
- Encrypted local storage (SQLCipher)
- Background message sync
- Push notification handling
- WebRTC for calls

### 3.2 Next.js Web App

**Architecture Pattern:** App Router + Server/Client Components

**Structure:**
1. **Server Components** - Landing pages, static content
2. **Client Components** - Interactive features
3. **API Routes** - Backend-for-Frontend pattern
4. **State Management** - Zustand (client), React Query (server state)

**Key Features:**
- Server-Side Rendering for SEO
- Progressive Web App
- IndexedDB for encrypted storage
- Service Worker for offline support

---

## 4. Backend Services Architecture

### 4.1 Express.js Services

**Service Structure:**
```
service-name/
├── src/
│   ├── controllers/     # Route handlers
│   ├── services/        # Business logic
│   ├── models/          # Data models
│   ├── middleware/      # Auth, validation
│   └── config/          # Configuration
├── tests/
└── Dockerfile
```

**Core Services:**
- Auth Service - Registration, login, device management
- Messaging Service - WebSocket messaging, delivery
- Call Service - WebRTC signaling
- File Service - Upload/download, lifecycle
- Group Service - Group management
- Presence Service - Online status, typing indicators
- Notification Service - Push notifications

### 4.2 Go Blockchain Services

**Service Structure:**
```
blockchain-service/
├── cmd/server/          # Entry point
├── internal/
│   ├── blockchain/      # Blockchain logic
│   ├── api/             # HTTP handlers
│   └── storage/         # Data persistence
└── pkg/                 # Shared utilities
```

**Services:**
- Identity Service - DID registration, verification
- Audit Service - Message hash anchoring, Merkle trees
- Blockchain Node - Custom PoS/BFT consensus

---

## 5. Service Communication

### 5.1 Synchronous (REST APIs)

**Use Cases:**
- Client to backend (auth, file upload)
- Service-to-service queries (immediate response needed)

**Protocol:** HTTP/JSON with JWT authentication

### 5.2 Asynchronous (Kafka)

**Use Cases:**
- Event streaming (message sent, file uploaded)
- Decoupled processing (notifications, analytics)
- Audit logging

**Topics:**
- messages.sent
- messages.delivered
- calls.initiated
- files.uploaded
- users.registered

### 5.3 Real-time (WebSocket)

**Use Cases:**
- Message delivery
- Typing indicators
- Presence updates
- Call signaling

**Protocol:** Socket.io with authentication

---

## 6. Data Architecture

### 6.1 Database Design

**PostgreSQL Schema:**
- Users, devices, sessions
- Conversations, messages, participants
- Groups, members
- Files, calls
- Blockchain metadata

**Optimization:**
- Messages table partitioned by month
- Covering indexes for frequent queries
- Partial indexes for specific conditions

### 6.2 Caching Strategy

**Three-Layer Cache:**
1. **Application Cache** - In-memory (< 1 minute TTL)
2. **Redis Cache** - Distributed (1 hour - 1 day TTL)
3. **CDN Cache** - Static assets (1 year TTL)

**Cache Invalidation:**
- Write-through for critical data
- TTL-based for non-critical data
- Event-based (Kafka) for related data

### 6.3 Event Streaming

**Kafka Architecture:**
- Producers: All backend services
- Consumers: Notification, Analytics, Audit
- Partitioning: By user_id for ordered delivery
- Retention: 7 days

---

## 7. Security Architecture

### 7.1 Defense in Depth

**Layer 1 - Edge (Cloudflare):**
- DDoS protection
- Web Application Firewall (WAF)
- Rate limiting

**Layer 2 - Gateway (Kong):**
- API authentication (JWT)
- Per-user rate limiting
- Request validation

**Layer 3 - Application:**
- Authorization (role-based)
- Input validation
- Output encoding

**Layer 4 - Data:**
- Encryption at rest
- Row-level security
- Audit logging

**Layer 5 - Transport:**
- TLS 1.3
- Certificate pinning (mobile)

### 7.2 Zero-Knowledge Architecture

**Server Never Sees:**
- Message content (encrypted client-side)
- File content (encrypted before upload)
- Call content (peer-to-peer WebRTC)

**Server Only Knows:**
- User exists (username, ID)
- Message metadata (sender, recipient, timestamp)
- File metadata (size, type, owner)

---

## 8. Deployment Architecture

### 8.1 Kubernetes Deployment

**Namespace Strategy:**
- Separate namespaces per environment (dev, staging, prod)
- Service isolation

**Scaling:**
- Horizontal Pod Autoscaler (HPA) based on CPU/memory
- Minimum 3 replicas per service for HA

**Health Checks:**
- Liveness probes (service running)
- Readiness probes (ready to receive traffic)

### 8.2 Multi-Region Architecture

**Regions:**
- Primary: US-East (Virginia)
- Secondary: EU-West (Ireland)
- Secondary: Asia-Pacific (Singapore)

**Routing:**
- GeoDNS routes to nearest region
- Database writes to primary
- Reads from local replicas
- Cross-region replication for DR

---

## 9. Blockchain Architecture

### 9.1 Components

1. **Identity Service (Go)** - DID management
2. **Audit Service (Go)** - Hash anchoring with Merkle trees
3. **Blockchain Node (Go)** - Custom PoS/BFT blockchain
4. **API Gateway (Express.js)** - Proxy to blockchain services

### 9.2 Consensus

**Proof of Stake (PoS):**
- Validators stake tokens
- Weighted random selection
- Energy efficient

### 9.3 Storage

- LevelDB for blockchain data (blocks, transactions, state)
- PostgreSQL for metadata cache
- Redis for pending transactions

---

## 10. Observability Architecture

### 10.1 Metrics (Prometheus + Grafana)

**Measurements:**
- Service health (uptime, latency, errors)
- Business metrics (messages sent, calls made)
- Infrastructure (CPU, memory, disk)

### 10.2 Logging (Loki)

**Log Structure:**
- JSON format
- Timestamp, service, level, trace_id
- Centralized collection
- 30-day retention

### 10.3 Tracing (Jaeger)

**Distributed Tracing:**
- Request flow across services
- Latency breakdown
- Error tracking

---

## 11. Architectural Patterns

### 11.1 Circuit Breaker

- Monitor failure rate
- Open circuit after threshold
- Fail fast during open state
- Periodic recovery attempts

### 11.2 Event Sourcing

- Store events instead of current state
- Replay events to rebuild state
- Immutable event log
- Used for audit logging, message history

### 11.3 CQRS

- Write operations to primary database
- Read operations from replicas/cache
- Optimize reads and writes independently
- Scale separately

---

## 12. Scalability Design

### 12.1 Horizontal Scaling

**Stateless Services:**
- All services designed stateless
- Add/remove instances dynamically
- Session data in Redis

**Database Scaling:**
- Read replicas (3 per region)
- Connection pooling
- Table partitioning

### 12.2 Load Distribution

- Consistent hashing for user assignment
- Sticky sessions for WebSocket
- Load balancing across instances

---

## 13. Future Architecture Evolution

### Phase 1 (Current)
- REST APIs
- WebSocket messaging
- Single region

### Phase 2 (6-12 months)
- gRPC for inter-service communication
- Multi-region active-active
- GraphQL for complex queries

### Phase 3 (12-24 months)
- Service mesh (Istio)
- Edge computing (Cloudflare Workers)
- Multi-cloud deployment

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Architecture Teams  
Review Cycle: Quarterly
