import { normalizePlan, getToolPolicy } from './toolPolicy.js';

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function cleanup(now: number) {
  for (const [k, v] of buckets.entries()) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function enforceBurstProtection(identity: string, plan: string | null | undefined, tool: string, now = Date.now()) {
  cleanup(now);
  const normalized = normalizePlan(plan);
  const policy = getToolPolicy(tool);
  const max = policy.burstMaxByPlan[normalized];
  const windowMs = policy.burstWindowMs;
  const key = `${tool}:${normalized}:${identity}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: max > 0, remaining: Math.max(0, max - 1), limit: max, retryAfterSeconds: 0, resetAt: now + windowMs };
  }
  if (current.count >= max) {
    return { ok: false, remaining: 0, limit: max, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now)/1000)), resetAt: current.resetAt };
  }
  current.count += 1;
  buckets.set(key, current);
  return { ok: true, remaining: Math.max(0, max - current.count), limit: max, retryAfterSeconds: 0, resetAt: current.resetAt };
}
