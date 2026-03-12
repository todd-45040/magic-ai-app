import { normalizePlan } from './toolPolicy.js';

type SessionRecord = { startedAt: number; expiresAt: number; reconnects: number; status: 'active' | 'ended'; sessionId: string };
const activeByUser = new Map<string, SessionRecord>();
const initAttempts = new Map<string, { count: number; resetAt: number }>();

const POLICY = {
  trial: { enabled: false, maxConcurrent: 0, maxSessionMinutes: 0, initPerHour: 0 },
  amateur: { enabled: true, maxConcurrent: 1, maxSessionMinutes: 15, initPerHour: 4 },
  professional: { enabled: true, maxConcurrent: 1, maxSessionMinutes: 30, initPerHour: 8 },
  admin: { enabled: true, maxConcurrent: 2, maxSessionMinutes: 60, initPerHour: 20 },
  expired: { enabled: false, maxConcurrent: 0, maxSessionMinutes: 0, initPerHour: 0 },
} as const;

function cleanup(now: number) {
  for (const [k, v] of activeByUser.entries()) {
    if (v.expiresAt <= now || v.status === 'ended') activeByUser.delete(k);
  }
  for (const [k, v] of initAttempts.entries()) {
    if (v.resetAt <= now) initAttempts.delete(k);
  }
}

export function startLiveSession(userId: string, plan: string | null | undefined) {
  const now = Date.now();
  cleanup(now);
  const tier = normalizePlan(plan);
  const p = POLICY[tier];
  if (!p.enabled) return { ok: false, status: 403, error_code: 'AI_LIMIT_REACHED', message: 'Live Rehearsal is not available on your current plan.' };

  const init = initAttempts.get(userId);
  if (!init || init.resetAt <= now) initAttempts.set(userId, { count: 1, resetAt: now + 60 * 60_000 });
  else if (init.count >= p.initPerHour) return { ok: false, status: 429, error_code: 'AI_LIMIT_REACHED', message: 'Too many live rehearsal session starts. Please try again later.' };
  else { init.count += 1; initAttempts.set(userId, init); }

  const existing = activeByUser.get(userId);
  if (existing && existing.status === 'active' && existing.expiresAt > now) {
    return { ok: false, status: 409, error_code: 'AI_DUPLICATE_REQUEST', message: 'A live rehearsal session is already active for this account.' };
  }

  const sessionId = `${userId}-${now}`;
  const rec: SessionRecord = { startedAt: now, expiresAt: now + p.maxSessionMinutes * 60_000, reconnects: 0, status: 'active', sessionId };
  activeByUser.set(userId, rec);
  return { ok: true, sessionId, maxSessionMinutes: p.maxSessionMinutes, expiresAt: new Date(rec.expiresAt).toISOString(), maxReconnects: 3 };
}

export function reconnectLiveSession(userId: string, sessionId: string) {
  const now = Date.now();
  cleanup(now);
  const existing = activeByUser.get(userId);
  if (!existing || existing.sessionId !== sessionId || existing.status !== 'active') {
    return { ok: false, status: 404, error_code: 'AI_INVALID_INPUT', message: 'Live rehearsal session not found.' };
  }
  if (existing.reconnects >= 3) {
    return { ok: false, status: 429, error_code: 'AI_LIMIT_REACHED', message: 'Reconnect limit reached for this live rehearsal session.' };
  }
  existing.reconnects += 1;
  activeByUser.set(userId, existing);
  return { ok: true, reconnects: existing.reconnects, maxReconnects: 3, expiresAt: new Date(existing.expiresAt).toISOString() };
}

export function endLiveSession(userId: string, sessionId?: string) {
  const existing = activeByUser.get(userId);
  if (!existing) return { ok: true };
  if (sessionId && existing.sessionId !== sessionId) return { ok: false, status: 404, error_code: 'AI_INVALID_INPUT', message: 'Live rehearsal session not found.' };
  existing.status = 'ended';
  activeByUser.delete(userId);
  return { ok: true };
}
