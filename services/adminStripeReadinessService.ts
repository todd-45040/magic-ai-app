import { supabase } from '../supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type StripeReadinessResult = {
  ok: boolean;
  env?: Record<string, boolean>;
  backup?: {
    payment_link_configured: boolean;
    payment_link_url: string | null;
  };
  founders?: {
    founders_total: number;
    founders_with_lock: number;
    founders_lock_pct: number;
  };
  dryRun?: any;
  error?: string;
};

export type ManualFounderClaimResult = { ok: boolean; message?: string; error?: string };

export async function manualFounderClaim(email: string): Promise<ManualFounderClaimResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Not authenticated.' };

  const r = await fetch('/api/adminManualFounderClaim', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, founding_bucket: 'admc_2026', source: 'backup_payment_link' }),
  });

  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) return { ok: false, error: j?.error || j?.message || 'Manual claim failed.' };
  return { ok: true, message: j?.message || 'Founder claimed.' };
}

export async function fetchStripeReadiness(dryRun = false): Promise<StripeReadinessResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'Not authenticated.' };

  const url = `/api/adminStripeReadiness${dryRun ? '?dryRun=1' : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = (await r.json().catch(() => ({}))) as any;

  if (!r.ok) return { ok: false, error: j?.error || j?.message || 'Stripe readiness failed.' };
  return j as StripeReadinessResult;
}

export type StripeWebhookHealthResult = {
  ok: boolean;
  webhook_secret_configured: boolean;
  signature_verification_active: boolean;
  expects_raw_body?: boolean;
  last_event_received_at: string | null;
  last_event_type: string | null;
  last_event_id: string | null;
  livemode: boolean | null;
  error?: string;
};

export async function fetchStripeWebhookHealth(): Promise<StripeWebhookHealthResult> {
  // endpoint intentionally does not require auth; it's read-only and does not expose secrets
  const r = await fetch('/api/admin/stripe-webhook-health');
  const j = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) return { ok: false, webhook_secret_configured: false, signature_verification_active: false, last_event_received_at: null, last_event_type: null, last_event_id: null, livemode: null, error: j?.error || j?.message || 'Webhook health failed.' };
  return j as StripeWebhookHealthResult;
}
