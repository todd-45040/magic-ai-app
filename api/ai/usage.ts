// /api/ai/usage.ts
// Unified Usage Endpoint (Phase 2 / Option A)
//
// Single source of truth for UI:
// - plan/membership
// - remaining quota
// - daily limit
// - burst remaining (best-effort, per-instance)
//
// NOTE: This endpoint NEVER consumes usage.
// It only reports status from the same backing source used by the guards.

import { getAiUsageStatus } from './_lib/usage.js';
import { isPreviewEnv } from './_lib/hardening.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  // Method guard
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', retryable: false });
  }

  try {
    const status = await getAiUsageStatus(req);

    if (!status?.ok) {
      const httpStatus = Number((status as any)?.status) || 503;
      const message = String((status as any)?.error || 'Usage status unavailable.');
      const retryable = httpStatus >= 500 || httpStatus === 429;

      return json(res, httpStatus, {
        ok: false,
        error_code:
          httpStatus === 401
            ? 'UNAUTHORIZED'
            : httpStatus === 429
              ? 'RATE_LIMITED'
              : httpStatus === 503
                ? 'SERVICE_UNAVAILABLE'
                : 'USAGE_UNAVAILABLE',
        message,
        retryable,
        ...(isPreviewEnv()
          ? { details: { status: (status as any)?.status, error: (status as any)?.error } }
          : null),
      });
    }

    // Normalized success shape for the UI.
    // We expose both the normalized fields and the raw status (under usage).
    const membership = (status as any).membership ?? 'free';
    const limit = (status as any).limit ?? 0;
    const used = (status as any).used ?? 0;
    const remaining = (status as any).remaining ?? 0;

    res.setHeader('X-AI-Remaining', String(remaining));
    res.setHeader('X-AI-Limit', String(limit));
    res.setHeader('X-AI-Membership', String(membership));
    res.setHeader('X-AI-Burst-Remaining', String((status as any).burstRemaining ?? ''));
    res.setHeader('X-AI-Burst-Limit', String((status as any).burstLimit ?? ''));

    return json(res, 200, {
      ok: true,
      plan: membership,
      limit,
      used,
      remaining,
      burstLimit: (status as any).burstLimit,
      burstRemaining: (status as any).burstRemaining,
      usage: status,
    });
  } catch (err: any) {
    return json(res, 500, {
      ok: false,
      error_code: 'INTERNAL_ERROR',
      message: 'Usage endpoint failed unexpectedly.',
      retryable: true,
      ...(isPreviewEnv() ? { details: { name: err?.name, message: err?.message, stack: err?.stack } } : null),
    });
  }
}
