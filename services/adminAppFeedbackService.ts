import { supabase } from '../supabase';

export type SuggestionStatus = 'new' | 'reviewing' | 'resolved' | 'archived';

export interface AppSuggestionRow {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  status: SuggestionStatus | null;
  user_id: string | null;
  user_email: string | null;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSuggestions(params?: {
  status?: SuggestionStatus | 'all';
  limit?: number;
}): Promise<AppSuggestionRow[]> {
  const status = params?.status ?? 'all';
  const limit = params?.limit ?? 200;

  const headers = await authHeaders();
  const qs = new URLSearchParams({ status, limit: String(limit) });
  const r = await fetch(`/api/adminSuggestions?${qs.toString()}`, { headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    const msg = j?.error || `Request failed (${r.status})`;
    throw new Error(msg);
  }
  return (j.suggestions ?? []) as AppSuggestionRow[];
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus): Promise<void> {
  const headers = await authHeaders();
  const r = await fetch('/api/adminSuggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id, status }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    const msg = j?.error || `Request failed (${r.status})`;
    throw new Error(msg);
  }
}

export async function deleteSuggestion(id: string): Promise<void> {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ id });
  const r = await fetch(`/api/adminSuggestions?${qs.toString()}`, { method: 'DELETE', headers });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    const msg = j?.error || `Request failed (${r.status})`;
    throw new Error(msg);
  }
}
