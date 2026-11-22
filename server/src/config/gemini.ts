export function isGeminiConfigured(enabled: boolean, apiKey: string | undefined): boolean {
  const key = apiKey?.trim() ?? '';
  return enabled && key.length > 0 && !key.startsWith('mock_');
}
