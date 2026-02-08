# Data Model
## Zynk — Secure Communication Platform

**Version:** 1.0  
**Last Updated:** February 7, 2026  
**Status:** Final

---

## 1. Data Model Overview

Zynk uses a **relational database model** (PostgreSQL) for structured data with strong consistency requirements, and **key-value stores** (Redis) for caching and real-time state.

### 1.1 Design Principles

1. **Normalization:** 3NF for data integrity
2. **Referential Integrity:** Foreign keys with CASCADE rules
3. **Partitioning:** Time-based partitioning for messages
4. **Indexing:** Strategic indexes for query performance
5. **Encryption:** E2EE content stored as encrypted blobs
6. **Minimal Metadata:** Store only essential information

---

## 2. Core Entities

### 2.1 Entity Relationship Diagram

```
Users ──────┐
     │      │
     │      └─────── Devices
     │      │
     │      └─────── User_Profiles
     │
     ├────────────── Conversations (via Conversation_Participants)
     │                      │
     │                      ├─────── Messages
     │                      │
     │                      └─────── Files
     │
     ├────────────── Groups (via Group_Members)
     │
     └────────────── Calls (via Call_Participants)
```

---

## 3. PostgreSQL Schema

### 3.1 Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,  -- PBKDF2-SHA256
    public_key TEXT NOT NULL,             -- Signal Protocol identity key
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_]{3,64}$')
);

CREATE INDEX idx_users_username ON users(username);
```

**Columns:**
- `id`: Unique user identifier (UUID)
- `username`: Unique username (3-64 alphanumeric + underscore)
- `password_hash`: PBKDF2-SHA256 with 100K iterations
- `public_key`: Signal Protocol identity public key
- `created_at`: Account creation timestamp
- `updated_at`: Last profile update timestamp

---

### 3.2 User Profiles Table

```sql
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    bio TEXT,
    last_seen_at TIMESTAMP,
    privacy_settings JSONB NOT NULL DEFAULT '{
        "show_online_status": true,
        "show_last_seen": true,
        "allow_read_receipts": true,
        "allow_proximity_discovery": true
    }',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Columns:**
- `user_id`: Foreign key to users table
- `display_name`: User's display name (optional)
- `avatar_url`: Profile picture URL
- `bio`: User biography (max 500 chars)
- `last_seen_at`: Last activity timestamp
- `privacy_settings`: JSON object for privacy controls
- `created_at`: Profile creation timestamp
- `updated_at`: Last profile update

---

### 3.3 Devices Table

```sql
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_fingerprint VARCHAR(64) UNIQUE NOT NULL,
    public_key TEXT NOT NULL,             -- Device-specific public key
    push_token TEXT,                      -- FCM/APNs token
    platform VARCHAR(20) NOT NULL,        -- 'android', 'ios', 'web'
    last_active_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT platform_check CHECK (platform IN ('android', 'ios', 'web')),
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_fingerprint ON devices(device_fingerprint);
CREATE INDEX idx_devices_last_active ON devices(last_active_at);
```

**Columns:**
- `id`: Unique device identifier
- `user_id`: Owner of the device
- `device_name`: User-assigned device name
- `device_fingerprint`: Unique device identifier
- `public_key`: Device-specific Signal Protocol key
- `push_token`: Push notification token
- `platform`: Operating system
- `last_active_at`: Last activity timestamp
- `created_at`: Device registration timestamp

---

### 3.4 Conversations Table

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL,            -- 'one_to_one', 'group'
    encryption_type VARCHAR(20) NOT NULL DEFAULT 'e2ee',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT type_check CHECK (type IN ('one_to_one', 'group')),
    CONSTRAINT encryption_check CHECK (encryption_type IN ('e2ee', 'none'))
);

CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

**Columns:**
- `id`: Unique conversation identifier
- `type`: Conversation type (one-to-one or group)
- `encryption_type`: Always 'e2ee' for Zynk
- `created_at`: Conversation creation timestamp
- `updated_at`: Last message timestamp

---

### 3.5 Conversation Participants Table

```sql
CREATE TABLE conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',    -- 'admin', 'member'
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMP,
    
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
```

