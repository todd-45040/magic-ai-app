// Shared usage guard for AI endpoints (Phase 1.5)
//
// Goals:
// - Use Supabase-backed usage truth (same source as api/ai/usage.ts)
// - Enforce quota BEFORE upstream AI call
// - Increment usage AFTER successful upstream response (best-effort; never fail the request)
// - Return the standard hardened error contract

import { getAiUsageStatus, incrementAiUsage } from '../../../lib/server/usage/index.js';
import { isPreviewEnv, mapProviderError, withTimeout } from './hardening.js';

export type UsageStatus = {
  ok: true;
  membership?: string;
  remaining?: number;
  limit?: number;
  burstRemaining?: number;
  burstLimit?: number;
  [k: string]: any;
};

export type UsageGuardOk = {
  ok: true;
  usage: UsageStatus;
};

export type UsageGuardFail = {
  ok: false;
  status: number;
  error: {
    ok: false;
    error_code:
      | 'QUOTA_EXCEEDED'
      | 'RATE_LIMITED'
      | 'UNAUTHORIZED'
      | 'SERVICE_UNAVAILABLE'
      | 'TIMEOUT'
      | 'USAGE_UNAVAILABLE';
    message: string;
    retryable: boolean;
    details?: any;
  };
};

function asNumber(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Reads the same Supabase-backed source used by api/ai/usage.ts and enforces limits.
export async function guardAiUsage(req: any, units = 1): Promise<UsageGuardOk | UsageGuardFail> {
  try {
    // Keep this snappy so we don't add noticeable latency.
    const status: any = await withTimeout(getAiUsageStatus(req), 8_000, 'TIMEOUT');

    if (!status?.ok) {
      const httpStatus = Number(status?.status) || 503;
      const error_code =
        httpStatus === 401
          ? 'UNAUTHORIZED'
          : httpStatus === 503
            ? 'SERVICE_UNAVAILABLE'
            : 'USAGE_UNAVAILABLE';

      return {
        ok: false,
        status: httpStatus,
        error: {
          ok: false,
          error_code,
          message: String(status?.error || 'Usage status unavailable.'),
          retryable: httpStatus >= 500 || httpStatus === 429,
          details: isPreviewEnv() ? { status: status?.status, error: status?.error } : undefined,
        },
      };
    }

    const usage: UsageStatus = status as UsageStatus;
    const remaining = asNumber((usage as any).remaining);
    const limit = asNumber((usage as any).limit);
    const burstRemaining = asNumber((usage as any).burstRemaining);
    const burstLimit = asNumber((usage as any).burstLimit);

    // Burst limiter (short-window). Treat this as RATE_LIMITED.
    if (typeof burstRemaining === 'number' && burstRemaining < units) {
      return {
        ok: false,
        status: 429,
        error: {
          ok: false,
          error_code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment and try again.',
          retryable: true,
          details: isPreviewEnv()
            ? { burstRemaining, burstLimit, units, membership: (usage as any).membership }
            : undefined,
        },
      };
    }

    // Daily quota.
    if (typeof remaining === 'number' && remaining < units) {
      return {
        ok: false,
        status: 429,
        error: {
          ok: false,
          error_code: 'QUOTA_EXCEEDED',
          message: 'Daily AI usage limit reached. Upgrade or wait for your quota to reset.',
          retryable: true,
          details: isPreviewEnv()
            ? { remaining, limit, units, membership: (usage as any).membership }
            : undefined,
        },
      };
    }

    return { ok: true, usage };
  } catch (err: any) {
    const mapped = mapProviderError(err);
    const error_code = mapped.error_code === 'TIMEOUT' ? 'TIMEOUT' : 'USAGE_UNAVAILABLE';
    return {
      ok: false,
      status: mapped.status || 503,
      error: {
        ok: false,
        error_code,
        message:
          error_code === 'TIMEOUT'
            ? 'Usage check timed out. Please try again.'
            : mapped.message || 'Usage status unavailable.',
        retryable: true,
        details: isPreviewEnv() ? { name: err?.name, message: err?.message, stack: err?.stack } : undefined,
      },
    };
  }
}

export function applyUsageHeaders(res: any, usage: any) {
  try {
    res.setHeader('X-AI-Remaining', String(usage?.remaining ?? ''));
    res.setHeader('X-AI-Limit', String(usage?.limit ?? ''));
    res.setHeader('X-AI-Membership', String(usage?.membership ?? ''));
    res.setHeader('X-AI-Burst-Remaining', String(usage?.burstRemaining ?? ''));
    res.setHeader('X-AI-Burst-Limit', String(usage?.burstLimit ?? ''));
  } catch {
    // ignore
  }
}

// Best-effort increment after success. Never throws.
export async function bestEffortIncrementAiUsage(req: any, units = 1) {
  try {
    // Prefer explicit increment function (does not re-check quota).
    if (typeof incrementAiUsage === 'function') {
      await withTimeout(Promise.resolve(incrementAiUsage(req, units)), 2_000, 'TIMEOUT');
      return;
    }

    // Fallback: attempt dynamic import for older builds.
    const mod: any = await import('../../../lib/server/usage/index.js');
    const inc =
      mod?.incrementAiUsage ||
      mod?.recordAiUsage ||
      mod?.consumeAiUsage ||
      mod?.incrementUsage ||
      null;

    if (typeof inc === 'function') {
      await withTimeout(Promise.resolve(inc(req, units)), 2_000, 'TIMEOUT');
    }
  } catch {
    // ignore
  }
}
