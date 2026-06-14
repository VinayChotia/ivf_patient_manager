// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt';
import { getForcedLogoutAt } from '../services/systemStateService';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { iat?: number };
      ipAddress?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token) as JWTPayload & { iat?: number };

    const forcedLogoutAt = await getForcedLogoutAt();
    if (forcedLogoutAt) {
      const issuedAt = payload.iat ? payload.iat * 1000 : null;
      if (!issuedAt || issuedAt < forcedLogoutAt.getTime()) {
        res.status(401).json({ error: 'Session invalidated. Please login again.' });
        return;
      }
    }
    
    req.user = payload;
    req.ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
    
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
