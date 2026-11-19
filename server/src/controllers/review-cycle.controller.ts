import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ReviewCycle, IReviewCycle } from '../models/ReviewCycle.js';
import { Employee } from '../models/Employee.js';
import { AppError } from '../middleware/errorHandler.js';

// Validation schemas
const createReviewCycleSchema = z
  .object({
    id: z.string().trim().optional(),
    title: z.string().trim().min(3, 'Title must be at least 3 characters'),
    period: z.string().trim().min(2, 'Period is required (e.g. FY2026)'),
    type: z.enum(['Annual 360°', 'Mid-Year Calibration', 'Quarterly Check-in']),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
    status: z.enum(['Draft', 'Active', 'Completed']).default('Draft'),
    eligibleEmployeesCount: z.number().min(0).optional(),
    completedReviewsCount: z.number().min(0).optional(),
    description: z.string().trim().optional(),
    departments: z.array(z.string().trim()).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

const updateReviewCycleSchema = z
  .object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters').optional(),
    period: z.string().trim().min(2).optional(),
    type: z.enum(['Annual 360°', 'Mid-Year Calibration', 'Quarterly Check-in']).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(['Draft', 'Active', 'Completed']).optional(),
    eligibleEmployeesCount: z.number().min(0).optional(),
    completedReviewsCount: z.number().min(0).optional(),
    description: z.string().trim().optional(),
    departments: z.array(z.string().trim()).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: 'End date must be on or after start date',
      path: ['endDate'],
    }
  );

/**
 * GET /api/v1/review-cycles
 * List all review cycles with status and period filters
 */
export async function getReviewCycles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { status, period, type, search } = req.query as Record<string, string>;

    const filter: Record<string, any> = { organizationId: orgId };

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (period && period !== 'all') {
      filter.period = period;
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ title: regex }, { description: regex }, { period: regex }];
    }

    const reviewCycles = await ReviewCycle.find(filter).sort({ startDate: -1, createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      count: reviewCycles.length,
      data: reviewCycles,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/review-cycles/:id
 * Retrieve a single review cycle profile
 */
export async function getReviewCycleById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const reviewCycle = await ReviewCycle.findOne({ organizationId: orgId, id }).lean();
    if (!reviewCycle) {
      throw new AppError(`Review cycle with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    res.status(200).json({
      success: true,
      data: reviewCycle,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/review-cycles
 * Create a new review cycle (HR Admin only)
 */
export async function createReviewCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const parseResult = createReviewCycleSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const payload = parseResult.data;

    // Auto-calculate eligible employee count if not provided
    let eligibleCount = payload.eligibleEmployeesCount;
    if (eligibleCount === undefined) {
      eligibleCount = await Employee.countDocuments({
        organizationId: orgId,
        isDeactivated: { $ne: true },
      });
    }

    // Generate cycle ID if not provided
    const cycleId = payload.id || (await ReviewCycle.getNextReviewCycleId(payload.period, payload.type));

    const existingCycle = await ReviewCycle.findOne({ organizationId: orgId, id: cycleId });
    if (existingCycle) {
      throw new AppError(`Review cycle ID '${cycleId}' already exists`, 409, 'CONFLICT');
    }

    const newCycle = await ReviewCycle.create({
      id: cycleId,
      organizationId: orgId,
      title: payload.title,
      period: payload.period,
      type: payload.type,
      startDate: payload.startDate,
      endDate: payload.endDate,
      status: payload.status,
      eligibleEmployeesCount: eligibleCount,
      completedReviewsCount: payload.completedReviewsCount || 0,
      description: payload.description || '',
      departments: payload.departments || [],
    });

    res.status(201).json({
      success: true,
      message: 'Review cycle created successfully',
      data: newCycle.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/review-cycles/:id
 * Update review cycle details or transition status (Draft -> Active -> Completed)
 * HR Admin only
 */
export async function updateReviewCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const parseResult = updateReviewCycleSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    const cycle = await ReviewCycle.findOne({ organizationId: orgId, id });
    if (!cycle) {
      throw new AppError(`Review cycle with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    const updates = parseResult.data;

    // Date validation against existing values
    const newStartDate = updates.startDate || cycle.startDate;
    const newEndDate = updates.endDate || cycle.endDate;
    if (newEndDate < newStartDate) {
      throw new AppError('End date cannot precede start date', 400, 'VALIDATION_ERROR');
    }

    if (updates.title !== undefined) cycle.title = updates.title;
    if (updates.period !== undefined) cycle.period = updates.period;
    if (updates.type !== undefined) cycle.type = updates.type;
    if (updates.startDate !== undefined) cycle.startDate = updates.startDate;
    if (updates.endDate !== undefined) cycle.endDate = updates.endDate;
    if (updates.status !== undefined) cycle.status = updates.status;
    if (updates.eligibleEmployeesCount !== undefined) cycle.eligibleEmployeesCount = updates.eligibleEmployeesCount;
    if (updates.completedReviewsCount !== undefined) cycle.completedReviewsCount = updates.completedReviewsCount;
    if (updates.description !== undefined) cycle.description = updates.description;
    if (updates.departments !== undefined) cycle.departments = updates.departments;

    await cycle.save();

    res.status(200).json({
      success: true,
      message: 'Review cycle updated successfully',
      data: cycle.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/review-cycles/:id
 * Delete a review cycle (HR Admin only)
 */
export async function deleteReviewCycle(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const { id } = req.params;

    const cycle = await ReviewCycle.findOne({ organizationId: orgId, id });
    if (!cycle) {
      throw new AppError(`Review cycle with ID '${id}' not found`, 404, 'NOT_FOUND');
    }

    await ReviewCycle.deleteOne({ organizationId: orgId, id });

    res.status(200).json({
      success: true,
      message: `Review cycle '${cycle.title}' (${id}) deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
}
