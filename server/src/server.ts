import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { User } from './models/User.js';
import { Employee } from './models/Employee.js';
import { Department } from './models/Department.js';
import { Organization } from './models/Organization.js';
import { ReviewCycle } from './models/ReviewCycle.js';
import { seedInitialFeedback } from './models/Feedback.js';
import { seedInitialFeedbackRequests } from './models/FeedbackRequest.js';
import { OKR, seedInitialOKRs } from './models/OKR.js';
import { seedInitialManagerNotes } from './models/ManagerNote.js';
import { seedInitialSelfReflections } from './models/SelfReflection.js';
import { seedInitialPerformanceReviews } from './models/PerformanceReview.js';
import { seedInitialNotifications } from './models/Notification.js';
import { seedInitialAuditLogs } from './models/AuditLog.js';
import { ensureAllIndexes } from './config/index-optimizer.js';

const app = createApp();

async function startServer() {
  try {
    console.log('🚀 Initializing ReviewForge Enterprise API Server...');

    // Connect to MongoDB
    await connectDatabase()
      .then(async () => {
        // Seed initial enterprise models if not already populated
        await Organization.seedDefaultOrganization().catch((e) => {
          console.warn('Organization seed warning:', e.message);
        });
        await User.seedDefaultUsers().catch((e) => {
          console.warn('User seed warning:', e.message);
        });
        await Department.seedDefaultDepartments().catch((e) => {
          console.warn('Department seed warning:', e.message);
        });
        await Employee.seedDefaultEmployees().catch((e) => {
          console.warn('Employee seed warning:', e.message);
        });
        await ReviewCycle.seedDefaultReviewCycles().catch((e) => {
          console.warn('ReviewCycle seed warning:', e.message);
        });
        // Seed initial review artifacts if empty or explicitly enabled
        const okrCount = await OKR.countDocuments({ organizationId: 'org-reviewforge-default' });
        if (okrCount === 0 || process.env.SEED_DEMO_REVIEWS === 'true') {
          await seedInitialFeedback().catch((e) => console.warn('Feedback seed warning:', e.message));
          await seedInitialFeedbackRequests().catch((e) => console.warn('FeedbackRequest seed warning:', e.message));
          await seedInitialOKRs().catch((e) => console.warn('OKR seed warning:', e.message));
          await seedInitialManagerNotes().catch((e) => console.warn('ManagerNote seed warning:', e.message));
          await seedInitialSelfReflections().catch((e) => console.warn('SelfReflection seed warning:', e.message));
          await seedInitialPerformanceReviews().catch((e) => console.warn('PerformanceReview seed warning:', e.message));
        }
        await seedInitialNotifications().catch((e) => {
          console.warn('Notification seed warning:', e.message);
        });
        await seedInitialAuditLogs().catch((e) => {
          console.warn('AuditLog seed warning:', e.message);
        });
        await ensureAllIndexes().then((reports) => {
          console.log(`🛡️ Verified ${reports.length} MongoDB collection schemas and indexes.`);
        }).catch((e) => {
          console.warn('Index verification warning:', e.message);
        });
      })
      .catch((err) => {
        if (config.NODE_ENV === 'production') {
          throw err;
        }
        console.warn('⚠️ Server started with degraded database connection:', err.message);
      });

    const server = app.listen(config.PORT, '0.0.0.0', () => {
      console.log(`🌟 ReviewForge Server listening on port ${config.PORT}`);
      console.log(`🩺 Health endpoint: http://localhost:${config.PORT}/api/v1/health`);
      console.log(`🌍 Environment: ${config.NODE_ENV}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        await disconnectDatabase();
        console.log('✅ Server stopped cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    return server;
  } catch (error) {
    console.error('💥 Fatal error starting ReviewForge Server:', error);
    process.exit(1);
  }
}

// Start if executed directly
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  void startServer();
}

export { startServer };
