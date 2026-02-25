import { supabase } from '../supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAdminSummary(days = 30): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const r = await fetch(`/api/adminSummary?days=${encodeURIComponent(String(days))}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load admin summary');
  return j;
}
