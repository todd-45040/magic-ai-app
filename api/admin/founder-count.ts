import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function toInt(v: any, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Public, non-sensitive: returns founder allocation counts.
// Used by the ADMC landing page + Admin widget.
export default async function handler(_req: any, res: any) {
  const admc_limit = toInt(getEnv('FOUNDERS_ADMC_LIMIT'), 75);
  const reserve_limit = toInt(getEnv('FOUNDERS_RESERVE_LIMIT'), 25);
  const total_limit = toInt(getEnv('FOUNDERS_TOTAL_LIMIT'), 100);

  try {
    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SERVICE_ROLE = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(200).json({
        ok: true,
        admc_count: 0,
        reserve_count: 0,
        total_count: 0,
        admc_limit,
        reserve_limit,
        total_limit,
        reason: 'supabase_not_configured',
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const [admc, reserve, total] = await Promise.all([
      admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('founding_circle_member', true)
        .eq('founding_bucket', 'admc_2026'),
      admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('founding_circle_member', true)
        .eq('founding_bucket', 'reserve_2026'),
      admin.from('users').select('id', { count: 'exact', head: true }).eq('founding_circle_member', true),
    ]);

    if (admc.error || reserve.error || total.error) {
      return res.status(200).json({
        ok: true,
        admc_count: 0,
        reserve_count: 0,
        total_count: 0,
        admc_limit,
        reserve_limit,
        total_limit,
        reason: 'query_failed',
      });
    }

    const admc_count = Number(admc.count || 0);
    const reserve_count = Number(reserve.count || 0);
    const total_count = Number(total.count || 0);

    // Cache briefly; clients refresh every 30s.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10');

    return res.status(200).json({
      ok: true,
      admc_count,
      reserve_count,
      total_count,
      admc_limit,
      reserve_limit,
      total_limit,
    });
  } catch (e: any) {
    return res.status(200).json({
      ok: true,
      admc_count: 0,
      reserve_count: 0,
      total_count: 0,
      admc_limit,
      reserve_limit,
      total_limit,
      error: e?.message || 'unknown_error',
    });
  }
}
