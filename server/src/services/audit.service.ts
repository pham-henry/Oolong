import { prisma } from '../lib/prisma';

export async function createAuditLog(userId: number, action: string, details?: string) {
  return prisma.auditLog.create({
    data: { userId, action, details },
  });
}

export async function getAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { username: true, role: true } },
    },
  });
}
