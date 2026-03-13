import { supabase } from '../supabase';
import type { BillingPlanKey } from './planCatalog.js';
import type { User } from '../types';
import { isFounderProtected } from './upgradeUx.js';

export type BillingCheckoutLookupKey =
  | 'amateur_monthly'
  | 'professional_monthly'
  | 'founder_professional_monthly';

export type BillingStatusPayload = {
  ok: true;
  planKey: BillingPlanKey;
  billingStatus: string;
  accessState: string;
  renewalDate: string | null;
  cancelAtPeriodEnd: boolean;
  founderProtected: boolean;
  founderLockedPlan: BillingPlanKey | null;
  founderLockedPriceCents: number | null;
  usagePeriodStart: string | null;
  usagePeriodEnd: string | null;
  upgradeTargets: BillingPlanKey[];
  stripeConfigured: boolean;
  billingCustomerExists: boolean;
  stripeCustomerIdPresent: boolean;
  source: 'database' | 'fallback';
};

export type BillingCheckoutPayload = {
  ok: boolean;
  mode?: 'placeholder';
  stripeConfigured: boolean;
  message?: string;
  targetPlanKey?: BillingPlanKey;
  targetLookupKey?: BillingCheckoutLookupKey;
  successUrl?: string;
  cancelUrl?: string;
  url?: string;
};

export type BillingPortalPayload = {
  ok: boolean;
  mode?: 'placeholder';
  stripeConfigured: boolean;
  billingCustomerExists?: boolean;
  message?: string;
  returnUrl?: string;
  url?: string;
};

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error('Please sign in to manage billing.');
  }
  return token;
}

async function authorizedFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.message === 'string'
        ? payload.message
        : 'Billing request failed.';
    throw new Error(message);
  }

  return payload as T;
}

export function resolveCheckoutLookupKey(targetTier: 'amateur' | 'professional', user?: User | null): BillingCheckoutLookupKey {
  if (targetTier === 'amateur') return 'amateur_monthly';
  return isFounderProtected(user) ? 'founder_professional_monthly' : 'professional_monthly';
}

export async function fetchBillingStatus(): Promise<BillingStatusPayload> {
  return authorizedFetch<BillingStatusPayload>('/api/billing/status', {
    method: 'GET',
  });
}

export async function createCheckoutSession(planKey: BillingCheckoutLookupKey): Promise<BillingCheckoutPayload> {
  return authorizedFetch<BillingCheckoutPayload>('/api/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ planKey }),
  });
}

export async function createPortalSession(): Promise<BillingPortalPayload> {
  return authorizedFetch<BillingPortalPayload>('/api/billing/create-portal-session', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
