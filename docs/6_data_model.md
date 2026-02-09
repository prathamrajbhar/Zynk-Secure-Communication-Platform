# Data Model
## Zynk – Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. Overview

Zynk uses PostgreSQL for relational data, Redis for caching/real-time state, LevelDB for blockchain data, and S3 for files. All designs follow normalization principles with strategic denormalization for performance.

---

## 2. PostgreSQL Schema

### 2.1 Users & Authentication

**users**
- id (UUID, primary key)
- username (unique, 3-64 chars)
- password_hash (PBKDF2-SHA256, 100K iterations)
- public_key (Signal Protocol identity key)
- created_at, updated_at

**user_profiles**
- user_id (foreign key to users)
- display_name, avatar_url, bio
- last_seen_at
- privacy_settings (JSON: online status, last seen, read receipts)

**devices**
- id (UUID)
- user_id (foreign key)
- device_name, device_fingerprint (unique)
- public_key (device-specific)
- push_token (FCM/APNs)
- platform (android/ios/web)
- last_active_at

---

### 2.2 Messaging

**conversations**
- id (UUID)
- type (one_to_one, group)
- created_at, updated_at

**conversation_participants**
- conversation_id, user_id (composite primary key)
- role (admin, member)
- joined_at, last_read_at

**messages** (partitioned by created_at month)
- id (UUID)
- conversation_id, sender_id
- encrypted_content (binary blob)
- content_hash (SHA-256 for integrity)
- message_type (text, image, file, audio, video)
- metadata (JSON: reply_to, mentions, reactions)
- status (sent, delivered, read, failed)
- expires_at (for self-destruct)
- created_at, edited_at, deleted_at

**Partitioning:**
- Monthly partitions (messages_2026_01, messages_2026_02, etc.)
- Automatic creation via pg_partman

**Indexes:**
- conversation_id + created_at (covering index)
- sender_id
- status + created_at (for undelivered messages)
- expires_at (for cleanup)

---

### 2.3 Groups

**groups**
- id (UUID)
- name, description, avatar_url
- max_members (default: 256)
- created_by, created_at, updated_at

**group_members**
- group_id, user_id (composite primary key)
- role (admin, member)
- joined_at, invited_by

---

### 2.4 Files

