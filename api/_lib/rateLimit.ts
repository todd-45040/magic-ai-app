// api/_lib/rateLimit.ts
//
// Best-effort in-memory rate limiting for Vercel serverless.
// NOTE: This is per-instance (not global). For launch-grade enforcement,
// back it with Upstash Redis or Supabase table. Still valuable for Phase 1.

type Key = string;

type Bucket = {
  hits: number[];
};

const buckets = new Map<Key, Bucket>();

function nowMs() {
  return Date.now();
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const t = nowMs();
  let b = buckets.get(key);
  if (!b) {
    b = { hits: [] };
    buckets.set(key, b);
  }

  // prune
  const cutoff = t - windowMs;
  b.hits = b.hits.filter((x) => x > cutoff);

  if (b.hits.length >= limit) {
    const oldest = b.hits[0] ?? t;
    const retryAfterMs = Math.max(0, windowMs - (t - oldest));
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { ok: false, retryAfterSec };
  }

  b.hits.push(t);

  // occasional cleanup
  if (buckets.size > 5000) {
    // drop oldest half (rough best effort)
    let i = 0
    for (const k of buckets.keys()) {
      buckets.delete(k);
      if (++i > 2500) break;
    }
  }

  return { ok: true };
}

export function getClientIp(req: any): string {
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  // Vercel provides this sometimes
  const rip = req.headers?.["x-real-ip"];
  if (typeof rip === "string" && rip.trim()) return rip.trim();
  return "unknown";
}
