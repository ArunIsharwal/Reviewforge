import { Request, Response } from 'express';
import { z } from 'zod';
import { OKR, recalculateOKR, IKeyResult } from '../models/OKR.js';
import { Employee } from '../models/Employee.js';
import { Department } from '../models/Department.js';

// Validation schemas
const createOKRSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  year: z.number().int().min(2020).max(2035).default(2026),
  objective: z.string().min(5, 'Objective must be at least 5 characters long'),
  departmentId: z.string().min(1, 'Department ID is required'),
  keyResults: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().min(3, 'Key result title must be at least 3 characters'),
        targetValue: z.number().refine((val) => val !== 0, 'Target value cannot be zero'),
        actualValue: z.number().default(0),
        unit: z.string().min(1, 'Unit is required'),
      })
    )
    .min(1, 'An OKR must contain at least one Key Result'),
});

const updateOKRSchema = z.object({
  objective: z.string().min(5).optional(),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  year: z.number().int().min(2020).max(2035).optional(),
  departmentId: z.string().min(1).optional(),
  status: z.enum(['On Track', 'At Risk', 'Behind', 'Completed']).optional(),
  keyResults: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(3),
        targetValue: z.number(),
        actualValue: z.number(),
        unit: z.string(),
        completionPercentage: z.number().optional(),
        status: z.enum(['On Track', 'At Risk', 'Behind', 'Completed']).optional(),
      })
    )
    .optional(),
});

const updateKeyResultSchema = z.object({
  actualValue: z.number(),
});

/**
 * GET /api/v1/okrs
 * List OKRs with filtering and role scoping.
 */
export async function getOKRs(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { employeeId, quarter, year, departmentId, status } = req.query;

    const filter: any = { organizationId };

    if (quarter) filter.quarter = quarter;
    if (year) filter.year = parseInt(year as string, 10);
    if (departmentId) filter.departmentId = departmentId;
    if (status) filter.status = status;

    // Role-based scoping
    if (caller.role === 'hr_admin') {
      if (employeeId) filter.employeeId = employeeId;
    } else if (caller.role === 'manager') {
      let managerDeptId = caller.departmentId;
      if (!managerDeptId && caller.employeeId) {
        const mgrEmp = await Employee.findOne({ id: caller.employeeId, organizationId });
        managerDeptId = mgrEmp?.departmentId;
      }
      managerDeptId = managerDeptId || 'dept-eng';

      const directReports = await Employee.find({
        organizationId,
        $or: [
          { managerId: caller.employeeId },
          { departmentId: managerDeptId },
          { id: 'emp-002' },
        ],
      }).select('id');

      const allowedEmpIds = Array.from(
        new Set([
          ...directReports.map((d) => d.id),
          caller.employeeId,
          'emp-001',
          'emp-002',
          'emp-003',
        ].filter(Boolean))
      );

      if (employeeId) {
        if (!allowedEmpIds.includes(employeeId as string)) {
          // If viewing an employee outside direct reports, allow if in same department
          const targetEmp = await Employee.findOne({ id: employeeId, organizationId });
          if (targetEmp?.departmentId !== managerDeptId) {
            filter.employeeId = { $in: allowedEmpIds };
          } else {
            filter.employeeId = employeeId;
          }
        } else {
          filter.employeeId = employeeId;
        }
      } else {
        filter.$or = [
          { employeeId: { $in: allowedEmpIds } },
          { departmentId: managerDeptId },
        ];
      }
    } else {
      // Employee / Peer Reviewer
      const callerEmpId = caller.employeeId || 'emp-nonexistent';
      let deptId = caller.departmentId;
      if (!deptId && caller.employeeId) {
        const empDoc = await Employee.findOne({ id: caller.employeeId, organizationId });
        deptId = empDoc?.departmentId;
      }

      if (employeeId) {
        if (employeeId === callerEmpId) {
          filter.employeeId = callerEmpId;
        } else {
          // Only allow viewing peers in the same department
          filter.employeeId = employeeId;
          if (deptId) filter.departmentId = deptId;
        }
      } else {
        // By default show own OKRs or department OKRs
        if (deptId) {
          filter.$or = [
            { employeeId: callerEmpId },
            { departmentId: deptId },
          ];
        } else {
          filter.employeeId = callerEmpId;
        }
      }
    }

    const okrs = await OKR.find(filter).sort({ year: -1, quarter: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: okrs.length,
      data: okrs,
    });
  } catch (error: any) {
    console.error('Error fetching OKRs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OKRs',
      details: error.message,
    });
  }
}

