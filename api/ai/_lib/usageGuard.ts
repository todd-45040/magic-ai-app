// Shared usage guard for AI endpoints (Phase 1.5)
//
// Goals:
// - Use Supabase-backed usage truth (same source as api/ai/usage.ts)
// - Enforce quota BEFORE upstream AI call
// - Increment usage AFTER successful upstream response (best-effort; never fail the request)
// - Return the standard hardened error contract

// NOTE: keep imports extensionless so TS/ESM works in both local + Vercel.
import { enforceAiUsage, getAiUsageStatus } from '../../../server/usage';
import { isPreviewEnv, mapProviderError, withTimeout } from './hardening';

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

// Enforces + decrements usage (server is source of truth) BEFORE the upstream AI call.
export async function guardAiUsage(req: any, units = 1): Promise<UsageGuardOk | UsageGuardFail> {
  try {
    // Keep this snappy so we don't add noticeable latency.
    const enforced: any = await withTimeout(enforceAiUsage(req, { cost: units }), 8_000, 'TIMEOUT');

    if (!enforced?.ok) {
      const httpStatus = Number(enforced?.status) || 503;
      const msg = String(enforced?.error || 'Usage enforcement failed.');

      const error_code: UsageGuardFail['error']['error_code'] =
        httpStatus === 401
          ? 'UNAUTHORIZED'
          : httpStatus === 429
            ? /burst|too many|rate/i.test(msg)
              ? 'RATE_LIMITED'
              : 'QUOTA_EXCEEDED'
            : httpStatus === 503
              ? 'SERVICE_UNAVAILABLE'
              : 'USAGE_UNAVAILABLE';

      return {
        ok: false,
        status: httpStatus,
        error: {
          ok: false,
          error_code,
          message:
            error_code === 'RATE_LIMITED'
              ? 'Too many requests. Please wait a moment and try again.'
              : error_code === 'QUOTA_EXCEEDED'
                ? 'Daily AI usage limit reached. Upgrade or wait for your quota to reset.'
                : msg,
          retryable: httpStatus >= 500 || httpStatus === 429,
          details: isPreviewEnv() ? { status: enforced?.status, error: enforced?.error } : undefined,
        },
      };
    }

    return { ok: true, usage: (enforced.usage ?? enforced) as UsageStatus };
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
  // No-op: usage is decremented up-front by guardAiUsage() via enforceAiUsage().
  // Keeping this exported avoids touching all call sites.
  void req;
  void units;
}
