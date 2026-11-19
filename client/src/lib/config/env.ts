import fs from 'fs';
import path from 'path';

export interface ConfigStatus {
  database: {
    configured: boolean;
    provider: string;
    dbName: string;
    message: string;
  };
  ai: {
    configured: boolean;
    model: string;
    enabled: boolean;
    allowRealEmployeeData: boolean;
    message: string;
  };
  auth: {
    configured: boolean;
    message: string;
  };
  mode: 'production_cloud' | 'demo_local';
}

function cleanValue(value: string | undefined): string {
  if (!value) return '';
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isPlaceholder(value: string | undefined): boolean {
  const trimmed = cleanValue(value);
  if (!trimmed) return true;
  return (
    trimmed.includes('REPLACE_') ||
    trimmed.startsWith('your_') ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  );
}

let cachedDotEnv: Record<string, string> | null = null;

function readFallbackDotEnv(): Record<string, string> {
  if (cachedDotEnv) return cachedDotEnv;
  const result: Record<string, string> = {};
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const rawLine of content.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;
          const eqIdx = line.indexOf('=');
          if (eqIdx === -1) continue;
          const k = line.slice(0, eqIdx).trim();
          const v = cleanValue(line.slice(eqIdx + 1));
          if (k && v) result[k] = v;
        }
      }
    }
  } catch {
    // Ignore fs errors in edge/browser environments
  }
  cachedDotEnv = result;
  return result;
}

/**
 * Reads an env variable safely: trims whitespace/quotes, and if Next.js .env.local
 * has a REPLACE_ placeholder shadowing a real value in .env, falls back to .env.
 */
function getEnv(key: string): string {
  const procVal = cleanValue(process.env[key]);
  if (!isPlaceholder(procVal)) {
    return procVal;
  }
  const dotEnv = readFallbackDotEnv();
  const baseVal = cleanValue(dotEnv[key]);
  if (!isPlaceholder(baseVal)) {
    return baseVal;
  }
  return procVal;
}

export const envConfig = {
  get appUrl(): string {
    return getEnv('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000';
  },

  get nodeEnv(): string {
    return getEnv('NODE_ENV') || 'development';
  },

  // MongoDB Atlas Configuration
  get mongoUri(): string {
    return getEnv('MONGODB_URI');
  },

  get mongoDbName(): string {
    return getEnv('MONGODB_DB_NAME') || 'reviewforge';
  },

  get isMongoConfigured(): boolean {
    const uri = this.mongoUri;
    if (isPlaceholder(uri)) return false;
    return uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
  },

  // Authentication Configuration
  get authSecret(): string {
    const secret = getEnv('AUTH_SECRET');
    if (isPlaceholder(secret)) {
      return 'reviewforge_development_default_secure_secret_key_32chars';
    }
    return secret;
  },

  get isAuthSecretSet(): boolean {
    return !isPlaceholder(getEnv('AUTH_SECRET'));
  },

  // Google Gemini Configuration
  get geminiApiKey(): string {
    return getEnv('GEMINI_API_KEY');
  },

  get geminiModel(): string {
    return getEnv('GEMINI_MODEL') || 'gemini-3.5-flash';
  },

  get isGeminiEnabled(): boolean {
    const enabled = getEnv('GEMINI_ENABLED');
    return enabled === 'true' || enabled === '';
  },

  get allowRealEmployeeData(): boolean {
    return getEnv('GEMINI_ALLOW_REAL_EMPLOYEE_DATA') === 'true';
  },

  get isGeminiConfigured(): boolean {
    if (!this.isGeminiEnabled) return false;
    const key = this.geminiApiKey;
    if (isPlaceholder(key)) return false;
    return key.length >= 10;
  },

  // Initial Admin Seed
  get seedAdmin(): { name: string; email: string; password: string } {
    const rawEmail = getEnv('SEED_ADMIN_EMAIL');
    const rawName = getEnv('SEED_ADMIN_NAME');
    const rawPass = getEnv('SEED_ADMIN_PASSWORD');
    return {
      name: !isPlaceholder(rawName) ? rawName : 'ReviewForge Admin',
      email: !isPlaceholder(rawEmail) ? rawEmail : 'admin@example.com',
      password: !isPlaceholder(rawPass) ? rawPass : 'Admin@ReviewForge2026!',
    };
  },

  // Safe status summary (NEVER exposes secret values)
  getStatus(): ConfigStatus {
    const mongoReady = this.isMongoConfigured;
    const geminiReady = this.isGeminiConfigured;
    const authReady = this.isAuthSecretSet;

    return {
      database: {
        configured: mongoReady,
        provider: 'MongoDB Atlas',
        dbName: this.mongoDbName,
        message: mongoReady
          ? 'MongoDB Atlas URI configured.'
          : 'Awaiting valid MONGODB_URI in .env (Running in resilient local repository mode).',
      },
      ai: {
        configured: geminiReady,
        model: this.geminiModel,
        enabled: this.isGeminiEnabled,
        allowRealEmployeeData: this.allowRealEmployeeData,
        message: geminiReady
          ? `Google Gemini configured with model ${this.geminiModel}.`
          : 'Awaiting GEMINI_API_KEY in .env (Running in deterministic local synthesis mode).',
      },
      auth: {
        configured: authReady,
        message: authReady
          ? 'Production AUTH_SECRET configured.'
          : 'Using development fallback AUTH_SECRET. Please set AUTH_SECRET in .env / .env.local.',
      },
      mode: mongoReady ? 'production_cloud' : 'demo_local',
    };
  },
};
