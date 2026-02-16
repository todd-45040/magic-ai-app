// Phase 1.5 hardened AI chat endpoint
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

    // Size guard (prevents accidental megabyte prompts / base64 dumps)
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

    // Rate limiting (per-user if authenticated, otherwise per-IP guest)
    let rlKey = await getRateLimitKey(req);
    // Guests may not have auth context; fall back to IP-based rate limit key.
    if (!rlKey) {
      const ip = getClientIp(req) || 'unknown';
      rlKey = { key: 'ai:chat:guest:' + ip, kind: 'guest', ip } as any;
    }

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 30 });
    if (!rl.ok) {
      try { res.setHeader('Retry-After', String(rl.retryAfterSeconds)); } catch {}
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

    const provider = resolveProvider(req);
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
        return callOpenAI({ model, contents, config });
      }
      if (provider === 'anthropic') {
        return callAnthropic({ model, contents, config });
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
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');

    // Best-effort increment AFTER success (do not fail the request if this fails)
    bestEffortIncrementAiUsage(req, 1);

    // Usage headers for the Usage Meter UI (best-effort)
    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    return res.status(200).json({ ok: true, data: result });
  } catch (err: any) {
    console.error('AI Chat Error:', err);

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
