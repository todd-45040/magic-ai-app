import { normalizePlan } from './toolPolicy.js';

const queueByUser = new Set<string>();

export function validateVideoRequest(opts: { plan?: string | null; mimeType?: string; fileSizeBytes?: number; durationSeconds?: number; clipsUsedThisMonth?: number | null }) {
  const plan = normalizePlan(opts.plan);
  if (plan === 'trial' || plan === 'expired') {
    return { ok: false, status: 403, error_code: 'AI_LIMIT_REACHED', message: 'Video Analysis is available on Amateur and Professional plans only.' };
  }
  const monthlyLimit = plan === 'professional' || plan === 'admin' ? 50 : 10;
  const fileSizeBytes = Number(opts.fileSizeBytes || 0);
  const durationSeconds = Number(opts.durationSeconds || 0);
  const mimeType = String(opts.mimeType || '');
  if (!mimeType.startsWith('video/')) {
    return { ok: false, status: 400, error_code: 'AI_INVALID_INPUT', message: 'Only video uploads are supported for Video Analysis.' };
  }
  if (fileSizeBytes > 50 * 1024 * 1024) {
    return { ok: false, status: 413, error_code: 'AI_INVALID_INPUT', message: 'Video file is too large. Please upload a file under 50MB.' };
  }
  if (durationSeconds > 180) {
    return { ok: false, status: 413, error_code: 'AI_INVALID_INPUT', message: 'Video clip is too long. Please keep clips under 3 minutes.' };
  }
  if (typeof opts.clipsUsedThisMonth === 'number' && opts.clipsUsedThisMonth >= monthlyLimit) {
    return { ok: false, status: 429, error_code: 'AI_LIMIT_REACHED', message: 'You have reached your monthly Video Analysis limit for this plan.' };
  }
  return { ok: true, monthlyLimit };
}

export function acquireVideoQueue(userId: string) {
  if (queueByUser.has(userId)) {
    return { ok: false, status: 409, error_code: 'AI_DUPLICATE_REQUEST', message: 'A video analysis job is already in progress for this account.' };
  }
  queueByUser.add(userId);
  return { ok: true };
}

export function releaseVideoQueue(userId: string) {
  queueByUser.delete(userId);
}
