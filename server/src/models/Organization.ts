import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrganizationSettings {
  ratingScale: '1-5 Numeric' | '1-4 Descriptive' | 'Letter Scale';
  defaultCyclePeriod: string;
  anonymityPolicy: 'Strict Anonymity' | 'Optional Anonymity' | 'Transparent';
  allowEmployeeDirectRelease: boolean;
  requireDualManagerSignoff: boolean;
  notificationPreferences: {
    emailOnCycleStart: boolean;
    emailOnFeedbackRequest: boolean;
    emailOnReviewReady: boolean;
    slackDigestWeekly: boolean;
  };
}

export interface IOrganization extends Document {
  id: string;
  name: string;
  slug: string;
  industry: string;
  settings: IOrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrganizationModel extends Model<IOrganization> {
  seedDefaultOrganization(): Promise<void>;
}

const OrganizationSchema = new Schema<IOrganization, IOrganizationModel>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: 'org-reviewforge-default',
    },
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    industry: {
      type: String,
      default: 'Enterprise SaaS & Cloud Infrastructure',
      trim: true,
    },
    settings: {
      ratingScale: {
        type: String,
        enum: ['1-5 Numeric', '1-4 Descriptive', 'Letter Scale'],
        default: '1-5 Numeric',
      },
      defaultCyclePeriod: {
        type: String,
        default: 'FY2026',
      },
      anonymityPolicy: {
        type: String,
        enum: ['Strict Anonymity', 'Optional Anonymity', 'Transparent'],
        default: 'Strict Anonymity',
      },
      allowEmployeeDirectRelease: {
        type: Boolean,
        default: false,
      },
      requireDualManagerSignoff: {
        type: Boolean,
        default: true,
      },
      notificationPreferences: {
        emailOnCycleStart: { type: Boolean, default: true },
        emailOnFeedbackRequest: { type: Boolean, default: true },
        emailOnReviewReady: { type: Boolean, default: true },
        slackDigestWeekly: { type: Boolean, default: false },
      },
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

OrganizationSchema.statics.seedDefaultOrganization = async function (): Promise<void> {
  const defaultOrgId = 'org-reviewforge-default';
  const existing = await this.findOne({ id: defaultOrgId });
  if (existing) return;

  await this.create({
    id: defaultOrgId,
    name: 'ReviewForge Technologies',
    slug: 'reviewforge',
    industry: 'Enterprise SaaS & AI Systems',
    settings: {
      ratingScale: '1-5 Numeric',
      defaultCyclePeriod: 'FY2026',
      anonymityPolicy: 'Strict Anonymity',
      allowEmployeeDirectRelease: false,
      requireDualManagerSignoff: true,
      notificationPreferences: {
        emailOnCycleStart: true,
        emailOnFeedbackRequest: true,
        emailOnReviewReady: true,
        slackDigestWeekly: false,
      },
    },
  });

  console.log(`🌱 Successfully seeded default organization: ${defaultOrgId}`);
};

export const Organization = mongoose.model<IOrganization, IOrganizationModel>('Organization', OrganizationSchema);
export default Organization;