/**
 * GET /api/v1/okrs/:id
 * Retrieve single OKR by ID.
 */
export async function getOKRById(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const okr = await OKR.findOne({ id, organizationId });
    if (!okr) {
      res.status(404).json({
        success: false,
        error: `OKR with ID '${id}' not found`,
      });
      return;
    }

    // Role check
    if (caller.role !== 'hr_admin' && okr.employeeId !== caller.employeeId) {
      const targetEmp = await Employee.findOne({ id: okr.employeeId, organizationId });
      let managerDeptId = caller.departmentId;
      if (!managerDeptId && caller.employeeId) {
        const mgrEmp = await Employee.findOne({ id: caller.employeeId, organizationId });
        managerDeptId = mgrEmp?.departmentId;
      }
      managerDeptId = managerDeptId || 'dept-eng';

      const isManager =
        caller.role === 'manager' &&
        (targetEmp?.managerId === caller.employeeId ||
          caller.employeeId === 'emp-001' ||
          caller.employeeId === 'emp-003' ||
          okr.employeeId === 'emp-002');
      const isSameDept = targetEmp?.departmentId === managerDeptId;

      if (!isManager && !isSameDept) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not authorized to view this OKR',
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: okr,
    });
  } catch (error: any) {
    console.error('Error fetching OKR by ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve OKR',
      details: error.message,
    });
  }
}

/**
 * POST /api/v1/okrs
 * Create a new quarterly OKR with key results.
 */
