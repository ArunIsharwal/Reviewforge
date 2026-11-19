import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Notification, INotification, NotificationType } from '../models/Notification.js';
import { Organization } from '../models/Organization.js';
import { AppError } from '../middleware/errorHandler.js';

const createNotificationSchema = z.object({
  userId: z.string().trim().min(1, 'Target userId is required'),
  title: z.string().trim().min(2, 'Title must be at least 2 characters'),
  message: z.string().trim().min(5, 'Message must be at least 5 characters'),
  type: z.enum(['cycle', 'feedback', 'approval', 'release', 'system']).default('system'),
  link: z.string().trim().optional(),
});

const updatePreferencesSchema = z.object({
  emailOnCycleStart: z.boolean().optional(),
  emailOnFeedbackRequest: z.boolean().optional(),
  emailOnReviewReady: z.boolean().optional(),
  slackDigestWeekly: z.boolean().optional(),
  inAppAlerts: z.boolean().optional(),
});

function getUserIdentifiers(user: any): string[] {
  const ids = new Set<string>();
  if (user.id) ids.add(String(user.id));
  if (user._id) ids.add(user._id.toString());
  if (typeof user.get === 'function' && user.get('id')) ids.add(String(user.get('id')));
  if (user.employeeId) ids.add(String(user.employeeId));
  return Array.from(ids);
}

/**
 * GET /api/v1/notifications
 * Lists notifications for authenticated user with unread counter
 */
export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const organizationId = user.organizationId;
    const userIds = getUserIdentifiers(user);

    const { unreadOnly } = req.query;

    const filter: Record<string, any> = {
      organizationId,
      userId: { $in: userIds },
    };

    if (unreadOnly === 'true') {
      filter.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({
        organizationId,
        userId: { $in: userIds },
        isRead: false,
      }),
    ]);

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/notifications
 * Creates a notification (system event or admin broadcast)
 */
export async function createNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const validated = createNotificationSchema.parse(req.body);
    const id = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const notification = await Notification.create({
      id,
      organizationId: user.organizationId,
      userId: validated.userId,
      title: validated.title,
      message: validated.message,
      type: validated.type as NotificationType,
      link: validated.link || '',
      isRead: false,
    });

    res.status(201).json({
      success: true,
      message: 'Notification created successfully.',
      data: notification,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: error.issues.map((i) => i.message).join('; '),
      });
      return;
    }
    next(error);
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read
 */
export async function markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const { id } = req.params;
    const organizationId = user.organizationId;
    const userIds = getUserIdentifiers(user);

    const notification = await Notification.findOne({ id, organizationId });
    if (!notification) {
      throw new AppError(`Notification "${id}" not found.`, 404);
    }

    // Verify ownership: user must own notification or be hr_admin
    if (!userIds.includes(notification.userId) && user.role !== 'hr_admin') {
      throw new AppError('Access denied: Cannot modify another user notification.', 403);
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: notification,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/notifications/mark-all-read
 * Marks all notifications for authenticated user as read
 */
export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const organizationId = user.organizationId;
    const userIds = getUserIdentifiers(user);

    const result = await Notification.updateMany(
      {
        organizationId,
        userId: { $in: userIds },
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/notifications/:id
 * Dismisses/deletes a notification
 */
export async function deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const { id } = req.params;
    const organizationId = user.organizationId;
    const userIds = getUserIdentifiers(user);

    const notification = await Notification.findOne({ id, organizationId });
    if (!notification) {
      throw new AppError(`Notification "${id}" not found.`, 404);
    }

    if (!userIds.includes(notification.userId) && user.role !== 'hr_admin') {
      throw new AppError('Access denied: Cannot delete another user notification.', 403);
    }

    await Notification.deleteOne({ id, organizationId });

    res.status(200).json({
      success: true,
      message: 'Notification dismissed successfully.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/notifications/preferences
 * Returns notification preferences
 */
export async function getNotificationPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const org = await Organization.findOne({ id: user.organizationId });
    const prefs = org?.settings?.notificationPreferences || {
      emailOnCycleStart: true,
      emailOnFeedbackRequest: true,
      emailOnReviewReady: true,
      slackDigestWeekly: false,
    };

    res.status(200).json({
      success: true,
      data: prefs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/notifications/preferences
 * Updates notification preferences
 */
export async function updateNotificationPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }

    const validated = updatePreferencesSchema.parse(req.body);
    const org = await Organization.findOne({ id: user.organizationId });
    if (!org) {
      throw new AppError('Organization not found.', 404);
    }

    const currentPrefs = org.settings.notificationPreferences || {
      emailOnCycleStart: true,
      emailOnFeedbackRequest: true,
      emailOnReviewReady: true,
      slackDigestWeekly: false,
    };

    org.settings.notificationPreferences = {
      ...currentPrefs,
      ...validated,
    };

    await org.save();

    res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully.',
      data: org.settings.notificationPreferences,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: error.issues.map((i) => i.message).join('; '),
      });
      return;
    }
    next(error);
  }
}
