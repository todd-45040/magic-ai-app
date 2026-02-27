export async function fetchAdminWaitlistLeads(params: { source?: string; days?: number; limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  if (params.days) qs.set('days', String(params.days));
  if (typeof params.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params.offset === 'number') qs.set('offset', String(params.offset));

  const url = `/api/adminWaitlistLeads${qs.toString() ? `?${qs.toString()}` : ''}`;
  const r = await fetch(url, { credentials: 'include' as any });
  if (!r.ok) {
    let msg = 'Failed to load leads';
    try {
      const j = await r.json();
      msg = j?.error || j?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return await r.json();
}
