import type { BillingPlanKey } from './planCatalog.js';

export type MembershipTier = BillingPlanKey;
export type CheckoutLookupKey =
  | 'amateur_monthly' | 'amateur_yearly' | 'founder_amateur_monthly' | 'founder_amateur_yearly'
  | 'professional_monthly' | 'professional_yearly' | 'founder_professional_monthly' | 'founder_professional_yearly';
export type SubscriptionStatus = 'trialing'|'active'|'past_due'|'canceled'|'unpaid'|'incomplete'|'incomplete_expired'|'paused'|'unknown';
export type BillingAccessState = 'active'|'grace'|'scheduled_cancel'|'restricted'|'inactive';
export type BillingStatusContract = { ok:true; membershipTier: MembershipTier; subscriptionStatus: SubscriptionStatus; accessState: BillingAccessState; renewalDate:string|null; cancelAtPeriodEnd:boolean; founderProtected:boolean; founderLockedPlan:BillingPlanKey|null; founderLockedPriceCents:number|null; usagePeriodStart:string|null; usagePeriodEnd:string|null; upgradeTargets:BillingPlanKey[]; stripeConfigured:boolean; billingCustomerExists:boolean; stripeCustomerIdPresent:boolean; source:'database'|'fallback'; };
export type CheckoutSessionContract = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; message?:string; membershipTier?:MembershipTier; lookupKey?:CheckoutLookupKey; successUrl?:string; cancelUrl?:string; url?:string; };
export type PortalSessionContract = { ok:boolean; mode?:'placeholder'; stripeConfigured:boolean; billingCustomerExists?:boolean; message?:string; returnUrl?:string; url?:string; };
