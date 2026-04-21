import { adminJson } from './adminApi';

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

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return adminJson<AdminSettings>('/api/adminSettings', {}, 'Failed to load admin settings');
}

export async function saveAdminSettings(settings: AdminSettings): Promise<void> {
  await adminJson('/api/adminSettings', { method: 'POST', body: JSON.stringify(settings) }, 'Failed to save admin settings');
}

export async function fetchAdminAiStatus(): Promise<AdminAiStatus> {
  return adminJson<AdminAiStatus>('/api/adminAiStatus', {}, 'Failed to load admin AI status');
}

export async function fetchAdminEnvSanity(): Promise<AdminEnvSanity> {
  return adminJson<AdminEnvSanity>('/api/adminEnvSanity', {}, 'Failed to load admin environment sanity');
}
