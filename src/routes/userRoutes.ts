import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';
import { authMiddleware, requireRole } from '../middleware/auth';
import { generateTemporaryPassword } from '../utils/password';
import { logAudit } from '../services/auditService';
import { sendVerificationCodeEmail } from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

interface CreateUserRequest {
  username: string;
  email?: string;
  role: 'OWNER' | 'ACCOUNTANT' | 'SECRETARY';
}

router.get('/', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { username, email, role } = req.body as CreateUserRequest;
    const normalizedEmail = email?.trim() || `${username}@example.com`;

    if (!username || !role) {
      res.status(400).json({ error: 'username and role are required' });
      return;
    }

    const normalizedRole = role.toUpperCase();
    if (!['OWNER', 'ACCOUNTANT', 'SECRETARY'].includes(normalizedRole)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email: normalizedEmail }
        ]
      }
    });

    if (existing) {
      res.status(409).json({ error: 'Username or email already exists' });
      return;
    }

    const tempPassword = generateTemporaryPassword(8);
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email: normalizedEmail,
        role: normalizedRole as 'OWNER' | 'ACCOUNTANT' | 'SECRETARY',
        passwordHash,
        mustChangePassword: true,
      }
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      details: { username: user.username, role: user.role }
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      tempPassword
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/:id/reset-password', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const tempPassword = generateTemporaryPassword(8);
    const passwordHash = await bcryptjs.hash(tempPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      }
    });

    await logAudit({
      userId: req.user!.id,
      action: 'RESET_PASSWORD',
      resourceType: 'USER',
      resourceId: updatedUser.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      details: { username: updatedUser.username }
    });

    res.json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        role: updatedUser.role,
        mustChangePassword: updatedUser.mustChangePassword,
      },
      tempPassword
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requesterRole = req.user!.role;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Prevent deletion of the requesting user
    if (user.id === req.user!.id) {
      res.status(403).json({ error: 'Cannot delete your own account' });
      return;
    }

    // Only non-OWNER users can be deleted by any OWNER
    if (user.role === 'OWNER') {
      res.status(403).json({ error: 'Cannot delete another owner account' });
      return;
    }

    await prisma.user.delete({ where: { id } });

    await logAudit({
      userId: req.user!.id,
      action: 'DELETE',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      details: { username: user.username, role: user.role }
    });

    res.json({ success: true, message: `User ${user.username} deleted` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

router.post('/backup-email/set', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { backupEmail } = req.body;

    if (!backupEmail || typeof backupEmail !== 'string') {
      res.status(400).json({ error: 'Valid backup email is required' });
      return;
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backupEmail)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store as temp update (not verified yet)
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        backupEmail,
        backupEmailVerified: false,
      }
    });

    const emailSent = await sendVerificationCodeEmail(backupEmail, verificationCode);

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      details: { action: 'SET_BACKUP_EMAIL', backupEmail, emailSent }
    });

    res.json({
      success: true,
      message: emailSent
        ? 'Backup email set. Verification code sent to your email.'
        : 'Backup email set, but verification email could not be delivered. Use the code below.',
      verificationCode: emailSent ? (process.env.NODE_ENV === 'production' ? undefined : verificationCode) : verificationCode,
      emailSent,
    });
  } catch (error) {
    console.error('Set backup email error:', error);
    res.status(500).json({ error: 'Failed to set backup email' });
  }
});

router.post('/backup-email/verify', authMiddleware, requireRole('OWNER'), async (req: Request, res: Response) => {
  try {
    const { verificationCode } = req.body;

    if (!verificationCode) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.backupEmail) {
      res.status(400).json({ error: 'No pending backup email to verify' });
      return;
    }

    // TODO: In production, verify the code against stored code with TTL
    // For now, accept any 6-digit code
    if (!/^\d{6}$/.test(verificationCode)) {
      res.status(400).json({ error: 'Invalid verification code format' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: { backupEmailVerified: true }
    });

    await logAudit({
      userId: req.user!.id,
      action: 'UPDATE',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
      details: { action: 'VERIFY_BACKUP_EMAIL', backupEmail: updatedUser.backupEmail }
    });

    res.json({
      success: true,
      message: 'Backup email verified successfully',
      backupEmail: updatedUser.backupEmail,
      backupEmailVerified: updatedUser.backupEmailVerified
    });
  } catch (error) {
    console.error('Verify backup email error:', error);
    res.status(500).json({ error: 'Failed to verify backup email' });
  }
});

export default router;
