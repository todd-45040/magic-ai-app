// Phase 1.5 hardened AI image endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing

import { resolveProvider } from '../../lib/server/providers';
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

const MAX_BODY_BYTES = 2 * 1024 * 1024; // prompts should be tiny; this is a safety cap
const TIMEOUT_MS = 45_000;

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

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 10 });
    if (!rl.ok) {
      return jsonError(
        res,
        429,
        {
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Too many image requests. Please wait and try again.',
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
    const { prompt, aspectRatio = '1:1' } = req.body || {};

    const run = async () => {
      if (provider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.');

        const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

        const resp = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            prompt: String(prompt || ''),
            size: '1024x1024',
            response_format: 'b64_json',
          }),
        });

        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = json?.error?.message || json?.message || `OpenAI image request failed (${resp.status})`;
          const e: any = new Error(msg);
          e.status = resp.status;
          throw e;
        }

        return json;
      }

      if (provider === 'anthropic') {
        const e: any = new Error('Image generation is not supported for Anthropic provider.');
        e.status = 400;
        throw e;
      }

      const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
      if (!apiKey) throw new Error('Google API key is not configured.');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      return ai.models.generateImages({
        model: 'imagen-4.0-generate-preview-06-06',
        prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio,
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');

    // Best-effort increment AFTER success
    bestEffortIncrementAiUsage(req, 1);

    applyUsageHeaders(res, guard.usage);
    res.setHeader('X-AI-Provider-Used', provider);

    return res.status(200).json({ ok: true, data: result });
  } catch (err: any) {
    console.error('AI Image Error:', err);

    const mapped = mapProviderError(err);
    const details = isPreviewEnv()
      ? {
          name: String(err?.name || 'Error'),
          message: String(err?.message || err),
          code: err?.code,
          status: err?.status,
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
