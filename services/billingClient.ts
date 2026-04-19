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


export type BillingEventSnapshot = {
  eventId: string | null;
  eventType: string | null;
  eventStatus: string | null;
  createdAt: string | null;
  processedAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  requestId: string | null;
  lastError: string | null;
  summary: {
    livemode: boolean | null;
    objectType: string | null;
    customerId: string | null;
    subscriptionId: string | null;
    status: string | null;
  };
};

export type BillingValidationChecks = {
  hasBillingCustomerLink: boolean;
  hasSubscriptionLink: boolean;
  checkoutReady: boolean;
  portalReady: boolean;
  webhookHealthy: boolean;
  renewalVisible: boolean;
  activeOrTrialing: boolean;
  currentPlanAligned: boolean;
  periodDatesPersisted: boolean;
  cancelStateReadable: boolean;
};

export type BillingValidationGuide = {
  recommendedOrder: string[];
  nextManualChecks: string[];
  likelyOwner: 'webhook_ingest' | 'db_persistence' | 'status_resolution' | 'ui_rendering' | 'ready_for_manual_validation';
};

export type BillingTruthDebug = {
  dbSnapshot: {
    billingCustomerId: string | null;
    stripeCustomerId: string | null;
    subscriptionId: string | null;
    stripeSubscriptionId: string | null;
    planKey: BillingPlanKey | null;
    billingStatus: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    priceId: string | null;
    founderLockedPlan: BillingPlanKey | null;
    founderLockedPriceCents: number | null;
    founderOverrideActive: boolean;
  };
  stripeSnapshot: {
    customerExists: boolean;
    subscriptionExists: boolean;
    status: string | null;
    priceId: string | null;
    interval: BillingCycle | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    latestInvoiceId: string | null;
    latestInvoiceStatus: string | null;
    latestPaymentIntentStatus: string | null;
  };
  resolvedSnapshot: {
    planKey: BillingPlanKey;
    billingStatus: string;
    accessState: string;
    renewalDate: string | null;
    currentBillingCycle: BillingCycle;
    partner_source: 'database' | 'fallback' | 'stripe_live';
  };
  mismatches: {
    planMismatch: boolean;
    statusMismatch: boolean;
    renewalMismatch: boolean;
    cycleMismatch: boolean;
    missingStripeCustomer: boolean;
    missingStripeSubscription: boolean;
    missingDbPeriodDates: boolean;
  };
  nextInspectionFocus: string[];
};

export type BillingStatusPayload = {
  ok:true; planKey:BillingPlanKey; billingStatus:string; accessState:string; renewalDate:string|null; cancelAtPeriodEnd:boolean; founderProtected:boolean; founderLockedPlan:BillingPlanKey|null; founderLockedPriceCents:number|null; usagePeriodStart:string|null; usagePeriodEnd:string|null; upgradeTargets:BillingPlanKey[]; stripeConfigured:boolean; billingCustomerExists:boolean; stripeCustomerIdPresent:boolean; currentBillingCycle: BillingCycle; currentPriceId: string | null; partner_source:'database'|'fallback'|'stripe_live'; billingTruth: BillingTruthDebug; recentBillingEvents: BillingEventSnapshot[]; validationChecks: BillingValidationChecks; validationGuide: BillingValidationGuide; billingReadiness:{ expectedWebhookPath:string; expectedWebhookUrl:string; missingEnvKeys:string[]; configuredPriceKeys:string[]; missingPriceKeys:string[]; hasPublishableKey:boolean; hasWebhookSecret:boolean; hasServerSecretKey:boolean; };
};
export type BillingCheckoutPayload = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; message?:string; targetPlanKey?:BillingPlanKey; targetLookupKey?:BillingCheckoutLookupKey; successUrl?:string; cancelUrl?:string; url?:string; cycleSwitchApplied?: boolean; billingAction?: 'subscription_update' | 'checkout_session'; subscriptionId?: string; };
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
