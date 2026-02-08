# Architecture
## Zynk — Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. Architecture Overview

Zynk follows a **microservices architecture** with clear service boundaries, event-driven communication, and polyglot persistence. The architecture prioritizes security, scalability, and maintainability while delivering low-latency real-time communication.

### 1.1 Architectural Principles

1. **Separation of Concerns:** Each service has a single, well-defined responsibility
2. **Loose Coupling:** Services communicate via APIs and message queues
3. **High Cohesion:** Related functionality grouped within services
4. **API-First Design:** All services expose well-documented REST/WebSocket APIs
5. **Event-Driven:** Asynchronous communication for non-blocking operations
6. **Security by Design:** E2EE, zero-knowledge architecture, minimal trust
7. **Observability:** Comprehensive logging, metrics, and tracing
8. **Resilience:** Graceful degradation, circuit breakers, retries

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                   CLIENT LAYER (Presentation)                    │
│           Flutter Mobile Apps  +  Next.js Web App                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EDGE LAYER (CDN + Security)                 │
│              Cloudflare (CDN, WAF, DDoS Protection)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GATEWAY LAYER (Routing + Auth)                 │
│            Kong API Gateway  +  Load Balancer (ALB)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              APPLICATION LAYER (Business Logic)                  │
│      Microservices: Auth, Messaging, Call, File, Group...       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                DATA LAYER (Persistence + Cache)                  │
│         PostgreSQL  +  Redis  +  Kafka  +  S3                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Microservices Architecture

### 3.1 Service Catalog

| Service | Responsibility | Technology | Port | Database |
|---------|----------------|------------|------|----------|
| **Auth Service** | Authentication, authorization, device management | Go | 8001 | PostgreSQL, Redis |
| **Messaging Service** | Message routing, storage, delivery | Go + Node.js | 8002 | PostgreSQL, Redis, Kafka |
| **Call Service** | WebRTC signaling, call management | Node.js | 8003 | Redis, PostgreSQL |
| **File Service** | File upload, download, lifecycle | Go | 8004 | PostgreSQL, S3 |
| **Group Service** | Group management, membership | Go | 8005 | PostgreSQL, Redis |
| **Presence Service** | Online status, typing indicators | Go | 8006 | Redis |
| **Proximity Service** | Location-based discovery | Go | 8007 | Redis, PostgreSQL |
| **Notification Service** | Push notifications | Go | 8008 | PostgreSQL, Kafka |
| **Search Service** | Full-text search | Go | 8009 | PostgreSQL, Elasticsearch |
| **Analytics Service** | Usage metrics, reporting | Go | 8010 | TimescaleDB |

### 3.2 Service Communication Patterns

**Synchronous Communication:**
- REST APIs for request/response operations
- gRPC for inter-service communication (future optimization)

**Asynchronous Communication:**
- Kafka for event streaming
- Redis Pub/Sub for real-time events

**Communication Matrix:**
```
┌─────────────────┬─────────────────────────────────────────────┐
│  Service        │  Communicates With                          │
├─────────────────┼─────────────────────────────────────────────┤
│ Auth            │ → All services (JWT validation)             │
│ Messaging       │ → Notification (Kafka), Presence (Redis)    │
│ Call            │ → Notification (Kafka), Presence (Redis)    │
│ File            │ → Messaging (REST), S3 (Direct)             │
│ Group           │ → Messaging (REST), Auth (REST)             │
│ Notification    │ → FCM/APNs (HTTP), Kafka (Consumer)         │
└─────────────────┴─────────────────────────────────────────────┘
```

---

## 4. Client Architecture

### 4.1 Flutter Mobile App Architecture

**Architecture Pattern:** Clean Architecture + BLoC

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Pages (Screens)                                       │    │
│  │  - ChatListPage, ChatPage, CallPage, SettingsPage...  │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Widgets (Reusable Components)                         │    │
│  │  - MessageBubble, ContactTile, CallControls...         │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  BLoCs (Business Logic Components)                     │    │
│  │  - AuthBloc, MessagingBloc, CallBloc, ContactsBloc... │    │
│  │  Events → BLoC Logic → States                          │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DOMAIN LAYER                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Use Cases (Business Logic)                            │    │
│  │  - SendMessage, InitiateCall, UploadFile...           │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Entities (Core Models)                                │    │
│  │  - User, Message, Call, Group, File...                │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Repository Interfaces (Contracts)                     │    │
│  │  - IMessageRepository, IAuthRepository...              │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Repository Implementations                            │    │
│  │  - MessageRepository, AuthRepository...                │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│           ┌───────────────┼───────────────┐                     │
│           ▼               ▼               ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │  API Client  │ │  Local DB    │ │  WebSocket   │           │
│  │   (Dio)      │ │ (SQLCipher)  │ │   Client     │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │   WebRTC     │ │  Encryption  │ │ Notification │           │
│  │   Service    │ │  (libsodium) │ │   Service    │           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

