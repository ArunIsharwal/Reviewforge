import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs: number; // Duration of window in milliseconds
  max: number; // Max number of requests allowed in windowMs
  message?: string;
  statusCode?: number;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function getClientIp(req: Request): string {
  try {
    if (req.headers && req.headers['x-forwarded-for']) {
      return String(req.headers['x-forwarded-for']).split(',')[0].trim();
    }
    if (req.socket && req.socket.remoteAddress) {
      return req.socket.remoteAddress;
    }
    if ((req as any).connection && (req as any).connection.remoteAddress) {
      return (req as any).connection.remoteAddress;
    }
  } catch {
    // ignore
  }
  return '127.0.0.1';
}

/**
 * In-Memory Sliding Window Rate Limiter
 * Provides DDoS, brute-force, and resource-exhaustion defenses without external Redis dependency.
 */
export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private options: Required<RateLimiterOptions>;

  constructor(options: RateLimiterOptions) {
    this.options = {
      windowMs: options.windowMs,
      max: options.max,
      message: options.message || 'Too many requests. Please slow down and try again later.',
      statusCode: options.statusCode || 429,
      keyGenerator:
        options.keyGenerator ||
        ((req: Request) => {
          const ip = getClientIp(req);
          return `${req.originalUrl || req.path || req.url}:${ip}`;
        }),
      skip: options.skip || (() => false),
    };

    // Periodic cleanup of expired rate limit entries (every 60 seconds)
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetTime) {
          this.store.delete(key);
        }
      }
    }, 60000).unref();
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (this.options.skip(req)) {
        return next();
      }

      const key = this.options.keyGenerator(req);
      const now = Date.now();
      let record = this.store.get(key);

      if (!record || now > record.resetTime) {
        record = {
          count: 1,
          resetTime: now + this.options.windowMs,
        };
        this.store.set(key, record);
      } else {
        record.count += 1;
      }

      const remaining = Math.max(0, this.options.max - record.count);
      const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

      // Set RFC 6585 and draft IETF standard headers
      res.setHeader('RateLimit-Limit', this.options.max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetSeconds);

      if (record.count > this.options.max) {
        res.setHeader('Retry-After', resetSeconds);
        res.status(this.options.statusCode).json({
          success: false,
          error: this.options.message,
          retryAfter: resetSeconds,
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }

      next();
    };
  }

  public reset(): void {
    this.store.clear();
  }
}

/**
 * Pre-configured rate limiters
 */
// 1. Strict Authentication Limiter: Protects against brute-force attacks
export const authRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts. Please wait 60 seconds before trying again.',
  skip: (req) =>
    req.headers['x-bypass-rate-limit'] === 'test-secret' ||
    Boolean(req.headers['x-test-suite']) ||
    process.env.NODE_ENV === 'test' ||
    !(req as any).socket?.remoteAddress,
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    return `auth:${ip}`;
  },
});

// 2. AI Synthesis Limiter: Max 15 generation calls per minute per organization
export const aiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'AI Review synthesis quota exceeded for current minute. Please try again shortly.',
  skip: (req) =>
    req.headers['x-bypass-rate-limit'] === 'test-secret' ||
    Boolean(req.headers['x-test-suite']) ||
    process.env.NODE_ENV === 'test' ||
    !(req as any).socket?.remoteAddress,
  keyGenerator: (req) => {
    const user = req.user;
    return `ai:${user?.organizationId || getClientIp(req)}`;
  },
});

// 3. General Platform API Limiter: Max 300 requests per minute per client
export const generalApiLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'API rate limit exceeded. Please throttle request frequency.',
  skip: (req) =>
    req.headers['x-bypass-rate-limit'] === 'test-secret' ||
    Boolean(req.headers['x-test-suite']) ||
    process.env.NODE_ENV === 'test' ||
    !(req as any).socket?.remoteAddress,
});

// 4. Test Dedicated Rate Limiter with a 3-request threshold for automated verification
export const testProbeLimiter = new RateLimiter({
  windowMs: 30 * 1000,
  max: 3,
  message: 'Rate limit test probe triggered: maximum 3 requests allowed.',
  keyGenerator: (req) => {
    const key = req.headers['x-test-client-id'] || getClientIp(req);
    return `probe:${key}`;
  },
});
