import { supabase } from '../supabase';
import { snapAdminWindowDays } from '../utils/adminMetrics';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchAdminUsageDashboard(days = 7): Promise<any> {
  const snappedDays = snapAdminWindowDays(days, 7);
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const r = await fetch(`/api/adminUsageDashboard?days=${encodeURIComponent(String(snappedDays))}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load admin usage dashboard');
  return j;
}


export async function resolveAnomalyFlag(id: number, resolved = true): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const r = await fetch(`/api/adminResolveAnomaly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, resolved }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to update flag');
}
