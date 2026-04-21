import { adminJson } from './adminApi';

export async function fetchAdminIbmFunnel(days = 7, source: 'ibm' | 'sam' | 'all' = 'ibm'): Promise<any> {
  return adminJson<any>(`/api/adminIbmFunnel?days=${encodeURIComponent(String(days))}&source=${encodeURIComponent(source)}`, {}, 'Failed to load partner funnel');
}
