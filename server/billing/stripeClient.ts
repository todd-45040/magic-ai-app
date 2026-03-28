import { getOptionalEnv } from './stripeConfig.js';

export type StripeCustomerRecord = {
  id: string;
  email?: string | null;
  metadata?: Record<string, string> | null;
};

export type StripeCheckoutSessionRecord = {
  id: string;
  url?: string | null;
  customer?: string | StripeCustomerRecord | null;
  subscription?: string | null;
  status?: string | null;
  payment_status?: string | null;
};



export type StripeSubscriptionItemRecord = {
  id: string;
  price?: {
    id?: string | null;
    recurring?: {
      interval?: string | null;
    } | null;
  } | null;
};

export type StripeSubscriptionRecord = {
  id: string;
  status?: string | null;
  customer?: string | StripeCustomerRecord | null;
  cancel_at_period_end?: boolean | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  latest_invoice?: {
    id?: string | null;
    status?: string | null;
    payment_intent?: { status?: string | null } | null;
  } | null;
  items?: { data?: StripeSubscriptionItemRecord[] | null } | null;
  metadata?: Record<string, string> | null;
};

export type StripeBillingPortalSessionRecord = {
  id: string;
  url?: string | null;
};

function getStripeSecretKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = getOptionalEnv('STRIPE_SECRET_KEY', env);
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured.');
  }
  return key;
}

function encodeBody(input: Record<string, unknown>): string {
  const params = new URLSearchParams();

  const append = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(`${key}[${index}]`, item));
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        append(`${key}[${childKey}]`, childValue);
      }
      return;
    }
    params.append(key, String(value));
  };

  for (const [key, value] of Object.entries(input)) append(key, value);
  return params.toString();
}

async function stripeGetRequest<T>(path: string, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const apiVersion = getOptionalEnv('STRIPE_API_VERSION', env) || '2024-06-20';
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(env)}`,
      'Stripe-Version': apiVersion,
    },
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    const message = String(json?.error?.message || json?.message || `Stripe request failed: ${response.status}`);
    throw new Error(message);
  }
  return json as T;
}

async function stripeRequest<T>(path: string, body: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const apiVersion = getOptionalEnv('STRIPE_API_VERSION', env) || '2024-06-20';
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeSecretKey(env)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': apiVersion,
    },
    body: encodeBody(body),
  });

  const json = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    const message = String(json?.error?.message || json?.message || `Stripe request failed: ${response.status}`);
    throw new Error(message);
  }
  return json as T;
}

export async function createStripeCheckoutSession(input: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) {
  return stripeRequest<StripeCheckoutSessionRecord>('/v1/checkout/sessions', input, env);
}

export async function createStripeBillingPortalSession(input: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) {
  return stripeRequest<StripeBillingPortalSessionRecord>('/v1/billing_portal/sessions', input, env);
}


export async function fetchStripeSubscription(subscriptionId: string, env: NodeJS.ProcessEnv = process.env) {
  return stripeGetRequest<StripeSubscriptionRecord>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice.payment_intent`, env);
}

export async function listStripeSubscriptionsByCustomer(customerId: string, env: NodeJS.ProcessEnv = process.env) {
  return stripeGetRequest<{ data?: StripeSubscriptionRecord[] }>(`/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10&expand[]=data.latest_invoice.payment_intent`, env);
}

export async function updateStripeSubscription(subscriptionId: string, input: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) {
  return stripeRequest<StripeSubscriptionRecord>(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, input, env);
}
