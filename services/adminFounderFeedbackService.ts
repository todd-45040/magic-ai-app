import { supabase } from '../supabase';

export type FounderFeedback = {
  id: string;
  created_at: string;
  received_at: string | null;
  source: string;
  status: string;
  message_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  meta: any | null;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listFounderFeedback(opts?: { limit?: number; status?: 'new' | 'archived' | 'all' }): Promise<FounderFeedback[]> {
  const limit = opts?.limit ?? 200;
  const status = opts?.status ?? 'new';
  const headers = await authHeader();
  const res = await fetch(`/api/adminFounderFeedback?limit=${encodeURIComponent(String(limit))}&status=${encodeURIComponent(status)}`, { headers });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed to load feedback');
  return json.rows as FounderFeedback[];
}

export async function createFounderFeedback(row: Partial<FounderFeedback> & { from_email: string }): Promise<FounderFeedback> {
  const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
  const res = await fetch('/api/adminFounderFeedback', { method: 'POST', headers, body: JSON.stringify(row) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed to create feedback');
  return json.row as FounderFeedback;
}

export async function updateFounderFeedback(id: string, patch: Partial<FounderFeedback>): Promise<FounderFeedback> {
  const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
  const res = await fetch('/api/adminFounderFeedback', { method: 'PATCH', headers, body: JSON.stringify({ id, ...patch }) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed to update feedback');
  return json.row as FounderFeedback;
}

export async function deleteFounderFeedback(id: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(`/api/adminFounderFeedback?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Failed to delete feedback');
}