**Key Flutter Architectural Decisions:**

**1. BLoC Pattern (Business Logic Component):**
```dart
// Example: MessagingBloc
class MessagingBloc extends Bloc<MessagingEvent, MessagingState> {
  final SendMessageUseCase _sendMessage;
  final GetMessagesUseCase _getMessages;
  
  MessagingBloc(this._sendMessage, this._getMessages) 
    : super(MessagingInitial()) {
    
    on<SendMessageEvent>((event, emit) async {
      emit(SendingMessage());
      final result = await _sendMessage(event.message);
      result.fold(
        (failure) => emit(MessageSendFailed(failure)),
        (success) => emit(MessageSent(success)),
      );
    });
    
    on<GetMessagesEvent>((event, emit) async {
      emit(LoadingMessages());
      final result = await _getMessages(event.conversationId);
      result.fold(
        (failure) => emit(MessagesLoadFailed(failure)),
        (messages) => emit(MessagesLoaded(messages)),
      );
    });
  }
}
```

**2. Dependency Injection with GetIt:**
```dart
final sl = GetIt.instance; // Service Locator

void initDependencies() {
  // BLoCs
  sl.registerFactory(() => AuthBloc(sl(), sl()));
  sl.registerFactory(() => MessagingBloc(sl(), sl()));
  
  // Use Cases
  sl.registerLazySingleton(() => SendMessageUseCase(sl()));
  sl.registerLazySingleton(() => LoginUseCase(sl()));
  
  // Repositories
  sl.registerLazySingleton<IMessageRepository>(
    () => MessageRepository(sl(), sl())
  );
  
  // Data Sources
  sl.registerLazySingleton(() => ApiClient());
  sl.registerLazySingleton(() => LocalDatabase());
}
```

**3. Clean Architecture Layers:**
- **Presentation:** UI components, state management (BLoC)
- **Domain:** Business logic, entities, repository interfaces
- **Data:** Repository implementations, data sources (API, local DB)

**Benefits:**
- Testability: Each layer can be tested independently
- Maintainability: Clear separation of concerns
- Scalability: Easy to add new features
- Platform-agnostic domain layer

### 4.2 Next.js Web App Architecture

**Architecture Pattern:** Next.js App Router + Server Components

```
┌─────────────────────────────────────────────────────────────────┐
│                       NEXT.JS APP ROUTER                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  App Directory Structure                               │    │
│  │  app/                                                  │    │
│  │    ├── (auth)/                                         │    │
│  │    │   ├── login/page.tsx                              │    │
│  │    │   └── register/page.tsx                           │    │
│  │    ├── (dashboard)/                                    │    │
│  │    │   ├── layout.tsx                                  │    │
│  │    │   ├── messages/page.tsx                           │    │
│  │    │   ├── calls/page.tsx                              │    │
│  │    │   └── settings/page.tsx                           │    │
│  │    ├── api/                                            │    │
│  │    │   ├── auth/route.ts                               │    │
│  │    │   └── messages/route.ts                           │    │
│  │    └── layout.tsx (root)                               │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                │                ▼
┌───────────────────┐      │      ┌───────────────────┐
│ Server Components │      │      │ Client Components │
│   (Default RSC)   │      │      │  ('use client')   │
│  - Static pages   │      │      │  - Interactive    │
│  - Data fetching  │      │      │  - State mgmt     │
│  - No JS shipped  │      │      │  - WebSocket      │
└───────────────────┘      │      └───────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STATE MANAGEMENT LAYER                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Zustand    │  │ React Query  │  │    Context   │         │
│  │  (Client)    │  │(Server State)│  │ (Auth/Theme) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVICES LAYER                             │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  API Client  │  │  WebSocket   │  │   WebRTC     │         │
│  │   (Axios)    │  │ (Socket.io)  │  │   Service    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Encryption  │  │  IndexedDB   │  │Service Worker│         │
│  │  (libsignal) │  │  (Storage)   │  │    (PWA)     │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Key Next.js Architectural Decisions:**

**1. Server vs Client Components:**
```tsx
// Server Component (default) - No 'use client'
// Runs on server, no JS sent to client
async function ChatList() {
  const conversations = await fetchConversations(); // Server-side data fetch
  
  return (
    <div>
      {conversations.map(conv => (
        <ChatListItem key={conv.id} conversation={conv} />
      ))}
    </div>
  );
}

