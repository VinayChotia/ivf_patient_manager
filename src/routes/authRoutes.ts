// src/routes/authRoutes.ts
import { Router, Request, Response } from 'express';
import { PrismaClient, User } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { signToken } from '../utils/jwt';
import { authMiddleware } from '../middleware/auth';
import { logAudit } from '../services/auditService';

const router = Router();
const prisma = new PrismaClient();

interface LoginRequest {
  username: string;
  password: string;
}

/**
 * POST /api/auth/login
 * Login with username and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as LoginRequest;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordMatch = await bcryptjs.compare(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as 'OWNER' | 'ACCOUNTANT' | 'SECRETARY'
    });

    // Log login action
    await logAudit({
      userId: user.id,
      action: 'LOGIN',
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown'
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/verify
 * Verify current token is valid
 */
router.post('/verify', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword ?? false
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh expired token
 */
router.post('/refresh', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const newToken = signToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as 'OWNER' | 'ACCOUNTANT' | 'SECRETARY'
    });

    res.json({
      success: true,
      token: newToken
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

router.post('/change-password', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body as ChangePasswordRequest;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const passwordMatch = await bcryptjs.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newPasswordHash = await bcryptjs.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false
      }
    });

    await logAudit({
      userId: user.id,
      action: 'CHANGE_PASSWORD',
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown'
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
