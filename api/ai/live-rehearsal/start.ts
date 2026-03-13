import { requireSupabaseAuth } from '../../../lib/server/auth/index.js';
import { getAiUsageStatus } from '../../../server/usage.js';
import { jsonError, isPreviewEnv } from '../_lib/hardening.js';
import { enforceBurstProtection } from '../_lib/burstProtection.js';
import { startLiveSession } from '../_lib/liveSessionSafety.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', retryable: false });
  }
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    return jsonError(res, auth.status, { ok: false, error_code: 'AI_AUTH_REQUIRED', message: 'Please sign in to start Live Rehearsal.', retryable: false });
  }
  const safeUserId: string = auth.userId;

  const status: any = await getAiUsageStatus(req);
  if (!status?.ok) {
    return jsonError(res, 503, { ok: false, error_code: 'AI_PROVIDER_UNAVAILABLE', message: 'Usage status unavailable. Please try again in a moment.', retryable: true });
  }

  const burst = enforceBurstProtection(safeUserId, status.membership, 'live_rehearsal_audio');
  if (!burst.ok) {
    try { res.setHeader('Retry-After', String(burst.retryAfterSeconds)); } catch {}
    return jsonError(res, 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: 'Too many Live Rehearsal session starts. Please wait before trying again.', retryable: true });
  }

  const daily = status?.quota?.live_audio_minutes?.daily;
  const monthlyRemaining = Number(status?.quota?.live_audio_minutes?.remaining ?? 0);
  if (Number(daily?.remaining ?? 0) <= 0 || monthlyRemaining <= 0) {
    return jsonError(res, 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: 'Your Live Rehearsal limit has been reached for this plan period.', retryable: true, ...(isPreviewEnv()?{details:{daily, monthlyRemaining}}:{}) });
  }

  const started = startLiveSession(safeUserId, status.membership);
  if (!started.ok) {
    const errorCode = started.error_code ?? 'AI_LIMIT_REACHED';
    const message = started.message ?? 'Unable to start Live Rehearsal.';
    return jsonError(res, started.status || 429, { ok: false, error_code: errorCode, message, retryable: started.status === 429 });
  }

  return res.status(200).json({ ok: true, data: started });
}