**Columns:**
- `conversation_id`: Conversation reference
- `user_id`: Participant reference
- `role`: User's role (admin can modify conversation)
- `joined_at`: When user joined conversation
- `last_read_at`: Last message read timestamp

---

### 3.6 Messages Table (Partitioned)

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    encrypted_content BYTEA NOT NULL,     -- E2EE encrypted message
    content_hash VARCHAR(64) NOT NULL,    -- SHA-256 for integrity
    message_type VARCHAR(20) NOT NULL,    -- 'text', 'image', 'file', 'audio', 'video'
    metadata JSONB,                       -- Reply_to, mentions, etc.
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    expires_at TIMESTAMP,                 -- For self-destructing messages
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMP,
    deleted_at TIMESTAMP,
    
    CONSTRAINT message_type_check CHECK (
        message_type IN ('text', 'image', 'file', 'audio', 'video', 'location')
    ),
    CONSTRAINT status_check CHECK (
        status IN ('sent', 'delivered', 'read', 'failed')
    )
) PARTITION BY RANGE (created_at);

-- Indexes on parent table
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_status ON messages(status, created_at) WHERE status = 'sent';
CREATE INDEX idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL;

-- Create monthly partitions
CREATE TABLE messages_2026_01 PARTITION OF messages
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE messages_2026_02 PARTITION OF messages
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE messages_2026_03 PARTITION OF messages
FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Future partitions created automatically by pg_partman
```

**Columns:**
- `id`: Unique message identifier
- `conversation_id`: Conversation reference
- `sender_id`: Message sender
- `encrypted_content`: E2EE encrypted message content (binary)
- `content_hash`: SHA-256 hash for integrity verification
- `message_type`: Type of message (text, media, file, etc.)
- `metadata`: JSON for reply_to, mentions, reactions
- `status`: Delivery status
- `expires_at`: Expiration timestamp for self-destruct
- `created_at`: Send timestamp
- `edited_at`: Last edit timestamp
- `deleted_at`: Soft delete timestamp

**Metadata JSON Structure:**
```json
{
  "reply_to_id": "uuid",
  "mentions": ["uuid1", "uuid2"],
  "reactions": {
    "👍": ["uuid1", "uuid2"],
    "❤️": ["uuid3"]
  },
  "edited": true
}
```

---

### 3.7 Groups Table

```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    max_members INT DEFAULT 256,
    encryption_mode VARCHAR(20) NOT NULL DEFAULT 'sender_keys',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT encryption_mode_check CHECK (
        encryption_mode IN ('sender_keys', 'shared_secret')
    )
);

CREATE INDEX idx_groups_created_by ON groups(created_by);
CREATE INDEX idx_groups_created_at ON groups(created_at DESC);
```

**Columns:**
- `id`: Unique group identifier
- `name`: Group name (required)
- `description`: Group description
- `avatar_url`: Group avatar URL
- `max_members`: Maximum allowed members
- `encryption_mode`: Sender keys (Signal) or shared secret
- `created_by`: Group creator
- `created_at`: Group creation timestamp
- `updated_at`: Last group update timestamp

---

### 3.8 Group Members Table

```sql
CREATE TABLE group_members (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_group ON group_members(group_id);
```

**Columns:**
- `group_id`: Group reference
- `user_id`: Member reference
- `role`: Member role (admin or member)
- `joined_at`: Join timestamp
- `invited_by`: Inviter reference

---

### 3.9 Files Table

```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID NOT NULL REFERENCES users(id),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,            -- Bytes
    mime_type VARCHAR(100),
    storage_path TEXT NOT NULL,           -- S3 key
    encryption_key_encrypted BYTEA,       -- Encrypted AES key
    content_hash VARCHAR(64) NOT NULL,    -- SHA-256
    thumbnail_path TEXT,                  -- S3 key for thumbnail
    metadata JSONB,                       -- Width, height, duration, etc.
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    
    CONSTRAINT file_size_check CHECK (file_size > 0 AND file_size <= 2147483648)  -- Max 2GB
);

