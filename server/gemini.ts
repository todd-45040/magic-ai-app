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
// NOTE (Feb 2026): Gemini 1.5 model aliases can return NOT_FOUND on the v1beta API.
// Default to a modern 2.5 family model.
export const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
// NOTE (Feb 2026): Gemini 1.5 model aliases can return NOT_FOUND on the v1beta API.
// Use a Gemini 2.5 family default and allow env overrides.
export const DEFAULT_GEMINI_FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
