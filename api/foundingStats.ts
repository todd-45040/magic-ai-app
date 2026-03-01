import { getSupabaseAdmin, getFoundersConfig, countFounders, foundersGate } from './_lib/foundersCap';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function parseIsoDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Public, non-sensitive Founding Circle status endpoint.
 * Step 6 — hard cap + permanent closure:
 * - If `maw_founders_config` exists, it becomes the source of truth (cap + closed + closed_at).
 * - If it doesn't exist yet, we fall back to env-based behavior for backward compatibility.
 */
export default async function handler(_req: any, res: any) {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(200).json({ ok: true, foundersCount: 0, isClosed: false, reason: 'supabase_not_configured' });
    }

    // Prefer DB config if available
    const cfg = await getFoundersConfig(admin);

    if (cfg) {
      const gate = await foundersGate(admin);
      // foundersGate will permanently close the first time we detect cap reached
      const foundersCount = gate.current ?? (await countFounders(admin));
      const maxMembers = gate.cap ?? cfg.cap ?? 100;

      const isClosed = gate.ok ? false : true;
      const reason = gate.ok ? 'open' : gate.reason === 'permanently_closed' ? 'permanently_closed' : 'limit_reached';

      return res.status(200).json({
        ok: true,
        foundersCount,
        isClosed,
        reason,
        maxMembers,
        closesAt: cfg.closed_at || null,
      });
    }

    // Fallback (legacy): env-based limit/date
    const foundersCount = await countFounders(admin);

    const maxMembersRaw = getEnv('FOUNDING_CIRCLE_MAX_MEMBERS');
    const maxMembers = maxMembersRaw ? Number(maxMembersRaw) : null;

    const closesAt = parseIsoDate(getEnv('FOUNDING_CIRCLE_CLOSES_AT')); // ISO string recommended
    const now = new Date();

    const closedByLimit = typeof maxMembers === 'number' && !isNaN(maxMembers) ? foundersCount >= maxMembers : false;
    const closedByDate = closesAt ? now.getTime() >= closesAt.getTime() : false;

    const isClosed = Boolean(closedByLimit || closedByDate);

    let reason: 'open' | 'limit_reached' | 'date_passed' = 'open';
    if (closedByLimit) reason = 'limit_reached';
    else if (closedByDate) reason = 'date_passed';

    return res.status(200).json({
      ok: true,
      foundersCount,
      isClosed,
      reason,
      maxMembers,
      closesAt: closesAt ? closesAt.toISOString() : null,
    });
  } catch (e: any) {
    return res.status(200).json({ ok: true, foundersCount: 0, isClosed: false, error: e?.message || 'unknown_error' });
  }
}
