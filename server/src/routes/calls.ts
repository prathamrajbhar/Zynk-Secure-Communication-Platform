/**
 * Call Routes — REST API for call history, ICE server config, and active call status.
 *
 * Signaling (initiate, answer, ICE candidates, end) is handled via WebSocket.
 * These REST endpoints provide:
 *   - GET /calls/history        — Paginated call history
 *   - GET /calls/ice-servers    — STUN/TURN credentials
 *   - GET /calls/active         — Check if user is in an active call
 */

import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getCallHistory, getUserActiveCall, getCallState, getIceServers } from '../services/callManager';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /calls/history
 * Returns paginated call history for the authenticated user.
 */
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    const calls = await getCallHistory(userId, limit, cursor);

    res.json({
      calls,
      hasMore: calls.length === limit,
      nextCursor: calls.length > 0 ? calls[calls.length - 1].created_at : null,
    });
  } catch (error) {
    console.error('GET /calls/history error:', error);
    res.status(500).json({ error: 'Failed to fetch call history' });
  }
});

/**
 * GET /calls/ice-servers
 * Returns STUN/TURN server configuration for WebRTC.
 */
router.get('/ice-servers', async (req: AuthRequest, res: Response) => {
  try {
    const iceServers = getIceServers();
    res.json({ iceServers });
  } catch (error) {
    console.error('GET /calls/ice-servers error:', error);
    res.status(500).json({ error: 'Failed to get ICE servers' });
  }
});

/**
 * GET /calls/active
 * Check if the authenticated user is currently in a call.
 */
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const callId = await getUserActiveCall(userId);

    if (!callId) {
      return res.json({ inCall: false });
    }

    const state = await getCallState(callId);
    res.json({
      inCall: true,
      callId,
      callType: state?.callType,
      status: state?.status,
    });
  } catch (error) {
    console.error('GET /calls/active error:', error);
    res.status(500).json({ error: 'Failed to check active call' });
  }
});

export default router;
