import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../controllers/notification.controller.js';

const router = express.Router();

router.use(authenticate);

// Preferences routes must precede /:id
router.get('/preferences', getNotificationPreferences);
router.put('/preferences', updateNotificationPreferences);

// Notification collection & bulk actions
router.get('/', getNotifications);
router.post('/', createNotification);
router.post('/mark-all-read', markAllNotificationsRead);

// Individual notification actions
router.patch('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

export default router;
