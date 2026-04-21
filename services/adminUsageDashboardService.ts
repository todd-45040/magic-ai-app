import { adminJson } from './adminApi';
import { snapAdminWindowDays } from '../utils/adminMetrics';

export async function fetchAdminUsageDashboard(days = 7): Promise<any> {
  const snappedDays = snapAdminWindowDays(days, 7);
  return adminJson<any>(`/api/adminUsageDashboard?days=${encodeURIComponent(String(snappedDays))}`, {}, 'Failed to load admin usage dashboard');
}

export async function resolveAnomalyFlag(id: number, resolved = true): Promise<void> {
  await adminJson(`/api/adminResolveAnomaly`, {
    method: 'POST',
    body: JSON.stringify({ id, resolved }),
  }, 'Failed to update flag');
}
