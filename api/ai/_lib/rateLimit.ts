/**
 * Phase 1 best-effort in-memory rate limiter.
 *
 * NOTE: Serverless instances do not share memory and can be recycled at any time.
 * This is intentionally a lightweight guardrail until Supabase-backed usage
 * enforcement is fully unified.
 */

type Bucket = {
  resetAt: number; // epoch ms
  remaining: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; resetAt: number; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  opts: {
    windowMs: number;
    max: number;
    now?: number;
  },
): RateLimitResult {
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const windowMs = Math.max(250, opts.windowMs);
  const max = Math.max(1, Math.floor(opts.max));

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    const remaining = max - 1;
    buckets.set(key, { resetAt, remaining });
    return { ok: true, remaining, resetAt };
  }

  if (existing.remaining <= 0) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, remaining: 0 as const, resetAt: existing.resetAt, retryAfterSeconds };
  }

  existing.remaining -= 1;
  buckets.set(key, existing);
  return { ok: true, remaining: existing.remaining, resetAt: existing.resetAt };
}
