# Database Schema

Complete PostgreSQL database schema documentation for Zynk.

## Table of Contents
- [Overview](#overview)
- [Schema Diagram](#schema-diagram)
- [Core Models](#core-models)
- [Conversation & Messaging](#conversation--messaging)
- [Group Management](#group-management)
- [E2EE Key Management](#e2ee-key-management)
- [File Sharing](#file-sharing)
- [Voice & Video Calls](#voice--video-calls)
- [Polls](#polls)
- [Indexes & Performance](#indexes--performance)
- [Enums](#enums)

---

## Overview

### Database Information
- **Database**: PostgreSQL 16
- **ORM**: Prisma 7.3
- **Total Models**: 21 tables
- **Total Enums**: 8 enumerations
- **Relationships**: Comprehensive foreign keys with cascade deletes
- **Indexing Strategy**: All foreign keys + frequent query patterns indexed

### Design Principles
1. **Referential Integrity**: All foreign keys with proper ON DELETE rules
2. **Soft Deletes**: Messages and files use `deleted_at` timestamps
3. **Optimistic Locking**: `updated_at` triggers on every update
4. **UUID Primary Keys**: For security and distributed systems
5. **Cascading Deletes**: Automatic cleanup of dependent records
6. **Composite Primary Keys**: For junction tables (many-to-many)

---

## Schema Diagram

```
┌──────────────────┐
│      User        │
└────────┬─────────┘
         │
         ├─────────── UserProfile (1:1)
         ├─────────── Device (1:N)
         │            └── Session (1:N)
         │            └── IdentityKey, SignedPreKey, PreKey
         │
         ├─────────── ConversationParticipant (M:N)
         │            └── Conversation
         │                ├── Messages
         │                ├── Group (1:1)
         │                ├── Files
         │                ├── Calls
         │                ├── Polls
         │                └── GroupSenderKey
         │
         ├─────────── GroupMember (M:N)
         │            └── Group
         │
         ├─────────── Contact (M:N)
         ├─────────── CallParticipant (M:N)
         │            └── Call
         │
         └─────────── MessageDeletedFor (M:N)
                      └── Messages
```

---

## Core Models

### User
The central user account model.

**Table:** `users`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `username` | VARCHAR(64) | Unique username (indexed) |
| `password_hash` | VARCHAR(255) | Bcrypt password hash |
| `public_key` | TEXT | E2EE identity public key (ECDH P-256) |
| `created_at` | TIMESTAMP(6) | Account creation time |
| `updated_at` | TIMESTAMP(6) | Last update time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`username`)
- INDEX `idx_users_username` (`username`)

**Relationships:**
- 1:1 → `UserProfile`
- 1:N → `Device`, `Session`, `Messages`, `File`, `Call`, `Poll`
- M:N → `ConversationParticipant`, `GroupMember`, `Contact`, `CallParticipant`

**Constraints:**
- Username must be 3-64 characters, alphanumeric + underscore
- Password must meet strength requirements (enforced in application layer)

---

### UserProfile
Extended user information and privacy settings.

**Table:** `user_profiles`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `display_name` | VARCHAR(255) | Display name shown to others |
| `avatar_url` | TEXT | Profile picture URL |
| `bio` | TEXT | User biography |
| `last_seen_at` | TIMESTAMP(6) | Last activity timestamp |
| `privacy_settings` | JSON | Privacy configuration object |
| `created_at` | TIMESTAMP(6) | Profile creation time |
| `updated_at` | TIMESTAMP(6) | Last update time |

**Primary Key:** `user_id`

**Default Privacy Settings:**
```json
{
  "show_last_seen": true,
  "show_online_status": true,
  "allow_read_receipts": true,
  "allow_proximity_discovery": true
}
```

**Cascade:** Deleted when User is deleted

---

### Device
Registered devices for multi-device support.

**Table:** `devices`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `device_name` | VARCHAR(255) | Human-readable device name |
| `device_fingerprint` | VARCHAR(64) | Unique device identifier |
| `public_key` | TEXT | Device-specific public key |
| `push_token` | TEXT | FCM/APNs push notification token |
| `platform` | Platform | Enum: web, ios, android, desktop |
| `last_active_at` | TIMESTAMP(6) | Last activity time |
| `created_at` | TIMESTAMP(6) | Device registration time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`user_id`, `device_fingerprint`)
- INDEX `idx_devices_user_id` (`user_id`)
- INDEX `idx_devices_fingerprint` (`device_fingerprint`)

**Constraints:**
- Max 5 devices per user (enforced in application layer)

---

### Session
JWT session tokens with refresh token support.

**Table:** `sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `device_id` | UUID | Foreign key to Device (CASCADE DELETE) |
| `session_token` | VARCHAR(512) | JWT access token (indexed) |
| `refresh_token` | VARCHAR(512) | JWT refresh token (unique) |
| `expires_at` | TIMESTAMP(6) | Access token expiration |
| `refresh_expires_at` | TIMESTAMP(6) | Refresh token expiration |
| `created_at` | TIMESTAMP(6) | Session creation time |
| `last_used_at` | TIMESTAMP(6) | Last use time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`session_token`, `refresh_token`)
- INDEX `idx_sessions_token` (`session_token`)
- INDEX `idx_sessions_user` (`user_id`)
- INDEX `idx_sessions_device` (`device_id`)
- INDEX `idx_sessions_expires` (`expires_at`)

**Security Features:**
- Tokens validated against database (revocation support)
- Cached in Redis for 5 minutes to reduce DB load
- Expired sessions automatically denied even if JWT is valid

---

## Conversation & Messaging

### Conversation
Container for messages (one-to-one or group).

**Table:** `conversations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `type` | ConversationType | Enum: one_to_one, group |
| `encryption_type` | EncryptionType | Enum: e2ee (default), standard |
| `created_at` | TIMESTAMP(6) | Creation time |
| `updated_at` | TIMESTAMP(6) | Last message time (indexed DESC) |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_conversations_type` (`type`)
- INDEX `idx_conversations_updated` (`updated_at DESC`)

**Relationships:**
- 1:N → `Messages`, `File`, `Call`, `Poll`, `GroupSenderKey`
- 1:1 → `Group` (optional, only if type=group)
- M:N → `ConversationParticipant`

---

### ConversationParticipant
Junction table linking users to conversations.

**Table:** `conversation_participants`

| Column | Type | Description |
|--------|------|-------------|
| `conversation_id` | UUID | Foreign key to Conversation (CASCADE DELETE) |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `role` | ParticipantRole | Enum: member, admin, moderator |
| `joined_at` | TIMESTAMP(6) | Join time |
| `last_read_at` | TIMESTAMP(6) | Last read message timestamp |

**Primary Key:** Composite (`conversation_id`, `user_id`)

**Indexes:**
- INDEX `idx_participants_conversation` (`conversation_id`)
- INDEX `idx_participants_user` (`user_id`)

**Purpose:**
- Access control (who can read/send messages)
- Unread count calculation (`last_read_at` vs message `created_at`)
- Read receipts tracking

---

### Messages
Encrypted messages within conversations.

**Table:** `messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | Foreign key to Conversation (CASCADE DELETE) |
| `sender_id` | UUID | Foreign key to User (NO ACTION) |
| `encrypted_content` | TEXT | E2EE encrypted message envelope |
| `content_hash` | VARCHAR(64) | SHA-256 hash for integrity |
| `message_type` | MessageType | Enum: text, image, file, audio, video, location, contact, poll |
| `metadata` | JSON | Reply-to, mentions, reactions, edited flag |
| `status` | MessageStatus | Enum: sent, delivered, read, failed |
| `expires_at` | TIMESTAMP(6) | Self-destruct time (optional) |
| `created_at` | TIMESTAMP(6) | Send time |
| `edited_at` | TIMESTAMP(6) | Last edit time |
| `deleted_at` | TIMESTAMP(6) | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_messages_conversation` (`conversation_id`, `created_at DESC`)
- INDEX `idx_messages_sender` (`sender_id`)
- INDEX `idx_messages_status` (`status`, `created_at`)
- INDEX `idx_messages_expires` (`expires_at`)

**Soft Delete:**
- `deleted_at` set when deleted "for everyone"
- Per-user deletions tracked in `MessageDeletedFor` table

**Metadata Examples:**
```json
{
  "reply_to_id": "msg_uuid",
  "mentions": ["user_uuid1", "user_uuid2"],
  "reactions": {"👍": ["user_uuid1"], "❤️": ["user_uuid2"]},
  "edited": true,
  "temp_id": "client_generated_id"
}
```

---

### MessageDeletedFor
Tracks per-user message deletions ("delete for me").

**Table:** `message_deleted_for`

| Column | Type | Description |
|--------|------|-------------|
| `message_id` | UUID | Foreign key to Messages (CASCADE DELETE) |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `deleted_at` | TIMESTAMP(6) | Deletion timestamp |

**Primary Key:** Composite (`message_id`, `user_id`)

**Indexes:**
- INDEX `idx_message_deleted_for_user` (`user_id`)

---

## Group Management

### Group
Named group chat metadata.

**Table:** `groups`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Group name |
| `description` | TEXT | Group description |
| `avatar_url` | TEXT | Group avatar image URL |
| `conversation_id` | UUID | Foreign key to Conversation (CASCADE DELETE, UNIQUE) |
| `max_members` | INTEGER | Maximum member count (default 256) |
| `created_by` | UUID | Foreign key to User (NO ACTION) |
| `created_at` | TIMESTAMP(6) | Creation time |
| `updated_at` | TIMESTAMP(6) | Last update time |

**Indexes:**
- PRIMARY KEY (`id`)
- UNIQUE (`conversation_id`)
- INDEX `idx_groups_created_by` (`created_by`)
- INDEX `idx_groups_created_at` (`created_at DESC`)

---

### GroupMember
Junction table for group membership.

**Table:** `group_members`

| Column | Type | Description |
|--------|------|-------------|
| `group_id` | UUID | Foreign key to Group (CASCADE DELETE) |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `role` | ParticipantRole | Enum: member, admin, moderator |
| `joined_at` | TIMESTAMP(6) | Join time |
| `invited_by` | UUID | Foreign key to User (NO ACTION) |

**Primary Key:** Composite (`group_id`, `user_id`)

**Indexes:**
- INDEX `idx_group_members_user` (`user_id`)

**Roles:**
- **admin**: Can add/remove members, change group settings, delete group
- **moderator**: Can remove members
- **member**: Regular member

---

## E2EE Key Management

All E2EE key models support Signal Protocol-inspired key infrastructure.

### IdentityKey
Long-term identity key per user+device.

**Table:** `identity_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `device_id` | UUID | Foreign key to Device (CASCADE DELETE) |
| `identity_key` | TEXT | Base64-encoded ECDH P-256 public key |
| `registration_id` | INTEGER | Signal Protocol registration ID |
| `created_at` | TIMESTAMP(6) | Key upload time |
| `updated_at` | TIMESTAMP(6) | Last update time |

**Unique Constraint:** (`user_id`, `device_id`)

**Indexes:**
- INDEX `idx_identity_keys_user` (`user_id`)

---

### SignedPreKey
Medium-term rotating key (one per device).

**Table:** `signed_pre_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `device_id` | UUID | Foreign key to Device (CASCADE DELETE) |
| `key_id` | INTEGER | Signal Protocol key ID |
| `public_key` | TEXT | Base64-encoded public key |
| `signature` | TEXT | Base64-encoded signature |
| `created_at` | TIMESTAMP(6) | Key upload time |

**Unique Constraint:** (`user_id`, `device_id`, `key_id`)

**Indexes:**
- INDEX `idx_signed_pre_keys_user_device` (`user_id`, `device_id`)

**Rotation:** Old signed pre-keys deleted when new one uploaded.

---

### PreKey
One-time ephemeral pre-keys consumed during session establishment.

**Table:** `pre_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `device_id` | UUID | Foreign key to Device (CASCADE DELETE) |
| `key_id` | INTEGER | Signal Protocol key ID |
| `public_key` | TEXT | Base64-encoded public key |
| `used` | BOOLEAN | Marked true when consumed |
| `created_at` | TIMESTAMP(6) | Key upload time |

**Unique Constraint:** (`user_id`, `device_id`, `key_id`)

**Indexes:**
- INDEX `idx_pre_keys_user_device_used` (`user_id`, `device_id`, `used`)

**Consumption:**
- Atomically marked as `used=true` when fetched in bundle
- Prevents race conditions using database transactions
- Client should replenish when count < 10

---

### GroupSenderKey
Group E2EE sender key distribution.

**Table:** `group_sender_keys`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | Foreign key to Conversation (CASCADE DELETE) |
| `sender_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `recipient_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `key_id` | INTEGER | Incrementing version (bumped on rotation) |
| `encrypted_key` | TEXT | Sender's AES-256 key encrypted for recipient |
| `created_at` | TIMESTAMP(6) | Distribution time |

**Unique Constraint:** (`conversation_id`, `sender_id`, `recipient_id`, `key_id`)

**Indexes:**
- INDEX `idx_group_sender_keys_conv_recipient` (`conversation_id`, `recipient_id`)
- INDEX `idx_group_sender_keys_conv_sender` (`conversation_id`, `sender_id`)

**How It Works:**
1. Each group member generates an AES-256 sender key
2. Sender key is encrypted via 1:1 ECDH with each recipient
3. Recipients decrypt using their private key
4. Messages encrypted with sender's AES key, decrypted by all recipients

---

## File Sharing

### File
Uploaded file metadata with soft delete.

**Table:** `files`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `uploader_id` | UUID | Foreign key to User (NO ACTION) |
| `conversation_id` | UUID | Foreign key to Conversation (NO ACTION) |
| `filename` | VARCHAR(255) | Original filename |
| `file_size` | BIGINT | Size in bytes |
| `mime_type` | VARCHAR(100) | Content type |
| `storage_path` | TEXT | Server-side random filename |
| `content_hash` | VARCHAR(64) | SHA-256 hash for integrity/ETag |
| `thumbnail_path` | TEXT | Generated thumbnail filename |
| `metadata` | JSON | Original name, dimensions, duration, etc. |
| `expires_at` | TIMESTAMP(6) | Expiration time (optional) |
| `created_at` | TIMESTAMP(6) | Upload time |
| `deleted_at` | TIMESTAMP(6) | Soft delete timestamp |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_files_uploader` (`uploader_id`)
- INDEX `idx_files_conversation` (`conversation_id`)
- INDEX `idx_files_created` (`created_at DESC`)
- INDEX `idx_files_expires` (`expires_at`)

**Security:**
- Random server-side filenames (prevents overwriting)
- SHA-256 content hashing for integrity
- Blocked executable extensions
- MIME type validation

---

## Voice & Video Calls

### Call
Call lifecycle tracking.

**Table:** `calls`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `initiator_id` | UUID | Foreign key to User (NO ACTION) |
| `call_type` | CallType | Enum: audio, video |
| `status` | CallStatus | Enum: initiated, ringing, in_progress, ended, missed, declined |
| `conversation_id` | UUID | Foreign key to Conversation (NO ACTION) |
| `started_at` | TIMESTAMP(6) | Time when answered |
| `ended_at` | TIMESTAMP(6) | Time when ended |
| `duration_seconds` | INTEGER | Computed on end |
| `created_at` | TIMESTAMP(6) | Initiation time |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_calls_initiator` (`initiator_id`)
- INDEX `idx_calls_conversation` (`conversation_id`)
- INDEX `idx_calls_created` (`created_at DESC`)
- INDEX `idx_calls_status` (`status`)

**Status Flow:**
```
initiated → ringing → in_progress → ended
                  ↘ declined
                  ↘ missed (timeout)
```

---

### CallParticipant
Tracks who joined/left a call.

**Table:** `call_participants`

| Column | Type | Description |
|--------|------|-------------|
| `call_id` | UUID | Foreign key to Call (CASCADE DELETE) |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `joined_at` | TIMESTAMP(6) | Join time |
| `left_at` | TIMESTAMP(6) | Leave time |

**Primary Key:** Composite (`call_id`, `user_id`)

**Indexes:**
- INDEX `idx_call_participants_user` (`user_id`)

---

## Polls

### Poll
Poll metadata.

**Table:** `polls`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | Foreign key to Conversation (CASCADE DELETE) |
| `creator_id` | UUID | Foreign key to User (NO ACTION) |
| `question` | VARCHAR(500) | Poll question |
| `allow_multiple` | BOOLEAN | Allow multiple choice votes |
| `is_anonymous` | BOOLEAN | Hide voter identities |
| `closes_at` | TIMESTAMP(6) | Expiration time (optional) |
| `created_at` | TIMESTAMP(6) | Creation time |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_polls_conversation` (`conversation_id`)

---

### PollOption
Individual poll choices.

**Table:** `poll_options`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `poll_id` | UUID | Foreign key to Poll (CASCADE DELETE) |
| `text` | VARCHAR(200) | Option text |

**Indexes:**
- PRIMARY KEY (`id`)
- INDEX `idx_poll_options_poll` (`poll_id`)

---

### PollVote
User votes on poll options.

**Table:** `poll_votes`

| Column | Type | Description |
|--------|------|-------------|
| `option_id` | UUID | Foreign key to PollOption (CASCADE DELETE) |
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `voted_at` | TIMESTAMP(6) | Vote time |

**Primary Key:** Composite (`option_id`, `user_id`)

**Indexes:**
- INDEX `idx_poll_votes_user` (`user_id`)

**Constraints:**
- Single choice polls: Only one vote per user (enforced in application layer)
- Multi-choice polls: User can vote for multiple options

---

## Contact Management

### Contact
User contact list with blocking support.

**Table:** `contacts`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `contact_id` | UUID | Foreign key to User (CASCADE DELETE) |
| `nickname` | VARCHAR(255) | Custom nickname |
| `blocked` | BOOLEAN | Block status (default false) |
| `created_at` | TIMESTAMP(6) | Addition time |

**Primary Key:** Composite (`user_id`, `contact_id`)

**Indexes:**
- INDEX `idx_contacts_user` (`user_id`)
- INDEX `idx_contacts_contact` (`contact_id`)
- INDEX `idx_contacts_user_blocked` (`user_id`, `blocked`)

**Blocked Users:**
- Cannot send messages
- Not shown in search results
- Existing conversations hidden

---

## Indexes & Performance

### Indexing Strategy

#### Primary Keys
All tables use UUID primary keys for security and distributed system support.

#### Foreign Keys
All foreign key columns are indexed for efficient joins and cascade operations.

#### Query Patterns
Indexes added based on common query patterns:
- **Messages**: `(conversation_id, created_at DESC)` for conversation message listing
- **Conversations**: `(updated_at DESC)` for chat list ordering
- **Sessions**: `(session_token)` for authentication lookups
- **PreKeys**: `(user_id, device_id, used)` for bundle fetching

#### Performance Considerations
1. **N+1 Query Prevention**: Use Prisma's `include` to batch fetch related records
2. **Pagination**: All list endpoints support limit/offset
3. **Redis Caching**: Sessions cached for 5 minutes to reduce DB load
4. **Batch Operations**: Multiple inserts use `createMany` with single DB roundtrip
5. **Connection Pooling**: Prisma manages PostgreSQL connection pool

---

## Enums

### Platform
Device platform types.
```sql
enum Platform {
  web
  ios
  android
  desktop
}
```

### ConversationType
Conversation types.
```sql
enum ConversationType {
  one_to_one
  group
}
```

### EncryptionType
Encryption methods.
```sql
enum EncryptionType {
  e2ee      -- End-to-end encrypted (default)
  standard  -- Server-side encrypted (fallback)
}
```

### MessageType
Message content types.
```sql
enum MessageType {
  text
  image
  file
  audio
  video
  location
  contact
  poll
}
```

### MessageStatus
Message delivery lifecycle.
```sql
enum MessageStatus {
  sent       -- Sent to server
  delivered  -- Delivered to recipient's device
  read       -- Read by recipient
  failed     -- Failed to send
}
```

### ParticipantRole
User roles in conversations and groups.
```sql
enum ParticipantRole {
  member
  admin
  moderator
}
```

### CallType
Call types.
```sql
enum CallType {
  audio
  video
}
```

### CallStatus
Call lifecycle states.
```sql
enum CallStatus {
  initiated
  ringing
  in_progress
  ended
  missed
  declined
}
```

---

## Database Migration & Seeding

### Run Migrations
```bash
cd server
npx prisma migrate dev
```

### Generate Prisma Client
```bash
npx prisma generate
```

### Seed Database
```bash
npx tsx prisma/seed.ts
```

### Prisma Studio (Database GUI)
```bash
npx prisma studio
```

---

## Next Steps

For information on how the database integrates with the application, see:
- [Backend API Reference](./02-Backend-API-Reference.md)
- [WebSocket Events](./04-WebSocket-Events.md)
- [Encryption & Security](./06-Encryption-and-Security.md)
