import { Router, Response } from 'express';
import prisma from '../db/client';
import { authenticate, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { recordAudit, AuditAction } from '../lib/audit';

const router = Router();

// ======================== Admin Middleware ========================

/**
 * Verify the authenticated user has admin role.
 * Admin is determined by an `is_admin` flag on the User model.
 * If the field doesn't exist yet, this middleware will return 403.
 */
async function requireAdmin(req: AuthRequest, res: Response, next: Function) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true },
    });

    if (!user) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check admin status from a config list or DB flag
    const adminUsernames = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!adminUsernames.includes(user.username)) {
      logger.warn({ userId: req.userId, username: user.username }, 'Non-admin attempted admin access');
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Admin auth check failed');
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ======================== Dashboard Stats ========================

// GET /admin/stats — platform statistics overview
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const [userCount, messageCount, groupCount, fileCount, activeSessionCount] = await Promise.all([
      prisma.user.count(),
      prisma.messages.count(),
      prisma.group.count(),
      prisma.file.count(),
      prisma.session.count({ where: { expires_at: { gt: new Date() } } }),
    ]);

    // Users registered in the last 24h / 7d / 30d
    const now = new Date();
    const [usersLast24h, usersLast7d, usersLast30d] = await Promise.all([
      prisma.user.count({ where: { created_at: { gte: new Date(now.getTime() - 86400000) } } }),
      prisma.user.count({ where: { created_at: { gte: new Date(now.getTime() - 7 * 86400000) } } }),
      prisma.user.count({ where: { created_at: { gte: new Date(now.getTime() - 30 * 86400000) } } }),
    ]);

    // Messages in the last 24h
    const messagesLast24h = await prisma.messages.count({
      where: { created_at: { gte: new Date(now.getTime() - 86400000) } },
    });

    await recordAudit({
      action: AuditAction.ADMIN_ACTION,
      userId: req.userId!,
      ipAddress: req.ip || 'unknown',
      details: { action: 'view_stats' },
    });

    return res.json({
      users: {
        total: userCount,
        last_24h: usersLast24h,
        last_7d: usersLast7d,
        last_30d: usersLast30d,
      },
      messages: {
        total: messageCount,
        last_24h: messagesLast24h,
      },
      groups: groupCount,
      files: fileCount,
      active_sessions: activeSessionCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch admin stats');
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ======================== User Management ========================

// GET /admin/users — list users with pagination
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string) || '';
    const skip = (page - 1) * limit;

    const where = search
      ? { username: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          created_at: true,
          profile: {
            select: {
              display_name: true,
              avatar_url: true,
              last_seen_at: true,
            },
          },
          _count: {
            select: {
              devices: true,
              sessions: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch users');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /admin/users/:userId — detailed user info
router.get('/users/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        created_at: true,
        profile: {
          select: {
            display_name: true,
            avatar_url: true,
            bio: true,
            last_seen_at: true,
          },
        },
        devices: {
          select: {
            id: true,
            device_name: true,
            platform: true,
            last_active_at: true,
            created_at: true,
          },
        },
        sessions: {
          where: { expires_at: { gt: new Date() } },
          select: {
            id: true,
            created_at: true,
            expires_at: true,
            last_used_at: true,
          },
        },
        _count: {
          select: {
            sentMessages: true,
            reports: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(user);
  } catch (error) {
    logger.error({ error, userId: req.params.userId }, 'Failed to fetch user details');
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// DELETE /admin/users/:userId/sessions — force logout a user
router.delete('/users/:userId/sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const deleted = await prisma.session.deleteMany({
      where: { user_id: userId },
    });

    await recordAudit({
      action: AuditAction.ADMIN_ACTION,
      userId: req.userId!,
      ipAddress: req.ip || 'unknown',
      details: {
        action: 'force_logout',
        target_user_id: userId,
        sessions_terminated: deleted.count,
      },
    });

    logger.info({ adminId: req.userId, targetUserId: userId, count: deleted.count }, 'Admin force-logged out user');

    return res.json({
      message: `Terminated ${deleted.count} sessions`,
      sessions_terminated: deleted.count,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to force logout user');
    return res.status(500).json({ error: 'Failed to terminate sessions' });
  }
});

// ======================== Moderation ========================

// GET /admin/reports — list content reports
router.get('/reports', async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || 'pending';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const where = status === 'all' ? {} : { status };

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: {
            select: { id: true, username: true },
          },
          reported_user: {
            select: { id: true, username: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    return res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch reports');
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// PUT /admin/reports/:reportId — resolve a report
router.put('/reports/:reportId', async (req: AuthRequest, res: Response) => {
  try {
    const { reportId } = req.params;
    const { status, admin_notes } = req.body;

    if (!['reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: reviewed, resolved, or dismissed' });
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: {
        status,
        reviewed_by: req.userId,
        reviewed_at: new Date(),
        admin_notes: admin_notes || null,
      },
    });

    await recordAudit({
      action: AuditAction.MODERATION_ACTION,
      userId: req.userId!,
      ipAddress: req.ip || 'unknown',
      resourceType: 'report',
      resourceId: reportId,
      details: { status, admin_notes },
    });

    return res.json(report);
  } catch (error) {
    logger.error({ error, reportId: req.params.reportId }, 'Failed to update report');
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

// ======================== Audit Log ========================

// GET /admin/audit-logs — view audit trail
router.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const userId = req.query.user_id as string;
    const action = req.query.action as string;

    const where: any = {};
    if (userId) where.user_id = userId;
    if (action) where.action = action;

    // Query the audit_logs table via raw SQL since it may not be in the Prisma schema yet
    const logs = await prisma.$queryRawUnsafe(
      `SELECT id, action, user_id, ip_address, user_agent, resource_type, resource_id, details, created_at 
       FROM audit_logs 
       ${userId ? 'WHERE user_id = $1' : ''}
       ${action ? (userId ? 'AND action = $2' : 'WHERE action = $1') : ''}
       ORDER BY created_at DESC 
       LIMIT $${userId && action ? 3 : userId || action ? 2 : 1} OFFSET $${userId && action ? 4 : userId || action ? 3 : 2}`,
      ...(userId ? [userId] : []),
      ...(action ? [action] : []),
      limit,
      skip,
    );

    return res.json({
      logs,
      pagination: { page, limit },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch audit logs');
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
