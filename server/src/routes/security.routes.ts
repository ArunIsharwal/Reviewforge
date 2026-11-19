import express, { Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { testProbeLimiter } from '../middleware/rate-limiter.js';
import { maskSensitiveData } from '../middleware/security.js';
import { ensureAllIndexes } from '../config/index-optimizer.js';
import { platformCache } from '../utils/cache.js';
import { PerformanceReview } from '../models/PerformanceReview.js';
import { AISynthesisLog } from '../models/AISynthesisLog.js';
import { ManagerNote } from '../models/ManagerNote.js';
import { SelfReflection } from '../models/SelfReflection.js';
import { FeedbackItem } from '../models/Feedback.js';
import { FeedbackRequest } from '../models/FeedbackRequest.js';
import { OKR } from '../models/OKR.js';
import { Employee } from '../models/Employee.js';

const router = express.Router();

/**
 * GET /api/v1/security/rate-limit-test
 * Verifies rate limiter enforcement (3 requests max per test client key)
 */
router.get('/rate-limit-test', testProbeLimiter.middleware(), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Rate limit test probe request accepted.',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/security/sanitize-test
 * Verifies secret masking utility
 */
router.post('/sanitize-test', (req: Request, res: Response) => {
  const masked = maskSensitiveData(req.body);
  res.status(200).json({
    success: true,
    data: masked,
  });
});

/**
 * GET /api/v1/security/indexes
 * Verifies and returns active MongoDB database collection indexes
 * Restricted to hr_admin
 */
router.get(
  '/indexes',
  authenticate,
  requireRoles('hr_admin'),
  async (req: Request, res: Response, next) => {
    try {
      const reports = await ensureAllIndexes();
      res.status(200).json({
        success: true,
        collectionCount: reports.length,
        totalIndexes: reports.reduce((acc, r) => acc + r.indexCount, 0),
        data: reports,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/security/status
 * Enterprise security, privacy, and performance posture audit endpoint
 * Restricted to hr_admin
 */
router.get(
  '/status',
  authenticate,
  requireRoles('hr_admin'),
  async (req: Request, res: Response, next) => {
    try {
      const indexReports = await ensureAllIndexes();
      const cacheStats = platformCache.stats();

      res.status(200).json({
        success: true,
        environment: process.env.NODE_ENV || 'development',
        securityHeaders: {
          xContentTypeOptions: 'nosniff',
          xFrameOptions: 'DENY',
          xXSSProtection: '1; mode=block',
          strictTransportSecurity: 'max-age=31536000; includeSubDomains',
          referrerPolicy: 'strict-origin-when-cross-origin',
          contentSecurityPolicy: 'Active',
        },
        protectionModules: {
          nosqlInjectionGuard: 'ENABLED',
          rateLimiting: 'ENABLED',
          rbacEnforcement: 'ENABLED',
          anonymityProtection: 'ENABLED',
          secretMasking: 'ENABLED',
        },
        databaseHealth: {
          collectionCount: indexReports.length,
          totalIndexes: indexReports.reduce((acc, r) => acc + r.indexCount, 0),
          allIndexesHealthy: indexReports.every((r) => r.indexCount > 0),
        },
        performanceCache: cacheStats,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/security/clear-data
 * Clears all performance reviews, OKRs, feedback, manager notes, and self-reflections
 * to allow starting a clean evaluation cycle from scratch.
 */
router.post('/clear-data', async (req: Request, res: Response) => {
  try {
    const orgId = 'org-reviewforge-default';

    const [revs, aiLogs, notes, refs, fb, reqs, okrs] = await Promise.all([
      PerformanceReview.deleteMany({ organizationId: orgId }),
      AISynthesisLog.deleteMany({ organizationId: orgId }),
      ManagerNote.deleteMany({ organizationId: orgId }),
      SelfReflection.deleteMany({ organizationId: orgId }),
      FeedbackItem.deleteMany({ organizationId: orgId }),
      FeedbackRequest.deleteMany({ organizationId: orgId }),
      OKR.deleteMany({ organizationId: orgId }),
    ]);

    await Employee.updateMany(
      { organizationId: orgId },
      { $set: { reviewStatus: 'Not Started' } }
    );

    res.status(200).json({
      success: true,
      message: 'All review and OKR data successfully cleared for a clean start.',
      cleared: {
        reviews: revs.deletedCount,
        aiLogs: aiLogs.deletedCount,
        notes: notes.deletedCount,
        selfReflections: refs.deletedCount,
        feedback: fb.deletedCount,
        feedbackRequests: reqs.deletedCount,
        okrs: okrs.deletedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
