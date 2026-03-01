import { supabase } from '../supabase';

export type AdminAIProvider = 'gemini' | 'openai' | 'anthropic';
export type AdminAiStatusSource = 'db' | 'env' | 'default';

export interface AdminAiRollup {
  calls: number;
  errors: number;
  error_rate: number | null;
  p95_latency_ms: number | null;
  cost_usd: number;
}

export interface AdminAiHealthProviderRow extends AdminAiRollup {
  provider: AdminAIProvider;
}

export interface AdminAiHealth {
  ok: boolean;
  runtimeProvider: AdminAIProvider;
  source: AdminAiStatusSource;
  envOverrideActive: boolean;
  key_status: {
    openai: { configured: boolean };
    gemini: { configured: boolean };
    anthropic: { configured: boolean };
  };
  last_60m: AdminAiRollup;
  last_24h: AdminAiRollup;
  window: AdminAiRollup & { days: number; sinceIso: string };
  by_provider: AdminAiHealthProviderRow[];
  recent_errors: Array<{
    occurred_at: string | null;
    provider: string | null;
    tool: string | null;
    endpoint: string | null;
    outcome: string | null;
    http_status: any;
    error_code: any;
    request_id: string | null;
  }>;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAdminAiHealth(days: number): Promise<AdminAiHealth> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`/api/adminAiHealth?days=${encodeURIComponent(String(days))}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  return JSON.parse(text) as AdminAiHealth;
}
