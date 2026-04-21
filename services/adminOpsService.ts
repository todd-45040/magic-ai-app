import { adminJson } from './adminApi';
import { snapAdminWindowDays } from '../utils/adminMetrics';

export type WatchlistResponse = {
  window: any;
  near_quota: { user_id: string; email: string | null; membership: string | null; remaining: number; limit: number }[];
  repeated_errors: { user_id: string; email: string | null; membership: string | null; failures: number; last_failure_at: string | null }[];
  big_spenders: { user_id: string; email: string | null; membership: string | null; total_cost_usd: number; sessions: number }[];
};

export async function fetchAdminWatchlist(params: { days?: number } = {}): Promise<WatchlistResponse> {
  const qs = new URLSearchParams();
  if (params.days != null) qs.set('days', String(snapAdminWindowDays(params.days, 7)));
  return adminJson<WatchlistResponse>(`/api/adminWatchlist?${qs.toString()}`, {}, 'Failed to load watchlist');
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
  const qs = new URLSearchParams();
  qs.set('entity_type', params.entity_type);
  qs.set('entity_id', params.entity_id);
  if (params.limit != null) qs.set('limit', String(params.limit));

  try {
    return await adminJson<{ ok: true; notes: OpsNoteRow[] }>(`/api/adminOpsNotes?${qs.toString()}`, {}, 'Failed to load ops notes');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to load ops notes' };
  }
}

export async function addAdminOpsNote(payload: { entity_type: string; entity_id: string; note: string }):
  Promise<{ ok: true; note: OpsNoteRow } | { ok: false; error: string }> {
  try {
    return await adminJson<{ ok: true; note: OpsNoteRow }>(`/api/adminOpsNotes`, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to add ops note');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to add ops note' };
  }
}
