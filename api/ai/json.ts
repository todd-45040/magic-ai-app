// Phase 1.5 hardened AI JSON endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing
//
// Input normalization:
// - Accept OpenAI-style `messages` as canonical input
// - For Gemini, adapt messages -> `contents` (required by @google/genai)

import { resolveProvider, callOpenAI, callAnthropic } from '../../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';
import { rateLimit } from './_lib/rateLimit.js';
import {
  getApproxBodySizeBytes,
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from './_lib/usageGuard.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // ~2MB
const TIMEOUT_MS = 25_000;

function getClientIp(req: any): string | null {
  const xf = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  if (typeof xf === 'string' && xf.trim()) {
    // may be a comma-separated list; take first
    return xf.split(',')[0].trim();
  }
  const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  const sock = req?.socket || req?.connection;
  const addr = sock?.remoteAddress;
  return typeof addr === 'string' && addr.trim() ? addr.trim() : null;
}

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

// Accept OpenAI-style messages as canonical input and adapt for Gemini when needed.
function messagesToGeminiContents(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .map((m) => {
      const role =
        m.role === 'assistant'
          ? 'model'
          : m.role === 'user'
            ? 'user'
            : m.role === 'system'
              ? 'user' // Gemini doesn't truly support system; treat as user guidance
              : 'user';
      return { role, parts: [{ text: String(m.content) }] };
    });
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

    let rlKey = await getRateLimitKey(req);
    // Guests may not have auth context; fall back to IP-based rate limit key.
    if (!rlKey) {
      const ip = getClientIp(req) || 'unknown';
      rlKey = { key: 'ai:json:guest:' + ip, kind: 'guest', ip } as any;
    }

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 20 });
    if (!rl.ok) {
      // IMPORTANT: set Retry-After directly (Vercel can drop headers passed via helper)
      try {
        res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      } catch {
        // ignore
      }
      return jsonError(res, 429, {
        ok: false,
        error_code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait and try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: { key: rlKey.key, resetAt: rl.resetAt } } : {}),
      });
    }

    // Supabase usage guard (single source of truth)
    const guard = await guardAiUsage(req, 1);
    if (!guard.ok) {
      return jsonError(res, guard.status, guard.error);
    }

    const provider = await resolveProvider(req);
    const body = req.body || {};
    const { model, config } = body;

    // Canonical input: messages[]; for Gemini we must provide `contents`.
    const messages = body.messages;
    let contents = body.contents;

    if (provider === 'gemini' && !contents && Array.isArray(messages)) {
      contents = messagesToGeminiContents(messages);
    }

    // Fail fast: prevent Gemini INVALID_ARGUMENT crashes when contents is missing/empty.
    if (provider === 'gemini' && (!Array.isArray(contents) || contents.length === 0)) {
      return jsonError(res, 400, {
        ok: false,
        error_code: 'BAD_REQUEST',
        message: 'Missing required input: provide `messages` (recommended) or `contents` for Gemini.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { hint: "Send { messages:[{role:'user',content:'...'}] }" } } : {}),
      });
    }

    const run = async () => {
      if (provider === 'openai') {
        return callOpenAI({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }
      if (provider === 'anthropic') {
        return callAnthropic({ model, contents, config: { ...config, responseMimeType: 'application/json' } });
      }

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) {
        throw new Error(
          'Google AI API key is not configured. Set GOOGLE_AI_API_KEY in Vercel environment variables.',
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
    // IMPORTANT: await so metering reliably persists in serverless runtimes
    await bestEffortIncrementAiUsage(req, 1);

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
