import { adminJson } from './adminApi';

export async function fetchAdminKpis(days = 7): Promise<any> {
  return adminJson<any>(`/api/adminKpis?days=${encodeURIComponent(String(days))}`, {}, 'Failed to load admin KPIs');
}
