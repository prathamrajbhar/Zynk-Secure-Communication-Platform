import prisma from '../db/client';
import { createServiceLogger } from './logger';

const log = createServiceLogger('audit');

// ============================================================================
// Audit Logging Service
//
// Tracks all security-sensitive operations to a database table and structured
// logs. Essential for:
// - Security incident investigation
// - Compliance (SOC 2, GDPR, HIPAA)
// - User activity forensics
// - Admin action accountability
// ============================================================================

export enum AuditAction {
  // Authentication
  USER_LOGIN = 'user.login',
  USER_LOGIN_FAILED = 'user.login_failed',
  USER_REGISTER = 'user.register',
  USER_LOGOUT = 'user.logout',
  USER_LOGOUT_ALL = 'user.logout_all',
  TOKEN_REFRESH = 'token.refresh',
  TOKEN_REFRESH_FAILED = 'token.refresh_failed',
  SESSION_EXPIRED = 'session.expired',

  // Account Management
  PASSWORD_CHANGE = 'password.change',
  PASSWORD_CHANGE_FAILED = 'password.change_failed',
  PROFILE_UPDATE = 'profile.update',
  ACCOUNT_DELETE = 'account.delete',
  DEVICE_ADDED = 'device.added',
  DEVICE_REMOVED = 'device.removed',
  TWO_FACTOR_ENABLED = '2fa.enabled',
  TWO_FACTOR_DISABLED = '2fa.disabled',

  // Encryption Keys
  KEY_UPLOAD = 'key.upload',
  KEY_BUNDLE_FETCH = 'key.bundle_fetch',
  IDENTITY_KEY_CHANGE = 'key.identity_change',

  // Group Management
  GROUP_CREATE = 'group.create',
  GROUP_DELETE = 'group.delete',
  GROUP_MEMBER_ADD = 'group.member_add',
  GROUP_MEMBER_REMOVE = 'group.member_remove',
  GROUP_ROLE_CHANGE = 'group.role_change',

  // Content Moderation
  USER_BLOCK = 'user.block',
  USER_UNBLOCK = 'user.unblock',
  REPORT_SUBMIT = 'report.submit',
  CONTENT_DELETE = 'content.delete',

  // Admin Actions
  ADMIN_USER_BAN = 'admin.user_ban',
  ADMIN_USER_UNBAN = 'admin.user_unban',
  ADMIN_CONFIG_CHANGE = 'admin.config_change',

  // Data Access
  DATA_EXPORT = 'data.export',
  MESSAGE_DELETE_ALL = 'message.delete_all',
}

export interface AuditEntry {
  action: AuditAction;
  userId?: string;
  targetUserId?: string;
  resourceType?: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  outcome: 'success' | 'failure';
  correlationId?: string;
}

/**
 * Record an audit log entry
 * 
 * Writes to both:
 * 1. Structured log output (for ELK/Loki)
 * 2. Database audit_logs table (for querying/reporting)
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const timestamp = new Date().toISOString();

  // Always log to structured logger (fast, non-blocking)
  log.info({
    audit: true,
    action: entry.action,
    userId: entry.userId,
    targetUserId: entry.targetUserId,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    ip: entry.ip,
    userAgent: entry.userAgent,
    outcome: entry.outcome,
    details: entry.details,
    correlationId: entry.correlationId,
    timestamp,
  }, `AUDIT: ${entry.action} [${entry.outcome}]`);

  // Write to database asynchronously (fire-and-forget with error logging)
  try {
    await prisma.$executeRaw`
      INSERT INTO audit_logs (action, user_id, target_user_id, resource_type, resource_id, ip_address, user_agent, details, outcome, correlation_id, created_at)
      VALUES (${entry.action}, ${entry.userId || null}::uuid, ${entry.targetUserId || null}::uuid, ${entry.resourceType || null}, ${entry.resourceId || null}, ${entry.ip || null}, ${entry.userAgent || null}, ${JSON.stringify(entry.details || {})}::jsonb, ${entry.outcome}, ${entry.correlationId || null}, NOW())
    `;
  } catch (error) {
    // Never let audit logging failure break the application
    log.error({ error, action: entry.action }, 'Failed to write audit log to database');
  }
}

/**
 * Express middleware to capture audit context automatically
 */
export function withAuditContext(action: AuditAction, resourceType?: string) {
  return (req: any, res: any, next: any) => {
    // Store audit context on request for use in route handlers
    req.auditContext = {
      action,
      resourceType,
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get?.('User-Agent'),
      correlationId: req.correlationId,
    };
    next();
  };
}
