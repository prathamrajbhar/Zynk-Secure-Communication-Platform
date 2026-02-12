-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('web', 'ios', 'android', 'desktop');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('one_to_one', 'group');

-- CreateEnum
CREATE TYPE "EncryptionType" AS ENUM ('e2ee', 'standard');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'file', 'audio', 'video', 'location', 'contact', 'poll');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('member', 'admin', 'moderator');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('audio', 'video');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'connecting', 'connected', 'ended', 'missed', 'declined', 'failed');

-- CreateEnum
CREATE TYPE "CallAction" AS ENUM ('answered', 'declined', 'missed', 'ended');

-- CreateEnum
CREATE TYPE "CallEndReason" AS ENUM ('normal', 'timeout', 'declined', 'busy', 'network_failure', 'permission_denied', 'error');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(64) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "public_key" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "bio" TEXT,
    "last_seen_at" TIMESTAMP(6),
    "privacy_settings" JSONB NOT NULL DEFAULT '{"show_last_seen": true, "show_online_status": true, "allow_read_receipts": true, "allow_proximity_discovery": true}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_name" VARCHAR(255),
    "device_fingerprint" VARCHAR(64) NOT NULL,
    "public_key" TEXT,
    "push_token" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'web',
    "last_active_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "session_token" VARCHAR(512) NOT NULL,
    "refresh_token" VARCHAR(512) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "refresh_expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "ConversationType" NOT NULL DEFAULT 'one_to_one',
    "encryption_type" "EncryptionType" NOT NULL DEFAULT 'e2ee',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ParticipantRole" DEFAULT 'member',
    "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(6),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "encrypted_content" TEXT NOT NULL,
    "content_hash" VARCHAR(64),
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "metadata" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'sent',
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMP(6),
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "conversation_id" UUID,
    "max_members" INTEGER DEFAULT 256,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invited_by" UUID,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "uploader_id" UUID NOT NULL,
    "conversation_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "mime_type" VARCHAR(100),
    "storage_path" TEXT NOT NULL,
    "content_hash" VARCHAR(64),
    "thumbnail_path" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "user_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "nickname" VARCHAR(255),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("user_id","contact_id")
);

-- CreateTable
CREATE TABLE "identity_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "identity_key" TEXT NOT NULL,
    "registration_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signed_pre_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "key_id" INTEGER NOT NULL,
    "public_key" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_pre_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "key_id" INTEGER NOT NULL,
    "public_key" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "closes_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "text" VARCHAR(200) NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_sender_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "key_id" INTEGER NOT NULL,
    "encrypted_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_sender_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key_backups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_key_archives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "key_epoch" INTEGER NOT NULL DEFAULT 1,
    "encrypted_key" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "remote_public_key" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_key_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratchet_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "key_epoch" INTEGER NOT NULL DEFAULT 1,
    "sending_chain_idx" INTEGER NOT NULL DEFAULT 0,
    "receiving_chain_idx" INTEGER NOT NULL DEFAULT 0,
    "encrypted_state" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratchet_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "voted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("option_id","user_id")
);

