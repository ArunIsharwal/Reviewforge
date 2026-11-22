import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(serverDirectory, '.env') });

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      return value;
    },
    z.boolean().default(defaultValue)
  );

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGIN: z.string().default('http://localhost:3000'),

  // MongoDB
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, 'MONGODB_URI is required')
    .refine(
      (uri) => /^mongodb(?:\+srv)?:\/\//i.test(uri),
      'MONGODB_URI must start with mongodb:// or mongodb+srv://'
    ),
  MONGODB_DB_NAME: z.string().default('reviewforge'),

  // JWT Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(16, 'REFRESH_TOKEN_SECRET must be at least 16 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Google Gemini AI
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_ENABLED: booleanFromEnv(true),
  GEMINI_ALLOW_REAL_EMPLOYEE_DATA: booleanFromEnv(false),

  // Seed Admin
  SEED_ADMIN_NAME: z.string().default('ReviewForge Admin'),
  SEED_ADMIN_EMAIL: z.string().default('admin@gmail.com'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@123'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment configuration validation failed:', parsedEnv.error.format());
  throw new Error('Invalid environment variables. Please check server/.env.');
}

export const config = parsedEnv.data;
export type Config = typeof config;