// Client Component - Interactive, stateful
'use client';
function ChatMessage({ message }) {
  const [isDecrypted, setIsDecrypted] = useState(false);
  
  useEffect(() => {
    decryptMessage(message.content).then(decrypted => {
      setIsDecrypted(true);
    });
  }, [message]);
  
  return <div>{isDecrypted ? message.content : 'Decrypting...'}</div>;
}
```

**2. API Routes (Backend-for-Frontend):**
```typescript
// app/api/auth/login/route.ts
export async function POST(request: Request) {
  const { username, password } = await request.json();
  
  // Call backend API
  const response = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  
  const data = await response.json();
  
  // Set secure HTTP-only cookie
  const cookieHeader = `session=${data.token}; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000; Path=/`;
  
  return NextResponse.json(data, {
    headers: { 'Set-Cookie': cookieHeader },
  });
}
```

**3. State Management:**
```typescript
// Zustand store for global client state
import create from 'zustand';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

// React Query for server state
function useChatMessages(conversationId: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId),
    staleTime: 30000, // 30 seconds
  });
}
```

---

## 5. Backend Service Architecture

### 5.1 Service Template (Go)

```
service-name/
├── cmd/
│   └── server/
│       └── main.go                 # Entry point
├── internal/
│   ├── api/
│   │   ├── handlers/               # HTTP handlers
│   │   ├── middleware/             # Auth, logging, etc.
│   │   └── routes.go               # Route definitions
│   ├── domain/
│   │   ├── entities/               # Domain models
│   │   └── repository/             # Repository interfaces
│   ├── service/                    # Business logic
│   ├── repository/                 # Repository implementations
│   └── config/                     # Configuration
├── pkg/                            # Public libraries
│   ├── crypto/                     # Encryption utilities
│   └── jwt/                        # JWT utilities
├── migrations/                     # Database migrations
├── Dockerfile
├── go.mod
└── go.sum
```

**Example Handler:**
```go
// internal/api/handlers/message_handler.go
package handlers

type MessageHandler struct {
    service service.MessageService
}

func (h *MessageHandler) SendMessage(c *gin.Context) {
    var req SendMessageRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": "Invalid request"})
        return
    }
    
    // Extract user from JWT
    userID := c.GetString("user_id")
    
    // Call service layer
    message, err := h.service.SendMessage(c.Request.Context(), userID, &req)
    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(201, message)
}
```

### 5.2 Service Template (Node.js)

```
service-name/
├── src/
│   ├── controllers/                # Route handlers
│   ├── services/                   # Business logic
│   ├── models/                     # Data models
│   ├── middleware/                 # Auth, validation
│   ├── config/                     # Configuration
│   ├── utils/                      # Utility functions
│   └── server.ts                   # Express/Socket.io setup
├── tests/
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 6. Data Architecture

### 6.1 Database Schema Design

**Design Principles:**
- Normalization for data integrity
- Partitioning for scalability (messages by month)
- Indexing for query performance
- Foreign keys for referential integrity

**Partitioning Strategy:**
```sql
-- Parent table
CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    encrypted_content BYTEA NOT NULL,
    created_at TIMESTAMP NOT NULL
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE messages_2026_01 PARTITION OF messages
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE messages_2026_02 PARTITION OF messages
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Auto-create future partitions with pg_partman
```

**Indexing Strategy:**
```sql
-- Covering index for message queries
CREATE INDEX idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC) 
INCLUDE (sender_id, message_type, status);

-- Index for user queries
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- Index for undelivered messages
CREATE INDEX idx_messages_undelivered 
ON messages(status, created_at) 
WHERE status = 'sent';
```

### 6.2 Caching Strategy

**Cache Layers:**

**L1 - Application Cache (In-Memory):**
- User sessions (Go map with TTL)
- Configuration values
- Short-lived (< 1 minute)

**L2 - Redis Cache:**
- User profiles (1-hour TTL)
- Online presence (60-second TTL)
- Group membership (10-minute TTL)
- API rate limits

**L3 - CDN Cache:**
- Static assets (1 year)
- User avatars (1 day)
- Public files (varies)

**Cache Invalidation:**
- Write-through: Update cache on write
- Time-based: TTL expiration
- Event-based: Invalidate on Kafka events

### 6.3 Event Streaming Architecture

**Kafka Topics:**

```
messages.sent               # New messages
messages.delivered          # Delivery confirmations
messages.read               # Read receipts
calls.initiated             # New calls
calls.ended                 # Call endings
files.uploaded              # New files
users.registered            # New users
groups.created              # New groups
```

