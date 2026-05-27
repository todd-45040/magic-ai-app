// Shared usage guard for AI endpoints (Phase 1.5)
//
// Goals:
// - Use Supabase-backed usage truth (same source as api/ai/usage.ts)
// - Enforce quota BEFORE upstream AI call
// - Increment usage AFTER successful upstream response (best-effort; never fail the request)
// - Return the standard hardened error contract

import { enforceAiUsage } from "../../../server/usage.js";
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

// Single-source usage guard.
//
// IMPORTANT: this function intentionally calls the canonical server enforcement
// helper once. Older builds did a read-only status check here and then called
// incrementAiUsage after the upstream AI call. That created a second quota door:
// different routes could pass the status check but then fail or charge from a
// different enforcement path. The canonical helper now owns:
// - admin bypass
// - daily/monthly quota checks
// - burst checks
// - usage charging
// - denied-request logging
export async function guardAiUsage(
  req: any,
  units = 1,
  opts?: { tool?: string }
): Promise<UsageGuardOk | UsageGuardFail> {
  try {
    const status: any = await withTimeout(enforceAiUsage(req, units, opts), 8_000, 'TIMEOUT');

    if (!status?.ok) {
      const httpStatus = Number(status?.status) || 503;
      const rawCode = String(status?.error_code || '').toUpperCase();
      const error_code =
        rawCode === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : rawCode === 'USAGE_LIMIT_REACHED' || rawCode === 'QUOTA_EXCEEDED'
            ? 'QUOTA_EXCEEDED'
            : httpStatus === 401
              ? 'UNAUTHORIZED'
              : httpStatus === 429
                ? 'RATE_LIMITED'
                : httpStatus >= 500
                  ? 'SERVICE_UNAVAILABLE'
                  : 'USAGE_UNAVAILABLE';

      return {
        ok: false,
        status: httpStatus,
        error: {
          ok: false,
          error_code,
          message: String(status?.error || 'Usage status unavailable.'),
          retryable: Boolean(status?.retryable ?? (httpStatus >= 500 || httpStatus === 429)),
          details: isPreviewEnv()
            ? {
                status: status?.status,
                error: status?.error,
                error_code: status?.error_code,
                membership: status?.membership,
                remaining: status?.remaining,
                limit: status?.limit,
                tool: opts?.tool ?? null,
              }
            : undefined,
        },
      };
    }

    return { ok: true, usage: status as UsageStatus };
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

// Back-compat no-op.
//
// guardAiUsage now uses enforceAiUsage directly, so usage has already been
// charged or admin-bypassed before the upstream AI call starts. Keeping this
// function as a no-op prevents older callers from double-charging or reopening
// a second quota path after success.
export async function bestEffortIncrementAiUsage(_req: any, _units = 1) {
  return;
}
