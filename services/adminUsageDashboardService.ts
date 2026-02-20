export async function fetchAdminUsageDashboard(days = 7): Promise<any> {
  const r = await fetch(`/api/adminUsageDashboard?days=${encodeURIComponent(String(days))}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load admin usage dashboard');
  return j;
}


export async function resolveAnomalyFlag(id: number, resolved = true): Promise<void> {
  const r = await fetch(`/api/adminResolveAnomaly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, resolved }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to update flag');
}
