import mongoose, { Schema, Document, Model } from 'mongoose';

export type EvidenceSourceType =
  | 'OKR'
  | 'PeerFeedback'
  | 'SelfReflection'
  | 'ManagerObservation'
  | 'ProjectMilestone';

export interface IEvidenceReference {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceTitle: string;
  sourceDate: string;
  excerpt: string;
  metrics?: string;
}

export interface IReviewSection {
  id: string;
  title: string;
  content: string;
  evidenceRefs: IEvidenceReference[];
  isFlaggedForReview?: boolean;
  flagReason?: string;
}

export type ReviewApprovalStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Changes Requested'
  | 'Approved'
  | 'Released';

export interface IReviewWorkflowEvent {
  action: 'Created' | 'Submitted' | 'ChangesRequested' | 'Approved' | 'Released';
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: string;
  notes?: string;
}

export interface IPerformanceReview extends Document {
  id: string;
  organizationId: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  departmentName: string;
  reviewCycleId: string;
  reviewCycleTitle: string;
  status: ReviewApprovalStatus;
  overallRating: number;
  evidenceCoverageScore: number;
  synthesisEngine: string;
  generatedAt: string;
  lastUpdatedAt: string;
  sections: {
    overallSummary: IReviewSection;
    majorAchievements: IReviewSection;
    keyStrengths: IReviewSection;
    collaborationAndCommunication: IReviewSection;
    okrAchievementSummary: IReviewSection;
    areasForDevelopment: IReviewSection;
    futureGoals: IReviewSection;
    managerRecommendations: IReviewSection;
  };
  managerFeedbackNotes?: string;
  approverName?: string;
  approvedAt?: string;
  releasedAt?: string;
  workflowHistory?: IReviewWorkflowEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceReferenceSchema = new Schema<IEvidenceReference>(
  {
    id: { type: String, required: true },
    sourceType: {
      type: String,
      required: true,
      enum: ['OKR', 'PeerFeedback', 'SelfReflection', 'ManagerObservation', 'ProjectMilestone'],
    },
    sourceId: { type: String, required: true },
    sourceTitle: { type: String, required: true },
    sourceDate: { type: String, required: true },
    excerpt: { type: String, required: true },
    metrics: { type: String, default: '' },
  },
  { _id: false }
);

const ReviewSectionSchema = new Schema<IReviewSection>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    evidenceRefs: { type: [EvidenceReferenceSchema], default: [] },
    isFlaggedForReview: { type: Boolean, default: false },
    flagReason: { type: String, default: '' },
  },
  { _id: false }
);

