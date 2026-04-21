import { adminJson } from './adminApi';

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
  try {
    return await adminJson<ManualFounderClaimResult>('/api/adminManualFounderClaim', {
      method: 'POST',
      body: JSON.stringify({ email, founding_bucket: 'admc_2026', source: 'backup_payment_link' }),
    }, 'Manual founder claim failed');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Manual claim failed.' };
  }
}

export async function fetchStripeReadiness(dryRun = false): Promise<StripeReadinessResult> {
  try {
    const url = `/api/adminStripeReadiness${dryRun ? '?dryRun=1' : ''}`;
    return await adminJson<StripeReadinessResult>(url, {}, 'Stripe readiness failed');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Stripe readiness failed.' };
  }
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
  try {
    return await adminJson<StripeWebhookHealthResult>('/api/admin/stripe-webhook-health', {}, 'Webhook health failed');
  } catch (error: any) {
    return { ok: false, webhook_secret_configured: false, signature_verification_active: false, last_event_received_at: null, last_event_type: null, last_event_id: null, livemode: null, error: error?.message || 'Webhook health failed.' };
  }
}

export type FounderCountResult = {
  ok: boolean;
  admc_count: number;
  reserve_count: number;
  total_count: number;
  admc_limit: number;
  reserve_limit: number;
  total_limit: number;
  reason?: string;
  error?: string;
};

export async function fetchFounderCounts(): Promise<FounderCountResult> {
  try {
    return await adminJson<FounderCountResult>('/api/admin/founder-count', {}, 'Founder count failed');
  } catch (error: any) {
    return {
      ok: false,
      admc_count: 0,
      reserve_count: 0,
      total_count: 0,
      admc_limit: 75,
      reserve_limit: 25,
      total_limit: 100,
      error: error?.message || 'Founder count failed.',
    };
  }
}
