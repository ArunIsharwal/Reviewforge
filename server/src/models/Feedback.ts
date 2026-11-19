import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFeedbackRating {
  collaboration: number;
  communication: number;
  problemSolving: number;
  technicalContribution: number;
  leadership: number;
}

export type FeedbackStatus = 'Submitted' | 'Requested' | 'Declined';
export type FeedbackRelationship = 'Peer' | 'Direct Report' | 'Manager' | 'Cross-Functional';

export interface IFeedbackItem extends Document {
  id: string;
  organizationId: string;
  reviewCycleId: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  providerEmployeeId: string | null;
  providerEmployeeName: string;
  providerRole: string;
  relationship: FeedbackRelationship;
  isAnonymous: boolean;
  ratings: IFeedbackRating;
  strengths: string;
  improvements: string;
  additionalComments?: string;
  submittedAt: string;
  status: FeedbackStatus;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackRatingSchema = new Schema<IFeedbackRating>(
  {
    collaboration: { type: Number, required: true, min: 1, max: 5 },
    communication: { type: Number, required: true, min: 1, max: 5 },
    problemSolving: { type: Number, required: true, min: 1, max: 5 },
    technicalContribution: { type: Number, required: true, min: 1, max: 5 },
    leadership: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const FeedbackItemSchema = new Schema<IFeedbackItem>(
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
    providerEmployeeId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    providerEmployeeName: {
      type: String,
      required: true,
      trim: true,
    },
    providerRole: {
      type: String,
      required: true,
      trim: true,
      default: 'Peer Reviewer',
    },
    relationship: {
      type: String,
      enum: ['Peer', 'Direct Report', 'Manager', 'Cross-Functional'],
      default: 'Peer',
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    ratings: {
      type: FeedbackRatingSchema,
      required: true,
    },
    strengths: {
      type: String,
      required: true,
      trim: true,
    },
    improvements: {
      type: String,
      required: true,
      trim: true,
    },
    additionalComments: {
      type: String,
      default: '',
      trim: true,
    },
    submittedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString().split('T')[0],
    },
    status: {
      type: String,
      enum: ['Submitted', 'Requested', 'Declined'],
      default: 'Submitted',
    },
    requestId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for rapid query and scoping
FeedbackItemSchema.index({ organizationId: 1, reviewCycleId: 1, targetEmployeeId: 1 });
FeedbackItemSchema.index({ organizationId: 1, providerEmployeeId: 1 });
FeedbackItemSchema.index({ organizationId: 1, targetEmployeeId: 1, status: 1 });

export const FeedbackItem: Model<IFeedbackItem> =
  mongoose.models.FeedbackItem || mongoose.model<IFeedbackItem>('FeedbackItem', FeedbackItemSchema);

export const INITIAL_FEEDBACK_DATA = [
  {
    id: 'fb-001',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-002',
    targetEmployeeName: 'Rahul Deshmukh',
    providerEmployeeId: 'emp-003',
    providerEmployeeName: 'Elena Rostova',
    providerRole: 'Peer Engineer',
    relationship: 'Peer' as const,
    isAnonymous: false,
    ratings: {
      collaboration: 5,
      communication: 4,
      problemSolving: 5,
      technicalContribution: 5,
      leadership: 4,
    },
    strengths:
      'Rahul is a powerhouse architect. When the API response times were spiking during peak review traffic in May, he redesigned our caching strategy and reduced endpoint latency by over 30%. He is always approachable and explains complex backend internals with immense patience.',
    improvements:
      'Occasionally dives straight into solving architectural problems before documenting the RFC decisions in Notion for the broader team to review.',
    additionalComments:
      'Working alongside Rahul has elevated the technical standard of our entire squad.',
    submittedAt: '2026-10-18',
    status: 'Submitted' as const,
  },
  {
    id: 'fb-002',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-002',
    targetEmployeeName: 'Rahul Deshmukh',
    providerEmployeeId: 'emp-007',
    providerEmployeeName: 'Sofia Al-Mansoor',
    providerRole: 'Cross-Functional Partner',
    relationship: 'Cross-Functional' as const,
    isAnonymous: true,
    ratings: {
      collaboration: 4,
      communication: 4,
      problemSolving: 5,
      technicalContribution: 5,
      leadership: 4,
    },
    strengths:
      'Exceptional depth in cloud data engineering. His Kafka migration cut event drops to virtually zero. Dependable during Sev-1 outages and maintains a calm, disciplined approach.',
    improvements:
      'Can sometimes be overly protective of service boundaries, making cross-team feature handoffs take an extra calibration cycle.',
    additionalComments: 'A true pillar of technical excellence.',
    submittedAt: '2026-10-22',
    status: 'Submitted' as const,
  },
  {
    id: 'fb-003',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-002',
    targetEmployeeName: 'Rahul Deshmukh',
    providerEmployeeId: 'emp-011',
    providerEmployeeName: 'Liam Chen',
    providerRole: 'Direct Report / Junior Peer',
    relationship: 'Direct Report' as const,
    isAnonymous: false,
    ratings: {
      collaboration: 5,
      communication: 5,
      problemSolving: 5,
      technicalContribution: 5,
      leadership: 5,
    },
    strengths:
      'Outstanding mentor. Rahul reviewed over 60 of my pull requests this year, providing constructive line-by-line feedback that taught me concurrency patterns and database indexing.',
    improvements:
      'Would love for Rahul to lead more public tech-talks and architecture brown-bags across the engineering department.',
    additionalComments: 'The best tech lead I have worked with.',
    submittedAt: '2026-10-24',
    status: 'Submitted' as const,
  },
  {
    id: 'fb-004',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-003',
    targetEmployeeName: 'Elena Rostova',
    providerEmployeeId: 'emp-006',
    providerEmployeeName: 'Julian Mercer',
    providerRole: 'Product Designer',
    relationship: 'Peer' as const,
    isAnonymous: false,
    ratings: {
      collaboration: 5,
      communication: 5,
      problemSolving: 4,
      technicalContribution: 5,
      leadership: 4,
    },
    strengths:
      'Elena has transformed our design tokens into pixel-perfect accessible components. Her work on WCAG AAA compliance ensures ReviewForge meets the strictest procurement audits.',
    improvements:
      'Ensure design-dev handoff tickets include edge-case empty states earlier in the sprint.',
    additionalComments: 'Consistently delivers beyond design specifications.',
    submittedAt: '2026-10-20',
    status: 'Submitted' as const,
  },
  {
    id: 'fb-005',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-003',
    targetEmployeeName: 'Elena Rostova',
    providerEmployeeId: 'emp-002',
    providerEmployeeName: 'Rahul Deshmukh',
    providerRole: 'Peer Engineer',
    relationship: 'Peer' as const,
    isAnonymous: true,
    ratings: {
      collaboration: 4,
      communication: 5,
      problemSolving: 4,
      technicalContribution: 5,
      leadership: 3,
    },
    strengths:
      'Fastidious about bundle size and performance. Her dynamic import optimizations trimmed frontend load times significantly.',
    improvements: 'Encourage Elena to take on more cross-squad architecture decisions.',
    additionalComments: 'Reliable team contributor.',
    submittedAt: '2026-10-21',
    status: 'Submitted' as const,
  },
  {
    id: 'fb-006',
    organizationId: 'org-reviewforge-default',
    reviewCycleId: 'cycle-2026-annual',
    targetEmployeeId: 'emp-006',
    targetEmployeeName: 'Julian Mercer',
    providerEmployeeId: 'emp-007',
    providerEmployeeName: 'Sofia Al-Mansoor',
    providerRole: 'Product Manager',
    relationship: 'Cross-Functional' as const,
    isAnonymous: false,
    ratings: {
      collaboration: 5,
      communication: 5,
      problemSolving: 5,
      technicalContribution: 4,
      leadership: 5,
    },
    strengths:
      'Julian is an editorial mastermind. The 3-panel Review Studio layout he conceived solved our highest customer friction point—connecting AI text directly to empirical data evidence.',
    improvements:
      'Needs more bandwidth to support mobile design variations earlier in product discovery.',
    additionalComments: 'One of the most strategic designers in SaaS.',
    submittedAt: '2026-10-25',
    status: 'Submitted' as const,
  },
];

export async function seedInitialFeedback(): Promise<void> {
  for (const item of INITIAL_FEEDBACK_DATA) {
    await FeedbackItem.findOneAndUpdate({ id: item.id }, item, { upsert: true });
  }
}
