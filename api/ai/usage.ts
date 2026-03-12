import { getAiUsageStatus } from './_lib/usage.js';
import { getAiUsageStatus as getLegacyAiUsageStatus } from '../_usage.js';
import { isPreviewEnv } from './_lib/hardening.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function buildUsageSuccessPayload(status: any) {
  // "free" behaves like "trial" for ADMC soft launch in the primary path,
  // but older/fallback usage resolvers may still return "free". Normalize both
  // to a user-friendly payload without granting extra access client-side.
  const membership = status?.membership === 'free' ? 'trial' : (status?.membership ?? 'trial');
  const limit = status?.limit ?? 0;
  const used = status?.used ?? 0;
  const remaining = status?.remaining ?? 0;
  const resetAt = status?.resetAt;
  const quota = status?.quota ?? {
    live_audio_minutes: { remaining: null },
    image_gen: { remaining: null },
    identify: { remaining: null },
    video_uploads: { remaining: null },
    resetAt: null,
  };

  const warnings: string[] = [];

  const dailyNear = (node: any, label: string) => {
    const d = node?.daily;
    if (!d || typeof d.limit !== 'number' || d.limit <= 0) return false;
    const rem = Number(d.remaining ?? 0);
    const lim = Number(d.limit ?? 0);
    const pct = lim > 0 ? rem / lim : 1;
    if (pct <= 0.2) {
      warnings.push(`${label} daily limit is running low.`);
      return true;
    }
    return false;
  };

  const monthlyNear = (node: any, label: string) => {
    const rem = node?.remaining;
    const lim = node?.limit;
    if (typeof rem !== 'number' || typeof lim !== 'number' || lim <= 0) return false;
    const pct = rem / lim;
    if (pct <= 0.15) {
      warnings.push(`${label} monthly quota is running low.`);
      return true;
    }
    return false;
  };

  const nearDailyLive = dailyNear(quota?.live_audio_minutes, 'Live Rehearsal');
  const nearMonthlyLive = monthlyNear(quota?.live_audio_minutes, 'Live Rehearsal');
  const nearMonthlyIdentify = monthlyNear(quota?.identify, 'Identify');
  const nearMonthlyImages = monthlyNear(quota?.image_gen, 'Image Generation');
  const nearDailyVideo = dailyNear(quota?.video_uploads, 'Video Rehearsal');
  const nearMonthlyVideo = monthlyNear(quota?.video_uploads, 'Video Rehearsal');

  const nearLimit = (limit > 0 ? remaining <= Math.ceil(limit * 0.15) : false)
    || nearDailyLive
    || nearMonthlyLive
    || nearMonthlyIdentify
    || nearMonthlyImages
    || nearDailyVideo
    || nearMonthlyVideo;

  const upgradeRecommended = membership === 'trial' && nearLimit;

  return {
    ok: true,
    plan: membership,
    limit,
    used,
    remaining,
    quota,
    nearLimit,
    upgradeRecommended,
    warnings,
    sessionsToday: status?.sessionsToday ?? 0,
    toolsUsedToday: status?.toolsUsedToday ?? [],
    distinctToolsToday: status?.distinctToolsToday ?? 0,
    resetAt: resetAt ?? null,
    resetTz: status?.resetTz ?? null,
    resetHourLocal: status?.resetHourLocal ?? null,
    burstLimit: status?.burstLimit,
    burstRemaining: status?.burstRemaining,
    usage: status,
  };
}

async function getUsageStatusWithFallback(req: any) {
  try {
    const primary = await getAiUsageStatus(req);
    if (primary?.ok) return { source: 'primary', status: primary };
    if (Number(primary?.status) && Number(primary.status) < 500) return { source: 'primary', status: primary };
  } catch {}

  try {
    const legacy = await getLegacyAiUsageStatus(req);
    return { source: 'legacy', status: legacy };
  } catch (fallbackErr: any) {
    return {
      source: 'none',
      status: {
        ok: false,
        status: 500,
        error: fallbackErr?.message || 'Usage status unavailable.',
      },
    };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', retryable: false });
  }

  try {
    const { status, source } = await getUsageStatusWithFallback(req);

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
        ...(isPreviewEnv() ? { details: { source, status: status?.status, error: status?.error } } : null),
      });
    }

    const payload = buildUsageSuccessPayload(status);

    res.setHeader('X-AI-Remaining', String(payload.remaining));
    res.setHeader('X-AI-Limit', String(payload.limit));
    res.setHeader('X-AI-Membership', String(payload.plan));
    res.setHeader('X-AI-Burst-Remaining', String(status?.burstRemaining ?? ''));
    res.setHeader('X-AI-Burst-Limit', String(status?.burstLimit ?? ''));
    if (payload.resetAt) res.setHeader('X-AI-Reset-At', String(payload.resetAt));
    res.setHeader('X-AI-Usage-Source', source);

    return json(res, 200, payload);
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
