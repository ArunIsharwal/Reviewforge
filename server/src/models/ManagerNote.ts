import mongoose, { Schema, Document, Model } from 'mongoose';

export type ManagerNoteCategory =
  | 'Achievement'
  | 'Collaboration'
  | 'Leadership'
  | 'Improvement'
  | 'Problem Solving'
  | 'Delivery';

export const VALID_MANAGER_NOTE_CATEGORIES: ManagerNoteCategory[] = [
  'Achievement',
  'Collaboration',
  'Leadership',
  'Improvement',
  'Problem Solving',
  'Delivery',
];

export interface IManagerNote extends Document {
  id: string;
  organizationId: string;
  employeeId: string;
  managerId: string;
  managerName: string;
  title: string;
  date: string;
  category: ManagerNoteCategory;
  description: string;
  relatedProject?: string;
  evidenceRef?: string;
  isPrivateToManagers: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ManagerNoteSchema = new Schema<IManagerNote>(
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
    managerId: {
      type: String,
      required: [true, 'Manager ID is required'],
      trim: true,
      index: true,
    },
    managerName: {
      type: String,
      required: [true, 'Manager name is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Note title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    date: {
      type: String,
      required: true,
      default: () => new Date().toISOString().split('T')[0],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: VALID_MANAGER_NOTE_CATEGORIES,
        message: 'Invalid category: must be Achievement, Collaboration, Leadership, Improvement, Problem Solving, or Delivery',
      },
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters long'],
      maxlength: [4000, 'Description cannot exceed 4000 characters'],
    },
    relatedProject: {
      type: String,
      trim: true,
      default: '',
    },
    evidenceRef: {
      type: String,
      trim: true,
      default: '',
    },
    isPrivateToManagers: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for rapid lookup by employee, manager, and category
ManagerNoteSchema.index({ organizationId: 1, employeeId: 1, date: -1 });
ManagerNoteSchema.index({ organizationId: 1, managerId: 1 });
ManagerNoteSchema.index({ organizationId: 1, category: 1 });

export const ManagerNote: Model<IManagerNote> =
  mongoose.models.ManagerNote || mongoose.model<IManagerNote>('ManagerNote', ManagerNoteSchema);

export const INITIAL_MANAGER_NOTES_DATA = [
  {
    id: 'note-001',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    managerId: 'emp-001',
    managerName: 'Dr. Aris Thorne',
    title: 'Exemplary Incident Handling during June Database Failover',
    date: '2026-06-14',
    category: 'Problem Solving' as const,
    description:
      'Rahul showed extraordinary composure during an unannounced AWS AZ degradation in us-east-1. He identified the connection pool leak within 8 minutes and orchestrated automated failover to us-west-2 with zero data loss or customer impact.',
    relatedProject: 'Edge API Gateway & High Availability',
    evidenceRef: 'Post-Mortem INC-4892 (Resolved in 18 mins)',
    isPrivateToManagers: true,
  },
  {
    id: 'note-002',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    managerId: 'emp-001',
    managerName: 'Dr. Aris Thorne',
    title: 'Pivotal Q2 Latency Breakthrough (31.5% Gain)',
    date: '2026-06-29',
    category: 'Achievement' as const,
    description:
      'Rahul exceeded his Q2 OKR target of 30% API response time reduction, hitting 31.5% across all core endpoints. The caching layer he designed shaved off $4,200/month in egress and database IOPS costs.',
    relatedProject: 'API Performance & Caching Architecture',
    evidenceRef: 'Q2 OKR Key Result 3 (31.5% latency reduction)',
    isPrivateToManagers: true,
  },
  {
    id: 'note-003',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-002',
    managerId: 'emp-001',
    managerName: 'Dr. Aris Thorne',
    title: 'Coaching Junior Engineers & Knowledge Sharing Gap',
    date: '2026-09-12',
    category: 'Leadership' as const,
    description:
      'Rahul is a stellar 1-on-1 mentor to Liam and Priya. However, he prefers informal Slack threads over publishing formalized RFCs. I have encouraged him to write 1 structured RFC per major architectural change before the annual calibration.',
    relatedProject: 'Engineering Culture & Documentation',
    evidenceRef: '1-on-1 Coaching Notes Q3',
    isPrivateToManagers: true,
  },
  {
    id: 'note-004',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-003',
    managerId: 'emp-002',
    managerName: 'Rahul Deshmukh',
    title: 'Flawless WCAG 2.1 AAA Accessibility Execution',
    date: '2026-07-08',
    category: 'Delivery' as const,
    description:
      'Elena single-handedly completed our component accessibility overhaul ahead of our SOC2 Type II and government procurement security audit. Every interactive element now supports screen readers and keyboard navigation seamlessly.',
    relatedProject: 'Design System & Accessibility Standards',
    evidenceRef: 'Accessibility Audit Pass Certificate #892',
    isPrivateToManagers: true,
  },
  {
    id: 'note-005',
    organizationId: 'org-reviewforge-default',
    employeeId: 'emp-003',
    managerId: 'emp-002',
    managerName: 'Rahul Deshmukh',
    title: 'Cross-Squad Design Alignment & Code Splitting',
    date: '2026-09-22',
    category: 'Collaboration' as const,
    description:
      'Elena partnered with Julian from Product Design to streamline token sync between Figma and Tailwind. Front-end load time dropped 28% without sacrificing visual polish.',
    relatedProject: 'Front-End Performance Initiative',
    evidenceRef: 'Lighthouse Performance Score 98/100',
    isPrivateToManagers: true,
  },
];

export async function seedInitialManagerNotes(): Promise<void> {
  const count = await ManagerNote.countDocuments({
    organizationId: 'org-reviewforge-default',
  });
  if (count === 0) {
    await ManagerNote.insertMany(INITIAL_MANAGER_NOTES_DATA);
    console.log(`🌱 Seeded ${INITIAL_MANAGER_NOTES_DATA.length} initial manager qualitative notes.`);
  }
}