CREATE INDEX idx_files_uploader ON files(uploader_id);
CREATE INDEX idx_files_conversation ON files(conversation_id);
CREATE INDEX idx_files_expires ON files(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_files_created ON files(created_at DESC);
```

**Columns:**
- `id`: Unique file identifier
- `uploader_id`: Uploader reference
- `conversation_id`: Associated conversation
- `filename`: Original filename
- `file_size`: File size in bytes
- `mime_type`: MIME type (e.g., image/jpeg)
- `storage_path`: S3 object key
- `encryption_key_encrypted`: AES key encrypted with user's public key
- `content_hash`: SHA-256 hash for integrity
- `thumbnail_path`: Thumbnail S3 key (for images/videos)
- `metadata`: JSON for dimensions, duration, etc.
- `expires_at`: File expiration timestamp
- `created_at`: Upload timestamp
- `deleted_at`: Soft delete timestamp

**Metadata JSON Structure:**
```json
{
  "width": 1920,
  "height": 1080,
  "duration_seconds": 120,
  "codec": "h264"
}
```

---

### 3.10 Calls Table

```sql
CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiator_id UUID NOT NULL REFERENCES users(id),
    call_type VARCHAR(20) NOT NULL,       -- 'audio', 'video'
    status VARCHAR(20) NOT NULL DEFAULT 'initiated',
    conversation_id UUID REFERENCES conversations(id),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT call_type_check CHECK (call_type IN ('audio', 'video')),
    CONSTRAINT status_check CHECK (
        status IN ('initiated', 'ringing', 'in_progress', 'ended', 'missed', 'declined')
    )
);

CREATE INDEX idx_calls_initiator ON calls(initiator_id);
CREATE INDEX idx_calls_conversation ON calls(conversation_id);
CREATE INDEX idx_calls_created ON calls(created_at DESC);
```

**Columns:**
- `id`: Unique call identifier
- `initiator_id`: Call initiator
- `call_type`: Audio or video
- `status`: Call status
- `conversation_id`: Associated conversation
- `started_at`: Call start timestamp
- `ended_at`: Call end timestamp
- `duration_seconds`: Call duration
- `created_at`: Call creation timestamp

---

### 3.11 Call Participants Table

```sql
CREATE TABLE call_participants (
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP,
    left_at TIMESTAMP,
    
    PRIMARY KEY (call_id, user_id)
);

CREATE INDEX idx_call_participants_user ON call_participants(user_id);
CREATE INDEX idx_call_participants_call ON call_participants(call_id);
```

**Columns:**
- `call_id`: Call reference
- `user_id`: Participant reference
- `joined_at`: Join timestamp
- `left_at`: Leave timestamp

---

### 3.12 Sessions Table (Alternative to Redis)

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    session_token VARCHAR(512) UNIQUE NOT NULL,
    refresh_token VARCHAR(512) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    refresh_expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_device ON sessions(device_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

---

## 4. Redis Data Structures

### 4.1 Session Tokens (String)

```
Key: session:{token}
Value: {user_id}:{device_id}
TTL: 2592000 seconds (30 days)

Example:
SET session:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... "user_uuid:device_uuid" EX 2592000
```

### 4.2 Online Users (Sorted Set)

```
Key: online_users
Score: timestamp (for TTL management)
Member: user_id

Example:
ZADD online_users 1706000000 "user_uuid"
```

### 4.3 Typing Indicators (String with TTL)

```
Key: typing:{conversation_id}:{user_id}
Value: 1
TTL: 5 seconds

Example:
SETEX typing:conv_uuid:user_uuid 5 "1"
```

### 4.4 User Presence Cache (Hash)

```
Key: presence:{user_id}
Fields:
  - status: online | away | offline
  - last_seen: timestamp
  - device_id: uuid

Example:
HMSET presence:user_uuid status "online" last_seen 1706000000 device_id "device_uuid"
EXPIRE presence:user_uuid 60
```

### 4.5 Message Queue (List)

```
Key: queue:messages:{recipient_id}
Value: JSON message object

Example:
LPUSH queue:messages:user_uuid '{"message_id":"uuid","encrypted_content":"..."}'
```

### 4.6 User Location (Geospatial)

```
Key: locations
Longitude, Latitude, Member: user_id
TTL: 300 seconds (5 minutes)

