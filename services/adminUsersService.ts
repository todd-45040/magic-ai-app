import { supabase } from '../supabase';
import { snapAdminWindowDays } from '../utils/adminMetrics';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  membership: string | null;
  created_at: string | null;
  last_active_at: string | null;
  cost_usd_window: number;
  events_window: number;
};

export async function fetchAdminUsers(params: {
  plan?: string;
  q?: string;
  user_ids?: string[];
  limit?: number;
  offset?: number;
  days?: number;
}): Promise<{ window: any; paging: any; users: AdminUserRow[] }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const qs = new URLSearchParams();
  if (params.plan) qs.set('plan', params.plan);
  if (params.q) qs.set('q', params.q);
  if (params.user_ids && params.user_ids.length) qs.set('user_ids', params.user_ids.slice(0, 200).join(','));
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.days != null) qs.set('days', String(snapAdminWindowDays(params.days, 30)));

  const r = await fetch(`/api/adminUsers?${qs.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load admin users');
  return { window: j.window, paging: j.paging, users: j.users };
}
