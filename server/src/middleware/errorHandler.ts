import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { maskSensitiveData } from './security.js';

export class AppError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      issues: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // 2. Custom Application Errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: maskSensitiveData(err.details),
    });
    return;
  }

  // 3. Mongoose CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({
      success: false,
      error: `Invalid identifier format for field: ${err.path}`,
    });
    return;
  }

  // 4. Mongoose ValidationError
  if (err.name === 'ValidationError') {
    res.status(400).json({
      success: false,
      error: 'Database validation failed',
      details: Object.values(err.errors || {}).map((e: any) => e.message),
    });
    return;
  }

  // 5. Unhandled / Server Errors
  console.error('💥 Unhandled Exception:', err);
  const isProd = process.env.NODE_ENV === 'production';

  res.status(err.status || 500).json({
    success: false,
    error: isProd ? 'Internal server error' : err.message || 'Unknown server error',
    ...(isProd ? {} : { stack: err.stack }),
  });
}