**Producer Example (Go):**
```go
func (s *MessageService) SendMessage(ctx context.Context, msg *Message) error {
    // 1. Store in database
    if err := s.repo.Create(ctx, msg); err != nil {
        return err
    }
    
    // 2. Publish to Kafka
    event := Event{
        Type: "messages.sent",
        Payload: msg,
    }
    
    if err := s.kafka.Produce(ctx, "messages.sent", event); err != nil {
        log.Error("Failed to publish event", err)
        // Continue anyway - message is saved
    }
    
    return nil
}
```

**Consumer Example (Go):**
```go
func (s *NotificationService) ConsumeMessages(ctx context.Context) {
    for {
        msg, err := s.kafka.Consume(ctx, "messages.sent")
        if err != nil {
            log.Error("Kafka consume error", err)
            continue
        }
        
        // Check if recipient is offline
        if !s.presence.IsOnline(msg.RecipientID) {
            // Send push notification
            s.sendPushNotification(msg)
        }
    }
}
```

---

## 7. Security Architecture

### 7.1 Defense in Depth

```
Layer 1: Edge (Cloudflare)
         ├─ DDoS Protection
         ├─ WAF (SQL injection, XSS)
         └─ Rate Limiting

Layer 2: Gateway (Kong)
         ├─ API Authentication (JWT)
         ├─ Rate Limiting (per user)
         └─ Request Validation

Layer 3: Service (Application)
         ├─ Authorization (RBAC)
         ├─ Input Validation
         └─ Output Encoding

Layer 4: Data (Database)
         ├─ Encryption at Rest
         ├─ Row-Level Security
         └─ Audit Logging

Layer 5: Transport (TLS)
         ├─ TLS 1.3
         ├─ Certificate Pinning
         └─ HSTS
```

### 7.2 Zero-Knowledge Architecture

**Principle:** Server cannot access plaintext content

**Implementation:**
1. **Client-Side Encryption:** All content encrypted before leaving device
2. **Encrypted Storage:** Server stores only ciphertext
3. **Key Management:** Keys never sent to server
4. **Metadata Minimization:** Collect only essential metadata

**What Server Knows:**
- User exists (username, user_id)
- Message metadata (sender, recipient, timestamp)
- File metadata (size, type, upload time)

**What Server DOESN'T Know:**
- Message content
- File content
- User location (only temporary, not stored)
- Call content (media is P2P)

### 7.3 Threat Model

| Threat | Mitigation |
|--------|------------|
| Man-in-the-Middle | TLS 1.3, certificate pinning |
| Server Compromise | E2EE (server has no keys) |
| Client Compromise | Device-level encryption, biometric lock |
| Network Surveillance | E2EE, minimal metadata |
| Replay Attack | Message authentication, nonces |
| Account Takeover | Multi-factor auth (future), device trust |
| DDoS | Cloudflare protection, rate limiting |
| SQL Injection | Parameterized queries, input validation |

---

## 8. Deployment Architecture

### 8.1 Kubernetes Cluster

**Cluster Configuration:**
- **Node Groups:**
  - General-purpose: t3.medium (API services)
  - Compute-optimized: c5.large (messaging, signaling)
  - Memory-optimized: r5.large (database, cache)

**Namespace Strategy:**
```
zynk-prod
├── auth
├── messaging
├── call
├── file
├── monitoring
└── ingress
```

**Example Deployment (Messaging Service):**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: messaging-service
  namespace: zynk-prod
spec:
  replicas: 5
  selector:
    matchLabels:
      app: messaging-service
  template:
    metadata:
      labels:
        app: messaging-service
    spec:
      containers:
      - name: messaging
        image: zynk/messaging-service:v1.0.0
        ports:
        - containerPort: 8002
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-secret
              key: url
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        livenessProbe:
          httpGet:
            path: /health
            port: 8002
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8002
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: messaging-service
  namespace: zynk-prod
spec:
  selector:
    app: messaging-service
  ports:
  - port: 80
    targetPort: 8002
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: messaging-service-hpa
  namespace: zynk-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: messaging-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### 8.2 Multi-Region Architecture

```
Region: US-East (Primary)
├── EKS Cluster
├── RDS PostgreSQL (Primary)
├── ElastiCache Redis
├── S3 Bucket (us-east-1)
└── CloudFront Distribution

Region: EU-West (Secondary)
├── EKS Cluster
├── RDS PostgreSQL (Read Replica)
├── ElastiCache Redis
├── S3 Bucket (eu-west-1, replicated)
└── CloudFront Distribution

Region: Asia-Pacific (Secondary)
├── EKS Cluster
├── RDS PostgreSQL (Read Replica)
├── ElastiCache Redis
├── S3 Bucket (ap-southeast-1, replicated)
└── CloudFront Distribution
```

