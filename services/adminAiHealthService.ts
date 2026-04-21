import { adminJson } from './adminApi';

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
  tool_support?: Array<{
    id: string;
    label: string;
    category: string;
    endpoints: string[];
    support: AdminAIProvider[];
    note?: string;
  }>;
  limitations?: Array<{
    id: string;
    label: string;
    category: string;
    endpoints: string[];
    support: AdminAIProvider[];
    note?: string;
  }>;
  limitations_count?: number;
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

export async function fetchAdminAiHealth(days: number): Promise<AdminAiHealth> {
  return adminJson<AdminAiHealth>(`/api/adminAiHealth?days=${encodeURIComponent(String(days))}`, {}, 'Failed to load admin AI health');
}
