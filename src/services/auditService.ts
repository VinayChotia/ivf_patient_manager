// src/services/auditService.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuditLogData {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  details?: Record<string, any>;
}

export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        ipAddress: data.ipAddress,
        details: data.details ? JSON.stringify(data.details) : null,
        timestamp: new Date(),
      }
    });
  } catch (error) {
    console.error('Error logging audit:', error);
    // Don't throw - audit failure shouldn't break main flow
  }
}

export async function getAuditLogs(
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  const logs = await prisma.auditLog.findMany({
    take: limit,
    skip: offset,
    orderBy: { timestamp: 'desc' },
    include: { user: true }
  });

  return logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null
  }));
}

export async function getAuditLogsByUser(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    take: limit,
    skip: offset,
    orderBy: { timestamp: 'desc' }
  });

  return logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null
  }));
}

export async function getAuditLogsByAction(
  action: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  const logs = await prisma.auditLog.findMany({
    where: { action },
    take: limit,
    skip: offset,
    orderBy: { timestamp: 'desc' },
    include: { user: true }
  });

  

  return logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null
  }));
}

export async function deleteAllAuditLogs(): Promise<{ count: number }> {
  const result = await prisma.auditLog.deleteMany();
  return { count: result.count };
}