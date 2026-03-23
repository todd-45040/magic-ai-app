import type { BillingPlanKey } from '../../services/planCatalog.js';
import { BILLING_PLAN_CATALOG } from '../../services/planCatalog.js';
import { getOptionalEnv, getStripeEnvironmentReport } from './stripeConfig.js';

export type BillingCheckoutLookupKey =
  | 'amateur_monthly'
  | 'amateur_yearly'
  | 'founder_amateur_monthly'
  | 'founder_amateur_yearly'
  | 'professional_monthly'
  | 'professional_yearly'
  | 'founder_professional_monthly'
  | 'founder_professional_yearly';

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
  amateur_yearly: {
    internalLookupKey: 'amateur_yearly',
    internalPlanKey: 'amateur',
    displayName: `${BILLING_PLAN_CATALOG.amateur.displayName} Yearly`,
    productLookupKey: 'product_amateur',
    priceLookupKey: 'price_amateur_yearly',
    founderOnly: false,
    founderPricePlaceholderCents: null,
    stripeProductEnvKey: 'STRIPE_PRODUCT_AMATEUR',
    stripePriceEnvKey: 'STRIPE_PRICE_AMATEUR_YEARLY',
  },
  founder_amateur_monthly: {
    internalLookupKey: 'founder_amateur_monthly',
    internalPlanKey: 'amateur',
    displayName: `Founder ${BILLING_PLAN_CATALOG.amateur.displayName}`,
    productLookupKey: 'product_founder_amateur',
    priceLookupKey: 'price_founder_amateur_monthly',
    founderOnly: true,
    founderPricePlaceholderCents: BILLING_PLAN_CATALOG.amateur.monthlyPriceCents,
    stripeProductEnvKey: 'STRIPE_PRODUCT_AMATEUR',
    stripePriceEnvKey: 'STRIPE_PRICE_AMATEUR_FOUNDER_MONTHLY',
  },
  founder_amateur_yearly: {
    internalLookupKey: 'founder_amateur_yearly',
    internalPlanKey: 'amateur',
    displayName: `Founder ${BILLING_PLAN_CATALOG.amateur.displayName} Yearly`,
    productLookupKey: 'product_founder_amateur',
    priceLookupKey: 'price_founder_amateur_yearly',
    founderOnly: true,
    founderPricePlaceholderCents: BILLING_PLAN_CATALOG.amateur.annualPriceCents ?? BILLING_PLAN_CATALOG.amateur.monthlyPriceCents,
    stripeProductEnvKey: 'STRIPE_PRODUCT_AMATEUR',
    stripePriceEnvKey: 'STRIPE_PRICE_AMATEUR_FOUNDER_YEARLY',
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
  professional_yearly: {
    internalLookupKey: 'professional_yearly',
    internalPlanKey: 'professional',
    displayName: `${BILLING_PLAN_CATALOG.professional.displayName} Yearly`,
    productLookupKey: 'product_professional',
    priceLookupKey: 'price_professional_yearly',
    founderOnly: false,
    founderPricePlaceholderCents: null,
    stripeProductEnvKey: 'STRIPE_PRODUCT_PRO',
    stripePriceEnvKey: 'STRIPE_PRICE_PRO_YEARLY',
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
  founder_professional_yearly: {
    internalLookupKey: 'founder_professional_yearly',
    internalPlanKey: 'founder_professional',
    displayName: `${BILLING_PLAN_CATALOG.founder_professional.displayName} Yearly`,
    productLookupKey: 'product_founder_professional',
    priceLookupKey: 'price_founder_professional_yearly',
    founderOnly: true,
    founderPricePlaceholderCents: BILLING_PLAN_CATALOG.founder_professional.annualPriceCents ?? BILLING_PLAN_CATALOG.founder_professional.monthlyPriceCents,
    stripeProductEnvKey: 'STRIPE_PRODUCT_PRO_FOUNDER',
    stripePriceEnvKey: 'STRIPE_PRICE_PRO_FOUNDER_YEARLY',
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
    && (getOptionalEnv('STRIPE_PRICE_AMATEUR_MONTHLY', env) || getOptionalEnv('STRIPE_PRICE_AMATEUR_ANNUAL', env) || getOptionalEnv('STRIPE_PRICE_AMATEUR_YEARLY', env))
    && (getOptionalEnv('STRIPE_PRICE_PRO_MONTHLY', env) || getOptionalEnv('STRIPE_PRICE_PRO_ANNUAL', env) || getOptionalEnv('STRIPE_PRICE_PRO_YEARLY', env))
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
    const configuredStripePriceId = getOptionalEnv(plan.stripePriceEnvKey, env)
    || (plan.stripePriceEnvKey.endsWith('_YEARLY') ? getOptionalEnv(plan.stripePriceEnvKey.replace(/_YEARLY$/, '_ANNUAL'), env) : null);
  return {
    ...plan,
    configuredStripePriceId,
    configuredStripeProductId: getOptionalEnv(plan.stripeProductEnvKey, env),
  };
}
