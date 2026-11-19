import mongoose, { Schema, Document, Model } from 'mongoose';

export type ReviewCycleStatus = 'Draft' | 'Active' | 'Completed';
export type ReviewType = 'Annual 360°' | 'Mid-Year Calibration' | 'Quarterly Check-in';

export interface IReviewCycle extends Document {
  id: string;
  organizationId: string;
  title: string;
  period: string;
  type: ReviewType;
  startDate: string;
  endDate: string;
  status: ReviewCycleStatus;
  eligibleEmployeesCount: number;
  completedReviewsCount: number;
  description: string;
  departments?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewCycleModel extends Model<IReviewCycle> {
  seedDefaultReviewCycles(): Promise<void>;
  getNextReviewCycleId(period?: string, type?: string): Promise<string>;
}

const ReviewCycleSchema = new Schema<IReviewCycle, IReviewCycleModel>(
  {
    id: {
      type: String,
      required: [true, 'Review cycle ID is required'],
      trim: true,
    },
    organizationId: {
      type: String,
      required: true,
      default: 'org-reviewforge-default',
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Cycle title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
    },
    period: {
      type: String,
      required: [true, 'Period is required (e.g. FY2026)'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['Annual 360°', 'Mid-Year Calibration', 'Quarterly Check-in'],
      required: [true, 'Review cycle type is required'],
      default: 'Annual 360°',
    },
    startDate: {
      type: String,
      required: [true, 'Start date is required (YYYY-MM-DD)'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'],
    },
    endDate: {
      type: String,
      required: [true, 'End date is required (YYYY-MM-DD)'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'],
    },
    status: {
      type: String,
      enum: ['Draft', 'Active', 'Completed'],
      default: 'Draft',
      required: true,
      index: true,
    },
    eligibleEmployeesCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedReviewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    departments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any)._id;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

ReviewCycleSchema.index({ organizationId: 1, id: 1 }, { unique: true });
ReviewCycleSchema.index({ organizationId: 1, status: 1 });
ReviewCycleSchema.index({ organizationId: 1, period: 1 });

ReviewCycleSchema.statics.getNextReviewCycleId = async function (
  period: string = 'FY2026',
  type: string = 'annual'
): Promise<string> {
  const cleanPeriod = period.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanType = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  const count = await this.countDocuments();
  return `cycle-${cleanPeriod}-${cleanType}-${count + 1}`;
};

ReviewCycleSchema.statics.seedDefaultReviewCycles = async function (): Promise<void> {
  const defaultOrgId = 'org-reviewforge-default';
  const count = await this.countDocuments({ organizationId: defaultOrgId });
  if (count > 0) return;

  const seedData = [
    {
      id: 'cycle-2026-annual',
      organizationId: defaultOrgId,
      title: 'FY2026 Comprehensive Annual 360° Review',
      period: 'FY2026',
      type: 'Annual 360°',
      startDate: '2026-10-01',
      endDate: '2026-11-30',
      status: 'Active',
      eligibleEmployeesCount: 12,
      completedReviewsCount: 8,
      description: 'Company-wide annual review synthesizing all 4 quarters of OKRs, 360 peer feedback, manager observations, and self-reflections.',
      departments: ['dept-eng', 'dept-prod', 'dept-gtm'],
    },
    {
      id: 'cycle-2026-q2-midyear',
      organizationId: defaultOrgId,
      title: 'FY2026 Mid-Year Growth & Calibration Cycle',
      period: 'H1 2026',
      type: 'Mid-Year Calibration',
      startDate: '2026-06-01',
      endDate: '2026-07-15',
      status: 'Completed',
      eligibleEmployeesCount: 12,
      completedReviewsCount: 12,
      description: 'Mid-year milestone calibration focused on H1 goal achievement and second-half career trajectory development.',
      departments: ['dept-eng', 'dept-prod', 'dept-gtm'],
    },
    {
      id: 'cycle-2027-q1-preview',
      organizationId: defaultOrgId,
      title: 'FY2027 Q1 Goal Alignment & Check-in',
      period: 'Q1 2027',
      type: 'Quarterly Check-in',
      startDate: '2027-01-15',
      endDate: '2027-02-28',
      status: 'Draft',
      eligibleEmployeesCount: 12,
      completedReviewsCount: 0,
      description: 'Preliminary Q1 check-in cycle to baseline quarterly OKRs and leadership expectations.',
      departments: ['dept-eng', 'dept-prod', 'dept-gtm'],
    },
  ];

  await this.insertMany(seedData);
  console.log(`🌱 Successfully seeded ${seedData.length} initial review cycles for ${defaultOrgId}`);
};

export const ReviewCycle = mongoose.model<IReviewCycle, IReviewCycleModel>('ReviewCycle', ReviewCycleSchema);
export default ReviewCycle;
