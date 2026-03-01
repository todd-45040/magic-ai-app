import { createClient } from '@supabase/supabase-js';

type FoundersConfigRow = {
  id: number;
  cap: number;
  closed: boolean;
  closed_at: string | null;
};

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export function getSupabaseAdmin() {
  const SUPABASE_URL = getEnv('SUPABASE_URL');
  const SERVICE_ROLE = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

/**
 * Step 6 — Hard cap + permanent closure:
 * - Uses table public.maw_founders_config (single row id=1)
 * - When cap is reached for the FIRST time, we set closed=true and it stays closed permanently.
 * - If the table doesn't exist yet, callers should fall back to env/RPC-based behavior.
 */
export async function getFoundersConfig(admin: any): Promise<FoundersConfigRow | null> {
  try {
    const { data, error } = await admin
      .from('maw_founders_config')
      .select('id,cap,closed,closed_at')
      .eq('id', 1)
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    return {
      id: Number((data as any).id ?? 1),
      cap: Number((data as any).cap ?? 100),
      closed: Boolean((data as any).closed),
      closed_at: (data as any).closed_at ? String((data as any).closed_at) : null,
    };
  } catch {
    return null;
  }
}

export async function countFounders(admin: any): Promise<number> {
  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('founding_circle_member', true);
  return Number(count || 0);
}

export async function permanentlyCloseFounders(admin: any): Promise<void> {
  try {
    await admin
      .from('maw_founders_config')
      .update({ closed: true, closed_at: new Date().toISOString() })
      .eq('id', 1);
  } catch {
    // ignore best-effort
  }
}

export async function foundersGate(admin: any): Promise<
  | { ok: true; cap: number; current: number; remaining: number; closed: false; closed_at: null }
  | { ok: false; cap: number | null; current: number | null; remaining: number | null; closed: true; reason: 'permanently_closed' | 'limit_reached' }
> {
  const cfg = await getFoundersConfig(admin);
  if (!cfg) {
    // Config not installed — treat as open (caller may still enforce via RPC/env).
    return { ok: true, cap: 100, current: 0, remaining: 100, closed: false, closed_at: null };
  }

  const cap = Number(cfg.cap || 100);

  if (cfg.closed) {
    return { ok: false, cap, current: null, remaining: null, closed: true, reason: 'permanently_closed' };
  }

  const current = await countFounders(admin);
  const remaining = Math.max(0, cap - current);

  if (current >= cap) {
    // Permanently close on first detection (idempotent)
    await permanentlyCloseFounders(admin);
    return { ok: false, cap, current, remaining: 0, closed: true, reason: 'limit_reached' };
  }

  return { ok: true, cap, current, remaining, closed: false, closed_at: null };
}
