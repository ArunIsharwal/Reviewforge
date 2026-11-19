import express from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import employeeRoutes from './employee.routes.js';
import departmentRoutes from './department.routes.js';
import organizationRoutes from './organization.routes.js';
import reviewCycleRoutes from './review-cycle.routes.js';
import feedbackRoutes from './feedback.routes.js';
import okrRoutes from './okr.routes.js';
import managerNoteRoutes from './manager-note.routes.js';
import aiSynthesizerRoutes from './ai-synthesizer.routes.js';
import selfReflectionRoutes from './self-reflection.routes.js';
import reviewRoutes from './review.routes.js';
import analyticsRoutes from './analytics.routes.js';
import notificationRoutes from './notification.routes.js';
import auditLogRoutes from './audit-log.routes.js';
import securityRoutes from './security.routes.js';

const apiRouter = express.Router();

// Mount modules
apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/employees', employeeRoutes);
apiRouter.use('/departments', departmentRoutes);
apiRouter.use('/organization', organizationRoutes);
apiRouter.use('/review-cycles', reviewCycleRoutes);
apiRouter.use('/feedback', feedbackRoutes);
apiRouter.use('/okrs', okrRoutes);
apiRouter.use('/manager-notes', managerNoteRoutes);
apiRouter.use('/ai', aiSynthesizerRoutes);
apiRouter.use('/self-reflections', selfReflectionRoutes);
apiRouter.use('/reviews', reviewRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/audit-logs', auditLogRoutes);
apiRouter.use('/security', securityRoutes);

export default apiRouter;
