import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function parseIsoDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default async function handler(_req: any, res: any) {
  try {
    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SERVICE_ROLE = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(200).json({ ok: true, foundersCount: 0, isClosed: false, reason: 'supabase_not_configured' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const { count } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .or('is_founder.eq.true,founding_circle_member.eq.true');

    const foundersCount = Number(count || 0);

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