**Routing Strategy:**
- GeoDNS routes users to nearest region
- WebSocket connections sticky to region
- Database writes go to primary (US-East)
- Reads from local replicas
- Cross-region replication for disaster recovery

---

## 9. Observability Architecture

### 9.1 Metrics Architecture

```
Application Services
         │
         ▼ (Prometheus client libraries)
    Prometheus
         │
         ▼ (Remote write)
      Thanos
         │
         ├─────────────────────┐
         ▼                     ▼
    Long-term Storage      Grafana
       (S3)             (Visualization)
```

**Key Metrics:**
- Service health: up/down, response time, error rate
- Business: DAU, messages sent, calls initiated
- Infrastructure: CPU, memory, disk, network

### 9.2 Logging Architecture

```
Application Services
         │
         ▼ (stdout/stderr)
   Kubernetes Logs
         │
         ▼ (Fluentd/Fluent Bit)
       Loki
         │
         ▼
     Grafana
```

### 9.3 Tracing Architecture

```
Application Services
         │
         ▼ (OpenTelemetry SDK)
     Jaeger Collector
         │
         ▼
    Jaeger Storage
         │
         ▼
    Jaeger UI
```

---

## 10. Architectural Patterns

### 10.1 Circuit Breaker

**Purpose:** Prevent cascading failures

**Implementation:**
```go
import "github.com/sony/gobreaker"

var cb = gobreaker.NewCircuitBreaker(gobreaker.Settings{
    Name:        "external-api",
    MaxRequests: 3,
    Interval:    time.Minute,
    Timeout:     30 * time.Second,
    ReadyToTrip: func(counts gobreaker.Counts) bool {
        failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
        return counts.Requests >= 3 && failureRatio >= 0.6
    },
})

func CallExternalAPI() (interface{}, error) {
    return cb.Execute(func() (interface{}, error) {
        // Call external service
        return http.Get("https://external-api.com")
    })
}
```

### 10.2 Saga Pattern (Distributed Transactions)

**Use Case:** File upload transaction

**Steps:**
1. Reserve storage quota (compensatable: release quota)
2. Upload file to S3 (compensatable: delete file)
3. Create database record (compensatable: delete record)
4. Update conversation (compensatable: remove file reference)

**Implementation:** Event-driven with Kafka

### 10.3 CQRS (Command Query Responsibility Segregation)

**Messaging Service:**
- **Command:** SendMessage, DeleteMessage (write to primary DB)
- **Query:** GetMessages, SearchMessages (read from replicas/cache)

**Benefits:**
- Optimize reads separately from writes
- Scale read/write independently
- Different data models for read/write

---

## 11. Architectural Trade-offs

| Decision | Pros | Cons | Chosen |
|----------|------|------|--------|
| Microservices vs Monolith | Scalability, tech diversity | Complexity, latency | Microservices |
| REST vs gRPC | Simplicity, debugging | Performance | REST (gRPC future) |
| SQL vs NoSQL | ACID, relational | Scalability limits | SQL (PostgreSQL) |
| Self-hosted vs Managed | Cost, control | Operational burden | Managed (RDS, ElastiCache) |
| Kafka vs RabbitMQ | Throughput, durability | Complexity | Kafka |
| P2P vs SFU (calls) | Low latency | NAT traversal | P2P + SFU fallback |

---

## 12. Future Architecture Enhancements

### Phase 1 (Current)
- REST APIs
- WebSocket for messaging
- P2P + SFU for calls

### Phase 2 (6-12 months)
- gRPC for inter-service communication
- GraphQL for complex client queries
- Edge computing (Cloudflare Workers) for low-latency

### Phase 3 (12-24 months)
- Service mesh (Istio/Linkerd) for advanced traffic management
- Event sourcing for audit trails
- Multi-cloud deployment (AWS + GCP)

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Architecture Teams  
Review Cycle: Quarterly

---

## 13. Blockchain Architecture

### 13.1 Blockchain Integration Overview

Zynk integrates blockchain technology for **decentralized identity verification**, **message integrity auditing**, and **trust scoring**. All blockchain services are built with **Go** for performance and compatibility with blockchain ecosystems.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN LAYER (Go)                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Blockchain  │  │  Blockchain  │  │  Blockchain  │         │
│  │   Identity   │  │    Audit     │  │     Node     │         │
│  │   Service    │  │   Service    │  │  (Custom)    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                     │
│                            ▼                                     │
│              ┌─────────────────────────┐                        │
│              │   LevelDB / BadgerDB    │                        │
│              │  (Blockchain Storage)   │                        │
│              └─────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              BLOCKCHAIN API GATEWAY (Express.js)                 │
│                REST API + WebSocket Events                       │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Blockchain Identity Service (Go)

