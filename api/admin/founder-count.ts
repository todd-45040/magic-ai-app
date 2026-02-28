import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function toInt(v: any, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Public, non-sensitive: only returns counts for the ADMC allocation.
export default async function handler(_req: any, res: any) {
  try {
    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SERVICE_ROLE = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    // Defaults per ADMC strategy
    const admc_limit = toInt(getEnv('FOUNDERS_ADMC_LIMIT'), 75);

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(200).json({ ok: true, admc_count: 0, admc_limit, reason: 'supabase_not_configured' });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Count ADMC founders (bucketed) when available.
    // We still require founding_circle_member=true to avoid counting partial/lead states.
    const { count, error } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('founding_circle_member', true)
      .eq('founding_bucket', 'admc_2026');

    if (error) {
      // Fail-open (counts show as 0) rather than breaking the landing page.
      return res.status(200).json({ ok: true, admc_count: 0, admc_limit, reason: 'query_failed' });
    }

    const admc_count = Number(count || 0);

    // Cache for short periods; client auto-refreshes every 30s anyway.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10');

    return res.status(200).json({ ok: true, admc_count, admc_limit });
  } catch (e: any) {
    return res.status(200).json({ ok: true, admc_count: 0, admc_limit: 75, error: e?.message || 'unknown_error' });
  }
}
