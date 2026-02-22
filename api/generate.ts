// NOTE:
// Vercel serverless functions run as ESM. In ESM, relative imports must include
// the file extension (e.g. './lib/usage.js') or Node will throw ERR_MODULE_NOT_FOUND
// even when the file exists.
//
// Also: keep provider SDK imports *inside* the handler via dynamic import.
// This avoids "FUNCTION_INVOCATION_FAILED" when a module has ESM/CJS quirks.

import { enforceAiUsage } from '../server/usage.js';
import { resolveProvider, callOpenAI, callAnthropic } from '../lib/server/providers/index.js';

// Effect Engine is inherently "idea generation" and can occasionally run long on slower models.
// We keep an app-level timeout (to avoid platform-level 504s), but allow it to be tuned via env.
// NOTE: Vercel maxDuration is configured separately in vercel.json.
const DEFAULT_TIMEOUT_MS = (() => {
  const v = Number(process.env.EFFECT_ENGINE_TIMEOUT_MS);
  // sensible bounds: 10s–55s
  if (Number.isFinite(v) && v >= 10_000 && v <= 55_000) return Math.floor(v);
  return 40_000;
})();

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: any;
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(`TIMEOUT_${ms}MS`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(request: any, response: any) {
  // IMPORTANT:
  // Vercel will sometimes return a plain-text 500 "FUNCTION_INVOCATION_FAILED"
  // when an exception occurs outside our try/catch. That makes the UI show the
  // unhelpful message "Request failed (500)". To avoid that, keep *all* logic
  // inside a single try/catch and always return JSON.
  try {
    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    // Basic Auth Check (Simulated)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized. Please log in.' });
    }

    // AI cost protection (daily caps + per-minute burst limits)
    // IMPORTANT: /generate powers the Effect Engine. It must be metered + logged.
    const usage = await enforceAiUsage(request, 1, { tool: 'effect_engine' });
    if (!usage.ok) {
      return response
        .status(usage.status || 429)
        .json({
          error: usage.error || 'AI usage limit reached.',
          remaining: usage.remaining,
          limit: usage.limit,
          burstRemaining: usage.burstRemaining,
          burstLimit: usage.burstLimit,
        });
    }

    const provider = resolveProvider(request);
    const { model, contents, config } = request.body || {};

    // Speed guardrails for Effect Engine (helps avoid timeouts on default configs)
    // - keep outputs bounded
    // - default to a fast Gemini model when caller didn't specify
    const boundedConfig = {
      ...(config || {}),
      // If not specified, keep the output size sane.
      maxOutputTokens:
        typeof (config || {})?.maxOutputTokens === 'number'
          ? (config || {}).maxOutputTokens
          : 900,
    };

    let result: any;

    const run = async (override?: { providerModel?: string; hardTimeoutMs?: number }) => {
      const hardTimeout = override?.hardTimeoutMs ?? DEFAULT_TIMEOUT_MS;

      if (provider === 'openai') {
        return await withTimeout(
          callOpenAI({ model: override?.providerModel || model, contents, config: boundedConfig }),
          hardTimeout
        );
      }

      if (provider === 'anthropic') {
        return await withTimeout(
          callAnthropic({ model: override?.providerModel || model, contents, config: boundedConfig }),
          hardTimeout
        );
      }

      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        // This is an infra misconfig (not a user error)
        throw new Error(
          'Google API key is not configured. Set GOOGLE_API_KEY (preferred) or API_KEY in Vercel environment variables.'
        );
      }

      // Dynamic import to avoid hard crashes at module init time.
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // If no model was provided, default Effect Engine to a faster model.
      // This dramatically reduces timeouts while keeping quality acceptable for brainstorming.
      const defaultFast = process.env.GEMINI_EFFECT_MODEL || 'gemini-1.5-flash';
      const chosenModel = override?.providerModel || model || defaultFast;

      return await withTimeout(
        ai.models.generateContent({
          model: chosenModel,
          contents,
          config: {
            ...boundedConfig,
          },
        }),
        hardTimeout
      );
    };

    // Primary attempt
    try {
      result = await run();
    } catch (e: any) {
      // One fast retry on timeout only. This keeps UX smooth without hammering providers.
      // If the first attempt used a slower model, retry with a fast model + tighter cap.
      if (String(e?.message || '').startsWith('TIMEOUT_')) {
        const retryFastModel =
          provider === 'openai'
            ? (process.env.OPENAI_EFFECT_MODEL || 'gpt-4o-mini')
            : provider === 'anthropic'
              ? (process.env.ANTHROPIC_EFFECT_MODEL || 'claude-3-5-haiku-20241022')
              : (process.env.GEMINI_EFFECT_MODEL || 'gemini-1.5-flash');

        result = await run({ providerModel: retryFastModel, hardTimeoutMs: 22_000 });
      } else {
        throw e;
      }
    }

    // Return usage headers for the Usage Meter UI (best-effort)
    response.setHeader('X-AI-Remaining', String(usage.remaining ?? ''));
    response.setHeader('X-AI-Limit', String(usage.limit ?? ''));
    response.setHeader('X-AI-Membership', String(usage.membership ?? ''));
    response.setHeader('X-AI-Burst-Remaining', String(usage.burstRemaining ?? ''));
    response.setHeader('X-AI-Burst-Limit', String(usage.burstLimit ?? ''));
    response.setHeader('X-AI-Provider-Used', provider);

    return response.status(200).json(result);
  } catch (error: any) {
    // Ensure we always return JSON so the client can show a helpful message.
    console.error('AI Provider Error:', error);

    if (String(error?.message || '').startsWith('TIMEOUT_')) {
      return response.status(504).json({ error: 'Request timed out. Please try again.' });
    }

    if (error?.message?.includes('finishReason: SAFETY')) {
      return response.status(400).json({ error: 'The request was blocked by safety filters.' });
    }

    return response.status(500).json({
      error: error?.message || 'An internal error occurred while processing your request.',
    });
  }
}
