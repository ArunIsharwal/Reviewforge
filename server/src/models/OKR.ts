import mongoose, { Schema, Document, Model } from 'mongoose';

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type OKRStatus = 'On Track' | 'At Risk' | 'Behind' | 'Completed';

export interface IKeyResult {
  id: string;
  title: string;
  targetValue: number;
  actualValue: number;
  unit: string;
  completionPercentage: number;
  status: OKRStatus;
}

export interface IOKR extends Document {
  id: string;
  organizationId: string;
  employeeId: string;
  quarter: Quarter;
  year: number;
  objective: string;
  departmentId: string;
  keyResults: IKeyResult[];
  overallProgress: number;
  status: OKRStatus;
  updatedAt: string;
  createdAt: Date;
}

export function computeKeyResultStatus(completionPercentage: number): OKRStatus {
  if (completionPercentage >= 90) return 'Completed';
  if (completionPercentage >= 60) return 'On Track';
  if (completionPercentage >= 35) return 'At Risk';
  return 'Behind';
}

export function recalculateOKR(okr: {
  keyResults: Array<{
    id: string;
    title: string;
    targetValue: number;
    actualValue: number;
    unit: string;
    completionPercentage?: number;
    status?: OKRStatus;
  }>;
}): {
  keyResults: IKeyResult[];
  overallProgress: number;
  status: OKRStatus;
} {
  const recalculatedKrs: IKeyResult[] = okr.keyResults.map((kr) => {
    let perc = 0;
    if (kr.targetValue > 0) {
      perc = Math.round((kr.actualValue / kr.targetValue) * 100);
    } else if (kr.targetValue === 0) {
      perc = kr.actualValue <= 0 ? 100 : 0;
    }
    perc = Math.min(150, Math.max(0, perc));
    const status = computeKeyResultStatus(perc);
    return {
      id: kr.id,
      title: kr.title,
      targetValue: kr.targetValue,
      actualValue: kr.actualValue,
      unit: kr.unit,
      completionPercentage: perc,
      status,
    };
  });

  const total = recalculatedKrs.reduce((sum, kr) => sum + kr.completionPercentage, 0);
  const overall = recalculatedKrs.length > 0 ? Math.round(total / recalculatedKrs.length) : 0;
  const overallStatus = computeKeyResultStatus(overall);

  return {
    keyResults: recalculatedKrs,
    overallProgress: overall,
    status: overallStatus,
  };
}

const KeyResultSchema = new Schema<IKeyResult>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    targetValue: { type: Number, required: true },
    actualValue: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true, trim: true },
    completionPercentage: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['On Track', 'At Risk', 'Behind', 'Completed'],
      default: 'On Track',
    },
  },
  { _id: false }
);

