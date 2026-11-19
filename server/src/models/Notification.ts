import mongoose, { Schema, Document, Model } from 'mongoose';

export type NotificationType = 'cycle' | 'feedback' | 'approval' | 'release' | 'system';

export interface INotification extends Document {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  link?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
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
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['cycle', 'feedback', 'approval', 'release', 'system'],
      default: 'system',
    },
    link: {
      type: String,
      trim: true,
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast user unread queries
NotificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
NotificationSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-001',
    organizationId: 'org-reviewforge-default',
    userId: 'usr-admin',
    title: 'Review Awaiting Executive Approval',
    message: "Rahul Deshmukh's FY2026 performance review draft is pending sign-off.",
    type: 'approval' as NotificationType,
    link: '/approvals',
    isRead: false,
  },
  {
    id: 'notif-002',
    organizationId: 'org-reviewforge-default',
    userId: 'usr-admin',
    title: 'FY2026 Review Cycle Milestone',
    message: 'Annual evaluation calibration closes in 14 days (Nov 30, 2026).',
    type: 'cycle' as NotificationType,
    link: '/review-cycles',
    isRead: false,
  },
  {
    id: 'notif-003',
    organizationId: 'org-reviewforge-default',
    userId: 'usr-mgr',
    title: '360° Peer Feedback Received',
    message: 'Marcus Vance submitted feedback for Rahul Deshmukh with 5/5 collaboration score.',
    type: 'feedback' as NotificationType,
    link: '/feedback',
    isRead: false,
  },
  {
    id: 'notif-004',
    organizationId: 'org-reviewforge-default',
    userId: 'usr-emp',
    title: 'Performance Review Released',
    message: 'Your FY2026 Annual Performance Review has been released by HR.',
    type: 'release' as NotificationType,
    link: '/reviews',
    isRead: false,
  },
];

export async function seedInitialNotifications(): Promise<void> {
  for (const n of INITIAL_NOTIFICATIONS) {
    await Notification.findOneAndUpdate({ id: n.id }, n, { upsert: true });
  }
}
