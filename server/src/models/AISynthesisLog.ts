import mongoose, { Schema, Document, Model } from 'mongoose';

export type AISynthesisStatus = 'success' | 'failed' | 'unavailable' | 'regenerated';

export interface IAISynthesisLog extends Document {
  id: string;
  organizationId: string;
  employeeId: string;
  reviewCycleId: string;
  actorId: string;
  actorRole: string;
  modelName: string;
  latencyMs: number;
  status: AISynthesisStatus;
  coverageScore: number;
  conflictsDetected: boolean;
  missingEvidenceFlags: string[];
  regeneratedSection?: string;
  errorMessage?: string;
  timestamp: string;
  createdAt: Date;
}

const AISynthesisLogSchema = new Schema<IAISynthesisLog>(
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
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    reviewCycleId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    actorId: {
      type: String,
      required: true,
      trim: true,
    },
    actorRole: {
      type: String,
      required: true,
      trim: true,
    },
    modelName: {
      type: String,
      required: true,
      trim: true,
    },
    latencyMs: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'failed', 'unavailable', 'regenerated'],
      index: true,
    },
    coverageScore: {
      type: Number,
      required: true,
      default: 0,
    },
    conflictsDetected: {
      type: Boolean,
      default: false,
    },
    missingEvidenceFlags: {
      type: [String],
      default: [],
    },
    regeneratedSection: {
      type: String,
      default: '',
    },
    errorMessage: {
      type: String,
      default: '',
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

AISynthesisLogSchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });

export const AISynthesisLog: Model<IAISynthesisLog> =
  mongoose.models.AISynthesisLog ||
  mongoose.model<IAISynthesisLog>('AISynthesisLog', AISynthesisLogSchema);
