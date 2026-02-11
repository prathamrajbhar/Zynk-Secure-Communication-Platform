-- Database optimization indexes
-- Run these migrations to improve query performance

-- Messages table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_timestamp 
  ON messages (conversation_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_sender 
  ON messages (sender_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_status 
  ON messages (status) WHERE status != 'sent';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_recipient
  ON messages (recipient_id, status) WHERE recipient_id IS NOT NULL;

-- Conversations table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_updated 
  ON conversations (updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_type 
  ON conversations (type);

-- Users table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email 
  ON users (email) WHERE email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username 
  ON users (username);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_seen 
  ON users (last_seen DESC);

-- Call logs indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_caller 
  ON call_logs (caller_id, started_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_call_logs_recipient 
  ON call_logs (recipient_id, started_at DESC);

-- File uploads indexes  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_file_uploads_uploader 
  ON file_uploads (uploader_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_file_uploads_conversation 
  ON file_uploads (conversation_id, created_at DESC);

-- Group members indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_members_user 
  ON group_members (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_members_group 
  ON group_members (group_id);

-- Keys table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keys_user 
  ON keys (user_id);

-- Partial index for unread messages
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread 
  ON messages (recipient_id, conversation_id) 
  WHERE status = 'sent';

-- Composite index for message fetching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_status_time 
  ON messages (conversation_id, status, timestamp DESC);

-- Full-text search index for messages (if using PostgreSQL)
-- Note: This works on plaintext, not encrypted content
-- For encrypted content, search must be done client-side
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_fts 
  ON messages USING GIN (to_tsvector('english', content)) 
  WHERE content IS NOT NULL;

-- Auto-vacuum settings for high-traffic tables
ALTER TABLE messages SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE conversations SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- Add table partitioning for messages (by month)
-- This improves performance for very large message tables

-- First, create the partitioned table structure
-- Note: This requires migrating existing data

-- Create parent table (if not exists)
-- CREATE TABLE messages_partitioned (
--   LIKE messages INCLUDING ALL
-- ) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
-- CREATE TABLE messages_2026_01 PARTITION OF messages_partitioned
--   FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- CREATE TABLE messages_2026_02 PARTITION OF messages_partitioned
--   FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Add more partitions as needed

-- Statistics for query planner
ANALYZE messages;
ANALYZE conversations;
ANALYZE users;
ANALYZE call_logs;
ANALYZE file_uploads;
