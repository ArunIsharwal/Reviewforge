import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'hr_admin' | 'manager' | 'employee' | 'peer_reviewer';

export interface IUser extends Document {
  id?: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId: string;
  employeeId?: string;
  departmentId?: string;
  status: 'active' | 'invited' | 'deactivated';
  refreshToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IUserModel extends Model<IUser> {
  hashPassword(password: string): Promise<string>;
  seedDefaultUsers(): Promise<void>;
}

const UserSchema = new Schema<IUser, IUserModel>(
  {
    id: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password hash must be valid'],
    },
    role: {
      type: String,
      enum: ['hr_admin', 'manager', 'employee', 'peer_reviewer'],
      default: 'employee',
      required: true,
    },
    organizationId: {
      type: String,
      required: true,
      default: 'org-reviewforge-default',
      index: true,
    },
    employeeId: {
      type: String,
      trim: true,
    },
    departmentId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'deactivated'],
      default: 'active',
      required: true,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).passwordHash;
        delete (ret as any).refreshToken;
        delete (ret as any).passwordResetToken;
        delete (ret as any).passwordResetExpires;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

// Indexes
UserSchema.index({ organizationId: 1, email: 1 }, { unique: true });
UserSchema.index({ organizationId: 1, role: 1 });

// Instance Method: Compare candidate password with stored hash
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static Method: Hash password utility
UserSchema.statics.hashPassword = async function (password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Static Method: Seed default 4 test role accounts
UserSchema.statics.seedDefaultUsers = async function (): Promise<void> {
  const defaultUsers = [
    {
      name: 'ReviewForge HR Admin',
      email: 'admin@reviewforge.io',
      password: 'Admin@ReviewForge2026!',
      role: 'hr_admin' as UserRole,
      organizationId: 'org-reviewforge-default',
    },
    {
      name: 'Elena Rostova (Engineering Manager)',
      email: 'elena.rostova@reviewforge.io',
      password: 'Manager@ReviewForge2026!',
      role: 'manager' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-001',
      departmentId: 'dept-eng',
    },
    {
      name: 'Rahul Deshmukh (Frontend Engineer)',
      email: 'rahul.deshmukh@reviewforge.io',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-002',
      departmentId: 'dept-eng',
    },
    {
      name: 'Marcus Vance (Senior Peer Reviewer)',
      email: 'marcus.vance@reviewforge.io',
      password: 'Peer@ReviewForge2026!',
      role: 'peer_reviewer' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-003',
      departmentId: 'dept-eng',
    },
    {
      name: 'Dr. Aris Thorne (VP of Engineering)',
      email: 'aris.thorne@reviewforge.internal',
      password: 'Manager@ReviewForge2026!',
      role: 'manager' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-001',
      departmentId: 'dept-eng',
    },
    {
      name: 'Kenji Sato (DevOps & SRE)',
      email: 'kenji.sato@reviewforge.internal',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-004',
      departmentId: 'dept-eng',
    },
    {
      name: 'Maya Lin-Vance (VP of Product Experience)',
      email: 'maya.vance@reviewforge.internal',
      password: 'Manager@ReviewForge2026!',
      role: 'manager' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-005',
      departmentId: 'dept-prod',
    },
    {
      name: 'Julian Mercer (Principal Product Designer)',
      email: 'julian.mercer@reviewforge.internal',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-006',
      departmentId: 'dept-prod',
    },
    {
      name: 'Sofia Al-Mansoor (Senior Product Manager)',
      email: 'sofia.mansoor@reviewforge.internal',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-007',
      departmentId: 'dept-prod',
    },
    {
      name: 'Liam O\'Connor (Account Executive)',
      email: 'liam.oconnor@reviewforge.internal',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-009',
      departmentId: 'dept-gtm',
    },
    {
      name: 'Chloe Bennet (Customer Success Lead)',
      email: 'chloe.bennet@reviewforge.internal',
      password: 'Employee@ReviewForge2026!',
      role: 'employee' as UserRole,
      organizationId: 'org-reviewforge-default',
      employeeId: 'emp-010',
      departmentId: 'dept-gtm',
    },
  ];

  for (const u of defaultUsers) {
    const existing = await this.findOne({ email: u.email.toLowerCase() });
    if (!existing) {
      const passwordHash = await (this as IUserModel).hashPassword(u.password);
      await this.create({
        name: u.name,
        email: u.email.toLowerCase(),
        passwordHash,
        role: u.role,
        organizationId: u.organizationId,
        employeeId: u.employeeId,
        departmentId: u.departmentId,
        status: 'active',
      });
      console.log(`🌱 Seeded ${u.role} user: ${u.email}`);
    }
  }
};

export const User = mongoose.model<IUser, IUserModel>('User', UserSchema);
export default User;

