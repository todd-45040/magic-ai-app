export function getGeminiApiKey(): string | null {
  // Support multiple env var names to avoid deployment confusion.
  return (
    process.env.API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    null
  );
}

// Reasonable stable defaults (can be overridden per-request)
export const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
export const DEFAULT_GEMINI_FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-1.5-flash';
