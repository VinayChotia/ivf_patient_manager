// src/routes/auditRoutes.ts
import { Router, Request, Response } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getAuditLogs,
  getAuditLogsByUser,
  getAuditLogsByAction
} from '../services/auditService';

const router = Router();

/**
 * GET /api/audit/logs
 * Get audit logs (OWNER only)
 */
router.get('/logs', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const action = req.query.action as string;
    const userId = req.query.userId as string;

    let logs;

    if (action) {
      logs = await getAuditLogsByAction(action, limit, offset);
    } else if (userId) {
      logs = await getAuditLogsByUser(userId, limit, offset);
    } else {
      logs = await getAuditLogs(limit, offset);
    }

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

/**
 * GET /api/audit/my-activity
 * Get current user's activity log
 */
router.get('/my-activity', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const logs = await getAuditLogsByUser(req.user.id, limit, offset);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('Get user activity error:', error);
    res.status(500).json({ error: 'Failed to retrieve activity' });
  }
});

export default router;
