import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { getOptionalEnv, getStripeEnvironmentReport } from './stripeConfig.js';

export type BillingCheckoutLookupKey =
  | 'amateur_monthly' | 'amateur_yearly' | 'founder_amateur_monthly' | 'founder_amateur_yearly'
  | 'professional_monthly' | 'professional_yearly' | 'founder_professional_monthly' | 'founder_professional_yearly';
export type StripePlaceholderPlanConfig = { internalLookupKey:BillingCheckoutLookupKey; internalPlanKey:BillingPlanKey; displayName:string; productLookupKey:string; priceLookupKey:string; founderOnly:boolean; founderPricePlaceholderCents:number|null; stripeProductEnvKey:string; stripePriceEnvKey:string; stripePriceEnvFallbackKey?:string; };
export type BillingRuntimeConfig = { stripeConfigured:boolean; appBaseUrl:string; successUrl:string; cancelUrl:string; portalReturnUrl:string; environmentName:string; priceLookup:Record<BillingCheckoutLookupKey, StripePlaceholderPlanConfig>; };

const PRICE_LOOKUP: Record<BillingCheckoutLookupKey, StripePlaceholderPlanConfig> = {
  amateur_monthly: { internalLookupKey:'amateur_monthly', internalPlanKey:'amateur', displayName:BILLING_PLAN_CATALOG.amateur.displayName, productLookupKey:'product_amateur', priceLookupKey:'price_amateur_monthly', founderOnly:false, founderPricePlaceholderCents:null, stripeProductEnvKey:'STRIPE_PRODUCT_AMATEUR', stripePriceEnvKey:'STRIPE_PRICE_AMATEUR_MONTHLY' },
  amateur_yearly: { internalLookupKey:'amateur_yearly', internalPlanKey:'amateur', displayName:BILLING_PLAN_CATALOG.amateur.displayName, productLookupKey:'product_amateur', priceLookupKey:'price_amateur_yearly', founderOnly:false, founderPricePlaceholderCents:null, stripeProductEnvKey:'STRIPE_PRODUCT_AMATEUR', stripePriceEnvKey:'STRIPE_PRICE_AMATEUR_YEARLY', stripePriceEnvFallbackKey:'STRIPE_PRICE_AMATEUR_ANNUAL' },
  founder_amateur_monthly: { internalLookupKey:'founder_amateur_monthly', internalPlanKey:'founder_amateur', displayName:BILLING_PLAN_CATALOG.founder_amateur.displayName, productLookupKey:'product_founder_amateur', priceLookupKey:'price_founder_amateur_monthly', founderOnly:true, founderPricePlaceholderCents:BILLING_PLAN_CATALOG.founder_amateur.monthlyPriceCents, stripeProductEnvKey:'STRIPE_PRODUCT_AMATEUR_FOUNDER', stripePriceEnvKey:'STRIPE_PRICE_AMATEUR_FOUNDER_MONTHLY' },
  founder_amateur_yearly: { internalLookupKey:'founder_amateur_yearly', internalPlanKey:'founder_amateur', displayName:BILLING_PLAN_CATALOG.founder_amateur.displayName, productLookupKey:'product_founder_amateur', priceLookupKey:'price_founder_amateur_yearly', founderOnly:true, founderPricePlaceholderCents:BILLING_PLAN_CATALOG.founder_amateur.annualPriceCents, stripeProductEnvKey:'STRIPE_PRODUCT_AMATEUR_FOUNDER', stripePriceEnvKey:'STRIPE_PRICE_AMATEUR_FOUNDER_YEARLY', stripePriceEnvFallbackKey:'STRIPE_PRICE_AMATEUR_FOUNDER_ANNUAL' },
  professional_monthly: { internalLookupKey:'professional_monthly', internalPlanKey:'professional', displayName:BILLING_PLAN_CATALOG.professional.displayName, productLookupKey:'product_professional', priceLookupKey:'price_professional_monthly', founderOnly:false, founderPricePlaceholderCents:null, stripeProductEnvKey:'STRIPE_PRODUCT_PRO', stripePriceEnvKey:'STRIPE_PRICE_PRO_MONTHLY' },
  professional_yearly: { internalLookupKey:'professional_yearly', internalPlanKey:'professional', displayName:BILLING_PLAN_CATALOG.professional.displayName, productLookupKey:'product_professional', priceLookupKey:'price_professional_yearly', founderOnly:false, founderPricePlaceholderCents:null, stripeProductEnvKey:'STRIPE_PRODUCT_PRO', stripePriceEnvKey:'STRIPE_PRICE_PRO_YEARLY', stripePriceEnvFallbackKey:'STRIPE_PRICE_PRO_ANNUAL' },
  founder_professional_monthly: { internalLookupKey:'founder_professional_monthly', internalPlanKey:'founder_professional', displayName:BILLING_PLAN_CATALOG.founder_professional.displayName, productLookupKey:'product_founder_professional', priceLookupKey:'price_founder_professional_monthly', founderOnly:true, founderPricePlaceholderCents:BILLING_PLAN_CATALOG.founder_professional.monthlyPriceCents, stripeProductEnvKey:'STRIPE_PRODUCT_PRO_FOUNDER', stripePriceEnvKey:'STRIPE_PRICE_PRO_FOUNDER_MONTHLY' },
  founder_professional_yearly: { internalLookupKey:'founder_professional_yearly', internalPlanKey:'founder_professional', displayName:BILLING_PLAN_CATALOG.founder_professional.displayName, productLookupKey:'product_founder_professional', priceLookupKey:'price_founder_professional_yearly', founderOnly:true, founderPricePlaceholderCents:BILLING_PLAN_CATALOG.founder_professional.annualPriceCents, stripeProductEnvKey:'STRIPE_PRODUCT_PRO_FOUNDER', stripePriceEnvKey:'STRIPE_PRICE_PRO_FOUNDER_YEARLY', stripePriceEnvFallbackKey:'STRIPE_PRICE_PRO_FOUNDER_ANNUAL' },
};
const normalizeBaseUrl = (value?: string | null) => String(value || '').trim().replace(/\/$/, '') || 'http://localhost:5173';
export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingRuntimeConfig {
  const appBaseUrl = normalizeBaseUrl(getOptionalEnv('NEXT_PUBLIC_APP_URL', env) || getOptionalEnv('VITE_APP_URL', env) || getOptionalEnv('APP_URL', env) || getOptionalEnv('VERCEL_PROJECT_PRODUCTION_URL', env));
  const stripeEnv = getStripeEnvironmentReport(env);
  const configuredCount = Object.values(PRICE_LOOKUP).filter((plan) => getOptionalEnv(plan.stripePriceEnvKey, env) || (plan.stripePriceEnvFallbackKey && getOptionalEnv(plan.stripePriceEnvFallbackKey, env))).length;
  const appShellUrl = `${appBaseUrl}/app`;
  const billingAppUrl = `${appShellUrl}?view=billing-settings`;
  return {
    stripeConfigured: Boolean(getOptionalEnv('STRIPE_SECRET_KEY', env) && configuredCount >= 2),
    appBaseUrl,
    successUrl: `${billingAppUrl}&checkout=success`,
    cancelUrl: `${billingAppUrl}&checkout=cancel`,
    portalReturnUrl: billingAppUrl,
    environmentName: stripeEnv.environmentName,
    priceLookup: PRICE_LOOKUP,
  };
}
export const isBillingCheckoutLookupKey = (value: unknown): value is BillingCheckoutLookupKey => typeof value === 'string' && value in PRICE_LOOKUP;
export function getBillingPlanPlaceholder(value: BillingCheckoutLookupKey, env: NodeJS.ProcessEnv = process.env) {
  const plan = PRICE_LOOKUP[value];
  return { ...plan, configuredStripePriceId: getOptionalEnv(plan.stripePriceEnvKey, env) || (plan.stripePriceEnvFallbackKey ? getOptionalEnv(plan.stripePriceEnvFallbackKey, env) : null), configuredStripeProductId: getOptionalEnv(plan.stripeProductEnvKey, env) };
}
