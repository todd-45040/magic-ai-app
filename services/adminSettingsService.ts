import { supabase } from '../supabase';

export type AdminAIProvider = 'gemini' | 'openai' | 'anthropic';

export interface AdminSettings {
  defaultProvider: AdminAIProvider;
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
