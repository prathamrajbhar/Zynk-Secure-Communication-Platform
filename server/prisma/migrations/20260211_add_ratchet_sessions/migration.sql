-- CreateTable
CREATE TABLE "ratchet_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "peer_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "root_key" TEXT NOT NULL,
    "sending_chain_key" TEXT,
    "receiving_chain_key" TEXT,
    "sending_chain_n" INTEGER NOT NULL DEFAULT 0,
    "receiving_chain_n" INTEGER NOT NULL DEFAULT 0,
    "previous_chain_n" INTEGER NOT NULL DEFAULT 0,
    "dh_public_key" TEXT NOT NULL,
    "dh_private_key" TEXT NOT NULL,
    "peer_dh_public_key" TEXT,
    "skipped_message_keys" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratchet_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ratchet_sessions_user_id_peer_id_conversation_id_key" ON "ratchet_sessions"("user_id", "peer_id", "conversation_id");

-- CreateIndex
CREATE INDEX "idx_ratchet_sessions_user_conv" ON "ratchet_sessions"("user_id", "conversation_id");

-- CreateIndex
CREATE INDEX "idx_ratchet_sessions_updated" ON "ratchet_sessions"("updated_at");

-- AddForeignKey
ALTER TABLE "ratchet_sessions" ADD CONSTRAINT "ratchet_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratchet_sessions" ADD CONSTRAINT "ratchet_sessions_peer_id_fkey" FOREIGN KEY ("peer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ratchet_sessions" ADD CONSTRAINT "ratchet_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
