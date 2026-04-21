import { adminJson } from './adminApi';

export async function fetchAdminSummary(days = 7): Promise<any> {
  return adminJson<any>(`/api/adminSummary?days=${encodeURIComponent(String(days))}`, {}, 'Failed to load admin summary');
}