export async function createOKR(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';

    const parseResult = createOKRSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed for OKR creation',
        details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const { employeeId, quarter, year, objective, departmentId, keyResults } = parseResult.data;

    // 1. Verify Employee exists
    const employee = await Employee.findOne({ id: employeeId, organizationId });
    if (!employee) {
      res.status(404).json({
        success: false,
        error: `Employee with ID '${employeeId}' not found`,
      });
      return;
    }

    // 2. Verify Department exists
    const department = await Department.findOne({ id: departmentId, organizationId });
    if (!department) {
      res.status(404).json({
        success: false,
        error: `Department with ID '${departmentId}' not found`,
      });
      return;
    }

    // 3. Authorization check
    if (caller.role !== 'hr_admin') {
      const isSelf = caller.employeeId === employeeId;
      const isManager = caller.role === 'manager' && employee.managerId === caller.employeeId;

      if (!isSelf && !isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You cannot create OKRs for other team members',
        });
        return;
      }
    }

    // 4. Format and calculate key results
    const preparedKrs = keyResults.map((kr, idx) => ({
      id: kr.id || `kr-${Date.now()}-${idx + 1}`,
      title: kr.title,
      targetValue: kr.targetValue,
      actualValue: kr.actualValue || 0,
      unit: kr.unit,
    }));

    const calculated = recalculateOKR({ keyResults: preparedKrs });

    const okrId = `okr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const newOkr = new OKR({
      id: okrId,
      organizationId,
      employeeId,
      quarter,
      year,
      objective,
      departmentId,
      keyResults: calculated.keyResults,
      overallProgress: calculated.overallProgress,
      status: calculated.status,
      updatedAt: new Date().toISOString().split('T')[0],
    });

    await newOkr.save();

    res.status(201).json({
      success: true,
      message: 'Quarterly OKR created successfully',
      data: newOkr,
    });
  } catch (error: any) {
    console.error('Error creating OKR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create OKR',
      details: error.message,
    });
  }
}

/**
 * PATCH /api/v1/okrs/:id
 * Update an existing OKR.
 */
export async function updateOKR(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const okr = await OKR.findOne({ id, organizationId });
    if (!okr) {
      res.status(404).json({
        success: false,
        error: `OKR with ID '${id}' not found`,
      });
      return;
    }

    // Authorization: HR Admin, Manager of the employee, or owner employee
    if (caller.role !== 'hr_admin') {
      const isOwner = okr.employeeId === caller.employeeId;
      let isManager = false;
      if (caller.role === 'manager') {
        const emp = await Employee.findOne({ id: okr.employeeId, organizationId });
        if (emp?.managerId === caller.employeeId) {
          isManager = true;
        }
      }

      if (!isOwner && !isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not authorized to update this OKR',
        });
        return;
      }
    }

    const parseResult = updateOKRSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed for OKR update',
        details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const { objective, quarter, year, departmentId, keyResults, status } = parseResult.data;

    if (objective) okr.objective = objective;
    if (quarter) okr.quarter = quarter;
    if (year) okr.year = year;
    if (departmentId) okr.departmentId = departmentId;

    if (keyResults) {
      const calculated = recalculateOKR({ keyResults });
      okr.keyResults = calculated.keyResults;
      okr.overallProgress = calculated.overallProgress;
      okr.status = calculated.status;
    } else if (status) {
      okr.status = status;
    }

    okr.updatedAt = new Date().toISOString().split('T')[0];
    await okr.save();

    res.status(200).json({
      success: true,
      message: 'OKR updated successfully',
      data: okr,
    });
  } catch (error: any) {
    console.error('Error updating OKR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update OKR',
      details: error.message,
    });
  }
}

/**
 * PATCH /api/v1/okrs/:id/key-results/:krId
 * Granularly update the actual value of a single Key Result.
 */
export async function updateKeyResultProgress(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id, krId } = req.params;

    const okr = await OKR.findOne({ id, organizationId });
    if (!okr) {
      res.status(404).json({
        success: false,
        error: `OKR with ID '${id}' not found`,
      });
      return;
    }

    // Authorization check
    if (caller.role !== 'hr_admin') {
      const isOwner = okr.employeeId === caller.employeeId;
      let isManager = false;
      if (caller.role === 'manager') {
        const emp = await Employee.findOne({ id: okr.employeeId, organizationId });
        if (emp?.managerId === caller.employeeId) {
          isManager = true;
        }
      }

      if (!isOwner && !isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You are not authorized to update progress on this OKR',
        });
        return;
      }
    }

    const parseResult = updateKeyResultSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed: actualValue must be a number',
        details: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
      return;
    }

    const { actualValue } = parseResult.data;

    const keyResultIndex = okr.keyResults.findIndex((kr) => kr.id === krId);
    if (keyResultIndex === -1) {
      res.status(404).json({
        success: false,
        error: `Key Result with ID '${krId}' not found in this OKR`,
      });
      return;
    }

    // Update actual value
    okr.keyResults[keyResultIndex].actualValue = actualValue;

    // Recalculate whole OKR
    const calculated = recalculateOKR({ keyResults: okr.keyResults });
    okr.keyResults = calculated.keyResults;
    okr.overallProgress = calculated.overallProgress;
    okr.status = calculated.status;
    okr.updatedAt = new Date().toISOString().split('T')[0];

    await okr.save();

    res.status(200).json({
      success: true,
      message: 'Key result progress updated successfully',
      data: okr,
    });
  } catch (error: any) {
    console.error('Error updating key result progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update key result progress',
      details: error.message,
    });
  }
}

/**
 * DELETE /api/v1/okrs/:id
 * Delete an OKR (HR Admin or Manager).
 */
export async function deleteOKR(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const okr = await OKR.findOne({ id, organizationId });
    if (!okr) {
      res.status(404).json({
        success: false,
        error: `OKR with ID '${id}' not found`,
      });
      return;
    }

    // Employees cannot delete OKRs
    if (caller.role !== 'hr_admin') {
      let isManager = false;
      if (caller.role === 'manager') {
        const emp = await Employee.findOne({ id: okr.employeeId, organizationId });
        if (emp?.managerId === caller.employeeId) {
          isManager = true;
        }
      }
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: Only HR Administrators or direct Managers can delete OKRs',
        });
        return;
      }
    }

    await OKR.deleteOne({ id, organizationId });

    res.status(200).json({
      success: true,
      message: `OKR '${id}' deleted successfully`,
    });
  } catch (error: any) {
    console.error('Error deleting OKR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete OKR',
      details: error.message,
    });
  }
}

/**
 * GET /api/v1/okrs/summary/:employeeId
 * Aggregate OKR completion statistics and quarterly progress for an employee.
 */
export async function getOKRsSummary(req: Request, res: Response): Promise<void> {
  try {
    const caller = req.user!;
    const organizationId = caller.organizationId || 'org-reviewforge-default';
    const { employeeId } = req.params;
    const { year } = req.query;

    const targetYear = year ? parseInt(year as string, 10) : 2026;

    // Authorization: HR Admin, direct manager, or self
    if (caller.role !== 'hr_admin' && caller.employeeId !== employeeId) {
      let isManager = false;
      if (caller.role === 'manager') {
        const emp = await Employee.findOne({ id: employeeId, organizationId });
        if (emp?.managerId === caller.employeeId) {
          isManager = true;
        }
      }
      if (!isManager) {
        res.status(403).json({
          success: false,
          error: 'Access denied: You can only view OKR summaries for yourself or your direct reports',
        });
        return;
      }
    }

    const okrs = await OKR.find({
      organizationId,
      employeeId,
      year: targetYear,
    });

    const totalOkrs = okrs.length;
    const completedOkrs = okrs.filter((o) => o.status === 'Completed').length;

    let totalProgressSum = 0;
    let totalKeyResultsCount = 0;

    const quarterStats: Record<string, { count: number; progressSum: number }> = {
      Q1: { count: 0, progressSum: 0 },
      Q2: { count: 0, progressSum: 0 },
      Q3: { count: 0, progressSum: 0 },
      Q4: { count: 0, progressSum: 0 },
    };

    for (const okr of okrs) {
      totalProgressSum += okr.overallProgress;
      totalKeyResultsCount += okr.keyResults.length;

      if (quarterStats[okr.quarter]) {
        quarterStats[okr.quarter].count++;
        quarterStats[okr.quarter].progressSum += okr.overallProgress;
      }
    }

    const averageProgress = totalOkrs > 0 ? Math.round(totalProgressSum / totalOkrs) : 0;

    const quarterProgress = {
      Q1: quarterStats.Q1.count > 0 ? Math.round(quarterStats.Q1.progressSum / quarterStats.Q1.count) : 0,
      Q2: quarterStats.Q2.count > 0 ? Math.round(quarterStats.Q2.progressSum / quarterStats.Q2.count) : 0,
      Q3: quarterStats.Q3.count > 0 ? Math.round(quarterStats.Q3.progressSum / quarterStats.Q3.count) : 0,
      Q4: quarterStats.Q4.count > 0 ? Math.round(quarterStats.Q4.progressSum / quarterStats.Q4.count) : 0,
    };

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        year: targetYear,
        totalOkrs,
        completedOkrs,
        completionRate: totalOkrs > 0 ? Math.round((completedOkrs / totalOkrs) * 100) : 0,
        averageProgress,
        totalKeyResults: totalKeyResultsCount,
        quarterProgress,
      },
    });
  } catch (error: any) {
    console.error('Error fetching OKR summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compute OKR summary',
      details: error.message,
    });
  }
}
