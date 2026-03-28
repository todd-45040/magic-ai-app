/**
 * Phase 1 billing freeze scope
 *
 * Keep client-side billing work isolated to Stripe endpoints and billing state.
 * Do not widen edits from this file into auth, DNS, email, or unrelated UI.
 */
import { supabase } from '../supabase';
import type { BillingPlanKey, BillingCycle } from './planCatalog.js';

export const BILLING_API_ROUTES = {
  status: '/api/billing/status',
  checkout: '/api/billing/create-checkout-session',
  portal: '/api/billing/create-portal-session',
} as const;

export const PHASE_ONE_BILLING_SCOPE = Object.freeze({
  touches: [
    'server/billing/status.ts',
    'server/billing/stripeWebhook.ts',
    'server/billing/planMapping.ts',
    'services/billingClient.ts',
    'Stripe dashboard webhook/event config',
    'billing-related DB rows',
  ],
  avoids: [
    'Supabase auth',
    'confirmation email setup',
    'domain / DNS',
    'non-Stripe env vars',
    'unrelated UI components',
  ],
});

export type BillingCheckoutLookupKey =
  | 'amateur_monthly' | 'amateur_yearly' | 'founder_amateur_monthly' | 'founder_amateur_yearly'
  | 'professional_monthly' | 'professional_yearly' | 'founder_professional_monthly' | 'founder_professional_yearly';


export type BillingTruthDebug = {
  database: {
    billingCustomer: any | null;
    subscription: any | null;
    usagePeriod: any | null;
    founderOverride: any | null;
  };
  stripe: {
    customerExists: boolean;
    subscriptionExists: boolean;
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
    priceId: string | null;
    interval: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean | null;
    latestInvoiceId: string | null;
    latestInvoiceStatus: string | null;
    latestPaymentIntentStatus: string | null;
    error?: string | null;
  };
  resolved: {
    currentPlan: BillingPlanKey;
    billingState: string;
    accessState: string;
    currentBillingCycle: BillingCycle;
    renewalDate: string | null;
    founderProtected: boolean;
    upgradeTargets: BillingPlanKey[];
  };
  mismatches: {
    planMismatch: boolean;
    statusMismatch: boolean;
    renewalMismatch: boolean;
    cycleMismatch: boolean;
    missingStripeCustomerLink: boolean;
    missingStripeSubscriptionLink: boolean;
    missingDbPeriodDates: boolean;
  };
  nextInspectionFocus: string[];
};

export type BillingStatusPayload = {
  ok:true; planKey:BillingPlanKey; billingStatus:string; accessState:string; renewalDate:string|null; cancelAtPeriodEnd:boolean; founderProtected:boolean; founderLockedPlan:BillingPlanKey|null; founderLockedPriceCents:number|null; usagePeriodStart:string|null; usagePeriodEnd:string|null; upgradeTargets:BillingPlanKey[]; stripeConfigured:boolean; billingCustomerExists:boolean; stripeCustomerIdPresent:boolean; currentBillingCycle: BillingCycle; currentPriceId: string | null; source:'database'|'fallback'; billingReadiness:{ expectedWebhookPath:string; expectedWebhookUrl:string; missingEnvKeys:string[]; configuredPriceKeys:string[]; missingPriceKeys:string[]; hasPublishableKey:boolean; hasWebhookSecret:boolean; hasServerSecretKey:boolean; }; billingTruth: BillingTruthDebug;
};
export type BillingCheckoutPayload = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; message?:string; targetPlanKey?:BillingPlanKey; targetLookupKey?:BillingCheckoutLookupKey; successUrl?:string; cancelUrl?:string; url?:string; };
export type BillingPortalPayload = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; billingCustomerExists?:boolean; message?:string; returnUrl?:string; url?:string; };
export type UpgradeSelection = { tier:'amateur'|'professional'; billingCycle?:BillingCycle; founderRequested?:boolean; };

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Please sign in to manage billing.');
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
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
          ? payload.message
          : 'Billing request failed.',
    );
  }

  return payload as T;
}

export function resolveCheckoutLookupKey(selection: UpgradeSelection, billingStatus: Pick<BillingStatusPayload, 'founderProtected'|'founderLockedPlan'|'planKey'|'upgradeTargets'>): BillingCheckoutLookupKey {
  const cycle = selection.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const founderEligible = Boolean(selection.founderRequested || billingStatus.founderProtected || billingStatus.founderLockedPlan === 'founder_amateur' || billingStatus.founderLockedPlan === 'founder_professional');
  if (selection.tier === 'amateur') return founderEligible ? (`founder_amateur_${cycle}` as BillingCheckoutLookupKey) : (`amateur_${cycle}` as BillingCheckoutLookupKey);
  return founderEligible ? (`founder_professional_${cycle}` as BillingCheckoutLookupKey) : (`professional_${cycle}` as BillingCheckoutLookupKey);
}
export const fetchBillingStatus = async (): Promise<BillingStatusPayload> =>
  authorizedFetch<BillingStatusPayload>(BILLING_API_ROUTES.status, { method: 'GET' });

export const createCheckoutSession = async (
  planKey: BillingCheckoutLookupKey,
): Promise<BillingCheckoutPayload> =>
  authorizedFetch<BillingCheckoutPayload>(BILLING_API_ROUTES.checkout, {
    method: 'POST',
    body: JSON.stringify({ planKey }),
  });

export const createPortalSession = async (): Promise<BillingPortalPayload> =>
  authorizedFetch<BillingPortalPayload>(BILLING_API_ROUTES.portal, {
    method: 'POST',
    body: JSON.stringify({}),
  });
