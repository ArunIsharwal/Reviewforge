import express, { Request, Response } from 'express';
import { checkDatabaseHealth } from '../config/database.js';
import { config } from '../config/env.js';

const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbHealth = await checkDatabaseHealth();

  const isHealthy = dbHealth.connected;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    success: isHealthy,
    status: isHealthy ? 'healthy' : 'degraded',
    version: '1.0.0-enterprise',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbHealth,
    services: {
      api: { status: 'operational' },
      database: { status: dbHealth.status, connected: dbHealth.connected },
      ai: {
        status: config.GEMINI_ENABLED && config.GEMINI_API_KEY ? 'configured' : 'awaiting_key',
        model: config.GEMINI_MODEL,
      },
    },
  });
});

export default router;

