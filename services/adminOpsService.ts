import { adminJson } from './adminApi';
import { snapAdminWindowDays } from '../utils/adminMetrics';

type WatchNearQuotaRow = { user_id: string; email: string | null; membership: string | null; remaining: number; limit: number };
type WatchRepeatedErrorRow = { user_id: string; email: string | null; membership: string | null; failures: number; last_failure_at: string | null };
type WatchBigSpenderRow = { user_id: string; email: string | null; membership: string | null; total_cost_usd: number; sessions: number };

export type WatchlistGroups = {
  near_quota: WatchNearQuotaRow[];
  repeated_errors: WatchRepeatedErrorRow[];
  big_spenders: WatchBigSpenderRow[];
};

export type WatchlistResponse = {
  ok?: boolean;
  window: any;
  near_quota: WatchNearQuotaRow[];
  repeated_errors: WatchRepeatedErrorRow[];
  big_spenders: WatchBigSpenderRow[];
  watchlist: WatchlistGroups;
};

export async function fetchAdminWatchlist(params: { days?: number } = {}): Promise<WatchlistResponse> {
  const qs = new URLSearchParams();
  if (params.days != null) qs.set('days', String(snapAdminWindowDays(params.days, 7)));
  const raw = await adminJson<Omit<WatchlistResponse, 'watchlist'> & { watchlist?: WatchlistGroups }>(`/api/adminWatchlist?${qs.toString()}`, {}, 'Failed to load watchlist');
  return {
    ...raw,
    watchlist: raw.watchlist || {
      near_quota: raw.near_quota || [],
      repeated_errors: raw.repeated_errors || [],
      big_spenders: raw.big_spenders || [],
    },
  };
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
  Promise<{ ok: true; notes: OpsNoteRow[]; missingTable?: boolean } | { ok: false; error: string; missingTable?: boolean }> {
  const qs = new URLSearchParams();
  qs.set('entity_type', params.entity_type);
  qs.set('entity_id', params.entity_id);
  if (params.limit != null) qs.set('limit', String(params.limit));

  try {
    return await adminJson<{ ok: true; notes: OpsNoteRow[] }>(`/api/adminOpsNotes?${qs.toString()}`, {}, 'Failed to load ops notes');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to load ops notes', missingTable: String(error?.message || '').includes('admin_ops_notes table not installed') };
  }
}

export async function addAdminOpsNote(payload: { entity_type: string; entity_id: string; note: string; resolved?: boolean }):
  Promise<{ ok: true; note: OpsNoteRow; missingTable?: boolean } | { ok: false; error: string; missingTable?: boolean }> {
  try {
    return await adminJson<{ ok: true; note: OpsNoteRow }>(`/api/adminOpsNotes`, { method: 'POST', body: JSON.stringify(payload) }, 'Failed to add ops note');
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to add ops note', missingTable: String(error?.message || '').includes('admin_ops_notes table not installed') };
  }
}
