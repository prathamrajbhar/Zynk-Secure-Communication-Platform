import { Router, Response } from 'express';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CallType, CallStatus } from '@prisma/client';
import { config } from '../config';

const router = Router();

// GET /calls/ice-servers - Get ICE server configuration for WebRTC
router.get('/ice-servers', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const iceServers: object[] = config.stun.urls.map(url => ({ urls: url }));

    if (config.turn.urls) {
      const turnUrls = config.turn.urls.split(',').map(u => u.trim()).filter(Boolean);
      if (turnUrls.length > 0) {
        iceServers.push({
          urls: turnUrls,
          username: config.turn.username,
          credential: config.turn.credential,
        });
      }
    }

    return res.json({ ice_servers: iceServers, ttl: 86400 });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});

// POST /calls/initiate
router.post('/initiate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { recipient_id, call_type } = req.body;

    if (!recipient_id) {
      return res.status(400).json({ error: 'recipient_id is required' });
    }

    if (!['audio', 'video'].includes(call_type)) {
      return res.status(400).json({ error: 'Invalid call type. Must be audio or video.' });
    }

    // Verify recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipient_id },
      select: { id: true }
    });
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    // Check for ongoing active calls for either user
    const ongoingCall = await prisma.call.findFirst({
      where: {
        status: { in: ['ringing', 'in_progress'] },
        participants: {
          some: { user_id: { in: [req.userId!, recipient_id] } }
        }
      },
      select: { id: true, status: true }
    });
    if (ongoingCall) {
      return res.status(409).json({ error: 'User is busy on another call', code: 'USER_BUSY' });
    }

    // Find or create conversation for DM (one_to_one)
    const existingConv = await prisma.conversation.findFirst({
      where: {
        type: 'one_to_one',
        AND: [
          { participants: { some: { user_id: req.userId! } } },
          { participants: { some: { user_id: recipient_id } } },
        ]
      },
      select: { id: true }
    });

    const conversationId = existingConv?.id || null;

    const call = await prisma.call.create({
      data: {
        initiator_id: req.userId!,
        call_type: call_type as CallType,
        status: 'ringing' as CallStatus,
        conversation_id: conversationId,
        participants: {
          create: [
            { user_id: req.userId!, joined_at: new Date() },
            { user_id: recipient_id }
          ]
        }
      }
    });

    return res.status(201).json({
      call_id: call.id,
      status: call.status,
      created_at: call.created_at,
    });
  } catch (error) {
    console.error('Call initiate error:', error);
    return res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// POST /calls/:callId/answer
router.post('/:callId/answer', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { callId } = req.params;

    // Verify user is a participant in this call
    const participant = await prisma.callParticipant.findUnique({
      where: { call_id_user_id: { call_id: callId, user_id: req.userId! } }
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this call' });
    }

    await prisma.$transaction([
      prisma.call.update({
        where: { id: callId },
        data: {
          status: 'in_progress' as CallStatus,
          started_at: new Date()
        }
      }),
      prisma.callParticipant.update({
        where: {
          call_id_user_id: {
            call_id: callId,
            user_id: req.userId!
          }
        },
        data: { joined_at: new Date() }
      })
    ]);

    return res.json({ call_id: callId, status: 'in_progress' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to answer call' });
  }
});

// POST /calls/:callId/end
router.post('/:callId/end', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { callId } = req.params;

    // Verify user is a participant in this call
    const participant = await prisma.callParticipant.findUnique({
      where: { call_id_user_id: { call_id: callId, user_id: req.userId! } }
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this call' });
    }

    const callData = await prisma.call.findUnique({
      where: { id: callId },
      select: { started_at: true }
    });

    const duration = callData?.started_at
      ? Math.floor((Date.now() - new Date(callData.started_at).getTime()) / 1000)
      : 0;

    await prisma.$transaction([
      prisma.call.update({
        where: { id: callId },
        data: {
          status: 'ended' as CallStatus,
          ended_at: new Date(),
          duration_seconds: duration
        }
      }),
      prisma.callParticipant.updateMany({
        where: { call_id: callId, left_at: null },
        data: { left_at: new Date() }
      })
    ]);

    return res.json({ call_id: callId, duration_seconds: duration, ended_at: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to end call' });
  }
});

// POST /calls/:callId/decline
router.post('/:callId/decline', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { callId } = req.params;

    // Verify user is a participant in this call
    const participant = await prisma.callParticipant.findUnique({
      where: { call_id_user_id: { call_id: callId, user_id: req.userId! } }
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this call' });
    }

    await prisma.call.update({
      where: { id: callId },
      data: {
        status: 'declined' as CallStatus,
        ended_at: new Date()
      }
    });
    return res.json({ call_id: callId, status: 'declined' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to decline call' });
  }
});

// GET /calls/:callId/status
router.get('/:callId/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const call = await prisma.call.findUnique({
      where: { id: req.params.callId },
      include: {
        participants: {
          select: {
            user_id: true,
            joined_at: true
          }
        }
      }
    });

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    return res.json({
      call_id: call.id,
      call_type: call.call_type,
      status: call.status,
      started_at: call.started_at,
      ended_at: call.ended_at,
      duration_seconds: call.duration_seconds,
      participants: call.participants
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get call status' });
  }
});

// GET /calls/history
router.get('/history/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    // Use transaction for consistent count + fetch
    const [total, calls] = await prisma.$transaction([
      prisma.call.count({
        where: {
          participants: {
            some: { user_id: req.userId! }
          }
        }
      }),
      prisma.call.findMany({
        where: {
          participants: {
            some: { user_id: req.userId! }
          }
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  username: true,
                  profile: {
                    select: { display_name: true }
                  }
                }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset
      })
    ]);

    const formattedCalls = calls.map(c => ({
      call_id: c.id,
      call_type: c.call_type,
      status: c.status,
      duration_seconds: c.duration_seconds,
      created_at: c.created_at,
      initiator_id: c.initiator_id,
      participants: c.participants.map(p => ({
        user_id: p.user_id,
        username: p.user.username,
        display_name: p.user.profile?.display_name
      }))
    }));

    return res.json({ calls: formattedCalls, total, offset, limit });
  } catch (error) {
    console.error('Fetch call history error:', error);
    return res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

// GET /calls/missed/count - Get count of missed calls since last check
router.get('/missed/count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const since = req.query.since as string;
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // default 24h

    const count = await prisma.call.count({
      where: {
        status: { in: ['missed', 'declined'] },
        participants: {
          some: { user_id: req.userId! }
        },
        initiator_id: { not: req.userId! },
        created_at: { gte: sinceDate }
      }
    });

    return res.json({ missed_count: count, since: sinceDate.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get missed call count' });
  }
});

export default router;
