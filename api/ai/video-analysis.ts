import { requireSupabaseAuth } from '../../lib/server/auth/index.js';
import { getAiUsageStatus, enforceAiUsage } from '../../server/usage.js';
import { jsonError, isPreviewEnv } from './_lib/hardening.js';
import { enforceBurstProtection } from './_lib/burstProtection.js';
import { validateVideoRequest, acquireVideoQueue, releaseVideoQueue } from './_lib/videoSafety.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', retryable: false });
  }
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return jsonError(res, auth.status, { ok: false, error_code: 'AI_AUTH_REQUIRED', message: 'Please sign in to use Video Analysis.', retryable: false });
  const safeUserId: string = auth.userId;

  const status: any = await getAiUsageStatus(req);
  if (!status?.ok) return jsonError(res, 503, { ok: false, error_code: 'AI_PROVIDER_UNAVAILABLE', message: 'Usage status unavailable. Please try again in a moment.', retryable: true });

  const burst = enforceBurstProtection(safeUserId, status.membership, 'video_analysis');
  if (!burst.ok) {
    try { res.setHeader('Retry-After', String(burst.retryAfterSeconds)); } catch {}
    return jsonError(res, 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: 'Too many Video Analysis requests. Please wait before trying again.', retryable: true });
  }

  const mimeType = String(req.body?.mimeType || '');
  const fileSizeBytes = Number(req.body?.fileSizeBytes || 0);
  const durationSeconds = Number(req.body?.durationSeconds || 0);
  const clipsUsedThisMonth = Number(status?.quota?.video_uploads?.limit ?? 0) - Number(status?.quota?.video_uploads?.remaining ?? 0);
  const validation = validateVideoRequest({ plan: status.membership, mimeType, fileSizeBytes, durationSeconds, clipsUsedThisMonth });
  if (!validation.ok) {
    return jsonError(res, validation.status || 400, { ok: false, error_code: validation.error_code, message: validation.message, retryable: validation.status === 429, ...(isPreviewEnv()?{details:{mimeType,fileSizeBytes,durationSeconds, clipsUsedThisMonth}}:{}) });
  }

  const queue = acquireVideoQueue(safeUserId);
  if (!queue.ok) return jsonError(res, queue.status || 409, { ok: false, error_code: queue.error_code, message: queue.message, retryable: true });

  try {
    const usage = await enforceAiUsage(req, 1, { tool: 'video_rehearsal' });
    if (!usage.ok) {
      return jsonError(res, usage.status || 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: usage.error || 'Video Analysis limit reached.', retryable: Boolean(usage.retryable) });
    }

    return res.status(202).json({ ok: true, data: { status: 'queued', message: 'Video Analysis request accepted and queued.', limits: { monthlyLimit: validation.monthlyLimit, maxClipDurationSeconds: 180, maxFileBytes: 50 * 1024 * 1024 } } });
  } finally {
    releaseVideoQueue(safeUserId);
  }
}
