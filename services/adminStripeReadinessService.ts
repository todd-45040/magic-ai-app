import { supabase } from '../supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type StripeReadinessResult = {
  ok: boolean;
  env?: Record<string, boolean>;
  founders?: {
    founders_total: number;
    founders_with_lock: number;
    founders_lock_pct: number;
  };
  dryRun?: any;
  error?: string;
};

export async function fetchStripeReadiness(dryRun = false): Promise<StripeReadinessResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Not authenticated.' };

  const url = `/api/adminStripeReadiness${dryRun ? '?dryRun=1' : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = (await r.json().catch(() => ({}))) as any;

  if (!r.ok) return { ok: false, error: j?.error || j?.message || 'Stripe readiness failed.' };
  return j as StripeReadinessResult;
}
