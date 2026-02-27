import { supabase } from '../supabase';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAdminWaitlistLeads(
  params: { source?: string; days?: number; limit?: number; offset?: number } = {}
) {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  if (params.days) qs.set('days', String(params.days));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));

  const url = `/api/adminWaitlistLeads${qs.toString() ? `?${qs.toString()}` : ''}`;

  const r = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || j?.message || 'Failed to load leads');
  }
  return j;
}
