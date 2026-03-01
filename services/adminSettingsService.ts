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
