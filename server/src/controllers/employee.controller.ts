import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Employee, IEmployee } from '../models/Employee.js';
import { Department } from '../models/Department.js';
import { User, UserRole } from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';

// Validation schemas
const createEmployeeSchema = z.object({
  id: z.string().trim().optional(),
  employeeNumber: z.string().trim().optional(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Valid email is required'),
  avatar: z.string().url().optional(),
  departmentId: z.string().trim().min(1, 'Department ID is required'),
  departmentName: z.string().trim().optional(),
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  managerId: z.string().trim().nullable().optional(),
  managerName: z.string().trim().nullable().optional(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD').optional(),
  employmentStatus: z.enum(['Full-Time', 'Part-Time', 'Contractor']).optional(),
  reviewStatus: z.enum(['Not Started', 'In Progress', 'Pending Approval', 'Approved', 'Released']).optional(),
  location: z.string().trim().optional(),
  bio: z.string().trim().optional(),
  skills: z.array(z.string().trim()).optional(),
  role: z.enum(['employee', 'manager', 'peer_reviewer', 'hr_admin']).optional(),
  password: z.string().min(6).optional(),
});

const updateEmployeeSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().trim().email('Valid email is required').optional(),
  avatar: z.string().url().optional(),
  departmentId: z.string().trim().min(1).optional(),
  departmentName: z.string().trim().optional(),
  jobTitle: z.string().trim().min(1).optional(),
  managerId: z.string().trim().nullable().optional(),
  managerName: z.string().trim().nullable().optional(),
  joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Join date must be YYYY-MM-DD').optional(),
  employmentStatus: z.enum(['Full-Time', 'Part-Time', 'Contractor']).optional(),
  reviewStatus: z.enum(['Not Started', 'In Progress', 'Pending Approval', 'Approved', 'Released']).optional(),
  location: z.string().trim().optional(),
  bio: z.string().trim().optional(),
  skills: z.array(z.string().trim()).optional(),
  isDeactivated: z.boolean().optional(),
});

/**
 * GET /api/v1/employees
 * List employees with search, department filtering, status filtering, and pagination
 */
