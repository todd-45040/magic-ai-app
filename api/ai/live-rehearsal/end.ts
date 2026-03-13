import { requireSupabaseAuth } from '../../../lib/server/auth/index.js';
import { endLiveSession } from '../_lib/liveSessionSafety.js';
import { jsonError } from '../_lib/hardening.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', retryable: false });
  }
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return jsonError(res, auth.status, { ok: false, error_code: 'AI_AUTH_REQUIRED', message: 'Please sign in to end Live Rehearsal.', retryable: false });
  const safeUserId: string = auth.userId;
  const sessionIdRaw = String(req.body?.sessionId || '').trim();
  const sessionId: string | null = sessionIdRaw.length > 0 ? sessionIdRaw : null;
  const result = endLiveSession(safeUserId, sessionId ?? undefined);
  if (!result.ok) {
    const errorCode = result.error_code ?? 'AI_INVALID_INPUT';
    const message = result.message ?? 'Unable to end Live Rehearsal.';
    return jsonError(res, result.status || 400, { ok: false, error_code: errorCode, message, retryable: false });
  }
  return res.status(200).json({ ok: true });
}