**files**
- id (UUID)
- uploader_id, conversation_id
- filename, file_size, mime_type
- storage_path (S3 key)
- encryption_key_encrypted (AES key encrypted with user's public key)
- content_hash (SHA-256)
- thumbnail_path (S3 key for images/videos)
- metadata (JSON: dimensions, duration, etc.)
- expires_at, created_at, deleted_at

**Constraints:**
- Max file size: 2GB (100MB in MVP)

---

### 2.5 Calls

**calls**
- id (UUID)
- initiator_id, call_type (audio, video)
- status (initiated, ringing, in_progress, ended, missed, declined)
- conversation_id
- started_at, ended_at, duration_seconds
- created_at

**call_participants**
- call_id, user_id (composite primary key)
- joined_at, left_at

---

### 2.6 Sessions

**sessions**
- id (UUID)
- user_id, device_id
- session_token (JWT, unique)
- refresh_token (unique)
- expires_at, refresh_expires_at
- created_at, last_used_at

---

## 3. Blockchain Schema (PostgreSQL)

### 3.1 Identity Management

**blockchain_identities**
- did (primary key, format: did:zynk:{user_id})
- user_id (unique foreign key)
- public_key
- trust_score (0-100, default: 50)
- is_verified (boolean)
- transaction_hash, block_number
- blockchain_registered_at
- created_at, updated_at

**trust_score_history**
- id (UUID)
- did (foreign key)
- old_score, new_score
- change_reason (verified_by_community, spam_report, account_age_milestone)
- transaction_hash, changed_by
- created_at

---

### 3.2 Audit Trail

**blockchain_transactions**
- id (UUID)
- transaction_hash (unique, 0x...)
- transaction_type (identity_registration, trust_score_update, message_anchor)
- from_address, to_address
- block_number, block_hash
- gas_used
- user_id, related_entity_id
- status (pending, confirmed, failed)
- created_at, confirmed_at

**message_anchors**
- id (UUID)
- merkle_root (unique SHA-256 hash)
- message_count
- transaction_hash, block_number
- anchored_at

**message_merkle_proofs**
- message_id (primary key, foreign key)
- content_hash
- merkle_root_id (foreign key to message_anchors)
- proof (JSON array of sibling hashes)
- leaf_index
- created_at

---

## 4. Redis Data Structures

### 4.1 Session Management

**Format:** `session:{token}` → `{user_id}:{device_id}`  
**TTL:** 2592000 seconds (30 days)

### 4.2 Online Presence

**Format:** Sorted Set `online_users`  
**Score:** Current timestamp  
**Member:** user_id  
**TTL:** Automatic cleanup via score comparison

### 4.3 Typing Indicators

**Format:** `typing:{conversation_id}:{user_id}` → "1"  
**TTL:** 5 seconds

### 4.4 Message Queue

**Format:** List `queue:messages:{recipient_id}`  
**Value:** JSON message object

### 4.5 Location (Geospatial)

**Format:** Geospatial index `locations`  
**Data:** longitude, latitude, user_id  
**TTL:** 300 seconds (5 minutes)

### 4.6 Cache

**User Profiles:** `user:{user_id}` → JSON (1-hour TTL)  
**Group Members:** `group_members:{group_id}` → Set of user_ids (10-min TTL)  
**Rate Limiting:** `ratelimit:{ip}:{endpoint}` → count (1-hour TTL)

---

## 5. LevelDB Structure (Blockchain - Go)

### 5.1 Block Storage

**Key:** `block:{block_number}`  
**Value:** JSON block data

### 5.2 Transaction Index

**Key:** `tx:{transaction_hash}`  
**Value:** JSON transaction data

### 5.3 State Storage

**Key:** `state:identity:{did}`  
**Value:** JSON identity state

### 5.4 Merkle Trees

**Key:** `merkle:{root_hash}`  
**Value:** JSON tree structure

---

## 6. S3 Object Storage

### 6.1 File Organization

**Bucket Structure:**
```
zynk-files/
├── encrypted/
│   └── {year}/{month}/{file_id}.enc
└── thumbnails/
    └── {year}/{month}/{file_id}_thumb.jpg
```

**Properties:**
- Server-side encryption (AES-256)
- Versioning enabled
- Lifecycle policies for expiration
- Cross-region replication

---

## 7. Data Relationships

```
User
├── 1:1 → User_Profile
├── 1:N → Devices
├── 1:N → Messages (as sender)
├── 1:N → Files (as uploader)
├── N:M → Conversations (via Conversation_Participants)
├── N:M → Groups (via Group_Members)
└── 1:1 → Blockchain_Identity (DID)

Conversation
├── 1:N → Messages
├── 1:N → Files
├── 1:N → Calls
└── N:M → Users (via Participants)

Message
└── 1:1 → Message_Merkle_Proof → N:1 → Message_Anchor

Blockchain_Identity
├── 1:N → Trust_Score_History
└── 1:N → Blockchain_Transactions
```

---

## 8. Data Lifecycle

### 8.1 Messages

- **Delivered:** Retained indefinitely (unless user deletes)
- **Undelivered:** 30-day retention, then deleted
- **Self-Destruct:** Deleted at expires_at timestamp
- **Deleted:** Soft delete (deleted_at set), purged after 30 days

### 8.2 Files

- **Active:** Retained per expiration setting (1 hour to 30 days, or indefinite)
- **Expired:** Deleted from S3 and database (daily cron job)
- **Orphaned:** Weekly cleanup of S3 objects without database entries

### 8.3 Sessions

- **Active:** 30-day TTL in Redis
- **Refresh Tokens:** 90-day TTL, rotated on use
- **Expired:** Auto-deleted by Redis TTL

### 8.4 Blockchain Data

- **Blockchain:** Permanent (blocks, transactions)
- **PostgreSQL Cache:** Indefinite with indexes for queries
- **LevelDB:** Permanent with periodic archival

---

## 9. Partitioning Strategy

### 9.1 Messages Table

**Partition Type:** Range partitioning by created_at

**Partitions:**
- One partition per month
- Automatic creation via pg_partman
- Retention: 24 months, then archive to S3

**Benefits:**
- Faster queries (partition pruning)
- Easier maintenance
- Better index performance

---

## 10. Indexing Strategy

### 10.1 Covering Indexes

**Purpose:** Query never touches table, only index

**Example (messages):**
- Index: conversation_id + created_at DESC
- Include: sender_id, message_type, status

### 10.2 Partial Indexes

**Purpose:** Smaller index for specific conditions

**Example (undelivered messages):**
- Index: status + created_at
- Condition: WHERE status = 'sent'

---

## 11. Data Encryption

### 11.1 Client-Side (E2EE)

- **Messages:** Signal Protocol (Double Ratchet)
- **Files:** AES-256-GCM before upload
- **Keys:** Never sent to server

### 11.2 Server-Side (At Rest)

- **PostgreSQL:** pgcrypto for sensitive fields (optional)
- **S3:** Server-side encryption (AES-256)
- **Redis:** In-memory only (no disk persistence for sensitive data)

---

## 12. Backup Strategy

### 12.1 PostgreSQL

- **Method:** Continuous WAL archiving + daily full backup
- **Retention:** Full backups 30 days, WAL 7 days
- **Storage:** S3 with versioning

### 12.2 Redis

- **Method:** RDB snapshots every 6 hours + AOF
- **Retention:** 7 days
- **Recovery:** Point-in-time from RDB + AOF replay

### 12.3 LevelDB (Blockchain)

- **Method:** Daily snapshot to S3
- **Retention:** Indefinite (archival)

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Data Teams  
Review Cycle: With schema changes
