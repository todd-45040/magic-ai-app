// Phase 1.5 hardened AI image endpoint
// - size guard
// - rate limiting (best-effort in-memory)
// - timeout protection
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage enforcement + best-effort incrementing
//
// Input normalization:
// - Accept OpenAI-style `messages` as canonical input
// - Derive `prompt` from messages when prompt is not provided

import { rateLimit } from './_lib/rateLimit.js';
import {
  getApproxBodySizeBytes,
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';
import { applyUsageHeaders } from './_lib/usageGuard.js';
import { resolveImageProvider } from './_lib/imageProvider.js';
import { enforceAiUsage } from '../../server/usage.js';
import { getGoogleAiApiKey } from '../../server/gemini.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // prompts should be tiny; this is a safety cap
const TIMEOUT_MS = 45_000;

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

// Accept OpenAI-style messages as canonical input and derive a prompt string.
// This makes /api/ai/image consistent with /api/ai/chat and /api/ai/json.
function promptFromMessages(messages: any[]): string {
  if (!Array.isArray(messages)) return '';
  const parts: string[] = [];
  for (const m of messages) {
    if (!m) continue;
    const role = String(m.role || '').toLowerCase();
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;

    // Include system guidance as part of the prompt. Prefer user content.
    if (role === 'system') parts.push(`Instruction: ${content}`);
    else if (role === 'user') parts.push(content);
  }
  // If no user/system, fall back to any string content
  if (parts.length === 0) {
    for (const m of messages) {
      const content = typeof m?.content === 'string' ? m.content.trim() : '';
      if (content) parts.push(content);
    }
  }
  return parts.join('\n\n').slice(0, 8000);
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

    const body = req.body || {};
    const { aspectRatio = '1:1' } = body;
    const requestedCount = Math.max(1, Math.min(4, Math.floor(Number(body.count) || 1)));
    const requestedTool = String(body.tool || '').trim() === 'visual_brainstorm'
      ? 'visual_brainstorm'
      : 'image_generation';

    // Tool-aware Supabase quota enforcement. This path intentionally uses the
    // canonical server quota function instead of the generic guard so admin
    // users are bypassed before image quotas are checked and so successful
    // admin requests are not charged against daily/monthly image counters.
    const usage = await enforceAiUsage(req, requestedCount, { tool: requestedTool });
    if (!usage.ok) {
      const rawCode = String(usage.error_code || '').toUpperCase();
      const status = Number(usage.status || 429);
      const error_code = rawCode === 'USAGE_LIMIT_REACHED' || rawCode === 'QUOTA_EXCEEDED'
        ? 'QUOTA_EXCEEDED'
        : rawCode === 'RATE_LIMITED' || status === 429
          ? 'RATE_LIMITED'
          : status === 401
            ? 'UNAUTHORIZED'
            : 'SERVICE_UNAVAILABLE';
      return jsonError(res, status, {
        ok: false,
        error_code,
        message: usage.error || (error_code === 'QUOTA_EXCEEDED' ? 'AI usage limit reached.' : 'AI temporarily unavailable. Please try again shortly.'),
        retryable: usage.retryable ?? (status >= 500 || status === 429),
        ...(isPreviewEnv() ? { details: { membership: usage.membership, remaining: usage.remaining, limit: usage.limit, tool: requestedTool } } : {}),
      });
    }

    // Admins must bypass *all* local route throttles. Previous builds bypassed
    // quota but still hit this route-level limiter before/around image calls,
    // which made admin testing look like provider or quota failures.
    const isAdminBypass = String((usage as any)?.membership || '').toLowerCase() === 'admin' || Boolean((usage as any)?.bypass || (usage as any)?.unlimited);
    if (!isAdminBypass) {
      let rlKey = await getRateLimitKey(req);
      // Guests may not have auth context; fall back to IP-based rate limit key.
      if (!rlKey) {
        const ip = getClientIp(req) || 'unknown';
        rlKey = { key: 'ai:image:guest:' + ip, kind: 'guest', ip } as any;
      }

      const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 10 });
      if (!rl.ok) {
        try {
          res.setHeader('Retry-After', String(rl.retryAfterSeconds));
        } catch {
          // ignore
        }
        return jsonError(res, 429, {
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Too many image requests. Please wait and try again.',
          retryable: true,
          ...(isPreviewEnv() ? { details: { key: rlKey.key, resetAt: rl.resetAt, membership: usage.membership, tool: requestedTool } } : {}),
        });
      }
    }

    const imageProvider = await resolveImageProvider(req);
    const provider = imageProvider.provider;

    // Canonical input: messages[]; derive prompt if prompt is missing.
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt
        : Array.isArray(body.messages)
          ? promptFromMessages(body.messages)
          : '';

    if (!prompt.trim()) {
      return jsonError(res, 400, {
        ok: false,
        error_code: 'BAD_REQUEST',
        message: 'Missing required input: provide `prompt` or `messages`.',
        retryable: false,
        ...(isPreviewEnv()
          ? { details: { hint: "Send { prompt: '...', ... } or { messages:[{role:'user',content:'...'}] }" } }
          : {}),
      });
    }

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

      const apiKey = getGoogleAiApiKey();
      if (!apiKey) throw new Error('Google AI API key is not configured. Set GOOGLE_AI_API_KEY.');

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // NOTE: For @google/genai generateImages, empty prompt can cause INVALID_ARGUMENT "Empty instances."
      return ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt,
        config: {
          numberOfImages: requestedCount,
          outputMimeType: 'image/jpeg',
          aspectRatio,
        },
      });
    };

    const result = await withTimeout(run(), TIMEOUT_MS, 'TIMEOUT');

    applyUsageHeaders(res, usage);
    res.setHeader('X-AI-Provider-Used', provider);
    res.setHeader('X-AI-Provider-Requested', imageProvider.requestedProvider);
    if (imageProvider.warnings.length) res.setHeader('X-AI-Provider-Warning', imageProvider.warnings.join(' | '));

    return res.status(200).json({ ok: true, data: result, provider, requestedProvider: imageProvider.requestedProvider, warnings: imageProvider.warnings });
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
