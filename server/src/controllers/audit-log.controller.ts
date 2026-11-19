import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuditLog, IAuditLog } from '../models/AuditLog.js';
import { AppError } from '../middleware/errorHandler.js';

const createAuditLogSchema = z.object({
  action: z.string().trim().min(2, 'Action is required'),
  target: z.string().trim().min(2, 'Target is required'),
  details: z.string().trim().min(3, 'Details are required'),
});

/**
 * Programmatic helper to record system audit logs
 */
export async function recordAuditEvent(params: {
  organizationId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  details: string;
  ipAddress?: string;
}): Promise<IAuditLog> {
  const id = `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  return await AuditLog.create({
    id,
    organizationId: params.organizationId,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    target: params.target,
    details: params.details,
    ipAddress: params.ipAddress || '127.0.0.1',
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/v1/audit-logs
 * Retrieves organization audit trail. Restricted strictly to hr_admin.
 */
export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    // CRITICAL SECURITY RULE: Only HR Administrators can view system audit logs
    if (user.role !== 'hr_admin') {
      throw new AppError('Access denied: Audit logs are restricted to HR Administrators.', 403);
    }

    const organizationId = user.organizationId;
    const { action, actorRole, target, page = '1', limit = '20' } = req.query;

    const filter: Record<string, any> = { organizationId };

    if (action && typeof action === 'string' && action !== 'all') {
      filter.action = action;
    }
    if (actorRole && typeof actorRole === 'string' && actorRole !== 'all') {
      filter.actorRole = actorRole;
    }
    if (target && typeof target === 'string') {
      filter.target = { $regex: target, $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: logs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/audit-logs
 * Records an audit log entry
 */
export async function createAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const validated = createAuditLogSchema.parse(req.body);

    let clientIp = '127.0.0.1';
    try {
      if (req.headers && req.headers['x-forwarded-for']) {
        clientIp = String(req.headers['x-forwarded-for']).split(',')[0].trim();
      } else if (req.socket && req.socket.remoteAddress) {
        clientIp = req.socket.remoteAddress;
      } else if (req.ip) {
        clientIp = req.ip;
      }
    } catch {
      clientIp = '127.0.0.1';
    }

    const log = await recordAuditEvent({
      organizationId: user.organizationId,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: validated.action,
      target: validated.target,
      details: validated.details,
      ipAddress: clientIp,
    });

    res.status(201).json({
      success: true,
      message: 'Audit event recorded.',
      data: log,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: error.issues.map((i) => i.message).join('; '),
      });
      return;
    }
    next(error);
  }
}

/**
 * Immutability Guard: Audit logs cannot be modified or deleted
 */
export function rejectAuditModification(req: Request, res: Response): void {
  res.status(405).json({
    success: false,
    error: 'Audit log entries are immutable and cannot be updated or deleted.',
  });
}
