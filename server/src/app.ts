import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { securityHeaders, nosqlInjectionGuard } from './middleware/security.js';
import { generalApiLimiter } from './middleware/rate-limiter.js';
import apiRouter from './routes/index.js';

export function createApp(): Express {
  const app = express();
  const allowedOrigins = config.ALLOWED_ORIGIN.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // 1. Enterprise Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
  app.use(securityHeaders);

  // 2. Deployment-ready CORS policy
  app.use(
    cors({
      origin: (requestOrigin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server health checks)
        if (!requestOrigin) return callback(null, true);

        if (allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin)) {
          return callback(null, true);
        }

        // In development, permit any localhost origin/port
        if (config.NODE_ENV === 'development' && /^http:\/\/localhost(:\d+)?$/.test(requestOrigin)) {
          return callback(null, true);
        }

        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Test-Suite', 'X-Bypass-Rate-Limit', 'X-Test-Client-Id'],
    })
  );

  // 3. Body parsers with tight payload boundaries
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // 4. NoSQL Injection protection (blocks malicious $ operators & query poisoning)
  app.use(nosqlInjectionGuard);

  // 5. General API rate limiter (sliding window defense)
  app.use(generalApiLimiter.middleware());

  // 6. Request logger
  app.use(requestLogger);

  // Mount centralized API v1
  app.use('/api/v1', apiRouter);

  // Fallback 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;