export async function getEmployees(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const {
      search,
      departmentId,
      reviewStatus,
      employmentStatus,
      managerId,
      sortBy = 'name',
      sortOrder = 'asc',
      page = '1',
      limit = '10',
      includeDeactivated = 'false',
    } = req.query as Record<string, string>;

    const filterQuery: Record<string, any> = {
      organizationId: orgId,
    };

    // Soft deletion filter (unless HR explicitly requests deactivated records)
    if (includeDeactivated === 'true' && req.user?.role === 'hr_admin') {
      // Allow viewing deactivated
    } else {
      filterQuery.isDeactivated = { $ne: true };
    }

    if (departmentId && departmentId !== 'all') {
      filterQuery.departmentId = departmentId;
    }

    if (reviewStatus && reviewStatus !== 'all') {
      filterQuery.reviewStatus = reviewStatus;
    }

    if (employmentStatus && employmentStatus !== 'all') {
      filterQuery.employmentStatus = employmentStatus;
    }

    if (managerId) {
      filterQuery.managerId = managerId;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filterQuery.$or = [
        { name: regex },
        { email: regex },
        { employeeNumber: regex },
        { jobTitle: regex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const allowedSortFields = ['name', 'joinDate', 'jobTitle', 'employeeNumber', 'reviewStatus', 'createdAt'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    const sortDirection = sortOrder.toLowerCase() === 'desc' ? -1 : 1;

    const [total, employees] = await Promise.all([
      Employee.countDocuments(filterQuery),
      Employee.find(filterQuery)
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    res.status(200).json({
      success: true,
      count: employees.length,
      total,
      page: pageNum,
      totalPages,
      limit: limitNum,
      data: employees,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/employees/:id
 * Retrieve employee profile by ID
 */
export async function getEmployeeById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const employee = await Employee.findOne({
      organizationId: orgId,
      id,
    }).lean();

    if (!employee) {
      throw new AppError(`Employee with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    if (employee.isDeactivated && req.user?.role !== 'hr_admin') {
      throw new AppError(`Employee record has been deactivated`, 404, 'NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/employees
 * Create a new employee (HR Admin only)
 */
export async function createEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const parseResult = createEmployeeSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const payload = parseResult.data;

    // Check for email collision
    const existingEmail = await Employee.findOne({
      organizationId: orgId,
      email: payload.email.toLowerCase(),
    });
    if (existingEmail) {
      throw new AppError(`An employee with email '${payload.email}' already exists`, 409, 'CONFLICT');
    }

    // Auto-generate employee ID and number if not explicitly specified
    const empId = payload.id || (await Employee.getNextEmployeeId(orgId));
    const empNum = payload.employeeNumber || (await Employee.getNextEmployeeNumber(orgId));

    // Check for ID collision if provided
    const existingId = await Employee.findOne({ organizationId: orgId, id: empId });
    if (existingId) {
      throw new AppError(`An employee with ID '${empId}' already exists`, 409, 'CONFLICT');
    }

    // Check for EmployeeNumber collision
    const existingNum = await Employee.findOne({ organizationId: orgId, employeeNumber: empNum });
    if (existingNum) {
      throw new AppError(`Employee number '${empNum}' is already assigned`, 409, 'CONFLICT');
    }

    // Resolve department name if not provided
    let deptName = payload.departmentName;
    if (!deptName) {
      const dept = await Department.findOne({ organizationId: orgId, id: payload.departmentId }).lean();
      deptName = dept ? dept.name : 'Engineering & Infrastructure';
    }

    // Resolve manager name if managerId is provided
    let mgrName = payload.managerName || null;
    if (payload.managerId && !mgrName) {
      const mgr = await Employee.findOne({ organizationId: orgId, id: payload.managerId }).lean();
      mgrName = mgr ? mgr.name : null;
    }

    const newEmployee = await Employee.create({
      id: empId,
      organizationId: orgId,
      employeeNumber: empNum,
      name: payload.name,
      email: payload.email.toLowerCase(),
      avatar: payload.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      departmentId: payload.departmentId,
      departmentName: deptName,
      jobTitle: payload.jobTitle,
      managerId: payload.managerId || null,
      managerName: mgrName,
      joinDate: payload.joinDate || new Date().toISOString().split('T')[0],
      employmentStatus: payload.employmentStatus || 'Full-Time',
      reviewStatus: payload.reviewStatus || 'Not Started',
      location: payload.location || 'Remote',
      bio: payload.bio || '',
      skills: payload.skills || [],
      isDeactivated: false,
    });

    // Auto-provision a login User account so the new employee can sign in immediately
    const existingUser = await User.findOne({ email: payload.email.toLowerCase() });
    if (!existingUser) {
      const initialPassword = payload.password || 'Employee@ReviewForge2026!';
      const passwordHash = await User.hashPassword(initialPassword);
      await User.create({
        id: `usr-${empId}`,
        name: payload.name,
        email: payload.email.toLowerCase(),
        passwordHash,
        role: (payload.role as UserRole) || 'employee',
        organizationId: orgId,
        employeeId: empId,
        departmentId: payload.departmentId,
        status: 'active',
      });
    }

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: newEmployee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/employees/:id
 * Update an existing employee
 * - HR Admin: can edit any employee and all fields
 * - Manager: can edit their direct reports or department employees
 * - Employee / Peer Reviewer: can only edit own bio, skills, location
 */
export async function updateEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;
    const caller = req.user;

    const parseResult = updateEmployeeSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const employee = await Employee.findOne({ organizationId: orgId, id });
    if (!employee) {
      throw new AppError(`Employee with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    const updates = parseResult.data;

    // RBAC validation for updates
    if (caller?.role === 'hr_admin') {
      // HR Admin has full permission
    } else if (caller?.role === 'manager') {
      // Manager can update their direct reports, or own non-administrative fields
      const isDirectReport = employee.managerId === caller.employeeId;
      const isSelf = employee.id === caller.employeeId;

      if (!isDirectReport && !isSelf) {
        throw new AppError('Managers may only update direct reports or their own profile', 403, 'FORBIDDEN');
      }

      // Restrict manager from altering organizational structure without HR
      if (updates.departmentId && updates.departmentId !== employee.departmentId) {
        throw new AppError('Only HR Administrators can change employee department assignments', 403, 'FORBIDDEN');
      }
    } else {
      // Regular employee or peer reviewer: can only update their own profile and only specific fields
      const isSelf = employee.id === caller?.employeeId;
      if (!isSelf) {
        throw new AppError('You do not have permission to modify another employee record', 403, 'FORBIDDEN');
      }

      // Prohibit changing protected structural fields
      const protectedFields: (keyof typeof updates)[] = [
        'departmentId',
        'departmentName',
        'jobTitle',
        'managerId',
        'managerName',
        'employmentStatus',
        'reviewStatus',
        'isDeactivated',
      ];

      for (const field of protectedFields) {
        if (updates[field] !== undefined) {
          throw new AppError(`Field '${field}' can only be modified by HR Administrators or Managers`, 403, 'FORBIDDEN');
        }
      }
    }

    // Check duplicate email if email is being changed
    if (updates.email && updates.email.toLowerCase() !== employee.email) {
      const emailExists = await Employee.findOne({
        organizationId: orgId,
        email: updates.email.toLowerCase(),
        id: { $ne: id },
      });
      if (emailExists) {
        throw new AppError(`Email '${updates.email}' is already in use by another employee`, 409, 'CONFLICT');
      }
      employee.email = updates.email.toLowerCase();
    }

    // Apply department name update if departmentId changed
    if (updates.departmentId && updates.departmentId !== employee.departmentId) {
      employee.departmentId = updates.departmentId;
      if (updates.departmentName) {
        employee.departmentName = updates.departmentName;
      } else {
        const dept = await Department.findOne({ organizationId: orgId, id: updates.departmentId }).lean();
        employee.departmentName = dept ? dept.name : employee.departmentName;
      }
    }

    // Apply manager name update if managerId changed
    if (updates.managerId !== undefined) {
      employee.managerId = updates.managerId;
      if (updates.managerId) {
        const mgr = await Employee.findOne({ organizationId: orgId, id: updates.managerId }).lean();
        employee.managerName = mgr ? mgr.name : updates.managerName || null;
      } else {
        employee.managerName = null;
      }
    }

    if (updates.name !== undefined) employee.name = updates.name;
    if (updates.avatar !== undefined) employee.avatar = updates.avatar;
    if (updates.jobTitle !== undefined) employee.jobTitle = updates.jobTitle;
    if (updates.joinDate !== undefined) employee.joinDate = updates.joinDate;
    if (updates.employmentStatus !== undefined) employee.employmentStatus = updates.employmentStatus;
    if (updates.reviewStatus !== undefined) employee.reviewStatus = updates.reviewStatus;
    if (updates.location !== undefined) employee.location = updates.location;
    if (updates.bio !== undefined) employee.bio = updates.bio;
    if (updates.skills !== undefined) employee.skills = updates.skills;
    if (updates.isDeactivated !== undefined) {
      employee.isDeactivated = updates.isDeactivated;
      employee.deactivatedAt = updates.isDeactivated ? new Date() : null;
    }

    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/employees/:id
 * Soft deactivate an employee (HR Admin only)
 */
export async function deleteEmployee(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;
    const { permanent } = req.query;

    const employee = await Employee.findOne({ organizationId: orgId, id });
    if (!employee) {
      throw new AppError(`Employee with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    if (permanent === 'true') {
      await Employee.deleteOne({ organizationId: orgId, id });
      res.status(200).json({
        success: true,
        message: `Employee '${employee.name}' (${id}) permanently deleted`,
      });
      return;
    }

    employee.isDeactivated = true;
    employee.deactivatedAt = new Date();
    await employee.save();

    res.status(200).json({
      success: true,
      message: `Employee '${employee.name}' (${id}) deactivated successfully`,
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}
