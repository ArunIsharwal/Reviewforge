import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const color = statusCode >= 500 ? '❌' : statusCode >= 400 ? '⚠️' : '✅';
    console.log(
      `${color} [${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} - ${statusCode} (${duration}ms)`
    );
  });

  next();
}

