import crypto from 'crypto';
import { resolveProvider } from '../../lib/server/providers/index.js';
import { requireSupabaseAuth } from '../../api/ai/_lib/auth.js';
import { applyUsageHeaders, bestEffortIncrementAiUsage, guardAiUsage } from '../../api/ai/_lib/usageGuard.js';
import { getApproxBodySizeBytes, isPreviewEnv, jsonError, mapProviderError } from '../../api/ai/_lib/hardening.js';
import { estimateCostUSD, getIpFromReq, hashIp, logUsageEvent } from '../telemetry.js';

export type AiCostTier = 'low' | 'medium' | 'high';

export type HandleAiRequestOptions<T = any, R = any> = {
  tool: string;
  endpoint: string;
  costTier?: AiCostTier;
  units?: number;
  maxBodyBytes?: number;
  requireAuth?: boolean;
  duplicateWindowMs?: number;
  cooldownMs?: number;
  inputFingerprint?: (req: any) => string;
  validate?: (ctx: RequestContext) => Promise<void> | void;
  run: (ctx: RequestContext) => Promise<T>;
  normalize?: (result: T, ctx: RequestContext) => R;
};

type RequestContext = {
  req: any;
  res: any;
  requestId: string;
  auth: Awaited<ReturnType<typeof requireSupabaseAuth>> | null;
  provider: string;
  body: any;
  tool: string;
  endpoint: string;
  costTier: AiCostTier;
  units: number;
};

type CacheEntry = { startedAt: number; promise?: Promise<any>; completedAt?: number };

function requestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function mapDefaultCooldownMs(costTier: AiCostTier): number {
  if (costTier === 'high') return 20_000;
  if (costTier === 'medium') return 9_000;
  return 4_000;
}

function getCache(): Map<string, CacheEntry> {
  const g: any = globalThis as any;
  if (!g.__mawAiRequestCache) g.__mawAiRequestCache = new Map<string, CacheEntry>();
  return g.__mawAiRequestCache;
}

function pruneCache(now: number) {
  const cache = getCache();
  for (const [key, value] of cache.entries()) {
    if (value.completedAt && now - value.completedAt > 60_000) cache.delete(key);
    else if (!value.completedAt && now - value.startedAt > 60_000) cache.delete(key);
  }
}

