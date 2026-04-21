import { adminJson } from './adminApi';

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

export async function listFounderFeedback(opts?: { limit?: number; status?: 'new' | 'archived' | 'all' }): Promise<FounderFeedback[]> {
  const limit = opts?.limit ?? 200;
  const status = opts?.status ?? 'new';
  const json = await adminJson<any>(`/api/adminFounderFeedback?limit=${encodeURIComponent(String(limit))}&status=${encodeURIComponent(status)}`, {}, 'Failed to load feedback');
  return json.rows as FounderFeedback[];
}

export async function createFounderFeedback(row: Partial<FounderFeedback> & { from_email: string }): Promise<FounderFeedback> {
  const json = await adminJson<any>('/api/adminFounderFeedback', { method: 'POST', body: JSON.stringify(row) }, 'Failed to create feedback');
  return json.row as FounderFeedback;
}

export async function updateFounderFeedback(id: string, patch: Partial<FounderFeedback>): Promise<FounderFeedback> {
  const json = await adminJson<any>('/api/adminFounderFeedback', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) }, 'Failed to update feedback');
  return json.row as FounderFeedback;
}

export async function deleteFounderFeedback(id: string): Promise<void> {
  await adminJson(`/api/adminFounderFeedback?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Failed to delete feedback');
}
