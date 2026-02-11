/**
 * Signal Protocol Session Management Routes
 * 
 * Handles Double Ratchet session state storage and retrieval.
 * Sessions are stored server-side for multi-device sync and backup.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// ========== Schemas ==========

const saveSessionSchema = z.object({
    peer_id: z.string().uuid(),
    conversation_id: z.string().uuid(),
    root_key: z.string().min(1),
    sending_chain_key: z.string().nullable(),
    receiving_chain_key: z.string().nullable(),
    sending_chain_n: z.number().int().min(0),
    receiving_chain_n: z.number().int().min(0),
    previous_chain_n: z.number().int().min(0),
    dh_public_key: z.string().min(1),
    dh_private_key: z.string().min(1),
    peer_dh_public_key: z.string().nullable(),
    skipped_message_keys: z.record(z.string()).default({}),
});

// ========== Routes ==========

/**
 * POST /sessions
 * Save or update a Double Ratchet session state
 */
router.post('/', authenticate, validate(saveSessionSchema), async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const sessionData = req.body;

        // Verify user is participant in the conversation
        const participant = await prisma.conversationParticipant.findUnique({
            where: {
                conversation_id_user_id: {
                    conversation_id: sessionData.conversation_id,
                    user_id: userId
                }
            }
        });

        if (!participant) {
            return res.status(403).json({ error: 'Not a conversation participant' });
        }

        // Upsert session
        const session = await prisma.ratchetSession.upsert({
            where: {
                user_id_peer_id_conversation_id: {
                    user_id: userId,
                    peer_id: sessionData.peer_id,
                    conversation_id: sessionData.conversation_id
                }
            },
            create: {
                user_id: userId,
                peer_id: sessionData.peer_id,
                conversation_id: sessionData.conversation_id,
                root_key: sessionData.root_key,
                sending_chain_key: sessionData.sending_chain_key,
                receiving_chain_key: sessionData.receiving_chain_key,
                sending_chain_n: sessionData.sending_chain_n,
                receiving_chain_n: sessionData.receiving_chain_n,
                previous_chain_n: sessionData.previous_chain_n,
                dh_public_key: sessionData.dh_public_key,
                dh_private_key: sessionData.dh_private_key,
                peer_dh_public_key: sessionData.peer_dh_public_key,
                skipped_message_keys: sessionData.skipped_message_keys
            },
            update: {
                root_key: sessionData.root_key,
                sending_chain_key: sessionData.sending_chain_key,
                receiving_chain_key: sessionData.receiving_chain_key,
                sending_chain_n: sessionData.sending_chain_n,
                receiving_chain_n: sessionData.receiving_chain_n,
                previous_chain_n: sessionData.previous_chain_n,
                dh_public_key: sessionData.dh_public_key,
                dh_private_key: sessionData.dh_private_key,
                peer_dh_public_key: sessionData.peer_dh_public_key,
                skipped_message_keys: sessionData.skipped_message_keys,
                updated_at: new Date()
            }
        });

        return res.status(201).json({
            success: true,
            session_id: session.id
        });

    } catch (error) {
        console.error('Save session error:', error);
        return res.status(500).json({ error: 'Failed to save session' });
    }
});

/**
 * GET /sessions/:peerId
 * Retrieve a Double Ratchet session for a specific peer
 */
router.get('/:peerId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { peerId } = req.params;
        const conversationId = req.query.conversation_id as string | undefined;

        // Build query
        const where: {
            user_id: string;
            peer_id: string;
            conversation_id?: string;
        } = {
            user_id: userId,
            peer_id: peerId
        };

        if (conversationId) {
            where.conversation_id = conversationId;
        }

        const session = await prisma.ratchetSession.findFirst({
            where,
            orderBy: { updated_at: 'desc' }
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        return res.json({
            session_id: session.id,
            peer_id: session.peer_id,
            conversation_id: session.conversation_id,
            root_key: session.root_key,
            sending_chain_key: session.sending_chain_key,
            receiving_chain_key: session.receiving_chain_key,
            sending_chain_n: session.sending_chain_n,
            receiving_chain_n: session.receiving_chain_n,
            previous_chain_n: session.previous_chain_n,
            dh_public_key: session.dh_public_key,
            dh_private_key: session.dh_private_key,
            peer_dh_public_key: session.peer_dh_public_key,
            skipped_message_keys: session.skipped_message_keys,
            created_at: session.created_at,
            updated_at: session.updated_at
        });

    } catch (error) {
        console.error('Get session error:', error);
        return res.status(500).json({ error: 'Failed to retrieve session' });
    }
});

/**
 * GET /sessions
 * List all sessions for the current user
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const sessions = await prisma.ratchetSession.findMany({
            where: { user_id: userId },
            orderBy: { updated_at: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                peer_id: true,
                conversation_id: true,
                created_at: true,
                updated_at: true
            }
        });

        const total = await prisma.ratchetSession.count({
            where: { user_id: userId }
        });

        return res.json({
            sessions,
            total,
            limit,
            offset
        });

    } catch (error) {
        console.error('List sessions error:', error);
        return res.status(500).json({ error: 'Failed to list sessions' });
    }
});

/**
 * DELETE /sessions/:peerId
 * Delete a session (reset encryption with this peer)
 */
router.delete('/:peerId', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;
        const { peerId } = req.params;
        const conversationId = req.query.conversation_id as string | undefined;

        const where: {
            user_id: string;
            peer_id: string;
            conversation_id?: string;
        } = {
            user_id: userId,
            peer_id: peerId
        };

        if (conversationId) {
            where.conversation_id = conversationId;
        }

        const result = await prisma.ratchetSession.deleteMany({ where });

        if (result.count === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        return res.status(204).send();

    } catch (error) {
        console.error('Delete session error:', error);
        return res.status(500).json({ error: 'Failed to delete session' });
    }
});

/**
 * DELETE /sessions
 * Delete all sessions for the current user (nuclear option)
 */
router.delete('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.userId!;

        const result = await prisma.ratchetSession.deleteMany({
            where: { user_id: userId }
        });

        return res.json({
            success: true,
            deleted_count: result.count
        });

    } catch (error) {
        console.error('Delete all sessions error:', error);
        return res.status(500).json({ error: 'Failed to delete sessions' });
    }
});

export default router;
