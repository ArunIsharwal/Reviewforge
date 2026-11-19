import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGIN: z.string().default('http://localhost:3000'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('reviewforge'),

  // JWT Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(16, 'REFRESH_TOKEN_SECRET must be at least 16 characters'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Google Gemini AI
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  GEMINI_ENABLED: z.coerce.boolean().default(true),
  GEMINI_ALLOW_REAL_EMPLOYEE_DATA: z.coerce.boolean().default(false),

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

