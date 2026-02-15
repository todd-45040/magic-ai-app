// Unified usage endpoint (Phase 1): single source of truth for usage meters.
// Returns Supabase-backed usage status (or best-effort guest/IP caps if not authed).

import { getAiUsageStatus } from '../../lib/server/usage.js';
import { rateLimit } from './_lib/rateLimit.js';
import {
  getRateLimitKey,
  isPreviewEnv,
  jsonError,
  mapProviderError,
  withTimeout,
} from './_lib/hardening.js';

export default async function handler(req: any, res: any) {
  // Prevent any accidental caching of usage numbers.
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } catch {
    // ignore
  }

  if (req.method !== 'GET') {
    return jsonError(res, 405, {
      ok: false,
      error_code: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
      retryable: false,
    });
  }

  // Phase 1 best-effort limiter. This endpoint is called frequently (meters),
  // so allow a higher ceiling while still preventing hot-loop storms.
  try {
    const k = await getRateLimitKey(req);
    if (k?.key) {
      const rl = rateLimit(`AI_USAGE:${k.key}`, { windowMs: 60_000, max: 120 });
      if (!rl.ok) {
        return jsonError(
          res,
          429,
          {
            ok: false,
            error_code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment and try again.',
            retryable: true,
            details: isPreviewEnv() ? { resetAt: rl.resetAt } : undefined,
          },
          { 'Retry-After': String(rl.retryAfterSeconds) },
        );
      }
    }
  } catch {
    // If limiter fails, do not block usage checks.
  }

  try {
    // Keep the meter endpoint snappy.
    const status = await withTimeout(getAiUsageStatus(req), 8_000, 'TIMEOUT');

    if (!status?.ok) {
      // Map known server-side usage errors to the standardized contract.
      const mapped = mapProviderError(status?.error || 'Usage status unavailable');
      const httpStatus = Number(status?.status) || mapped.status || 503;
      const error_code =
        httpStatus === 401
          ? 'UNAUTHORIZED'
          : httpStatus === 503
            ? 'SERVICE_UNAVAILABLE'
            : mapped.error_code || 'USAGE_UNAVAILABLE';

      return jsonError(res, httpStatus, {
        ok: false,
        error_code,
        message: status?.error || mapped.message || 'Usage status unavailable.',
        retryable: httpStatus >= 500 || httpStatus === 429,
        details: isPreviewEnv() ? { status: status?.status, error: status?.error } : undefined,
      });
    }

    // Ensure live fields always exist for stable UI rendering.
    return res.status(200).json(status);
  } catch (err: any) {
    const mapped = mapProviderError(err);
    return jsonError(res, mapped.status || 500, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      details: isPreviewEnv() ? { name: err?.name, message: err?.message, stack: err?.stack } : undefined,
    });
  }
}