**Purpose:** Decentralized identity (DID) management and verification

**Architecture:**
```go
// Go service structure
blockchain-identity/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── blockchain/
│   │   ├── did.go           // DID operations
│   │   ├── verifiable.go    // Credential verification
│   │   └── resolver.go      // DID resolution
│   ├── contracts/
│   │   └── identity.sol     // Smart contracts
│   └── api/
│       └── handlers.go      // HTTP handlers
├── pkg/
│   └── crypto/
│       └── keys.go          // Key management
└── Dockerfile
```

**Key Functions:**
- DID registration on blockchain
- Public key anchoring
- Verifiable credential issuance
- Trust score calculation
- Identity verification

**Smart Contract (Solidity):**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ZynkIdentity {
    struct Identity {
        bytes32 did;
        bytes publicKey;
        uint256 trustScore;
        uint256 createdAt;
        bool isActive;
    }
    
    mapping(bytes32 => Identity) public identities;
    mapping(address => bytes32) public addressToDID;
    
    event IdentityRegistered(bytes32 indexed did, address indexed owner);
    event TrustScoreUpdated(bytes32 indexed did, uint256 newScore);
    
    function registerIdentity(bytes32 _did, bytes memory _publicKey) public {
        require(!identities[_did].isActive, "DID already exists");
        
        identities[_did] = Identity({
            did: _did,
            publicKey: _publicKey,
            trustScore: 50, // Initial neutral score
            createdAt: block.timestamp,
            isActive: true
        });
        
        addressToDID[msg.sender] = _did;
        emit IdentityRegistered(_did, msg.sender);
    }
    
    function updateTrustScore(bytes32 _did, uint256 _newScore) public {
        require(identities[_did].isActive, "DID not found");
        require(_newScore <= 100, "Score must be <= 100");
        
        identities[_did].trustScore = _newScore;
        emit TrustScoreUpdated(_did, _newScore);
    }
    
    function verifyIdentity(bytes32 _did) public view returns (bool) {
        return identities[_did].isActive;
    }
}
```

**Go Implementation:**
```go
package blockchain

import (
    "github.com/ethereum/go-ethereum/accounts/abi/bind"
    "github.com/ethereum/go-ethereum/common"
    "github.com/ethereum/go-ethereum/ethclient"
)

type IdentityService struct {
    client   *ethclient.Client
    contract *ZynkIdentityContract
}

func (s *IdentityService) RegisterDID(did string, publicKey []byte) error {
    auth, err := s.getAuth()
    if err != nil {
        return err
    }
    
    didBytes := common.HexToHash(did)
    tx, err := s.contract.RegisterIdentity(auth, didBytes, publicKey)
    if err != nil {
        return err
    }
    
    // Wait for transaction confirmation
    receipt, err := bind.WaitMined(context.Background(), s.client, tx)
    if err != nil {
        return err
    }
    
    return nil
}

func (s *IdentityService) VerifyDID(did string) (bool, error) {
    didBytes := common.HexToHash(did)
    return s.contract.VerifyIdentity(&bind.CallOpts{}, didBytes)
}
```

**API Endpoints (via Express.js Gateway):**
```
POST   /api/v1/blockchain/identity/register
GET    /api/v1/blockchain/identity/{did}/verify
GET    /api/v1/blockchain/identity/{did}/trust-score
POST   /api/v1/blockchain/identity/{did}/credential
```

---

### 13.3 Blockchain Audit Service (Go)

**Purpose:** Immutable message hash anchoring for audit trail

**Architecture:**
```go
blockchain-audit/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── blockchain/
│   │   ├── anchor.go        // Hash anchoring
│   │   ├── merkle.go        // Merkle tree
│   │   └── verify.go        // Verification
│   └── api/
│       └── handlers.go
└── pkg/
    └── hasher/
        └── sha256.go
```

**Key Functions:**
- Anchor message hashes to blockchain
- Build Merkle trees for batch anchoring
- Verify message integrity against blockchain
- Provide tamper-proof audit trail

**Merkle Tree Implementation:**
```go
package blockchain

import (
    "crypto/sha256"
    "encoding/hex"
)

type MerkleTree struct {
    Root   string
    Leaves []string
}

