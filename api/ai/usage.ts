// Phase 1.5+ Unified Usage Endpoint
// GET /api/ai/usage
// - rate limiting (best-effort in-memory)
// - consistent error contract { ok:false, error_code, message, retryable, details? }
// - preview-only debug details
// - Supabase-backed usage truth via existing usageGuard

import { rateLimit } from './_lib/rateLimit.js';
import {
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
} from './_lib/hardening.js';
import { applyUsageHeaders, guardAiUsage } from './_lib/usageGuard.js';

function getClientIp(req: any): string | null {
  const xf = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  const sock = req?.socket || req?.connection;
  const addr = sock?.remoteAddress;
  return typeof addr === 'string' && addr.trim() ? addr.trim() : null;
}

function firstDefined<T = any>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'GET') {
      return jsonError(res, 405, {
        ok: false,
        error_code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        retryable: false,
      });
    }

    // Rate limiting (per-user if authenticated, otherwise per-IP guest)
    let rlKey = await getRateLimitKey(req);
    if (!rlKey) {
      const ip = getClientIp(req) || 'unknown';
      rlKey = { key: 'ai:usage:guest:' + ip, kind: 'guest', ip } as any;
    }

    const rl = rateLimit(rlKey.key, { windowMs: 60_000, max: 60 });
    if (!rl.ok) {
      try {
        res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      } catch {}
      return jsonError(res, 429, {
        ok: false,
        error_code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait and try again.',
        retryable: true,
        ...(isPreviewEnv() ? { details: { key: rlKey.key, resetAt: rl.resetAt } } : {}),
      });
    }

    // IMPORTANT:
    // We pass cost=0 so this endpoint NEVER consumes usage.
    // It is the single source of truth for remaining quota / plan enforcement.
    const guard = await guardAiUsage(req, 0);

    // If quota is exceeded, guardAiUsage may return a structured QUOTA_EXCEEDED.
    // We forward that as-is so the UI can show "Upgrade" CTAs consistently.
    if (!guard.ok) {
      return jsonError(res, guard.status, guard.error);
    }

    const usage = guard.usage || {};

    // Provide a normalized, UI-friendly shape (without assuming a specific schema)
    const plan = firstDefined<string>(usage, ['plan', 'membership', 'tier']) || 'unknown';
    const limit = firstDefined<number>(usage, ['limit', 'quota', 'monthly_limit', 'generation_limit']);
    const used = firstDefined<number>(usage, ['used', 'generation_count', 'count', 'used_this_period']);
    const remaining = firstDefined<number>(usage, ['remaining', 'remaining_quota', 'remaining_generations']);

    const resetDate = firstDefined<any>(usage, ['reset_date', 'last_reset_date', 'period_start', 'period_reset_at']);
    const trialEnd = firstDefined<any>(usage, ['trial_end_date', 'trialEnd', 'trial_end']);

    // Best-effort usage headers (so pages can still read headers if they want)
    applyUsageHeaders(res, usage);

    return res.status(200).json({
      ok: true,
      plan,
      limit: limit ?? null,
      used: used ?? null,
      remaining: remaining ?? null,
      reset_date: resetDate ?? null,
      trial_end_date: trialEnd ?? null,
      usage,
    });
  } catch (err: any) {
    console.error('AI Usage Error:', err);

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
