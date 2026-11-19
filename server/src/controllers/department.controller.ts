import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Department, IDepartment } from '../models/Department.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../middleware/errorHandler.js';

// Validation schemas
const createDepartmentSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, 'Department name must be at least 2 characters'),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must not exceed 10 characters')
    .toUpperCase(),
  headEmployeeId: z.string().trim().min(1, 'Department head employee ID is required'),
  headName: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must not exceed 10 characters')
    .toUpperCase()
    .optional(),
  headEmployeeId: z.string().trim().min(1).optional(),
  headName: z.string().trim().optional(),
  description: z.string().trim().optional(),
  averageOkrCompletion: z.number().min(0).max(100).optional(),
});

/**
 * GET /api/v1/departments
 * List departments with live calculated employee counts and OKR completion metrics
 */
export async function getDepartments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';

    const departments = await Department.find({ organizationId: orgId }).sort({ name: 1 }).lean();

    // Calculate live employee count for each department from active employee records
    const enrichedDepartments = await Promise.all(
      departments.map(async (dept) => {
        const liveCount = await Employee.countDocuments({
          organizationId: orgId,
          departmentId: dept.id,
          isDeactivated: { $ne: true },
        });
        return {
          ...dept,
          employeeCount: liveCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedDepartments.length,
      data: enrichedDepartments,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/departments/:id
 * Retrieve a single department with leadership and assigned team members
 */
export async function getDepartmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const department = await Department.findOne({ organizationId: orgId, id }).lean();
    if (!department) {
      throw new AppError(`Department with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    // Retrieve active members assigned to this department
    const members = await Employee.find({
      organizationId: orgId,
      departmentId: id,
      isDeactivated: { $ne: true },
    })
      .select('id employeeNumber name email jobTitle avatar reviewStatus managerName joinDate location')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        ...department,
        employeeCount: members.length,
        members,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/departments
 * Create a new department (HR Admin only)
 */
export async function createDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const parseResult = createDepartmentSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const payload = parseResult.data;

    // Check code uniqueness
    const existingCode = await Department.findOne({
      organizationId: orgId,
      code: payload.code,
    });
    if (existingCode) {
      throw new AppError(`Department code '${payload.code}' is already in use`, 409, 'CONFLICT');
    }

    // Check name uniqueness
    const existingName = await Department.findOne({
      organizationId: orgId,
      name: new RegExp(`^${payload.name.trim()}$`, 'i'),
    });
    if (existingName) {
      throw new AppError(`Department named '${payload.name}' already exists`, 409, 'CONFLICT');
    }

    // Verify department head employee exists
    let headName = payload.headName;
    const headEmployee = await Employee.findOne({
      organizationId: orgId,
      id: payload.headEmployeeId,
    }).lean();

    if (headEmployee) {
      headName = headEmployee.name;
    } else if (!headName) {
      throw new AppError(`Employee with ID '${payload.headEmployeeId}' was not found to assign as department head`, 404, 'NOT_FOUND');
    }

    // Auto-generate ID if not provided
    const deptId = payload.id || `dept-${payload.code.toLowerCase()}`;

    // Verify ID uniqueness
    const existingId = await Department.findOne({ organizationId: orgId, id: deptId });
    if (existingId) {
      throw new AppError(`Department ID '${deptId}' already exists`, 409, 'CONFLICT');
    }

    const newDepartment = await Department.create({
      id: deptId,
      organizationId: orgId,
      name: payload.name,
      code: payload.code,
      headEmployeeId: payload.headEmployeeId,
      headName: headName || 'Unassigned',
      description: payload.description || '',
      employeeCount: 0,
      averageOkrCompletion: 0,
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: newDepartment.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/departments/:id
 * Update an existing department (HR Admin only)
 * If name changes, cascades departmentName update to all assigned employees.
 */
export async function updateDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const parseResult = updateDepartmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const department = await Department.findOne({ organizationId: orgId, id });
    if (!department) {
      throw new AppError(`Department with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    const updates = parseResult.data;

    // Check code collision if code updated
    if (updates.code && updates.code !== department.code) {
      const codeExists = await Department.findOne({
        organizationId: orgId,
        code: updates.code,
        id: { $ne: id },
      });
      if (codeExists) {
        throw new AppError(`Department code '${updates.code}' is already assigned to another department`, 409, 'CONFLICT');
      }
      department.code = updates.code;
    }

    // Check name collision if name updated
    let oldName = department.name;
    let nameChanged = false;
    if (updates.name && updates.name.toLowerCase() !== department.name.toLowerCase()) {
      const nameExists = await Department.findOne({
        organizationId: orgId,
        name: new RegExp(`^${updates.name.trim()}$`, 'i'),
        id: { $ne: id },
      });
      if (nameExists) {
        throw new AppError(`Department name '${updates.name}' is already in use`, 409, 'CONFLICT');
      }
      department.name = updates.name;
      nameChanged = true;
    }

    // Update department head
    if (updates.headEmployeeId && updates.headEmployeeId !== department.headEmployeeId) {
      const headEmployee = await Employee.findOne({
        organizationId: orgId,
        id: updates.headEmployeeId,
      }).lean();

      if (!headEmployee && !updates.headName) {
        throw new AppError(`Employee '${updates.headEmployeeId}' not found to assign as department head`, 404, 'NOT_FOUND');
      }

      department.headEmployeeId = updates.headEmployeeId;
      department.headName = headEmployee ? headEmployee.name : updates.headName || department.headName;
    } else if (updates.headName) {
      department.headName = updates.headName;
    }

    if (updates.description !== undefined) department.description = updates.description;
    if (updates.averageOkrCompletion !== undefined) department.averageOkrCompletion = updates.averageOkrCompletion;

    await department.save();

    // Cascading update: If department name changed, sync departmentName across all assigned employees
    if (nameChanged) {
      await Employee.updateMany(
        { organizationId: orgId, departmentId: id },
        { departmentName: department.name }
      );
    }

    // Recalculate live employee count
    const liveCount = await Employee.countDocuments({
      organizationId: orgId,
      departmentId: id,
      isDeactivated: { $ne: true },
    });

    const responseData = department.toJSON();
    responseData.employeeCount = liveCount;

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/departments/:id
 * Safeguarded department deletion (HR Admin only).
 * Prohibits deletion if any active employees are assigned to the department.
 */
export async function deleteDepartment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const department = await Department.findOne({ organizationId: orgId, id });
    if (!department) {
      throw new AppError(`Department with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    // Safeguard check: prohibit deleting department if active employees exist
    const activeEmployeesCount = await Employee.countDocuments({
      organizationId: orgId,
      departmentId: id,
      isDeactivated: { $ne: true },
    });

    if (activeEmployeesCount > 0) {
      throw new AppError(
        `Cannot delete department '${department.name}' because ${activeEmployeesCount} active employee(s) are assigned to it. Please reassign all employees before deleting.`,
        409,
        'CONFLICT'
      );
    }

    await Department.deleteOne({ organizationId: orgId, id });

    res.status(200).json({
      success: true,
      message: `Department '${department.name}' (${id}) deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}
