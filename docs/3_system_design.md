# System Design
## Zynk — Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. System Overview

Zynk is a distributed communication platform designed for high availability, horizontal scalability, and end-to-end security. The system handles real-time messaging, voice/video calls, and file transfers with zero-knowledge encryption.

### 1.1 Design Principles

1. **Security First** - E2EE, zero-knowledge architecture
2. **Scalability** - Horizontal scaling for 100M+ users
3. **Reliability** - 99.95% uptime target
4. **Low Latency** - Sub-500ms message delivery
5. **Privacy by Design** - Minimal metadata collection

---

## 2. High-Level Architecture

```
CLIENT LAYER
├── Flutter Mobile (Android/iOS)
└── Next.js Web App
        ↓
EDGE LAYER
└── Cloudflare (CDN, WAF, DDoS)
        ↓
API GATEWAY
└── Kong (Auth, Rate Limiting, Routing)
        ↓
APPLICATION SERVICES
├── Express.js Services (Auth, Messaging, Calls, Files, Groups, Presence, Proximity, Notifications)
└── Go Services (Blockchain Identity, Audit, Node)
        ↓
DATA LAYER
├── PostgreSQL (Relational data)
├── Redis (Cache, sessions, presence)
├── Kafka (Message queue)
├── S3 (File storage)
└── LevelDB (Blockchain data)
```

---

## 3. Core Service Flows

### 3.1 Authentication Flow

**Registration:**
1. Client generates Signal Protocol keypair
2. Client derives encryption key from passphrase (PBKDF2, 100K iterations)
3. Client sends username + public key + password hash
4. Server stores user record in PostgreSQL
5. Server returns JWT session token (30-day expiration)

**Login:**
1. Client sends username + password hash
2. Server verifies credentials
3. Server checks device fingerprint
4. Server generates device record if new
5. Server returns session token + device_id

### 3.2 Messaging Flow

**Send Message:**
1. Client encrypts message with Signal Protocol
2. Client sends via WebSocket
3. Server validates session token
4. Server stores metadata in PostgreSQL (partitioned by month)
5. Server publishes to Kafka
6. If recipient online: deliver via WebSocket
7. If offline: queue in Kafka, send push notification
8. Client sends delivery/read confirmation

**Storage:**
- PostgreSQL: Metadata + encrypted content
- Kafka: Delivery queue (7-day retention)
- Redis: Online user routing cache

### 3.3 Call Flow

**One-to-One Call:**
1. Caller initiates via WebSocket signaling
2. Server relays SDP offer to callee
3. Callee sends SDP answer
4. ICE candidates exchanged
5. WebRTC P2P connection established
6. Media flows directly (E2EE with DTLS-SRTP)

**Group Call (SFU):**
1. Participants connect to Janus Gateway
2. Each sends media stream to SFU
3. SFU forwards streams to others
4. Client-side encryption maintained

### 3.4 File Sharing Flow

**Upload:**
1. Client requests upload → Server generates presigned S3 URLs
2. Client encrypts file chunks (AES-256-GCM)
3. Client uploads directly to S3 (multipart)
4. Client finalizes → Server verifies SHA-256 hash
5. Server stores metadata in PostgreSQL

**Download:**
1. Client requests file → Server verifies permission
2. Server generates presigned S3 URL (1-hour expiration)
3. Client downloads and decrypts locally

### 3.5 Presence Management

- Client connects via WebSocket
- Server adds user to Redis sorted set (timestamp score)
- Heartbeat every 30 seconds
- TTL: 60 seconds (offline if no heartbeat)
- Presence changes broadcast to contacts

### 3.6 Push Notifications

1. Messaging service publishes "message.undelivered" to Kafka
2. Notification service consumes event
3. Service looks up device push tokens
4. Service sends encrypted push (FCM/APNs)
5. Client receives push, fetches message via WebSocket

---

## 4. Blockchain Integration

### 4.1 Identity Verification

**Decentralized Identity (DID):**
- User registers → DID created (did:zynk:{user_id})
- Public key anchored to blockchain
- Trust score initialized (default: 50/100)
- Verifiable credentials can be issued

