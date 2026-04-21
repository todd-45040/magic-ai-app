import { adminJson } from './adminApi';

export async function fetchAdminTopSpenders(days = 30, limit = 50): Promise<any> {
  return adminJson<any>(`/api/adminTopSpenders?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`, {}, 'Failed to load top spenders');
}
