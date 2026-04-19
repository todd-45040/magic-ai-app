import { supabase } from '../supabase';

export type AdminAIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AdminSettings {
  defaultProvider: AdminAIProvider;
}

export type AdminAiStatusSource = 'db' | 'env' | 'default';

export interface AdminAiStatus {
  defaultProvider: AdminAIProvider;
  runtimeProvider: AdminAIProvider;
  source: AdminAiStatusSource;
  envOverrideActive: boolean;
  tool_support?: Array<{
    tool: string;
    route: string;
    support: AdminAIProvider[];
    note?: string;
  }>;
  limitations?: Array<{
    tool: string;
    route: string;
    support: AdminAIProvider[];
    note?: string;
  }>;
  limitations_count?: number;
  keys: {
    openai: { configured: boolean };
    gemini: { configured: boolean };
    anthropic: { configured: boolean };
  };
}

export interface AdminEnvSanity {
  ok: boolean;
  generatedAt: string;
  provider: {
    runtimeProvider: AdminAIProvider;
    dbDefaultProvider: AdminAIProvider;
    envOverrideActive: boolean;
    source: 'env' | 'db';
    envOverrideValue: AdminAIProvider | null;
  };
  readiness: {
    stripeReady: boolean;
    webhookVerificationActive: boolean;
  };
  keys: {
    ai: {
      GOOGLE_AI_API_KEY: boolean;
      OPENAI_API_KEY: boolean;
      ANTHROPIC_API_KEY: boolean;
    };
    supabase: {
      SUPABASE_URL: boolean;
      SUPABASE_ANON_KEY: boolean;
      SUPABASE_SERVICE_ROLE_KEY: boolean;
    };
    stripe: {
      STRIPE_SECRET_KEY: boolean;
      STRIPE_WEBHOOK_SECRET: boolean;
      STRIPE_PRICE_AMATEUR: boolean;
      STRIPE_PRICE_PRO: boolean;
    };
    smtp: {
      SMTP_HOST: boolean;
      SMTP_PORT: boolean;
      SMTP_USER: boolean;
      SMTP_PASS: boolean;
      SMTP_FROM: boolean;
    };
  };
  warnings?: {
    vitePrefixedSecretsPresent: boolean;
    viteSecretNames: string[];
  };
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/adminSettings', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return JSON.parse(text) as AdminSettings;
}

export async function saveAdminSettings(settings: AdminSettings): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/adminSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
}

export async function fetchAdminAiStatus(): Promise<AdminAiStatus> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/adminAiStatus', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return JSON.parse(text) as AdminAiStatus;
}

export async function fetchAdminEnvSanity(): Promise<AdminEnvSanity> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/adminEnvSanity', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return JSON.parse(text) as AdminEnvSanity;
}