func BuildMerkleTree(messageHashes []string) *MerkleTree {
    if len(messageHashes) == 0 {
        return nil
    }
    
    tree := &MerkleTree{Leaves: messageHashes}
    tree.Root = tree.buildTree(messageHashes)
    return tree
}

func (t *MerkleTree) buildTree(hashes []string) string {
    if len(hashes) == 1 {
        return hashes[0]
    }
    
    var newLevel []string
    for i := 0; i < len(hashes); i += 2 {
        if i+1 < len(hashes) {
            combined := hashes[i] + hashes[i+1]
            hash := sha256.Sum256([]byte(combined))
            newLevel = append(newLevel, hex.EncodeToString(hash[:]))
        } else {
            newLevel = append(newLevel, hashes[i])
        }
    }
    
    return t.buildTree(newLevel)
}

func (t *MerkleTree) Verify(messageHash string) bool {
    for _, leaf := range t.Leaves {
        if leaf == messageHash {
            return true
        }
    }
    return false
}
```

**Batch Anchoring Process:**
```
1. Collect message hashes (every hour or 1000 messages)
2. Build Merkle tree
3. Anchor Merkle root to blockchain
4. Store tree structure in LevelDB
5. Return proof of inclusion for each message
```

**API Endpoints:**
```
POST   /api/v1/blockchain/audit/anchor
GET    /api/v1/blockchain/audit/{message_id}/verify
GET    /api/v1/blockchain/audit/proof/{message_id}
```

---

### 13.4 Custom Blockchain Node (Go)

**Purpose:** Private blockchain for Zynk-specific operations

**Consensus:** Proof of Stake (PoS) or Byzantine Fault Tolerance (BFT)

**Architecture:**
```go
blockchain-node/
├── cmd/
│   └── node/
│       └── main.go
├── internal/
│   ├── consensus/
│   │   ├── pos.go           // Proof of Stake
│   │   └── bft.go           // Byzantine Fault Tolerance
│   ├── p2p/
│   │   └── network.go       // Peer-to-peer networking
│   ├── blockchain/
│   │   ├── block.go         // Block structure
│   │   ├── chain.go         // Blockchain
│   │   └── transaction.go   // Transaction
│   └── storage/
│       └── leveldb.go       // Persistent storage
└── config/
    └── genesis.json         // Genesis block
```

**Block Structure:**
```go
type Block struct {
    Index        uint64
    Timestamp    int64
    Transactions []Transaction
    PrevHash     string
    Hash         string
    Nonce        uint64
    Validator    string  // For PoS
}

type Transaction struct {
    Type      string  // "identity_registration", "trust_score_update", "message_anchor"
    Data      []byte
    Signature []byte
    PublicKey []byte
}
```

**Consensus (Proof of Stake):**
```go
package consensus

type PoS struct {
    validators map[string]uint64  // validator -> stake amount
    minStake   uint64
}

func (p *PoS) SelectValidator() string {
    // Weighted random selection based on stake
    totalStake := p.getTotalStake()
    random := rand.Uint64() % totalStake
    
    cumulative := uint64(0)
    for validator, stake := range p.validators {
        cumulative += stake
        if random < cumulative {
            return validator
        }
    }
    return ""
}

func (p *PoS) ValidateBlock(block *Block) bool {
    // Verify validator has minimum stake
    stake, exists := p.validators[block.Validator]
    if !exists || stake < p.minStake {
        return false
    }
    
    // Verify block hash and signature
    return p.verifyBlockSignature(block)
}
```

**P2P Networking (libp2p):**
```go
package p2p

import (
    "github.com/libp2p/go-libp2p"
    "github.com/libp2p/go-libp2p-core/host"
    "github.com/libp2p/go-libp2p-core/peer"
)

type Network struct {
    host  host.Host
    peers []peer.ID
}

func NewNetwork() (*Network, error) {
    h, err := libp2p.New()
    if err != nil {
        return nil, err
    }
    
    return &Network{
        host:  h,
        peers: make([]peer.ID, 0),
    }, nil
}

func (n *Network) BroadcastBlock(block *Block) error {
    data, err := json.Marshal(block)
    if err != nil {
        return err
    }
    
    for _, peerID := range n.peers {
        n.host.NewStream(context.Background(), peerID, "/zynk/block/1.0.0")
        // Send block data to peer
    }
    return nil
}
```

---

### 13.5 Blockchain API Gateway (Express.js)

**Purpose:** Proxy requests from main services to Go blockchain services

**Implementation:**
```typescript
// Express.js proxy to Go blockchain services
import express from 'express';
import axios from 'axios';

const router = express.Router();

