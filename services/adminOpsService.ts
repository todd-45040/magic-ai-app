import { supabase } from '../supabase';
import { snapAdminWindowDays } from '../utils/adminMetrics';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type WatchlistResponse = {
  window: any;
  near_quota: { user_id: string; email: string | null; membership: string | null; remaining: number; limit: number }[];
  repeated_errors: { user_id: string; email: string | null; membership: string | null; failures: number; last_failure_at: string | null }[];
  big_spenders: { user_id: string; email: string | null; membership: string | null; total_cost_usd: number; sessions: number }[];
};

export async function fetchAdminWatchlist(params: { days?: number } = {}): Promise<WatchlistResponse> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const qs = new URLSearchParams();
  if (params.days != null) qs.set('days', String(snapAdminWindowDays(params.days, 7)));

  const r = await fetch(`/api/adminWatchlist?${qs.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load watchlist');
  return j as WatchlistResponse;
}

export type OpsNoteRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  note: string;
  created_at: string;
  created_by: string | null;
};

export async function fetchAdminOpsNotes(params: { entity_type: string; entity_id: string; limit?: number }):
  Promise<{ ok: true; notes: OpsNoteRow[] } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const qs = new URLSearchParams();
  qs.set('entity_type', params.entity_type);
  qs.set('entity_id', params.entity_id);
  if (params.limit != null) qs.set('limit', String(params.limit));

  const r = await fetch(`/api/adminOpsNotes?${qs.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const j = await r.json().catch(() => ({}));
  // This endpoint may return ok:false if the table isn't installed yet.
  return j;
}

export async function addAdminOpsNote(payload: { entity_type: string; entity_id: string; note: string }):
  Promise<{ ok: true; note: OpsNoteRow } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const r = await fetch(`/api/adminOpsNotes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  return j;
}