const PerformanceReviewSchema = new Schema<IPerformanceReview>(
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
      required: [true, 'Employee ID is required'],
      trim: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    departmentName: {
      type: String,
      required: true,
      trim: true,
    },
    reviewCycleId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    reviewCycleTitle: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['Draft', 'Pending Approval', 'Changes Requested', 'Approved', 'Released'],
      default: 'Draft',
      index: true,
    },
    overallRating: {
      type: Number,
      required: true,
      min: 1.0,
      max: 5.0,
      default: 3.0,
    },
    evidenceCoverageScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    synthesisEngine: {
      type: String,
      required: true,
      default: 'Google Gemini 2.5 Flash',
    },
    generatedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    lastUpdatedAt: {
      type: String,
      required: true,
      default: () => new Date().toISOString(),
    },
    sections: {
      overallSummary: { type: ReviewSectionSchema, required: true },
      majorAchievements: { type: ReviewSectionSchema, required: true },
      keyStrengths: { type: ReviewSectionSchema, required: true },
      collaborationAndCommunication: { type: ReviewSectionSchema, required: true },
      okrAchievementSummary: { type: ReviewSectionSchema, required: true },
      areasForDevelopment: { type: ReviewSectionSchema, required: true },
      futureGoals: { type: ReviewSectionSchema, required: true },
      managerRecommendations: { type: ReviewSectionSchema, required: true },
    },
    managerFeedbackNotes: {
      type: String,
      default: '',
    },
    approverName: {
      type: String,
      default: '',
    },
    approvedAt: {
      type: String,
    },
    releasedAt: {
      type: String,
    },
    workflowHistory: [
      {
        _id: false,
        action: {
          type: String,
          enum: ['Created', 'Submitted', 'ChangesRequested', 'Approved', 'Released'],
          required: true,
        },
        actorId: { type: String, required: true },
        actorName: { type: String, required: true },
        actorRole: { type: String, required: true },
        timestamp: { type: String, required: true },
        notes: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound indexes
PerformanceReviewSchema.index(
  { organizationId: 1, employeeId: 1, reviewCycleId: 1 },
  { unique: true }
);
PerformanceReviewSchema.index({ organizationId: 1, status: 1 });

export const PerformanceReview: Model<IPerformanceReview> =
  mongoose.models.PerformanceReview ||
  mongoose.model<IPerformanceReview>('PerformanceReview', PerformanceReviewSchema);

export const INITIAL_PERFORMANCE_REVIEWS_DATA = [
  {
    id: 'rev-001',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    employeeName: 'Rahul Deshmukh',
    jobTitle: 'Staff Backend Architect',
    departmentName: 'Engineering & Infrastructure',
    reviewCycleId: 'cycle-2026-annual',
    reviewCycleTitle: 'FY2026 Comprehensive Annual 360° Review',
    status: 'Pending Approval' as ReviewApprovalStatus,
    overallRating: 4.8,
    evidenceCoverageScore: 94,
    synthesisEngine: 'Gemini 2.5 Flash (Synthesis Engine)',
    generatedAt: '2026-10-26T14:32:00Z',
    lastUpdatedAt: '2026-10-27T09:15:00Z',
    sections: {
      overallSummary: {
        id: 'sec-sum-001',
        title: 'Overall Performance Summary',
        content:
          'Rahul Deshmukh had an outstanding FY2026, delivering foundational backend architecture transformations across data streaming, latency reduction, and microservice security. He demonstrated high operational discipline during cloud outages and acted as a core technical anchor for the engineering organization.',
        evidenceRefs: [
          {
            id: 'ev-001',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-002',
            sourceTitle: 'Q2 OKR: Accelerate API Gateway Throughput',
            sourceDate: 'June 2026',
            excerpt: '31.5% API latency reduction achieved across core endpoints (surpassed 30% target).',
            metrics: '31.5% latency cut',
          },
          {
            id: 'ev-002',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-001',
            sourceTitle: 'Manager Note: Exemplary Incident Handling during AWS AZ Degradation',
            sourceDate: 'June 2026',
            excerpt: 'Identified connection pool leak in 8 mins and led failover with zero customer data loss.',
            metrics: '18 min total recovery',
          },
        ],
      },
      majorAchievements: {
        id: 'sec-ach-001',
        title: 'Major Achievements',
        content:
          'Rahul improved API performance by 31.5% during the review period, exceeding the quarterly 30% latency reduction benchmark. He spearheaded the migration of legacy synchronous event pipelines to an enterprise Apache Kafka cluster, virtually eliminating dropped events. Additionally, his caching architecture reduced monthly database IOPS infrastructure costs by $4,200.',
        evidenceRefs: [
          {
            id: 'ev-003',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-002',
            sourceTitle: 'Q2 OKR: API Response Time Optimization',
            sourceDate: 'June 2026',
            excerpt: 'Target: 30% reduction. Actual: 31.5% reduction. Redis caching hit ratio reached 89.4%.',
            metrics: '31.5% reduction',
          },
          {
            id: 'ev-004',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-001',
            sourceTitle: 'Q1 OKR: Modernize Core Ingestion Pipeline',
            sourceDate: 'March 2026',
            excerpt: 'Kafka migration completed; pipeline ingest backpressure dropped events lowered to 0.0008%.',
            metrics: '0.0008% drop rate',
          },
          {
            id: 'ev-005',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-002',
            sourceTitle: 'Manager Note: Pivotal Q2 Latency Breakthrough',
            sourceDate: 'June 2026',
            excerpt: 'Caching layer shaved off $4,200/month in egress and database IOPS costs.',
            metrics: '$4.2k monthly savings',
          },
        ],
      },
      keyStrengths: {
        id: 'sec-str-001',
        title: 'Key Strengths',
        content:
          'Deep expertise in distributed event-driven systems, acute incident triage under pressure, and systematic mentorship of junior engineering staff. 360 peer feedback repeatedly highlighted his patience in explaining architectural tradeoffs and conducting over 60 constructive pull request reviews.',
        evidenceRefs: [
          {
            id: 'ev-006',
            sourceType: 'PeerFeedback' as EvidenceSourceType,
            sourceId: 'fb-003',
            sourceTitle: 'Peer Feedback from Liam Chen',
            sourceDate: 'October 2026',
            excerpt: 'Mentored junior engineers and reviewed 60+ pull requests with constructive guidance.',
            metrics: '5.0 / 5.0 rating',
          },
          {
            id: 'ev-007',
            sourceType: 'PeerFeedback' as EvidenceSourceType,
            sourceId: 'fb-001',
            sourceTitle: 'Peer Feedback from Elena Rostova',
            sourceDate: 'October 2026',
            excerpt: 'Redesigned caching strategy during peak traffic; always approachable and immense patience.',
            metrics: '5.0 / 5.0 rating',
          },
        ],
      },
      collaborationAndCommunication: {
        id: 'sec-col-001',
        title: 'Collaboration and Communication',
        content:
          'Rahul works effectively across engineering and product squads. Peer feedback rates him 5/5 in collaboration and technical contribution. However, multiple colleagues and manager notes indicate an opportunity to transition informal verbal/Slack architecture agreements into published, formal RFC documents.',
        evidenceRefs: [
          {
            id: 'ev-008',
            sourceType: 'PeerFeedback' as EvidenceSourceType,
            sourceId: 'fb-001',
            sourceTitle: 'Peer Feedback: Elena Rostova',
            sourceDate: 'October 2026',
            excerpt: 'Occasionally dives straight into solving problems before documenting RFC decisions in Notion.',
            metrics: 'Collaboration: 5/5',
          },
          {
            id: 'ev-009',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-003',
            sourceTitle: 'Manager Note: Coaching Junior Engineers & Knowledge Sharing Gap',
            sourceDate: 'September 2026',
            excerpt: 'Prefers informal Slack threads over publishing formalized RFCs. Encouraged to write formal RFCs.',
            metrics: 'Leadership observation',
          },
        ],
      },
      okrAchievementSummary: {
        id: 'sec-okr-001',
        title: 'OKR Achievement Summary',
        content:
          'Rahul concluded Q1, Q2, and Q3 with an aggregate 94% OKR completion rate. Q1 (Kafka event bus) achieved 100%. Q2 (API latency & Redis cache) reached 94% overall progress. Q3 (mTLS zero-trust audit) finished at 88%. Q4 (synthesis worker architecture) is currently tracking at 78% on pace.',
        evidenceRefs: [
          {
            id: 'ev-010',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-001',
            sourceTitle: 'Q1 OKR Status: Completed (100%)',
            sourceDate: 'March 2026',
            excerpt: 'All key results met or surpassed.',
            metrics: '100% completion',
          },
          {
            id: 'ev-011',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-002',
            sourceTitle: 'Q2 OKR Status: Completed (94%)',
            sourceDate: 'June 2026',
            excerpt: 'Key results 3, 4, and 5 successfully closed out.',
            metrics: '94% completion',
          },
        ],
      },
      areasForDevelopment: {
        id: 'sec-dev-001',
        title: 'Areas for Development',
        content:
          'Rahul must formalize architectural documentation before code implementation. Self-reflection and peer reviews both identify Architecture Decision Records (ADRs) as a key growth area. Additionally, scaling p95 processing latency for the Q4 worker pipeline requires focused profiling.',
        evidenceRefs: [
          {
            id: 'ev-012',
            sourceType: 'SelfReflection' as EvidenceSourceType,
            sourceId: 'ref-001',
            sourceTitle: 'Self-Reflection by Rahul Deshmukh',
            sourceDate: 'October 2026',
            excerpt: 'Authoring structured Architecture Decision Records prior to sprint kickoff.',
            metrics: 'Self-identified growth',
          },
          {
            id: 'ev-013',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-004',
            sourceTitle: 'Q4 OKR: Processing Latency Target',
            sourceDate: 'October 2026',
            excerpt: 'p95 processing time at 5.2s vs 4.5s target (At Risk).',
            metrics: '68% current progress',
          },
        ],
        isFlaggedForReview: false,
      },
      futureGoals: {
        id: 'sec-fut-001',
        title: 'Future Goals',
        content:
          "For FY2027, Rahul plans to lead ReviewForge's European multi-region data residency architecture to ensure GDPR enterprise compliance, establish distributed tracing standards with OpenTelemetry, and represent the organization at a major systems conference.",
        evidenceRefs: [
          {
            id: 'ev-014',
            sourceType: 'SelfReflection' as EvidenceSourceType,
            sourceId: 'ref-001',
            sourceTitle: 'Self-Reflection: Future Career Goals',
            sourceDate: 'October 2026',
            excerpt: 'Lead multi-region data residency architecture for European GDPR compliance in H1 2027.',
            metrics: 'Target H1 2027',
          },
        ],
      },
      managerRecommendations: {
        id: 'sec-rec-001',
        title: 'Manager Recommendations',
        content:
          'I strongly endorse Rahul for promotion from Staff Backend Architect to Principal Architect. His technical contributions have fundamentally stabilized our platform, and with the commitment to formalize RFC leadership, he will set the standard for our next generation of engineers.',
        evidenceRefs: [
          {
            id: 'ev-015',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-002',
            sourceTitle: 'Manager Note from Dr. Aris Thorne',
            sourceDate: 'June 2026',
            excerpt: 'Pivotal technical milestone delivered ahead of schedule with significant infrastructure savings.',
            metrics: 'Promotion endorsement',
          },
        ],
      },
    },
    managerFeedbackNotes:
      'Review draft is evidence-backed and verified against Q1-Q4 OKRs. Ready for formal sign-off.',
    approverName: 'Dr. Aris Thorne',
  },
  {
    id: 'rev-002',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-003',
    employeeName: 'Elena Rostova',
    jobTitle: 'Senior Frontend Engineer',
    departmentName: 'Engineering & Infrastructure',
    reviewCycleId: 'cycle-2026-annual',
    reviewCycleTitle: 'FY2026 Comprehensive Annual 360° Review',
    status: 'Approved' as ReviewApprovalStatus,
    overallRating: 4.9,
    evidenceCoverageScore: 96,
    synthesisEngine: 'Gemini 2.5 Flash (Synthesis Engine)',
    generatedAt: '2026-10-24T11:00:00Z',
    lastUpdatedAt: '2026-10-25T16:20:00Z',
    sections: {
      overallSummary: {
        id: 'sec-sum-002',
        title: 'Overall Performance Summary',
        content:
          'Elena Rostova demonstrated world-class frontend engineering leadership throughout FY2026. She steered our entire design system to full WCAG 2.1 AAA compliance and optimized page load benchmarks, proving that high accessibility and ultra-snappy performance can co-exist harmoniously.',
        evidenceRefs: [
          {
            id: 'ev-016',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-005',
            sourceTitle: 'Q2 OKR: WCAG Accessibility and Design System',
            sourceDate: 'June 2026',
            excerpt: '100% of 45 components audited and certified accessible.',
            metrics: '100% achieved',
          },
        ],
      },
      majorAchievements: {
        id: 'sec-ach-002',
        title: 'Major Achievements',
        content:
          'Elena completed a full WCAG 2.1 AAA accessibility audit across 45 shared UI components ahead of schedule. She restructured our front-end build pipelines, reducing bundle sizes by 28% and driving our Lighthouse performance score to 98/100.',
        evidenceRefs: [
          {
            id: 'ev-017',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-004',
            sourceTitle: 'Manager Note: Flawless WCAG 2.1 AAA Execution',
            sourceDate: 'July 2026',
            excerpt: 'Completed component accessibility overhaul ahead of SOC2 Type II audit.',
            metrics: '45 components certified',
          },
        ],
      },
      keyStrengths: {
        id: 'sec-str-002',
        title: 'Key Strengths',
        content:
          'Meticulous eye for design system fidelity, deep empathy for screen-reader and accessible navigation patterns, and rigorous performance optimization discipline.',
        evidenceRefs: [
          {
            id: 'ev-018',
            sourceType: 'PeerFeedback' as EvidenceSourceType,
            sourceId: 'fb-004',
            sourceTitle: 'Peer Feedback from Marcus Vance',
            sourceDate: 'October 2026',
            excerpt: 'Transformative contribution to design tokens and WCAG AAA compliance.',
            metrics: 'Technical: 5/5',
          },
        ],
      },
      collaborationAndCommunication: {
        id: 'sec-col-002',
        title: 'Collaboration and Communication',
        content:
          'Exceptional cross-squad partner with Julian Mercer in Product Design and Sofia Al-Mansoor in Product. Effectively translated abstract design vision into deterministic Tailwind component tokens.',
        evidenceRefs: [
          {
            id: 'ev-019',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-005',
            sourceTitle: 'Manager Note: Cross-Squad Design Alignment',
            sourceDate: 'September 2026',
            excerpt: 'Partnered with Product Design on token sync; load time dropped 28%.',
            metrics: '28% load reduction',
          },
        ],
      },
      okrAchievementSummary: {
        id: 'sec-okr-002',
        title: 'OKR Achievement Summary',
        content:
          'Elena concluded her FY2026 OKRs at a 96% completion rate. Both Q2 (Design system tokens) and Q3 (Bundle optimization) attained 100% completion.',
        evidenceRefs: [
          {
            id: 'ev-020',
            sourceType: 'OKR' as EvidenceSourceType,
            sourceId: 'okr-005',
            sourceTitle: 'Q2 OKR Status: Completed (100%)',
            sourceDate: 'June 2026',
            excerpt: 'All accessibility deliverables verified.',
            metrics: '100% progress',
          },
        ],
      },
      areasForDevelopment: {
        id: 'sec-dev-002',
        title: 'Areas for Development',
        content:
          'Elena expressed a desire to broaden her technical reach into backend WebSocket and Server-Sent Event (SSE) streaming architecture.',
        evidenceRefs: [
          {
            id: 'ev-021',
            sourceType: 'SelfReflection' as EvidenceSourceType,
            sourceId: 'ref-002',
            sourceTitle: 'Self-Reflection by Elena Rostova',
            sourceDate: 'October 2026',
            excerpt: 'Deepen understanding of backend server-sent events (SSE) and WebSockets.',
            metrics: 'Architecture expansion',
          },
        ],
      },
      futureGoals: {
        id: 'sec-fut-002',
        title: 'Future Goals',
        content:
          'Steer front-end technical standards across all ReviewForge product lines and establish an engineering apprenticeship mentorship program in FY2027.',
        evidenceRefs: [
          {
            id: 'ev-022',
            sourceType: 'SelfReflection' as EvidenceSourceType,
            sourceId: 'ref-002',
            sourceTitle: 'Self-Reflection: FY2027 Goals',
            sourceDate: 'October 2026',
            excerpt: 'Mentor incoming frontend apprentices and drive cross-team standards.',
            metrics: 'Mentorship leadership',
          },
        ],
      },
      managerRecommendations: {
        id: 'sec-rec-002',
        title: 'Manager Recommendations',
        content:
          'Elena has exceeded every performance metric for Senior Frontend Engineer. I recommend expanding her scope to Staff Frontend Architect.',
        evidenceRefs: [
          {
            id: 'ev-023',
            sourceType: 'ManagerObservation' as EvidenceSourceType,
            sourceId: 'note-004',
            sourceTitle: 'Manager Note from Rahul Deshmukh',
            sourceDate: 'July 2026',
            excerpt: 'Delivered SOC2 audit pass single-handedly.',
            metrics: 'Staff promotion endorsement',
          },
        ],
      },
    },
    managerFeedbackNotes: 'Exemplary review cycle. Sign-off completed.',
    approverName: 'Rahul Deshmukh',
    approvedAt: '2026-10-25T16:20:00Z',
  },
];

export async function seedInitialPerformanceReviews(): Promise<void> {
  for (const rev of INITIAL_PERFORMANCE_REVIEWS_DATA) {
    await PerformanceReview.findOneAndUpdate(
      { organizationId: rev.organizationId, employeeId: rev.employeeId, reviewCycleId: rev.reviewCycleId },
      rev,
      { upsert: true }
    );
  }
}
