export async function fetchAdminUsageDashboard(days = 7): Promise<any> {
  const r = await fetch(`/api/adminUsageDashboard?days=${encodeURIComponent(String(days))}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.ok) throw new Error(j?.error || 'Failed to load admin usage dashboard');
  return j;
}
