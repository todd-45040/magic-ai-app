import { supabase } from '../supabase';
import type { BillingPlanKey, BillingCycle } from './planCatalog.js';

export type BillingCheckoutLookupKey =
  | 'amateur_monthly' | 'amateur_yearly' | 'founder_amateur_monthly' | 'founder_amateur_yearly'
  | 'professional_monthly' | 'professional_yearly' | 'founder_professional_monthly' | 'founder_professional_yearly';

export type BillingStatusPayload = {
  ok:true;
  planKey:BillingPlanKey;
  billingStatus:string;
  accessState:string;
  renewalDate:string|null;
  cancelAtPeriodEnd:boolean;
  founderProtected:boolean;
  founderLockedPlan:BillingPlanKey|null;
  founderLockedPriceCents:number|null;
  currentBillingCycle:BillingCycle;
  currentPriceId:string|null;
  usagePeriodStart:string|null;
  usagePeriodEnd:string|null;
  upgradeTargets:BillingPlanKey[];
  stripeConfigured:boolean;
  billingCustomerExists:boolean;
  stripeCustomerIdPresent:boolean;
  source:'database'|'fallback';
};
export type BillingCheckoutPayload = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; message?:string; targetPlanKey?:BillingPlanKey; targetLookupKey?:BillingCheckoutLookupKey; successUrl?:string; cancelUrl?:string; url?:string; };
export type BillingPortalPayload = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; billingCustomerExists?:boolean; message?:string; returnUrl?:string; url?:string; };
export type UpgradeSelection = { tier:'amateur'|'professional'; billingCycle?:BillingCycle; founderRequested?:boolean; };

async function getAccessToken(): Promise<string> { const { data } = await supabase.auth.getSession(); const token = data?.session?.access_token; if (!token) throw new Error('Please sign in to manage billing.'); return token; }
async function authorizedFetch<T>(input: string, init?: RequestInit): Promise<T> { const token = await getAccessToken(); const response = await fetch(input, { ...init, headers: { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(init?.headers||{}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : 'Billing request failed.'); return payload as T; }

export function resolveCheckoutLookupKey(selection: UpgradeSelection, billingStatus: Pick<BillingStatusPayload, 'founderProtected'|'founderLockedPlan'|'planKey'|'upgradeTargets'>): BillingCheckoutLookupKey {
  const cycle = selection.billingCycle === 'yearly' ? 'yearly' : 'monthly';
  const founderEligible = Boolean(selection.founderRequested || billingStatus.founderProtected || billingStatus.founderLockedPlan === 'founder_amateur' || billingStatus.founderLockedPlan === 'founder_professional');
  if (selection.tier === 'amateur') return founderEligible ? (`founder_amateur_${cycle}` as BillingCheckoutLookupKey) : (`amateur_${cycle}` as BillingCheckoutLookupKey);
  return founderEligible ? (`founder_professional_${cycle}` as BillingCheckoutLookupKey) : (`professional_${cycle}` as BillingCheckoutLookupKey);
}
export const fetchBillingStatus = async (): Promise<BillingStatusPayload> => authorizedFetch<BillingStatusPayload>('/api/billing/status', { method:'GET' });
export const createCheckoutSession = async (planKey: BillingCheckoutLookupKey): Promise<BillingCheckoutPayload> => authorizedFetch<BillingCheckoutPayload>('/api/billing/create-checkout-session', { method:'POST', body: JSON.stringify({ planKey }) });
export const createPortalSession = async (): Promise<BillingPortalPayload> => authorizedFetch<BillingPortalPayload>('/api/billing/create-portal-session', { method:'POST', body: JSON.stringify({}) });
