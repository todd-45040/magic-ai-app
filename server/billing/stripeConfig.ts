export type StripeKeyMode = 'test' | 'live' | 'unknown';

export type StripeEnvironmentReport = {
  stripeKeyMode: StripeKeyMode;
  webhookSecretConfigured: boolean;
  webhookSecretNextConfigured: boolean;
  webhookSecretRotationSupported: boolean;
  hasServerSecretKey: boolean;
  hasClientExposedSecretLikeKey: boolean;
  clientExposureWarnings: string[];
  environmentName: string;
  isProductionLike: boolean;
  warnings: string[];
};

const CLIENT_EXPOSURE_ENV_KEYS = [
  'VITE_STRIPE_SECRET_KEY',
  'NEXT_PUBLIC_STRIPE_SECRET_KEY',
  'PUBLIC_STRIPE_SECRET_KEY',
  'REACT_APP_STRIPE_SECRET_KEY',
];

const DEV_BYPASS_ENV_KEYS = [
  'STRIPE_BYPASS_SIGNATURE_VERIFY',
  'STRIPE_SKIP_WEBHOOK_VERIFY',
  'STRIPE_FORCE_TEST_MODE',
  'ALLOW_UNVERIFIED_STRIPE_WEBHOOKS',
];

export function getOptionalEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env?.[name];
  return value && String(value).trim() ? String(value).trim() : null;
}

export function getStripeKeyMode(secretKey?: string | null): StripeKeyMode {
  const key = String(secretKey || '').trim();
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('sk_live_')) return 'live';
  return 'unknown';
}

export function getStripeWebhookSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const secrets = [getOptionalEnv('STRIPE_WEBHOOK_SECRET', env), getOptionalEnv('STRIPE_WEBHOOK_SECRET_NEXT', env)]
    .filter(Boolean) as string[];
  return Array.from(new Set(secrets));
}

export function getStripeEnvironmentReport(env: NodeJS.ProcessEnv = process.env): StripeEnvironmentReport {
  const secretKey = getOptionalEnv('STRIPE_SECRET_KEY', env);
  const stripeKeyMode = getStripeKeyMode(secretKey);
  const webhookSecretConfigured = Boolean(getOptionalEnv('STRIPE_WEBHOOK_SECRET', env));
  const webhookSecretNextConfigured = Boolean(getOptionalEnv('STRIPE_WEBHOOK_SECRET_NEXT', env));
  const environmentName = String(env.VERCEL_ENV || env.NODE_ENV || 'development');
  const isProductionLike = environmentName === 'production' || environmentName === 'preview';
  const warnings: string[] = [];
  const clientExposureWarnings: string[] = [];

  if (!secretKey) warnings.push('STRIPE_SECRET_KEY is missing.');
  if (!webhookSecretConfigured) warnings.push('STRIPE_WEBHOOK_SECRET is missing.');
  if (isProductionLike && stripeKeyMode === 'test') warnings.push('Production-like environment is using a Stripe test secret key.');
  if (!isProductionLike && stripeKeyMode === 'live') warnings.push('Non-production environment is using a Stripe live secret key.');

  for (const key of DEV_BYPASS_ENV_KEYS) {
    if (getOptionalEnv(key, env)) warnings.push(`${key} is set and must remain server-guarded or removed before launch.`);
  }

  for (const key of CLIENT_EXPOSURE_ENV_KEYS) {
    if (getOptionalEnv(key, env)) {
      clientExposureWarnings.push(`${key} is set. Secret-like Stripe values must never be exposed to the client bundle.`);
    }
  }

  return {
    stripeKeyMode,
    webhookSecretConfigured,
    webhookSecretNextConfigured,
    webhookSecretRotationSupported: webhookSecretConfigured || webhookSecretNextConfigured,
    hasServerSecretKey: Boolean(secretKey),
    hasClientExposedSecretLikeKey: clientExposureWarnings.length > 0,
    clientExposureWarnings,
    environmentName,
    isProductionLike,
    warnings,
  };
}

export function sanitizeStripeLogValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('sk_') || value.startsWith('whsec_') || value.startsWith('rk_')) return '[redacted]';
    if (value.length > 240) return `${value.slice(0, 237)}...`;
    return value;
  }
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeStripeLogValue(item));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/secret|signature|token|client_secret/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeStripeLogValue(item);
      }
    }
    return out;
  }
  return value;
}