**Trust Scoring:**
- Factors: account age, message volume, reports, verifications
- Score range: 0-100
- Updates anchored to blockchain
- Transparent and auditable

### 4.2 Message Audit Trail

**Batch Anchoring (Hourly):**
1. Collect message hashes (last hour or 1000 messages)
2. Build Merkle tree
3. Anchor Merkle root to blockchain
4. Store tree in LevelDB
5. Create proofs in PostgreSQL

**Verification:**
- Users can verify message wasn't tampered
- Proof of inclusion via Merkle path
- Blockchain timestamp proves when sent

### 4.3 Blockchain Architecture

**Components:**
- Identity Service (Go) - DID registration
- Audit Service (Go) - Merkle tree, anchoring
- Blockchain Node (Go) - Custom PoS consensus
- API Gateway (Express.js) - Proxy

**Consensus:** Proof of Stake
- Validators stake tokens
- Weighted random selection
- Energy efficient

**Storage:**
- LevelDB: Blockchain data
- PostgreSQL: Metadata cache
- Redis: Pending transactions

---

## 5. Scalability Design

### 5.1 Horizontal Scaling

**Services:**
- All Express.js services are stateless
- Kubernetes auto-scales based on CPU/memory
- Minimum 3 replicas per service

**Database:**
- PostgreSQL read replicas (3 per region)
- PgBouncer connection pooling
- Message table partitioned by month

**Cache:**
- Redis Cluster (6 nodes: 3 masters, 3 replicas)
- Consistent hashing

**Message Queue:**
- Kafka with 10 partitions per topic
- Partitioned by recipient_id

### 5.2 Geographic Distribution

**Regions:**
- Primary: US-East (writes)
- Replicas: EU-West, Asia-Pacific (reads)

**Routing:**
- GeoDNS routes to nearest region
- Database replication lag < 1 second
- Cross-region file replication (S3)

---

## 6. Security Design

### 6.1 End-to-End Encryption

**Protocol:** Signal Protocol (Double Ratchet + X3DH)

**Key Exchange:**
1. Fetch recipient's public identity key
2. Perform X3DH key agreement
3. Establish shared secret
4. Use Double Ratchet for ongoing messages

### 6.2 Transport Security

- TLS 1.3 for all connections
- Certificate pinning (mobile)
- WebSocket Secure (WSS)
- DTLS-SRTP for WebRTC

### 6.3 Zero-Knowledge Architecture

**Server Cannot Access:**
- Message content
- File content
- Call media
- User's private keys

**Server Only Stores:**
- Encrypted content
- Minimal metadata (routing)
- Public keys only

---

## 7. Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Message Delivery | < 500ms (p95) | End-to-end |
| API Response | < 200ms (p95) | Server-side |
| Call Setup | < 3s (p95) | Client-side |
| Voice Latency | < 200ms (p95) | End-to-end |
| File Upload Speed | 80% of bandwidth | Client-side |
| System Uptime | 99.95% | Monthly |

---

## 8. Monitoring & Alerting

### 8.1 Metrics

**Application:**
- Request rate, latency (p50, p95, p99)
- Error rate per endpoint
- WebSocket connections
- Message delivery latency

**Business:**
- Daily/Monthly Active Users
- Messages sent per day
- Call minutes per day

**Infrastructure:**
- CPU, memory, disk, network
- Database query performance
- Cache hit rate

### 8.2 Alerting

**Critical:**
- Service down → PagerDuty
- Database failover
- Error rate > 5%

**Warning:**
- Resource usage > 80%
- Certificate expiring < 30 days

---

## 9. Disaster Recovery

**Backup Strategy:**
- PostgreSQL: Continuous WAL archiving + daily full backup
- Redis: RDB snapshots every 6 hours
- S3: Cross-region replication

**Recovery Objectives:**
- RPO (Recovery Point Objective): < 1 hour
- RTO (Recovery Time Objective): < 4 hours

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering Teams  
Review Cycle: Quarterly
