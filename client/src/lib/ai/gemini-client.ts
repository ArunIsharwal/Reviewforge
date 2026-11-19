import { GoogleGenAI } from '@google/genai';
import { envConfig } from '@/lib/config/env';

let genAIInstance: GoogleGenAI | null = null;

/**
 * Returns the GoogleGenAI client instance if API key is configured.
 */
export function getGeminiClient(): GoogleGenAI | null {
  if (!envConfig.isGeminiConfigured) {
    return null;
  }

  if (!genAIInstance) {
    genAIInstance = new GoogleGenAI({
      apiKey: envConfig.geminiApiKey,
    });
  }

  return genAIInstance;
}

/**
 * Health check and configuration status for Google Gemini AI.
 */
export async function checkGeminiHealth(): Promise<{
  configured: boolean;
  status: 'ready' | 'awaiting_key' | 'disabled' | 'error';
  model: string;
  message: string;
}> {
  if (!envConfig.isGeminiEnabled) {
    return {
      configured: false,
      status: 'disabled',
      model: envConfig.geminiModel,
      message: 'Google Gemini integration is explicitly disabled in environment settings.',
    };
  }

  if (!envConfig.isGeminiConfigured) {
    return {
      configured: false,
      status: 'awaiting_key',
      model: envConfig.geminiModel,
      message: 'GEMINI_API_KEY is not configured or contains placeholder. Running in deterministic local engine mode.',
    };
  }

  try {
    const ai = getGeminiClient();
    if (!ai) {
      return {
        configured: false,
        status: 'error',
        model: envConfig.geminiModel,
        message: 'Could not initialize Google Gen AI client.',
      };
    }

    return {
      configured: true,
      status: 'ready',
      model: envConfig.geminiModel,
      message: `Google Gemini ready with model: ${envConfig.geminiModel}`,
    };
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : 'Unknown AI error';
    return {
      configured: false,
      status: 'error',
      model: envConfig.geminiModel,
      message: `Gemini initialization error: ${errMessage}`,
    };
  }
}

