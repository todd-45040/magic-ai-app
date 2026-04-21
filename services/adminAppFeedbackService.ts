import { adminJson } from './adminApi';

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

export async function fetchSuggestions(params?: {
  status?: SuggestionStatus | 'all';
  limit?: number;
}): Promise<AppSuggestionRow[]> {
  const status = params?.status ?? 'all';
  const limit = params?.limit ?? 200;
  const qs = new URLSearchParams({ status, limit: String(limit) });
  const j = await adminJson<any>(`/api/adminSuggestions?${qs.toString()}`, {}, 'Failed to load suggestions');
  return (j.suggestions ?? []) as AppSuggestionRow[];
}

export async function updateSuggestionStatus(id: string, status: SuggestionStatus): Promise<void> {
  await adminJson('/api/adminSuggestions', {
    method: 'POST',
    body: JSON.stringify({ id, status }),
  }, 'Failed to update suggestion');
}

export async function deleteSuggestion(id: string): Promise<void> {
  const qs = new URLSearchParams({ id });
  await adminJson(`/api/adminSuggestions?${qs.toString()}`, { method: 'DELETE' }, 'Failed to delete suggestion');
}
