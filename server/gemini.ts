/**
 * Preferred production key name:
 *   GOOGLE_AI_API_KEY
 *
 * Legacy fallbacks are supported to avoid breaking older deployments,
 * but should be removed once Vercel env reconciliation is complete.
 */
export function getGoogleAiApiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY ||
    // legacy fallbacks
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY ||
    null
  );
}

// Back-compat alias (older code refers to this)
export function getGeminiApiKey(): string | null {
  return getGoogleAiApiKey();
}

// Reasonable stable defaults (can be overridden per-request)
export const DEFAULT_GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FAST_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
