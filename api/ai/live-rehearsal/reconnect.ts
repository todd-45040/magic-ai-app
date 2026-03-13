import { requireSupabaseAuth } from '../../../lib/server/auth/index.js';
import { reconnectLiveSession } from '../_lib/liveSessionSafety.js';
import { jsonError } from '../_lib/hardening.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed', retryable: false });
  }
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) return jsonError(res, auth.status, { ok: false, error_code: 'AI_AUTH_REQUIRED', message: 'Please sign in to reconnect Live Rehearsal.', retryable: false });
  const safeUserId: string = auth.userId;
  const sessionId = String(req.body?.sessionId || '').trim();
  if (!sessionId) return jsonError(res, 400, { ok: false, error_code: 'AI_INVALID_INPUT', message: 'Missing sessionId.', retryable: false });
  const safeSessionId: string = sessionId;
  const result = reconnectLiveSession(safeUserId, safeSessionId);
  if (!result.ok) return jsonError(res, result.status || 400, { ok: false, error_code: result.error_code ?? 'AI_INVALID_INPUT', message: result.message ?? 'Unable to reconnect Live Rehearsal session.', retryable: result.status === 429 });
  return res.status(200).json({ ok: true, data: result });
}