-- CreateTable
CREATE TABLE "message_deleted_for" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_deleted_for_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "call_type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'initiated',
    "initiator_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(6),
    "ended_at" TIMESTAMP(6),
    "duration_seconds" INTEGER,
    "end_reason" "CallEndReason",
    "avg_latency_ms" INTEGER,
    "max_latency_ms" INTEGER,
    "packet_loss_pct" DOUBLE PRECISION,
    "avg_bitrate_kbps" INTEGER,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_participants" (
    "call_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(6),
    "answered_at" TIMESTAMP(6),
    "action" "CallAction" NOT NULL DEFAULT 'missed',

    CONSTRAINT "call_participants_pkey" PRIMARY KEY ("call_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_users_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_devices_user_id" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "idx_devices_fingerprint" ON "devices"("device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "uq_devices_user_fingerprint" ON "devices"("user_id", "device_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "idx_sessions_token" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_device" ON "sessions"("device_id");

-- CreateIndex
CREATE INDEX "idx_sessions_expires" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_conversations_type" ON "conversations"("type");

-- CreateIndex
CREATE INDEX "idx_conversations_updated" ON "conversations"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_participants_conversation" ON "conversation_participants"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_participants_user" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE INDEX "idx_messages_conversation" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_messages_sender" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "idx_messages_status" ON "messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_messages_expires" ON "messages"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "groups_conversation_id_key" ON "groups"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_groups_created_by" ON "groups"("created_by");

-- CreateIndex
CREATE INDEX "idx_groups_created_at" ON "groups"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_group_members_user" ON "group_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_files_uploader" ON "files"("uploader_id");

-- CreateIndex
CREATE INDEX "idx_files_conversation" ON "files"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_files_created" ON "files"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_files_expires" ON "files"("expires_at");

-- CreateIndex
CREATE INDEX "idx_contacts_user" ON "contacts"("user_id");

-- CreateIndex
CREATE INDEX "idx_contacts_contact" ON "contacts"("contact_id");

-- CreateIndex
CREATE INDEX "idx_contacts_user_blocked" ON "contacts"("user_id", "blocked");

-- CreateIndex
CREATE INDEX "idx_identity_keys_user" ON "identity_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_keys_user_id_device_id_key" ON "identity_keys"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "idx_signed_pre_keys_user_device" ON "signed_pre_keys"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "signed_pre_keys_user_id_device_id_key_id_key" ON "signed_pre_keys"("user_id", "device_id", "key_id");

-- CreateIndex
CREATE INDEX "idx_pre_keys_user_device_used" ON "pre_keys"("user_id", "device_id", "used");

-- CreateIndex
CREATE UNIQUE INDEX "pre_keys_user_id_device_id_key_id_key" ON "pre_keys"("user_id", "device_id", "key_id");

-- CreateIndex
CREATE INDEX "idx_polls_conversation" ON "polls"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_poll_options_poll" ON "poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "idx_group_sender_keys_conv_recipient" ON "group_sender_keys"("conversation_id", "recipient_id");

-- CreateIndex
CREATE INDEX "idx_group_sender_keys_conv_sender" ON "group_sender_keys"("conversation_id", "sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_sender_keys_conversation_id_sender_id_recipient_id_ke_key" ON "group_sender_keys"("conversation_id", "sender_id", "recipient_id", "key_id");

-- CreateIndex
CREATE UNIQUE INDEX "key_backups_user_id_key" ON "key_backups"("user_id");

-- CreateIndex
CREATE INDEX "idx_key_backups_user" ON "key_backups"("user_id");

-- CreateIndex
CREATE INDEX "idx_msg_key_archives_user_conv" ON "message_key_archives"("user_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_key_archives_user_id_conversation_id_key_epoch_key" ON "message_key_archives"("user_id", "conversation_id", "key_epoch");

-- CreateIndex
CREATE INDEX "idx_ratchet_states_user_conv" ON "ratchet_states"("user_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratchet_states_user_id_conversation_id_key" ON "ratchet_states"("user_id", "conversation_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_user" ON "poll_votes"("user_id");

-- CreateIndex
CREATE INDEX "idx_message_deleted_for_user" ON "message_deleted_for"("user_id");

-- CreateIndex
CREATE INDEX "idx_calls_initiator" ON "calls"("initiator_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_calls_conversation" ON "calls"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_calls_status" ON "calls"("status");

-- CreateIndex
CREATE INDEX "idx_calls_created" ON "calls"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_call_participants_user" ON "call_participants"("user_id", "joined_at" DESC);

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_keys" ADD CONSTRAINT "identity_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "identity_keys" ADD CONSTRAINT "identity_keys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "signed_pre_keys" ADD CONSTRAINT "signed_pre_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "signed_pre_keys" ADD CONSTRAINT "signed_pre_keys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pre_keys" ADD CONSTRAINT "pre_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pre_keys" ADD CONSTRAINT "pre_keys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_sender_keys" ADD CONSTRAINT "group_sender_keys_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_sender_keys" ADD CONSTRAINT "group_sender_keys_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "group_sender_keys" ADD CONSTRAINT "group_sender_keys_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "key_backups" ADD CONSTRAINT "key_backups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_key_archives" ADD CONSTRAINT "message_key_archives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_key_archives" ADD CONSTRAINT "message_key_archives_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratchet_states" ADD CONSTRAINT "ratchet_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratchet_states" ADD CONSTRAINT "ratchet_states_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_deleted_for" ADD CONSTRAINT "message_deleted_for_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "message_deleted_for" ADD CONSTRAINT "message_deleted_for_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
