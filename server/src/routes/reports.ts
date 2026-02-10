import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import fs from 'fs';
import path from 'path';

const router = Router();

const reportSchema = z.object({
  reported_user_id: z.string().uuid().optional(),
  message_id: z.string().uuid().optional(),
  reason: z.enum(['spam', 'harassment', 'hate_speech', 'inappropriate', 'impersonation', 'other']),
  details: z.string().max(1000).optional(),
});

/**
 * POST /reports — Submit a report
 * Stores reports to a local JSON log file for admin review.
 */
router.post('/', authenticate, validate(reportSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { reported_user_id, message_id, reason, details } = req.body;

    const report = {
      id: crypto.randomUUID(),
      reporter_id: userId,
      reported_user_id: reported_user_id || null,
      message_id: message_id || null,
      reason,
      details: details || null,
      created_at: new Date().toISOString(),
      status: 'pending',
    };

    // Append to reports log file
    const reportsDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const reportsFile = path.join(reportsDir, 'reports.json');
    let reports: any[] = [];
    if (fs.existsSync(reportsFile)) {
      try { reports = JSON.parse(fs.readFileSync(reportsFile, 'utf-8')); } catch { reports = []; }
    }
    reports.push(report);
    fs.writeFileSync(reportsFile, JSON.stringify(reports, null, 2));

    res.status(201).json({ message: 'Report submitted successfully', report_id: report.id });
  } catch (error) {
    console.error('Failed to submit report:', error);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
