// NOTE: This file lives at api/ai/_lib/* so we need to traverse back to repo root
// before importing shared server helpers.
import { getBearerToken, requireSupabaseAuth } from '../../../lib/server/auth/index.js';


export type ApiErrorPayload = {
  ok: false;
  error_code: string;
  message: string;
  retryable: boolean;
  details?: any;
};

export function isPreviewEnv(): boolean {
  const vercelEnv = String(process.env.VERCEL_ENV || '').toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  return vercelEnv !== 'production' && nodeEnv !== 'production';
}

export function jsonError(
  res: any,
  status: number,
  payload: ApiErrorPayload,
  extraHeaders?: Record<string, string>,
) {
  try {
    res.setHeader('Content-Type', 'application/json');
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
    }
  } catch {
    // ignore
  }
  return res.status(status).json(payload);
}

export function getClientIp(req: any): string {
  // Vercel / proxies
  const xf = req?.headers?.['x-forwarded-for'] || req?.headers?.['X-Forwarded-For'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  const realIp = req?.headers?.['x-real-ip'] || req?.headers?.['X-Real-IP'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown');
}

export function getApproxBodySizeBytes(req: any): number {
  const cl = req?.headers?.['content-length'] || req?.headers?.['Content-Length'];
  const n = typeof cl === 'string' ? Number(cl) : typeof cl === 'number' ? cl : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);

  try {
    const s = JSON.stringify(req?.body ?? {});
    return Buffer.byteLength(s, 'utf8');
  } catch {
    return 0;
  }
}

// Deterministic rate limit key:
// - Guests => IP-based
// - Authed => userId-based (best effort)
// - If auth fails => fallback to IP-based (never return null)
export async function getRateLimitKey(req: any): Promise<{ key: string; userId?: string }> {
  const ip = getClientIp(req);
  const token = getBearerToken(req);

  // No token OR explicit guest token => treat as guest, rate limit by IP
  if (!token || token === 'guest') {
    return { key: `ip:${ip}` };
  }

  // Token present => attempt Supabase auth for stable userId
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    // If auth fails, still rate limit by IP (do not return null)
    return { key: `ip:${ip}` };
  }

  return { key: `user:${auth.userId}`, userId: auth.userId };
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'TIMEOUT'): Promise<T> {
  const timeoutMs = Math.max(250, Math.floor(ms));
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      const err: any = new Error(`Request timed out after ${timeoutMs}ms`);
      err.code = label;
      reject(err);
    }, timeoutMs);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

// Preview-only debug details helper (never leaks in prod)
export function previewDetails(err: any) {
  if (!isPreviewEnv()) return undefined;
  return {
    message: String(err?.message || err || ''),
    code: err?.code,
    status: err?.status || err?.statusCode,
    stack: String(err?.stack || '').split('\n').slice(0, 6).join('\n'),
  };
}

export function mapProviderError(err: any): {
  status: number;
  error_code: string;
  message: string;
  retryable: boolean;
  details?: any;
} {
  const msg = String(err?.message || err || 'Request failed');
  const code = String(err?.code || err?.status || err?.statusCode || '');

  // Timeout
  if (code === 'TIMEOUT' || /timed out/i.test(msg)) {
    return { status: 504, error_code: 'TIMEOUT', message: 'The request timed out. Please try again.', retryable: true };
  }

  // Quota / rate / overload signals
  if (/quota|resource[_\s-]?exhausted|rate limit|too many requests/i.test(msg)) {
    // If it *looks* like provider quota, call it QUOTA_EXCEEDED
    const isQuota = /quota|resource[_\s-]?exhausted/i.test(msg);
    return {
      status: 429,
      error_code: isQuota ? 'QUOTA_EXCEEDED' : 'PROVIDER_RATE_LIMIT',
      message: isQuota
        ? 'AI quota has been temporarily exceeded. Please try again later.'
        : 'AI provider is rate limiting requests. Please try again shortly.',
      retryable: true,
    };
  }

  // Safety blocks
  if (/safety|blocked by safety|finishreason:\s*safety/i.test(msg)) {
    return {
      status: 400,
      error_code: 'SAFETY_BLOCK',
      message: 'This request was blocked by safety filters. Please rephrase and try again.',
      retryable: false,
    };
  }

  // Auth / config
  if (/api key|not configured|unauthorized|forbidden/i.test(msg)) {
    const isAuth = /unauthorized/i.test(msg);
    return {
      status: isAuth ? 401 : 500,
      error_code: isAuth ? 'UNAUTHORIZED' : 'CONFIG_ERROR',
      message: isAuth ? 'Unauthorized.' : 'Server configuration error.',
      retryable: false,
    };
  }

  // Default
  return {
    status: 500,
    error_code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again.',
    retryable: true,
    details: undefined,
  };
}
