export function isIbmLikeSource(raw: any): boolean {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'ibm' || s === 'ibm-30day' || s === 'ibm_30day' || s === 'sam' || s === 'sam-30day' || s === 'sam_30day';
}

export function normalizeIbmMetadata(metadata: any = {}, extras: Record<string, any> = {}): Record<string, any> {
  const base = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  const source = String(base.source || extras.source || '').trim().toLowerCase();
  if (isIbmLikeSource(source) || extras.is_ibm === true) {
    const resolvedSource = String(source || extras.source || '').trim().toLowerCase() === 'sam' || extras.is_sam === true ? 'sam' : 'ibm';
    base.source = resolvedSource;
    if (!base.campaign) base.campaign = resolvedSource === 'sam' ? 'sam-30day' : 'ibm-30day';
    if (extras.requested_trial_days && !base.requested_trial_days) base.requested_trial_days = extras.requested_trial_days;
  }
  for (const [k, v] of Object.entries(extras || {})) {
    if (v == null) continue;
    if (k === 'is_ibm' || k === 'is_sam') continue;
    if (base[k] == null) base[k] = v;
  }
  return base;
}

export async function getUserIbmContext(admin: any, userId: string | null | undefined): Promise<Record<string, any>> {
  if (!admin || !userId) return {};
  try {
    const { data, error } = await admin
      .from('users')
      .select('signup_source,requested_trial_days,membership,trial_end_date,email')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return {};
    const source = String((data as any).signup_source || '').trim().toLowerCase();
    if (!isIbmLikeSource(source)) return {};
    const resolvedSource = source === 'sam' ? 'sam' : 'ibm';
    return {
      is_ibm: resolvedSource === 'ibm',
      is_sam: resolvedSource === 'sam',
      source: resolvedSource,
      campaign: resolvedSource === 'sam' ? 'sam-30day' : 'ibm-30day',
      requested_trial_days: Number((data as any).requested_trial_days || 0) || 30,
      membership: (data as any).membership || null,
      trial_end_date: Number((data as any).trial_end_date || 0) || null,
      email: (data as any).email || null,
    };
  } catch {
    return {};
  }
}

export async function insertUserActivity(admin: any, row: {
  user_id?: string | null;
  email?: string | null;
  tool_name?: string | null;
  event_type: string;
  success?: boolean;
  duration_ms?: number | null;
  metadata?: Record<string, any>;
}) {
  if (!admin) return;
  await admin.from('user_activity_log').insert({
    user_id: row.user_id ?? null,
    email: row.email ?? null,
    tool_name: row.tool_name ?? 'system',
    event_type: row.event_type,
    success: row.success ?? true,
    duration_ms: row.duration_ms ?? null,
    metadata: row.metadata ?? {},
  });
}
