import { supabase } from '../supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type TopSpenderRow = {
  user_id: string;
  email: string | null;
  membership: string | null;
  cost_usd_window: number;
};

export async function fetchAdminTopSpenders(days = 30, limit = 20): Promise<{ window: any; top_spenders: TopSpenderRow[] }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const r = await fetch(`/api/adminTopSpenders?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load top spenders');
  return { window: j.window, top_spenders: j.top_spenders || [] };
}