const OKRSchema = new Schema<IOKR>(
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
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    quarter: {
      type: String,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    objective: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    keyResults: {
      type: [KeyResultSchema],
      required: true,
      validate: {
        validator: (v: IKeyResult[]) => Array.isArray(v) && v.length > 0,
        message: 'An OKR must contain at least one Key Result.',
      },
    },
    overallProgress: {
      type: Number,
      required: true,
      default: 0,
    },
    status: {
      type: String,
      enum: ['On Track', 'At Risk', 'Behind', 'Completed'],
      default: 'On Track',
      index: true,
    },
    updatedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString().split('T')[0],
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
OKRSchema.index({ organizationId: 1, employeeId: 1, year: 1, quarter: 1 });
OKRSchema.index({ organizationId: 1, departmentId: 1, year: 1, quarter: 1 });
OKRSchema.index({ organizationId: 1, status: 1 });

export const OKR: Model<IOKR> =
  mongoose.models.OKR || mongoose.model<IOKR>('OKR', OKRSchema);

export const INITIAL_OKRS_DATA = [
  // Rahul Deshmukh (emp-002) - Q1
  {
    id: 'okr-001',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    quarter: 'Q1' as const,
    year: 2026,
    objective: 'Modernize Core Data Ingestion Pipeline & Event Bus',
    departmentId: 'dept-eng',
    overallProgress: 100,
    status: 'Completed' as const,
    updatedAt: '2026-03-28',
    keyResults: [
      {
        id: 'kr-001',
        title: 'Migrate legacy synchronous queue to distributed Apache Kafka cluster',
        targetValue: 100,
        actualValue: 100,
        unit: '% completed',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
      {
        id: 'kr-002',
        title: 'Reduce pipeline ingest backpressure dropped events to 0.001%',
        targetValue: 0.001,
        actualValue: 0.0008,
        unit: '% drops',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
    ],
  },
  // Rahul Deshmukh (emp-002) - Q2
  {
    id: 'okr-002',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    quarter: 'Q2' as const,
    year: 2026,
    objective: 'Accelerate API Gateway Throughput and Lower P99 Latencies',
    departmentId: 'dept-eng',
    overallProgress: 94,
    status: 'Completed' as const,
    updatedAt: '2026-06-30',
    keyResults: [
      {
        id: 'kr-003',
        title: 'Reduce core GraphQL and REST API response times by 30%',
        targetValue: 30,
        actualValue: 31.5,
        unit: '% reduction',
        completionPercentage: 105,
        status: 'Completed' as const,
      },
      {
        id: 'kr-004',
        title: 'Optimize Redis distributed caching layer hit ratio to >92%',
        targetValue: 92,
        actualValue: 89.4,
        unit: '% cache hit',
        completionPercentage: 97,
        status: 'Completed' as const,
      },
      {
        id: 'kr-005',
        title: 'Publish zero-downtime database partitioning playbook for review tables',
        targetValue: 1,
        actualValue: 1,
        unit: 'playbook',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
    ],
  },
  // Rahul Deshmukh (emp-002) - Q3
  {
    id: 'okr-003',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    quarter: 'Q3' as const,
    year: 2026,
    objective: 'Strengthen Cloud Infrastructure Security and Zero-Trust Auditing',
    departmentId: 'dept-eng',
    overallProgress: 88,
    status: 'Completed' as const,
    updatedAt: '2026-09-29',
    keyResults: [
      {
        id: 'kr-006',
        title: 'Implement mTLS service mesh authentication across all internal microservices',
        targetValue: 100,
        actualValue: 100,
        unit: '% services',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
      {
        id: 'kr-007',
        title: 'Achieve automated vulnerability scanning in CI with zero high/critical issues',
        targetValue: 0,
        actualValue: 1,
        unit: 'vulnerabilities',
        completionPercentage: 80,
        status: 'On Track' as const,
      },
    ],
  },
  // Rahul Deshmukh (emp-002) - Q4
  {
    id: 'okr-004',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    quarter: 'Q4' as const,
    year: 2026,
    objective: 'Launch Real-Time Review Synthesis Worker Architecture',
    departmentId: 'dept-eng',
    overallProgress: 78,
    status: 'On Track' as const,
    updatedAt: '2026-10-25',
    keyResults: [
      {
        id: 'kr-008',
        title: 'Deliver async batch synthesis workers processing 50 reviews concurrently',
        targetValue: 50,
        actualValue: 45,
        unit: 'workers',
        completionPercentage: 90,
        status: 'On Track' as const,
      },
      {
        id: 'kr-009',
        title: 'Establish p95 processing time under 4.5 seconds for complete 360 reviews',
        targetValue: 4.5,
        actualValue: 5.2,
        unit: 'seconds',
        completionPercentage: 68,
        status: 'At Risk' as const,
      },
    ],
  },
  // Elena Rostova (emp-003) - Q2
  {
    id: 'okr-005',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-003',
    quarter: 'Q2' as const,
    year: 2026,
    objective: 'Elevate Enterprise Design System Quality & WCAG Accessibility',
    departmentId: 'dept-eng',
    overallProgress: 95,
    status: 'Completed' as const,
    updatedAt: '2026-06-25',
    keyResults: [
      {
        id: 'kr-010',
        title: 'Refactor 45 legacy UI components to WCAG 2.1 AAA accessible specifications',
        targetValue: 45,
        actualValue: 45,
        unit: 'components',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
      {
        id: 'kr-011',
        title: 'Cut initial client bundle size by 28% through dynamic route code-splitting',
        targetValue: 28,
        actualValue: 25,
        unit: '% reduction',
        completionPercentage: 89,
        status: 'Completed' as const,
      },
    ],
  },
  // Julian Mercer (emp-006) - Q3
  {
    id: 'okr-006',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-006',
    quarter: 'Q3' as const,
    year: 2026,
    objective: 'Design Evidence-First Review Studio Experience & Usability Benchmarks',
    departmentId: 'dept-prod',
    overallProgress: 96,
    status: 'Completed' as const,
    updatedAt: '2026-09-30',
    keyResults: [
      {
        id: 'kr-012',
        title: 'Complete 3 rounds of usability interviews with 18 enterprise HR directors',
        targetValue: 18,
        actualValue: 18,
        unit: 'interviews',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
      {
        id: 'kr-013',
        title: 'Raise System Usability Scale (SUS) score from 71 to >85 on review editor',
        targetValue: 85,
        actualValue: 88,
        unit: 'SUS score',
        completionPercentage: 104,
        status: 'Completed' as const,
      },
    ],
  },
  // Sofia Al-Mansoor (emp-007) - Q2
  {
    id: 'okr-007',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-007',
    quarter: 'Q2' as const,
    year: 2026,
    objective: 'Deliver AI Evidence Extraction Specification and Calibration Workflow',
    departmentId: 'dept-prod',
    overallProgress: 91,
    status: 'Completed' as const,
    updatedAt: '2026-06-28',
    keyResults: [
      {
        id: 'kr-014',
        title: 'Define traceable citation schema for 100% of generated review claims',
        targetValue: 100,
        actualValue: 100,
        unit: '% claims',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
      {
        id: 'kr-015',
        title: 'Achieve 90% manager approval rate on first generated draft review without rewrite',
        targetValue: 90,
        actualValue: 82,
        unit: '% first-pass rate',
        completionPercentage: 91,
        status: 'On Track' as const,
      },
    ],
  },
  // Camila Rodriguez (emp-010) - Q3
  {
    id: 'okr-008',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-010',
    quarter: 'Q3' as const,
    year: 2026,
    objective: 'Enterprise Account Retention and H2 Review Cycle Adoption',
    departmentId: 'dept-gtm',
    overallProgress: 98,
    status: 'Completed' as const,
    updatedAt: '2026-09-28',
    keyResults: [
      {
        id: 'kr-016',
        title: 'Maintain 98% gross dollar retention across Tier-1 enterprise accounts',
        targetValue: 98,
        actualValue: 99.2,
        unit: '% GDR',
        completionPercentage: 101,
        status: 'Completed' as const,
      },
      {
        id: 'kr-017',
        title: 'Onboard 14 enterprise customers into early-access 360 review cycle',
        targetValue: 14,
        actualValue: 14,
        unit: 'customers',
        completionPercentage: 100,
        status: 'Completed' as const,
      },
    ],
  },
];

export async function seedInitialOKRs(): Promise<void> {
  const count = await OKR.countDocuments({
    organizationId: 'org-reviewforge-default',
  });
  if (count === 0) {
    await OKR.insertMany(INITIAL_OKRS_DATA);
    console.log(`🌱 Seeded ${INITIAL_OKRS_DATA.length} initial quarterly OKRs.`);
  }
}
