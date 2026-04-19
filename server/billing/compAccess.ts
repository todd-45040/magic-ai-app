import type { BillingPlanKey } from '../../services/planCatalog.js';

export type ActiveCompGrant = {
  id: string;
  planKey: BillingPlanKey;
  startsAt: string;
  endsAt: string;
  status: string;
  partner_source: string | null;
  grantedBy: string | null;
  grantReason: string | null;
  email: string | null;
  userId: string | null;
};

const ALLOWED_PLAN_KEYS: BillingPlanKey[] = ['free', 'amateur', 'founder_amateur', 'professional', 'founder_professional'];

function normalizePlanKey(value: unknown): BillingPlanKey | null {
  const raw = String(value || '').trim();
  return ALLOWED_PLAN_KEYS.includes(raw as BillingPlanKey) ? (raw as BillingPlanKey) : null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function isActiveGrant(row: any, nowMs = Date.now()): boolean {
  const status = String(row?.status || '').trim().toLowerCase();
  if (status && status !== 'active') return false;
  const startsAtMs = new Date(row?.starts_at || 0).getTime();
  const endsAtMs = new Date(row?.ends_at || 0).getTime();
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) return false;
  return startsAtMs <= nowMs && endsAtMs > nowMs;
}

function scoreGrant(row: any): number {
  const endsAtMs = new Date(row?.ends_at || 0).getTime();
  const startsAtMs = new Date(row?.starts_at || 0).getTime();
  const hasUserId = row?.user_id ? 1 : 0;
  return (hasUserId * 10_000_000_000_000) + (Number.isFinite(endsAtMs) ? endsAtMs : 0) + ((Number.isFinite(startsAtMs) ? startsAtMs : 0) / 1000);
}

async function collectRows(query: Promise<any>): Promise<any[]> {
  try {
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

export async function findActiveCompGrant(admin: any, input: { userId?: string | null; email?: string | null; }): Promise<ActiveCompGrant | null> {
  const userId = String(input?.userId || '').trim();
  const email = String(input?.email || '').trim().toLowerCase();
  if (!admin || (!userId && !email)) return null;

  const [userRows, emailRows] = await Promise.all([
    userId
      ? collectRows(
          admin.from('comp_access_grants')
            .select('id, user_id, email, plan_key, starts_at, ends_at, status, source, granted_by, grant_reason')
            .eq('user_id', userId)
            .order('ends_at', { ascending: false })
            .limit(10)
        )
      : Promise.resolve([]),
    email
      ? collectRows(
          admin.from('comp_access_grants')
            .select('id, user_id, email, plan_key, starts_at, ends_at, status, source, granted_by, grant_reason')
            .ilike('email', email)
            .order('ends_at', { ascending: false })
            .limit(10)
        )
      : Promise.resolve([]),
  ]);

  const deduped = new Map<string, any>();
  for (const row of [...userRows, ...emailRows]) {
    const id = String(row?.id || '').trim();
    if (!id) continue;
    deduped.set(id, row);
  }

  const active = [...deduped.values()]
    .filter((row) => normalizePlanKey(row?.plan_key) && isActiveGrant(row))
    .sort((a, b) => scoreGrant(b) - scoreGrant(a));

  const best = active[0];
  if (!best) return null;

  const planKey = normalizePlanKey(best.plan_key);
  const startsAt = toIso(best.starts_at);
  const endsAt = toIso(best.ends_at);
  if (!planKey || !startsAt || !endsAt) return null;

  return {
    id: String(best.id),
    planKey,
    startsAt,
    endsAt,
    status: String(best.status || 'active').trim() || 'active',
    partner_source: String(best.source || '').trim() || null,
    grantedBy: String(best.granted_by || '').trim() || null,
    grantReason: String(best.grant_reason || '').trim() || null,
    email: String(best.email || '').trim() || null,
    userId: String(best.user_id || '').trim() || null,
  };
}

export function normalizeMembershipFromPlanKey(planKey: BillingPlanKey): 'free' | 'amateur' | 'professional' {
  if (planKey === 'professional' || planKey === 'founder_professional') return 'professional';
  if (planKey === 'amateur' || planKey === 'founder_amateur') return 'amateur';
  return 'free';
}