Example:
GEOADD locations -122.4194 37.7749 "user_uuid"
EXPIRE locations 300

Query:
GEORADIUS locations -122.4194 37.7749 1000 m WITHDIST
```

### 4.7 Group Member Cache (Set)

```
Key: group_members:{group_id}
Members: user_ids

Example:
SADD group_members:group_uuid "user_uuid1" "user_uuid2"
EXPIRE group_members:group_uuid 600  # 10 minutes
```

### 4.8 Rate Limiting (String with TTL)

```
Key: ratelimit:{ip}:{endpoint}
Value: request_count
TTL: 3600 seconds (1 hour)

Example:
INCR ratelimit:192.168.1.1:/api/v1/messages
EXPIRE ratelimit:192.168.1.1:/api/v1/messages 3600
```

---

## 5. Data Relationships

### 5.1 User Relationships

```
User
  ├── 1:1 → User_Profile
  ├── 1:N → Devices
  ├── 1:N → Messages (as sender)
  ├── 1:N → Files (as uploader)
  ├── 1:N → Calls (as initiator)
  ├── N:M → Conversations (via Conversation_Participants)
  └── N:M → Groups (via Group_Members)
```

### 5.2 Conversation Relationships

```
Conversation
  ├── 1:N → Messages
  ├── 1:N → Files
  ├── 1:N → Calls
  └── N:M → Users (via Conversation_Participants)
```

### 5.3 Group Relationships

```
Group
  ├── 1:1 → Conversation
  ├── 1:N → Group_Members
  └── 1:1 → User (created_by)
```

---

## 6. Data Lifecycle

### 6.1 Message Retention

- **Delivered Messages:** Retained indefinitely (unless deleted)
- **Undelivered Messages:** 30-day retention, then deleted
- **Self-Destruct Messages:** Deleted after expires_at timestamp
- **Deleted Messages:** Soft delete (deleted_at set), purged after 30 days

### 6.2 File Retention

- **Active Files:** Retained per expiration setting (1 hour to 30 days, or indefinite)
- **Expired Files:** Deleted from S3 and database
- **Orphaned Files:** Weekly cleanup job

### 6.3 Call Records

- **Metadata Only:** Stored indefinitely
- **No Content:** Media is P2P, never stored on server

### 6.4 Session Management

- **Session Tokens:** 30-day TTL in Redis
- **Refresh Tokens:** 90-day TTL, rotated on use
- **Expired Sessions:** Deleted from Redis automatically

---

## 7. Data Encryption

### 7.1 Encryption at Rest (Database)

```sql
-- Enable pgcrypto extension
CREATE EXTENSION pgcrypto;

-- Encrypt sensitive fields
CREATE TABLE sensitive_data (
    id UUID PRIMARY KEY,
    encrypted_field BYTEA NOT NULL,
    encryption_key_id VARCHAR(64) NOT NULL
);

-- Encrypt on insert
INSERT INTO sensitive_data (encrypted_field, encryption_key_id)
VALUES (pgp_sym_encrypt('sensitive data', 'encryption_key'), 'key_id_1');

-- Decrypt on select
SELECT pgp_sym_decrypt(encrypted_field, 'encryption_key') FROM sensitive_data;
```

### 7.2 Client-Side Encryption

- **Messages:** Encrypted with Signal Protocol (Double Ratchet)
- **Files:** Encrypted with AES-256-GCM before upload
- **Metadata:** Minimal, stored in plaintext for routing

---

## 8. Database Migrations

### 8.1 Migration Tool

**Tool:** golang-migrate or Flyway

**Migration Files:**
```
migrations/
  ├── 001_create_users_table.up.sql
  ├── 001_create_users_table.down.sql
  ├── 002_create_devices_table.up.sql
  ├── 002_create_devices_table.down.sql
  ...
