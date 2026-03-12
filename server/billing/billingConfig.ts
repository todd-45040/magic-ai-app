import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { getOptionalEnv, getStripeEnvironmentReport } from './stripeConfig.js';

export type BillingCheckoutLookupKey =
  | 'amateur_monthly'
  | 'professional_monthly'
  | 'founder_professional_monthly';

export type StripePlaceholderPlanConfig = {
  internalLookupKey: BillingCheckoutLookupKey;
  internalPlanKey: BillingPlanKey;
  displayName: string;
  productLookupKey: string;
  priceLookupKey: string;
  founderOnly: boolean;
  founderPricePlaceholderCents: number | null;
  stripeProductEnvKey: string;
  stripePriceEnvKey: string;
};

export type BillingRuntimeConfig = {
  stripeConfigured: boolean;
  appBaseUrl: string;
  successUrl: string;
  cancelUrl: string;
  portalReturnUrl: string;
  environmentName: string;
  priceLookup: Record<BillingCheckoutLookupKey, StripePlaceholderPlanConfig>;
};

const PRICE_LOOKUP: Record<BillingCheckoutLookupKey, StripePlaceholderPlanConfig> = {
  amateur_monthly: {
    internalLookupKey: 'amateur_monthly',
    internalPlanKey: 'amateur',
    displayName: BILLING_PLAN_CATALOG.amateur.displayName,
    productLookupKey: 'product_amateur',
    priceLookupKey: 'price_amateur_monthly',
    founderOnly: false,
    founderPricePlaceholderCents: null,
    stripeProductEnvKey: 'STRIPE_PRODUCT_AMATEUR',
    stripePriceEnvKey: 'STRIPE_PRICE_AMATEUR_MONTHLY',
  },
  professional_monthly: {
    internalLookupKey: 'professional_monthly',
    internalPlanKey: 'professional',
    displayName: BILLING_PLAN_CATALOG.professional.displayName,
    productLookupKey: 'product_professional',
    priceLookupKey: 'price_professional_monthly',
    founderOnly: false,
    founderPricePlaceholderCents: null,
    stripeProductEnvKey: 'STRIPE_PRODUCT_PRO',
    stripePriceEnvKey: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  founder_professional_monthly: {
    internalLookupKey: 'founder_professional_monthly',
    internalPlanKey: 'founder_professional',
    displayName: BILLING_PLAN_CATALOG.founder_professional.displayName,
    productLookupKey: 'product_founder_professional',
    priceLookupKey: 'price_founder_professional_monthly',
    founderOnly: true,
    founderPricePlaceholderCents: BILLING_PLAN_CATALOG.founder_professional.monthlyPriceCents,
    stripeProductEnvKey: 'STRIPE_PRODUCT_PRO_FOUNDER',
    stripePriceEnvKey: 'STRIPE_PRICE_PRO_FOUNDER_MONTHLY',
  },
};

function normalizeBaseUrl(value?: string | null): string {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (raw) return raw;
  return 'http://localhost:5173';
}

export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingRuntimeConfig {
  const appBaseUrl = normalizeBaseUrl(
    getOptionalEnv('NEXT_PUBLIC_APP_URL', env)
      || getOptionalEnv('VITE_APP_URL', env)
      || getOptionalEnv('APP_URL', env)
      || getOptionalEnv('VERCEL_PROJECT_PRODUCTION_URL', env)
  );
  const stripeEnv = getStripeEnvironmentReport(env);
  const stripeConfigured = Boolean(
    getOptionalEnv('STRIPE_SECRET_KEY', env)
    && getOptionalEnv('STRIPE_PRICE_AMATEUR_MONTHLY', env)
    && getOptionalEnv('STRIPE_PRICE_PRO_MONTHLY', env)
  );

  return {
    stripeConfigured,
    appBaseUrl,
    successUrl: `${appBaseUrl}/account/billing?checkout=success`,
    cancelUrl: `${appBaseUrl}/account/billing?checkout=cancel`,
    portalReturnUrl: `${appBaseUrl}/account/billing`,
    environmentName: stripeEnv.environmentName,
    priceLookup: PRICE_LOOKUP,
  };
}

export function isBillingCheckoutLookupKey(value: unknown): value is BillingCheckoutLookupKey {
  return typeof value === 'string' && value in PRICE_LOOKUP;
}

export function getBillingPlanPlaceholder(value: BillingCheckoutLookupKey, env: NodeJS.ProcessEnv = process.env): StripePlaceholderPlanConfig & {
  configuredStripePriceId: string | null;
  configuredStripeProductId: string | null;
} {
  const plan = PRICE_LOOKUP[value];
  return {
    ...plan,
    configuredStripePriceId: getOptionalEnv(plan.stripePriceEnvKey, env),
    configuredStripeProductId: getOptionalEnv(plan.stripeProductEnvKey, env),
  };
}
