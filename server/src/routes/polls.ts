import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

// ========== Schemas ==========

const createPollSchema = z.object({
  conversation_id: z.string().uuid(),
  question: z.string().min(1).max(500),
  options: z.array(z.string().min(1).max(200)).min(2).max(10),
  allow_multiple: z.boolean().default(false),
  is_anonymous: z.boolean().default(false),
  expires_in_seconds: z.number().nullable().optional(),
});

const voteSchema = z.object({
  option_id: z.string().uuid(),
});

// ========== Routes ==========

// POST /polls — Create a new poll
router.post('/', authenticate, validate(createPollSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { conversation_id, question, options, allow_multiple, is_anonymous, expires_in_seconds } = req.body;

    // Verify user is a participant in the conversation
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id,
          user_id: req.userId!,
        },
      },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    const closesAt = expires_in_seconds ? new Date(Date.now() + expires_in_seconds * 1000) : null;

    const poll = await prisma.$transaction(async (tx) => {
      const p = await tx.poll.create({
        data: {
          conversation_id,
          creator_id: req.userId!,
          question,
          allow_multiple,
          is_anonymous,
          closes_at: closesAt,
          options: {
            create: options.map((text: string) => ({ text })),
          },
        },
        include: {
          options: true,
        },
      });

      // Create a system message referencing the poll
      await tx.messages.create({
        data: {
          conversation_id,
          sender_id: req.userId!,
          encrypted_content: JSON.stringify({ type: 'poll', poll_id: p.id }),
          message_type: 'poll',
          metadata: { poll_id: p.id, question },
          status: 'sent',
        },
      });

      // Update conversation timestamp
      await tx.conversation.update({
        where: { id: conversation_id },
        data: { updated_at: new Date() },
      });

      return p;
    });

    return res.status(201).json({
      id: poll.id,
      question: poll.question,
      options: poll.options.map((o: { id: string; text: string }) => ({ id: o.id, text: o.text, votes: 0, voters: [], voted: false })),
      allow_multiple: poll.allow_multiple,
      is_anonymous: poll.is_anonymous,
      total_votes: 0,
      closes_at: poll.closes_at,
      is_closed: false,
      creator_id: poll.creator_id,
    });
  } catch (error) {
    console.error('Create poll error:', error);
    return res.status(500).json({ error: 'Failed to create poll' });
  }
});

// GET /polls/:pollId — Get poll with results
router.get('/:pollId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { pollId } = req.params;

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          include: {
            votes: {
              include: {
                user: {
                  select: { id: true, username: true },
                },
              },
            },
          },
        },
      },
    });

    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: poll.conversation_id,
          user_id: req.userId!,
        },
      },
    });

    if (!participant) return res.status(403).json({ error: 'Not a participant' });

    const isClosed = poll.closes_at ? new Date(poll.closes_at) < new Date() : false;
    let totalVotes = 0;

    const formattedOptions = poll.options.map((o: { id: string; text: string; votes: { user_id: string; user: { id: string; username: string } }[] }) => {
      totalVotes += o.votes.length;
      return {
        id: o.id,
        text: o.text,
        votes: o.votes.length,
        voters: poll.is_anonymous ? [] : o.votes.map((v: { user: { id: string; username: string } }) => ({ user_id: v.user.id, username: v.user.username })),
        voted: o.votes.some((v: { user_id: string }) => v.user_id === req.userId),
      };
    });

    return res.json({
      id: poll.id,
      question: poll.question,
      options: formattedOptions,
      allow_multiple: poll.allow_multiple,
      is_anonymous: poll.is_anonymous,
      total_votes: totalVotes,
      closes_at: poll.closes_at,
      is_closed: isClosed,
      creator_id: poll.creator_id,
    });
  } catch (error) {
    console.error('Get poll error:', error);
    return res.status(500).json({ error: 'Failed to fetch poll' });
  }
});

// POST /polls/:pollId/vote — Vote on a poll
router.post('/:pollId/vote', authenticate, validate(voteSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { pollId } = req.params;
    const { option_id } = req.body;

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { include: { votes: true } } },
    });

    if (!poll) return res.status(404).json({ error: 'Poll not found' });

    // Check if poll is closed
    if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
      return res.status(400).json({ error: 'Poll is closed' });
    }

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversation_id_user_id: {
          conversation_id: poll.conversation_id,
          user_id: req.userId!,
        },
      },
    });

    if (!participant) return res.status(403).json({ error: 'Not a participant' });

    // Verify option belongs to poll
    const option = poll.options.find((o: { id: string }) => o.id === option_id);
    if (!option) return res.status(400).json({ error: 'Invalid option' });

    // Check if already voted for this option
    const existingVote = option.votes.find((v: { user_id: string }) => v.user_id === req.userId);
    if (existingVote) {
      // Toggle - remove vote
      await prisma.pollVote.delete({
        where: { option_id_user_id: { option_id, user_id: req.userId! } },
      });
      return res.json({ action: 'removed' });
    }

    // If not allow_multiple, remove existing votes on other options
    if (!poll.allow_multiple) {
      const allOptionIds = poll.options.map((o: { id: string }) => o.id);
      await prisma.pollVote.deleteMany({
        where: {
          option_id: { in: allOptionIds },
          user_id: req.userId!,
        },
      });
    }

    // Cast vote
    await prisma.pollVote.create({
      data: {
        option_id,
        user_id: req.userId!,
      },
    });

    return res.json({ action: 'voted' });
  } catch (error) {
    console.error('Vote error:', error);
    return res.status(500).json({ error: 'Failed to vote' });
  }
});

export default router;
