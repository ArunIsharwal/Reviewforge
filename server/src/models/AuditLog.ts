import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAuditLog extends Document {
  id: string;
  organizationId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  details: string;
  ipAddress?: string;
  timestamp: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    organizationId: {
      type: String,
      required: true,
      default: 'org-reviewforge-default',
      trim: true,
      index: true,
    },
    actorId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    actorRole: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      required: true,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: '127.0.0.1',
    },
    timestamp: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ organizationId: 1, action: 1 });
AuditLogSchema.index({ organizationId: 1, actorRole: 1 });
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export const INITIAL_AUDIT_LOGS = [
  {
    id: 'audit-001',
    organizationId: 'org-reviewforge-default',
    actorId: 'usr-admin',
    actorName: 'ReviewForge HR Admin',
    actorRole: 'hr_admin',
    action: 'POLICY_UPDATED',
    target: 'Global Governance',
    details: 'Configured Dual Manager Sign-off and Strict Anonymity for FY2026',
    ipAddress: '127.0.0.1',
    timestamp: '2026-11-15T10:00:00.000Z',
  },
  {
    id: 'audit-002',
    organizationId: 'org-reviewforge-default',
    actorId: 'usr-mgr',
    actorName: 'Elena Rostova',
    actorRole: 'manager',
    action: 'REVIEW_SUBMITTED',
    target: 'Rahul Deshmukh (Frontend Engineer)',
    details: 'Submitted FY2026 synthesized review draft for HR approval',
    ipAddress: '127.0.0.1',
    timestamp: '2026-11-16T14:30:00.000Z',
  },
  {
    id: 'audit-003',
    organizationId: 'org-reviewforge-default',
    actorId: 'usr-admin',
    actorName: 'ReviewForge HR Admin',
    actorRole: 'hr_admin',
    action: 'REVIEW_PUBLISHED',
    target: 'Rahul Deshmukh (Frontend Engineer)',
    details: 'Formally released performance review to employee portal',
    ipAddress: '127.0.0.1',
    timestamp: '2026-11-16T16:45:00.000Z',
  },
];

export async function seedInitialAuditLogs(): Promise<void> {
  for (const log of INITIAL_AUDIT_LOGS) {
    await AuditLog.findOneAndUpdate({ id: log.id }, log, { upsert: true });
  }
}
