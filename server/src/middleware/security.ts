import { Request, Response, NextFunction } from 'express';

/**
 * Enterprise Security Headers Middleware
 * Implements OWASP recommended security headers:
 * - Content-Security-Policy (CSP)
 * - Strict-Transport-Security (HSTS)
 * - X-Content-Type-Options (nosniff)
 * - X-Frame-Options (DENY clickjacking defense)
 * - X-XSS-Protection
 * - Referrer-Policy
 * - Permissions-Policy
 * - Removes X-Powered-By
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  try {
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking by blocking iframe embedding
    res.setHeader('X-Frame-Options', 'DENY');

    // Legacy XSS filter protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Strict Transport Security (HSTS) - enforce HTTPS in production
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Control referrer information leakage
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
    );

    // Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

    // Remove fingerprinting header
    if (typeof res.removeHeader === 'function') {
      res.removeHeader('X-Powered-By');
    }
  } catch {
    // Graceful no-op on custom in-memory mock responses
  }

  next();
}

/**
 * Recursive check for prohibited NoSQL injection operators ($) or dot-notation keys
 */
function containsInjectionOperator(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  if (Array.isArray(obj)) {
    return obj.some((item) => containsInjectionOperator(item));
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    // Detect MongoDB operator keys like $gt, $ne, $where, $regex, $or
    if (key.startsWith('$')) {
      return true;
    }
    // Detect prohibited dot notation in user input keys
    if (key.includes('.')) {
      return true;
    }

    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null) {
      if (containsInjectionOperator(value)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * NoSQL Injection Protection Middleware
 * Scans req.body, req.query, and req.params for malicious MongoDB query operators ($gt, $ne, etc.)
 */
export function nosqlInjectionGuard(req: Request, res: Response, next: NextFunction): void {
  // 1. Check URL query parameters
  if (req.query && containsInjectionOperator(req.query)) {
    res.status(400).json({
      success: false,
      error: 'Prohibited query operator detected in request query parameters.',
      code: 'NOSQL_INJECTION_BLOCKED',
    });
    return;
  }

  // 2. Check JSON/UrlEncoded request body
  if (req.body && containsInjectionOperator(req.body)) {
    res.status(400).json({
      success: false,
      error: 'Prohibited operator detected in request payload. Input rejected.',
      code: 'NOSQL_INJECTION_BLOCKED',
    });
    return;
  }

  // 3. Check route parameters
  if (req.params && containsInjectionOperator(req.params)) {
    res.status(400).json({
      success: false,
      error: 'Prohibited character sequence detected in URL path parameters.',
      code: 'NOSQL_INJECTION_BLOCKED',
    });
    return;
  }

  next();
}

/**
 * Sanitizes an object by masking sensitive secrets (passwords, tokens, api keys)
 */
export function maskSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  const SENSITIVE_KEYS = [
    'password',
    'passwordhash',
    'refreshtoken',
    'token',
    'authorization',
    'cookie',
    'secret',
    'apikey',
    'gemini_api_key',
  ];

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = maskSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}
