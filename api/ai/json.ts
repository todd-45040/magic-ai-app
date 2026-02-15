// Phase 1.5 hardened AI JSON endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing

import { resolveProvider, callOpenAI, callAnthropic } from '../../lib/server/providers';
import { rateLimit } from './_lib/rateLimit';
import {
  getApproxBodySizeBytes,
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 25_000;

function extractText(result: any): string {
  // Gemini SDK
  const t1 = result?.response?.text?.();
  if (typeof t1 === 'string') return t1;

  // Direct candidates
  const parts = result?.candidates?.[0]?.content?.parts;
  const t2 = parts?.map((p: any) => p?.text).filter(Boolean).join('');
  if (typeof t2 === 'string' && t2.trim()) return t2;

  // OpenAI/Anthropic wrappers may return { text } or similar
  if (typeof result?.text === 'string') return result.text;
  if (typeof result?.output_text === 'string') return result.output_text;

  try {
    return JSON.stringify(result);
  } catch {
    return String(result ?? '');
  }
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return jsonError(res, 405, {
        ok: false,
        error_code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        retryable: false,
      });
    }

    const bodySize = getApproxBodySizeBytes(req);
    if (bodySize > MAX_BODY_BYTES) {
      return jsonError(res, 413, {
        ok: false,
        error_code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large. Please keep requests under ~2MB.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { bodySize, limit: MAX_BODY_BYTES } } : {}),
      });
    }

    const rlKey = await getRateLimitKey(req);
    if (!rlKey) {
      return jsonError(res, 401, {
        ok: false,
        error_code: 'UNAUTHORIZED',
        message: 'Unauthorized.',
        retryable: false,
      });
    }

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 20 });
    if (!rl.ok) {
      return jsonError(
        res,
        429,
        {
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait and try again.',
          retryable: true,
          ...(isPreviewEnv() ? { details: { key: rlKey.key, resetAt: rl.resetAt } } : {}),
        },
        { 'Retry-After': String(rl.retryAfterSeconds) },
      );
    }

    // Supabase usage guard (single source of truth)
    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
      return jsonError(res, guard.status, guard.error);
    }

    const provider = resolveProvider(req);
    const body = req.body || {};
    const { model, contents, config } = body;

    const run = async () => {
      if (provider === 'openai') {
        return callOpenAI({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }
      if (provider === 'anthropic') {
        return callAnthropic({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }

      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        throw new Error(
          'Google API key is not configured. Set GOOGLE_API_KEY (preferred) or API_KEY in Vercel environment variables.',
        );
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateContent({
        model: model || 'gemini-3-pro-preview',
        contents,
        config: {
          ...config,
          responseMimeType: 'application/json',
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');
    const rawText = extractText(result);

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return jsonError(res, 422, {
        ok: false,
        error_code: 'BAD_JSON',
        message: 'The AI response was not valid JSON. Please try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: { rawText: rawText?.slice(0, 4000) } } : {}),
      });
    }

    // Best-effort increment AFTER success
    bestEffortIncrementAiUsage(req, 1);

    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    return res.status(200).json({ ok: true, json: parsed });
  } catch (err: any) {
    console.error('AI JSON Error:', err);

    const mapped = mapProviderError(err);
    const details = isPreviewEnv()
      ? {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err),
          code: err?.code,
          stack: String(err?.stack || ''),
        }
      : undefined;

    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(details ? { details } : {}),
    });
  }
}
