import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartment extends Document {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  headEmployeeId: string;
  headName: string;
  employeeCount: number;
  averageOkrCompletion: number;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDepartmentModel extends Model<IDepartment> {
  seedDefaultDepartments(): Promise<void>;
  getNextDepartmentId(organizationId?: string): Promise<string>;
}

const DepartmentSchema = new Schema<IDepartment, IDepartmentModel>(
  {
    id: {
      type: String,
      required: [true, 'Department ID is required'],
      trim: true,
    },
    organizationId: {
      type: String,
      required: true,
      default: 'org-reviewforge-default',
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      trim: true,
      uppercase: true,
    },
    headEmployeeId: {
      type: String,
      required: true,
      trim: true,
    },
    headName: {
      type: String,
      required: true,
      trim: true,
    },
    employeeCount: {
      type: Number,
      default: 0,
    },
    averageOkrCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    description: {
      type: String,
      default: '',
      trim: true,
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

DepartmentSchema.index({ organizationId: 1, id: 1 }, { unique: true });
DepartmentSchema.index({ organizationId: 1, code: 1 }, { unique: true });
DepartmentSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Auto-generate next department ID e.g. dept-sec, dept-ops, or dept-004
DepartmentSchema.statics.getNextDepartmentId = async function (
  organizationId: string = 'org-reviewforge-default'
): Promise<string> {
  const count = await this.countDocuments({ organizationId });
  return `dept-${String(count + 1).padStart(3, '0')}`;
};

DepartmentSchema.statics.seedDefaultDepartments = async function (): Promise<void> {
  const defaultOrgId = 'org-reviewforge-default';
  const count = await this.countDocuments({ organizationId: defaultOrgId });
  if (count > 0) return;

  const seedData = [
    {
      id: 'dept-eng',
      organizationId: defaultOrgId,
      name: 'Engineering & Infrastructure',
      code: 'ENG',
      headEmployeeId: 'emp-001',
      headName: 'Dr. Aris Thorne',
      employeeCount: 5,
      averageOkrCompletion: 88,
      description: 'Core software systems, cloud infrastructure, AI platform reliability, and data engineering.',
    },
    {
      id: 'dept-prod',
      organizationId: defaultOrgId,
      name: 'Product & Design',
      code: 'PROD',
      headEmployeeId: 'emp-005',
      headName: 'Maya Lin-Vance',
      employeeCount: 4,
      averageOkrCompletion: 92,
      description: 'Product strategy, user experience research, design systems, and customer workflow architecture.',
    },
    {
      id: 'dept-gtm',
      organizationId: defaultOrgId,
      name: 'Sales & Growth',
      code: 'GTM',
      headEmployeeId: 'emp-009',
      headName: 'Marcus Sterling',
      employeeCount: 3,
      averageOkrCompletion: 84,
      description: 'Enterprise client acquisition, customer expansion, sales engineering, and account retention.',
    },
  ];

  await this.insertMany(seedData);
  console.log(`🌱 Successfully seeded ${seedData.length} initial departments for ${defaultOrgId}`);
};

export const Department = mongoose.model<IDepartment, IDepartmentModel>('Department', DepartmentSchema);
export default Department;
