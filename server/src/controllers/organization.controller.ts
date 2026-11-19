import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Organization } from '../models/Organization.js';
import { AppError } from '../middleware/errorHandler.js';

const updateSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Organization name must be at least 2 characters').optional(),
  industry: z.string().trim().optional(),
  ratingScale: z.enum(['1-5 Numeric', '1-4 Descriptive', 'Letter Scale']).optional(),
  defaultCyclePeriod: z.string().trim().optional(),
  anonymityPolicy: z.enum(['Strict Anonymity', 'Optional Anonymity', 'Transparent']).optional(),
  allowEmployeeDirectRelease: z.boolean().optional(),
  requireDualManagerSignoff: z.boolean().optional(),
  notificationPreferences: z
    .object({
      emailOnCycleStart: z.boolean().optional(),
      emailOnFeedbackRequest: z.boolean().optional(),
      emailOnReviewReady: z.boolean().optional(),
      slackDigestWeekly: z.boolean().optional(),
    })
    .optional(),
});

/**
 * GET /api/v1/organization
 * Retrieve active organization profile and platform governance settings
 */
export async function getOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';

    let org = await Organization.findOne({ id: orgId }).lean();
    if (!org) {
      await Organization.seedDefaultOrganization();
      org = await Organization.findOne({ id: orgId }).lean();
    }

    res.status(200).json({
      success: true,
      data: org,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/organization/settings
 * Update organization policies, rating rubrics, and notification rules (HR Admin only)
 */
export async function updateOrganizationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const orgId = req.user?.organizationId || 'org-reviewforge-default';
    const parseResult = updateSettingsSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMsg = parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${errorMsg}`, 400, 'VALIDATION_ERROR');
    }

    let org = await Organization.findOne({ id: orgId });
    if (!org) {
      await Organization.seedDefaultOrganization();
      org = await Organization.findOne({ id: orgId });
    }

    if (!org) {
      throw new AppError(`Organization '${orgId}' not found`, 404, 'NOT_FOUND');
    }

    const updates = parseResult.data;

    if (updates.name !== undefined) org.name = updates.name;
    if (updates.industry !== undefined) org.industry = updates.industry;

    if (updates.ratingScale !== undefined) org.settings.ratingScale = updates.ratingScale;
    if (updates.defaultCyclePeriod !== undefined) org.settings.defaultCyclePeriod = updates.defaultCyclePeriod;
    if (updates.anonymityPolicy !== undefined) org.settings.anonymityPolicy = updates.anonymityPolicy;
    if (updates.allowEmployeeDirectRelease !== undefined) {
      org.settings.allowEmployeeDirectRelease = updates.allowEmployeeDirectRelease;
    }
    if (updates.requireDualManagerSignoff !== undefined) {
      org.settings.requireDualManagerSignoff = updates.requireDualManagerSignoff;
    }
    if (updates.notificationPreferences) {
      org.settings.notificationPreferences = {
        ...org.settings.notificationPreferences,
        ...updates.notificationPreferences,
      };
    }

    await org.save();

    res.status(200).json({
      success: true,
      message: 'Organization platform settings updated successfully',
      data: org.toJSON(),
    });
  } catch (error) {
    next(error);
  }
}
