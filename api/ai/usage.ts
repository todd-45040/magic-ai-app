import { getAiUsageStatus } from './_lib/usage.js';
import { isPreviewEnv } from './_lib/hardening.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', retryable: false });
  }

  try {
    const status = await getAiUsageStatus(req);

    if (!status?.ok) {
      const httpStatus = Number(status?.status) || 503;
      const message = String(status?.error || 'Usage status unavailable.');
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
        ...(isPreviewEnv() ? { details: { status: status?.status, error: status?.error } } : null),
      });
    }

    const membership = status.membership ?? 'free';
    const limit = status.limit ?? 0;
    const used = status.used ?? 0;
    const remaining = status.remaining ?? 0;

    res.setHeader('X-AI-Remaining', String(remaining));
    res.setHeader('X-AI-Limit', String(limit));
    res.setHeader('X-AI-Membership', String(membership));
    res.setHeader('X-AI-Burst-Remaining', String(status.burstRemaining ?? ''));
    res.setHeader('X-AI-Burst-Limit', String(status.burstLimit ?? ''));

    return json(res, 200, {
      ok: true,
      plan: membership,
      limit,
      used,
      remaining,
      burstLimit: status.burstLimit,
      burstRemaining: status.burstRemaining,
      usage: status,
    });
  } catch (err: any) {
    return json(res, 500, {
      ok: false,
      error_code: 'INTERNAL_ERROR',
      message: 'Usage endpoint failed unexpectedly.',
      retryable: true,
      ...(isPreviewEnv()
        ? { details: { name: err?.name, message: err?.message, stack: err?.stack } }
        : null),
    });
  }
}
