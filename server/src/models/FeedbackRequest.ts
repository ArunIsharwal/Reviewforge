import mongoose, { Schema, Document, Model } from 'mongoose';

export type FeedbackRequestStatus = 'Pending' | 'Completed' | 'Declined';
export type FeedbackRequestRelationship = 'Peer' | 'Direct Report' | 'Manager' | 'Cross-Functional';

export interface IFeedbackRequest extends Document {
  id: string;
  organizationId: string;
  reviewCycleId: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  reviewerEmployeeId: string;
  reviewerEmployeeName: string;
  requestedByEmployeeId: string;
  requestedByName: string;
  relationship: FeedbackRequestRelationship;
  status: FeedbackRequestStatus;
  dueDate: string;
  message?: string;
  submittedFeedbackId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackRequestSchema = new Schema<IFeedbackRequest>(
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
      index: true,
    },
    reviewCycleId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetEmployeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetEmployeeName: {
      type: String,
      required: true,
      trim: true,
    },
    reviewerEmployeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    reviewerEmployeeName: {
      type: String,
      required: true,
      trim: true,
    },
    requestedByEmployeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requestedByName: {
      type: String,
      required: true,
      trim: true,
    },
    relationship: {
      type: String,
      enum: ['Peer', 'Direct Report', 'Manager', 'Cross-Functional'],
      default: 'Peer',
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Declined'],
      default: 'Pending',
      index: true,
    },
    dueDate: {
      type: String,
      required: true,
      default: () => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().split('T')[0];
      },
    },
    message: {
      type: String,
      default: '',
      trim: true,
    },
    submittedFeedbackId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
FeedbackRequestSchema.index({ organizationId: 1, reviewerEmployeeId: 1, status: 1 });
FeedbackRequestSchema.index({ organizationId: 1, reviewCycleId: 1, targetEmployeeId: 1, reviewerEmployeeId: 1 });
FeedbackRequestSchema.index({ organizationId: 1, requestedByEmployeeId: 1 });

export const FeedbackRequest: Model<IFeedbackRequest> =
  mongoose.models.FeedbackRequest ||
  mongoose.model<IFeedbackRequest>('FeedbackRequest', FeedbackRequestSchema);

export const INITIAL_FEEDBACK_REQUESTS = [
  {
    id: 'fbr-001',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-002',
    targetEmployeeName: 'Rahul Deshmukh',
    reviewerEmployeeId: 'emp-003',
    reviewerEmployeeName: 'Elena Rostova',
    requestedByEmployeeId: 'emp-001',
    requestedByName: 'Elena Rostova',
    relationship: 'Peer' as const,
    status: 'Pending' as const,
    dueDate: '2026-11-30',
    message: 'Please provide peer feedback on Rahul’s architecture contributions and API caching work.',
  },
  {
    id: 'fbr-002',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-003',
    targetEmployeeName: 'Elena Rostova',
    reviewerEmployeeId: 'emp-002',
    reviewerEmployeeName: 'Rahul Deshmukh',
    requestedByEmployeeId: 'emp-001',
    requestedByName: 'Elena Rostova',
    relationship: 'Peer' as const,
    status: 'Pending' as const,
    dueDate: '2026-11-30',
    message: 'Please share feedback on design system component consistency and accessibility.',
  },
];

export async function seedInitialFeedbackRequests(): Promise<void> {
  for (const req of INITIAL_FEEDBACK_REQUESTS) {
    await FeedbackRequest.findOneAndUpdate({ id: req.id }, req, { upsert: true });
  }
}
