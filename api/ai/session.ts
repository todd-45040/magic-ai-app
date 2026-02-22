import { recordUserActivity } from '../../server/usage';
import { isPreviewEnv } from './_lib/hardening.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

// Phase 2A: best-effort session telemetry
// Client calls this once after a successful login/signup.
// Records a row in public.user_activity with tool_used = null.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', retryable: false });
  }

  try {
    const r = await recordUserActivity(req, null);
    if (!r?.ok) {
      const httpStatus = Number(r?.status) || 503;
      return json(res, httpStatus, {
        ok: false,
        error_code: httpStatus === 401 ? 'UNAUTHORIZED' : 'SERVICE_UNAVAILABLE',
        message: String(r?.error || 'Session tracking unavailable.'),
        retryable: httpStatus >= 500,
        ...(isPreviewEnv() ? { details: { status: r?.status, error: r?.error } } : null),
      });
    }

    return json(res, 200, { ok: true });
  } catch (err: any) {
    return json(res, 500, {
      ok: false,
      error_code: 'INTERNAL_ERROR',
      message: 'Session endpoint failed unexpectedly.',
      retryable: true,
      ...(isPreviewEnv()
        ? { details: { name: err?.name, message: err?.message, stack: err?.stack } }
        : null),
    });
  }
}