// Proxy to Identity Service
router.post('/identity/register', async (req, res) => {
  try {
    const response = await axios.post(
      'http://blockchain-identity:8011/register',
      req.body
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy to Audit Service
router.post('/audit/anchor', async (req, res) => {
  try {
    const response = await axios.post(
      'http://blockchain-audit:8012/anchor',
      req.body
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for blockchain events
io.on('connection', (socket) => {
  // Subscribe to blockchain events from Go services
  const eventStream = connectToBlockchainEventStream();
  
  eventStream.on('identity_registered', (data) => {
    socket.emit('blockchain:identity', data);
  });
  
  eventStream.on('block_mined', (data) => {
    socket.emit('blockchain:block', data);
  });
});

export default router;
```

---

### 13.6 Data Storage

**LevelDB for Blockchain:**
```go
import "github.com/syndtr/goleveldb/leveldb"

type BlockchainDB struct {
    db *leveldb.DB
}

func (b *BlockchainDB) SaveBlock(block *Block) error {
    data, err := json.Marshal(block)
    if err != nil {
        return err
    }
    
    key := []byte(fmt.Sprintf("block:%d", block.Index))
    return b.db.Put(key, data, nil)
}

func (b *BlockchainDB) GetBlock(index uint64) (*Block, error) {
    key := []byte(fmt.Sprintf("block:%d", index))
    data, err := b.db.Get(key, nil)
    if err != nil {
        return nil, err
    }
    
    var block Block
    err = json.Unmarshal(data, &block)
    return &block, err
}
```

**PostgreSQL for Metadata:**
```sql
-- Blockchain transaction metadata
CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- DID registry cache
CREATE TABLE blockchain_identities (
    did VARCHAR(66) PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    public_key TEXT NOT NULL,
    trust_score INT NOT NULL DEFAULT 50,
    is_verified BOOLEAN DEFAULT false,
    blockchain_registered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 13.7 Integration with Main Services

**Authentication Service Integration:**
```typescript
// When user registers
async function registerUser(username: string, publicKey: string) {
  // 1. Create user in PostgreSQL
  const user = await db.users.create({ username, publicKey });
  
  // 2. Register DID on blockchain (async)
  await blockchainClient.registerIdentity({
    did: generateDID(user.id),
    publicKey: publicKey
  });
  
  return user;
}
```

**Messaging Service Integration:**
```typescript
// Batch anchor message hashes every hour
cron.schedule('0 * * * *', async () => {
  const messages = await db.messages.findRecentUnanchored();
  const hashes = messages.map(m => m.content_hash);
  
  // Anchor to blockchain
  const merkleRoot = await blockchainClient.anchorHashes(hashes);
  
  // Update messages with merkle root reference
  await db.messages.updateAnchorStatus(messages, merkleRoot);
});
```

---

### 13.8 Blockchain Monitoring

**Metrics:**
- Blocks mined per hour
- Transaction throughput
- Node sync status
- Validator performance
- Smart contract gas usage

**Prometheus Metrics (Go):**
```go
var (
    blocksMinedTotal = prometheus.NewCounter(
        prometheus.CounterOpts{
            Name: "blockchain_blocks_mined_total",
            Help: "Total number of blocks mined",
        },
    )
    
    transactionDuration = prometheus.NewHistogram(
        prometheus.HistogramOpts{
            Name: "blockchain_transaction_duration_seconds",
            Help: "Transaction processing duration",
        },
    )
)
```

---

### 13.9 Blockchain Deployment

**Kubernetes Deployment:**
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: blockchain-node
spec:
  serviceName: blockchain-node
  replicas: 3
  selector:
    matchLabels:
      app: blockchain-node
  template:
    metadata:
      labels:
        app: blockchain-node
    spec:
      containers:
      - name: node
        image: zynk/blockchain-node:v1.0.0
        ports:
        - containerPort: 8013
          name: rpc
        - containerPort: 30303
          name: p2p
        volumeMounts:
        - name: blockchain-data
          mountPath: /data
  volumeClaimTemplates:
  - metadata:
      name: blockchain-data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 100Gi
```

---

### 13.10 Future Blockchain Enhancements

**Phase 2 (Months 13-18):**
- [ ] IPFS integration for decentralized file storage
- [ ] Zero-knowledge proofs for privacy-preserving verification
- [ ] Cross-chain bridges for interoperability
- [ ] Decentralized governance (DAO)

**Phase 3 (Months 19-24):**
- [ ] Layer 2 scaling solutions (optimistic rollups)
- [ ] Tokenization for premium features
- [ ] NFT-based profile verification
- [ ] Decentralized messaging protocol

---