```

### 8.2 Migration Strategy

1. **Backward Compatible:** New migrations must not break existing code
2. **Versioned:** Each migration has a version number
3. **Reversible:** Each migration has an "up" and "down" script
4. **Tested:** Migrations tested in staging before production
5. **Automated:** Migrations run automatically in CI/CD pipeline

---

## 9. Data Backup & Recovery

### 9.1 PostgreSQL Backup

**Strategy:**
- Continuous WAL archiving to S3
- Daily full backup at 2 AM UTC
- Point-in-time recovery enabled

**Retention:**
- Full backups: 30 days
- WAL archives: 7 days

**Recovery Procedure:**
```bash
# Restore from backup
pg_restore -d zynk_production backup_2026_02_07.dump

# Point-in-time recovery
pg_ctl stop
rm -rf $PGDATA/*
pg_basebackup -D $PGDATA
# Set recovery.conf with recovery_target_time
pg_ctl start
```

### 9.2 Redis Backup

**Strategy:**
- RDB snapshots every 6 hours
- AOF (Append-Only File) enabled

**Retention:**
- RDB snapshots: 7 days
- AOF: Current day only

---

## 10. Data Analytics (TimescaleDB)

### 10.1 Analytics Schema

```sql
CREATE TABLE message_events (
    time TIMESTAMPTZ NOT NULL,
    user_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    metadata JSONB
);

SELECT create_hypertable('message_events', 'time');

-- Continuous aggregates for daily stats
CREATE MATERIALIZED VIEW daily_message_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) AS day,
    user_id,
    event_type,
    COUNT(*) as count
FROM message_events
GROUP BY day, user_id, event_type;
```

---

**Document Control:**  
Classification: Internal  
Distribution: Engineering, Data Teams  
Review Cycle: With schema changes

---

## 11. Blockchain Data Models

### 11.1 Blockchain Identities Table (PostgreSQL)

```sql
CREATE TABLE blockchain_identities (
    did VARCHAR(66) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    trust_score INT NOT NULL DEFAULT 50,
    is_verified BOOLEAN DEFAULT false,
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    blockchain_registered_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT trust_score_range CHECK (trust_score >= 0 AND trust_score <= 100),
    UNIQUE(user_id)
);

CREATE INDEX idx_blockchain_identities_user ON blockchain_identities(user_id);
CREATE INDEX idx_blockchain_identities_verified ON blockchain_identities(is_verified);
CREATE INDEX idx_blockchain_identities_trust ON blockchain_identities(trust_score DESC);
```

**Columns:**
- `did`: Decentralized Identifier (did:zynk:user_uuid)
- `user_id`: Reference to main users table
- `public_key`: User's blockchain public key
- `trust_score`: Reputation score (0-100)
- `is_verified`: Whether identity is verified on blockchain
- `transaction_hash`: Blockchain transaction hash
- `block_number`: Block number where registered
- `blockchain_registered_at`: Registration timestamp
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

---

### 11.2 Blockchain Transactions Table (PostgreSQL)

```sql
CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_hash VARCHAR(66) UNIQUE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    from_address VARCHAR(42),
    to_address VARCHAR(42),
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66),
    gas_used BIGINT,
    user_id UUID REFERENCES users(id),
    related_entity_id UUID,  -- message_id, file_id, etc.
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    
    CONSTRAINT transaction_type_check CHECK (
        transaction_type IN (
            'identity_registration',
            'trust_score_update',
            'message_anchor',
            'credential_issuance'
        )
    ),
    CONSTRAINT status_check CHECK (
        status IN ('pending', 'confirmed', 'failed')
    )
);

CREATE INDEX idx_blockchain_tx_hash ON blockchain_transactions(transaction_hash);
CREATE INDEX idx_blockchain_tx_user ON blockchain_transactions(user_id);
CREATE INDEX idx_blockchain_tx_type ON blockchain_transactions(transaction_type);
CREATE INDEX idx_blockchain_tx_block ON blockchain_transactions(block_number);
CREATE INDEX idx_blockchain_tx_status ON blockchain_transactions(status, created_at);
```

**Columns:**
- `id`: Unique transaction record identifier
- `transaction_hash`: Blockchain transaction hash (0x...)
- `transaction_type`: Type of blockchain transaction
- `from_address`: Sender's blockchain address
- `to_address`: Smart contract or recipient address
- `block_number`: Block number where transaction was included
- `block_hash`: Hash of the block
- `gas_used`: Gas consumed by transaction
- `user_id`: Associated Zynk user
- `related_entity_id`: Associated message, file, etc.
- `status`: Transaction status
- `created_at`: Transaction creation timestamp
- `confirmed_at`: Blockchain confirmation timestamp

---

### 11.3 Message Anchors Table (PostgreSQL)

```sql
CREATE TABLE message_anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merkle_root VARCHAR(64) NOT NULL,
    message_count INT NOT NULL,
    transaction_hash VARCHAR(66),
    block_number BIGINT,
    anchored_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(merkle_root)
);

CREATE INDEX idx_message_anchors_block ON message_anchors(block_number);
CREATE INDEX idx_message_anchors_time ON message_anchors(anchored_at DESC);
```

**Columns:**
- `id`: Unique anchor record identifier
- `merkle_root`: Root hash of Merkle tree
- `message_count`: Number of messages in this batch
- `transaction_hash`: Blockchain transaction hash
- `block_number`: Block number where anchored
- `anchored_at`: Anchor timestamp

---

### 11.4 Message Merkle Proofs Table (PostgreSQL)

```sql
CREATE TABLE message_merkle_proofs (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) NOT NULL,
    merkle_root_id UUID NOT NULL REFERENCES message_anchors(id),
    proof JSONB NOT NULL,  -- Array of hashes for proof
    leaf_index INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merkle_proofs_root ON message_merkle_proofs(merkle_root_id);
CREATE INDEX idx_merkle_proofs_hash ON message_merkle_proofs(content_hash);
```

**Columns:**
- `message_id`: Reference to message
- `content_hash`: SHA-256 hash of message content
- `merkle_root_id`: Reference to anchor batch
- `proof`: JSON array of sibling hashes for verification
- `leaf_index`: Position in Merkle tree
- `created_at`: Proof creation timestamp

**Proof JSON Structure:**
```json
{
  "siblings": [
    {"position": "left", "hash": "abc123..."},
    {"position": "right", "hash": "def456..."},
    {"position": "left", "hash": "ghi789..."}
  ]
}
```

---

### 11.5 Trust Score History Table (PostgreSQL)

```sql
CREATE TABLE trust_score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    did VARCHAR(66) NOT NULL REFERENCES blockchain_identities(did),
    old_score INT NOT NULL,
    new_score INT NOT NULL,
    change_reason VARCHAR(100) NOT NULL,
    transaction_hash VARCHAR(66),
    changed_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT score_range CHECK (
        old_score >= 0 AND old_score <= 100 AND
        new_score >= 0 AND new_score <= 100
    )
);

CREATE INDEX idx_trust_history_did ON trust_score_history(did, created_at DESC);
CREATE INDEX idx_trust_history_time ON trust_score_history(created_at DESC);
```

**Columns:**
- `id`: Unique history record identifier
- `did`: Decentralized identifier
- `old_score`: Previous trust score
- `new_score`: Updated trust score
- `change_reason`: Reason for score change
- `transaction_hash`: Blockchain transaction hash
- `changed_by`: User who triggered change (if applicable)
- `created_at`: Change timestamp

**Change Reasons:**
- `verified_by_community`
- `spam_report`
- `account_age_milestone`
- `message_volume_threshold`
- `manual_adjustment`

---

### 11.6 LevelDB Structure (Go Blockchain)

**Block Storage:**
```
Key Format: "block:{block_number}"
Value: JSON-encoded block data

Example:
Key: "block:12345"
Value: {
  "index": 12345,
  "timestamp": 1706000000,
  "transactions": [...],
  "prev_hash": "0xabc...",
  "hash": "0xdef...",
  "validator": "validator_address"
}
```

**Transaction Index:**
```
Key Format: "tx:{transaction_hash}"
Value: JSON-encoded transaction data

Example:
Key: "tx:0xabc123..."
Value: {
  "hash": "0xabc123...",
  "type": "identity_registration",
  "block_number": 12345,
  "data": {...}
}
```

**State Storage:**
```
Key Format: "state:identity:{did}"
Value: JSON-encoded identity state

Example:
Key: "state:identity:did:zynk:abc123"
Value: {
  "did": "did:zynk:abc123",
  "public_key": "base64...",
  "trust_score": 75,
  "is_active": true
}
```

**Merkle Tree Storage:**
```
Key Format: "merkle:{root_hash}"
Value: JSON-encoded tree structure

Example:
Key: "merkle:abc123def456..."
Value: {
  "root": "abc123def456...",
  "leaves": ["hash1", "hash2", ...],
  "tree_depth": 10,
  "message_count": 1024
}
```

---

### 11.7 Redis Blockchain Cache

**Pending Transactions:**
```
Key: blockchain:pending_tx:{transaction_hash}
Value: JSON transaction data
TTL: 3600 seconds (1 hour)

Example:
SET blockchain:pending_tx:0xabc123 '{"type":"identity_registration",...}' EX 3600
```

**Latest Block:**
```
Key: blockchain:latest_block
Value: Block number

Example:
SET blockchain:latest_block "12500"
```

**Validator Status:**
```
Key: blockchain:validator:{address}
Value: JSON validator info
TTL: 300 seconds (5 minutes)

Example:
HMSET blockchain:validator:0xabc123 stake "1000" active "true" last_block "12499"
EXPIRE blockchain:validator:0xabc123 300
```

**Unanchored Message Hashes:**
```
Key: blockchain:unanchored_hashes
Value: List of message hashes awaiting anchoring

Example:
LPUSH blockchain:unanchored_hashes "hash1" "hash2" "hash3"
```

---

### 11.8 Data Relationships

```
User
  └── 1:1 → Blockchain_Identity (DID)
              ├── 1:N → Trust_Score_History
              └── 1:N → Blockchain_Transactions

Message
  └── 1:1 → Message_Merkle_Proof
              └── N:1 → Message_Anchor
                        └── 1:1 → Blockchain_Transaction

Blockchain_Transaction
  └── N:1 → Block (in LevelDB)
```

---

### 11.9 Blockchain Data Lifecycle

**Identity Registration:**
1. User registers in PostgreSQL
2. DID created and stored in `blockchain_identities`
3. Transaction submitted to blockchain
4. Record in `blockchain_transactions` with status='pending'
5. Block mined, transaction confirmed
6. Update `blockchain_transactions` status='confirmed'
7. Update `blockchain_identities` with block_number

**Message Anchoring:**
1. Messages accumulate (hourly batch)
2. Hashes collected from Redis `blockchain:unanchored_hashes`
3. Merkle tree built
4. Root anchored to blockchain
5. Record created in `message_anchors`
6. Proofs stored in `message_merkle_proofs`
7. Clear Redis queue

**Trust Score Update:**
1. Score calculation triggered (user report, milestone, etc.)
2. New score computed
3. Transaction submitted to blockchain
4. Record in `trust_score_history`
5. Update `blockchain_identities` trust_score
6. Emit WebSocket event to user

---

### 11.10 Blockchain Data Queries

**Get User's Blockchain Identity:**
```sql
SELECT bi.*, u.username
FROM blockchain_identities bi
JOIN users u ON bi.user_id = u.id
WHERE u.id = 'user_uuid';
```

**Get Message Anchor Proof:**
```sql
SELECT ma.merkle_root, ma.transaction_hash, ma.block_number,
       mp.proof, mp.leaf_index
FROM message_merkle_proofs mp
JOIN message_anchors ma ON mp.merkle_root_id = ma.id
WHERE mp.message_id = 'message_uuid';
```

**Get Trust Score Trend:**
```sql
SELECT created_at, new_score, change_reason
FROM trust_score_history
WHERE did = 'did:zynk:user_uuid'
ORDER BY created_at DESC
LIMIT 10;
```

**Get Recent Blockchain Transactions:**
```sql
SELECT transaction_hash, transaction_type, status, created_at
FROM blockchain_transactions
WHERE user_id = 'user_uuid'
ORDER BY created_at DESC
LIMIT 20;
```

---