function stableStringify(input: any): string {
  if (input === null || input === undefined) return String(input);
  if (typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map((v) => stableStringify(v)).join(',')}]`;
  const keys = Object.keys(input).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(input[k])}`).join(',')}}`;
}

function sha(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildFingerprint(req: any, tool: string, custom?: (req: any) => string): string {
  if (typeof custom === 'function') return sha(`${tool}:${custom(req)}`);
  return sha(`${tool}:${stableStringify(req?.body ?? {})}`);
}

export async function handleAiRequest<T = any, R = any>(req: any, res: any, options: HandleAiRequestOptions<T, R>) {
  const now = Date.now();
  pruneCache(now);
  const request_id = requestId();
  const costTier = options.costTier ?? 'low';
  const units = Number(options.units ?? 1);
  const cooldownMs = Math.max(0, Number(options.cooldownMs ?? mapDefaultCooldownMs(costTier)));
  const duplicateWindowMs = Math.max(cooldownMs, Number(options.duplicateWindowMs ?? cooldownMs));

  try {
    if (req.method !== 'POST') {
      return jsonError(res, 405, { ok: false, error_code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.', retryable: false });
    }

    const bodySize = getApproxBodySizeBytes(req);
    if (bodySize > Number(options.maxBodyBytes ?? 2 * 1024 * 1024)) {
      return jsonError(res, 413, {
        ok: false,
        error_code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload too large.',
        retryable: false,
        ...(isPreviewEnv() ? { details: { bodySize, limit: options.maxBodyBytes ?? 2 * 1024 * 1024 } } : {}),
      });
    }

    const auth = options.requireAuth === false ? null : await requireSupabaseAuth(req);
    if (auth && !auth.ok) {
      await logUsageEvent({
        request_id,
        actor_type: 'guest',
        identity_key: sha(`guest:${getIpFromReq(req)}`),
        ip_hash: hashIp(getIpFromReq(req)),
        tool: options.tool,
        endpoint: options.endpoint,
        outcome: 'UNAUTHORIZED',
        http_status: auth.status,
        error_code: 'UNAUTHORIZED',
        retryable: false,
        units,
        charged_units: 0,
        user_agent: String(req?.headers?.['user-agent'] || ''),
      });
      return jsonError(res, auth.status, {
        ok: false,
        error_code: 'AI_AUTH_REQUIRED',
        message: auth.error || 'Unauthorized.',
        retryable: false,
      });
    }

    const provider = await resolveProvider(req);
    const body = req.body || {};
    const ctx: RequestContext = {
      req,
      res,
      requestId: request_id,
      auth: auth as any,
      provider,
      body,
      tool: options.tool,
      endpoint: options.endpoint,
      costTier,
      units,
    };

    if (options.validate) await options.validate(ctx);

    const identity = auth && auth.ok ? auth.userId : `guest:${getIpFromReq(req)}`;
    const fingerprint = buildFingerprint(req, options.tool, options.inputFingerprint);
    const cacheKey = `${identity}:${options.tool}:${fingerprint}`;
    const cache = getCache();
    const existing = cache.get(cacheKey);

    if (existing?.promise && now - existing.startedAt < duplicateWindowMs) {
      return jsonError(res, 409, {
        ok: false,
        error_code: 'AI_DUPLICATE_REQUEST',
        message: 'That request is already being processed.',
        retryable: true,
      });
    }

    if (existing?.completedAt && now - existing.completedAt < cooldownMs) {
      return jsonError(res, 429, {
        ok: false,
        error_code: 'AI_COOLDOWN_ACTIVE',
        message: `Please wait ${Math.ceil((cooldownMs - (now - existing.completedAt)) / 1000)} seconds before trying again.`,
        retryable: true,
      }, { 'Retry-After': String(Math.max(1, Math.ceil((cooldownMs - (now - existing.completedAt)) / 1000))) });
    }

    const usageGuard = await guardAiUsage(req, units);
    if (!usageGuard.ok) {
      await logUsageEvent({
        request_id,
        actor_type: auth && auth.ok ? 'user' : 'guest',
        user_id: auth && auth.ok ? auth.userId : null,
        identity_key: sha(identity),
        ip_hash: hashIp(getIpFromReq(req)),
        tool: options.tool,
        endpoint: options.endpoint,
        provider,
        outcome: usageGuard.status === 429 ? 'BLOCKED_QUOTA' : 'ERROR_UPSTREAM',
        http_status: usageGuard.status,
        error_code: usageGuard.error.error_code,
        retryable: usageGuard.error.retryable,
        units,
        charged_units: 0,
        membership: (usageGuard as any)?.usage?.membership || null,
        user_agent: String(req?.headers?.['user-agent'] || ''),
      });
      return jsonError(res, usageGuard.status, usageGuard.error);
    }

    const startedAt = Date.now();
    const promise = options.run(ctx);
    cache.set(cacheKey, { startedAt, promise });

    const raw = await promise;
    await bestEffortIncrementAiUsage(req, units);

    const normalized = options.normalize ? options.normalize(raw, ctx) : (raw as any as R);
    applyUsageHeaders(res, usageGuard.usage);
    res.setHeader('X-AI-Provider-Used', provider);
    res.setHeader('X-AI-Request-Id', request_id);
    res.setHeader('X-AI-Cooldown-Ms', String(cooldownMs));

    const estimatedCost = estimateCostUSD({ provider, model: String(body?.model || ''), charged_units: units, tool: options.tool });
    await logUsageEvent({
      request_id,
      actor_type: auth && auth.ok ? 'user' : 'guest',
      user_id: auth && auth.ok ? auth.userId : null,
      identity_key: sha(identity),
      ip_hash: hashIp(getIpFromReq(req)),
      tool: options.tool,
      endpoint: options.endpoint,
      provider,
      model: String(body?.model || ''),
      outcome: 'SUCCESS_CHARGED',
      http_status: 200,
      retryable: false,
      units,
      charged_units: units,
      membership: (usageGuard.usage as any)?.membership || null,
      latency_ms: Date.now() - startedAt,
      user_agent: String(req?.headers?.['user-agent'] || ''),
      estimated_cost_usd: estimatedCost,
    });

    cache.set(cacheKey, { startedAt, completedAt: Date.now() });
    return res.status(200).json({ ok: true, requestId: request_id, data: normalized });
  } catch (err: any) {
    const mapped = mapProviderError(err);
    await logUsageEvent({
      request_id,
      actor_type: 'user',
      user_id: null,
      identity_key: sha(`error:${getIpFromReq(req)}`),
      ip_hash: hashIp(getIpFromReq(req)),
      tool: options.tool,
      endpoint: options.endpoint,
      outcome: 'ERROR_UPSTREAM',
      http_status: mapped.status,
      error_code: mapped.error_code,
      retryable: mapped.retryable,
      units,
      charged_units: 0,
      user_agent: String(req?.headers?.['user-agent'] || ''),
    }).catch(() => undefined);
    return jsonError(res, mapped.status, {
      ok: false,
      error_code: mapped.error_code,
      message: mapped.message,
      retryable: mapped.retryable,
      ...(isPreviewEnv() ? { details: { message: String(err?.message || err || ''), code: err?.code, requestId: request_id } } : {}),
    });
  }
}
