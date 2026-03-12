import { getApproxBodySizeBytes, getClientIp, getRateLimitKey, jsonError } from './hardening.js';
import { rateLimit, rateLimitHeaders } from './rateLimit.js';
import { clearFingerprint, inspectDuplicate, makeFingerprint, markCompleted, markProcessing } from './duplicateRequest.js';
import { getCooldownHeaders, getToolPolicy } from './toolPolicy.js';
import { requireSupabaseAuth } from './auth.js';
import { estimateCostUSD, hashIp, logUsageEvent } from '../../../server/telemetry.js';

const cooldowns = new Map<string, number>();

type StartOpts = { req: any; res: any; tool: string; payloadForFingerprint: any; endpoint: string; model?: string | null; provider?: string | null };

function approxTextLen(payload: any): number {
  if (!payload) return 0;
  let total = 0;
  if (typeof payload.prompt === 'string') total += payload.prompt.length;
  if (Array.isArray(payload.messages)) total += payload.messages.reduce((sum: number, m: any) => sum + String(m?.content || '').length, 0);
  if (Array.isArray(payload.contents)) total += JSON.stringify(payload.contents).length;
  if (typeof payload.imageBase64 === 'string') total += payload.imageBase64.length;
  return total;
}

export function ensureInputWithinPolicy(payload: any, tool: string): { ok: true } | { ok: false; status: number; error_code: string; message: string } {
  const policy = getToolPolicy(tool);
  const prompt = typeof payload?.prompt === 'string' ? payload.prompt : '';
  if (prompt.length > policy.promptMaxChars) {
    return { ok: false, status: 413, error_code: 'AI_INVALID_INPUT', message: `That request is too large. Keep prompts under ${policy.promptMaxChars} characters.` };
  }
  const textLen = approxTextLen(payload);
  if (textLen > policy.contextMaxChars + policy.promptMaxChars) {
    return { ok: false, status: 413, error_code: 'AI_INVALID_INPUT', message: 'That request is too large. Please shorten your input and try again.' };
  }
  if (typeof payload?.imageBase64 === 'string' && policy.imageMaxBytes) {
    const bytes = Buffer.byteLength(payload.imageBase64, 'utf8');
    if (bytes > policy.imageMaxBytes * 1.37) {
      return { ok: false, status: 413, error_code: 'AI_INVALID_INPUT', message: `Image payload is too large. Keep uploads under ${Math.ceil(policy.imageMaxBytes / 1024 / 1024)} MB.` };
    }
  }
  return { ok: true };
}

export async function startProtectedRequest(opts: StartOpts): Promise<any> {
  const { req, res, tool, payloadForFingerprint, endpoint, provider, model } = opts;
  const policy = getToolPolicy(tool);
  const bodySize = getApproxBodySizeBytes(req);
  if (bodySize > policy.payloadMaxBytes) {
    return jsonError(res, 413, { ok: false, error_code: 'AI_INVALID_INPUT', message: 'That request is too large. Please shorten your input and try again.', retryable: false });
  }
  const auth = await requireSupabaseAuth(req);
  if (!auth.ok) {
    await bestEffortLog({ req, tool, endpoint, provider, model, success: false, error_code: 'AI_AUTH_REQUIRED', http_status: 401, charged_units: 0 });
    return jsonError(res, 401, { ok: false, error_code: 'AI_AUTH_REQUIRED', message: 'Please sign in to use this AI feature.', retryable: false });
  }
  const identityKey = `user:${auth.userId}`;
  const cooldownKey = `${identityKey}:${tool}`;
  const now = Date.now();
  const until = cooldowns.get(cooldownKey) || 0;
  if (until > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((until - now) / 1000));
    return jsonError(res, 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: 'Please wait a moment before trying this feature again.', retryable: true }, { ...getCooldownHeaders(tool, until), 'Retry-After': String(retryAfterSeconds) });
  }

  const validate = ensureInputWithinPolicy(payloadForFingerprint, tool);
  if (!validate.ok) {
    await bestEffortLog({ req, tool, endpoint, provider, model, success: false, error_code: validate.error_code, http_status: validate.status, charged_units: 0, input_size: bodySize });
    return jsonError(res, validate.status, { ok: false, error_code: validate.error_code, message: validate.message, retryable: false });
  }

  const rateKey = await getRateLimitKey(req);
  const burstMax = policy.costTier === 'HIGH' ? 4 : policy.costTier === 'MEDIUM' ? 10 : 20;
  const rl = rateLimit(`${rateKey.key}:${tool}:burst`, { windowMs: 60_000, max: burstMax });
  if (!rl.ok) {
    await bestEffortLog({ req, tool, endpoint, provider, model, success: false, error_code: 'AI_LIMIT_REACHED', http_status: 429, charged_units: 0, input_size: bodySize });
    return jsonError(res, 429, { ok: false, error_code: 'AI_LIMIT_REACHED', message: 'Too many requests. Please wait a moment and try again.', retryable: true }, rateLimitHeaders(rl));
  }

  const fingerprint = makeFingerprint({ identityKey, tool, payload: payloadForFingerprint });
  const dup = inspectDuplicate(fingerprint);
  if (dup.status === 'processing') {
    await bestEffortLog({ req, tool, endpoint, provider, model, success: false, error_code: 'AI_DUPLICATE_REQUEST', http_status: 409, charged_units: 0, input_size: bodySize });
    return jsonError(res, 409, { ok: false, error_code: 'AI_DUPLICATE_REQUEST', message: 'That request is already being processed.', retryable: true });
  }
  if (dup.status === 'cached') {
    res.setHeader('X-AI-Cache', 'HIT');
    return res.status(200).json(dup.cached);
  }

  markProcessing(fingerprint, policy.duplicateWindowMs);
  cooldowns.set(cooldownKey, now + policy.cooldownMs);
  return { ok: true, fingerprint, auth, identityKey, policy, bodySize };
}

export function completeProtectedRequest(fingerprint: string, responsePayload: any, tool: string) {
  const policy = getToolPolicy(tool);
  markCompleted(fingerprint, responsePayload, policy.duplicateWindowMs);
}

export function failProtectedRequest(fingerprint?: string) {
  if (fingerprint) clearFingerprint(fingerprint);
}

export async function bestEffortLog(input: { req: any; tool: string; endpoint: string; provider?: string | null; model?: string | null; success: boolean; error_code?: string | null; http_status?: number | null; charged_units?: number | null; input_size?: number | null; output_size?: number | null; cost_tier?: string | null; user_id?: string | null; membership?: string | null; latency_ms?: number | null; }) {
  try {
    const auth = input.user_id ? { ok: true, userId: input.user_id } as any : await requireSupabaseAuth(input.req);
    const ip = getClientIp(input.req);
    const userId = auth.ok ? auth.userId : null;
    const identity_key = userId ? `user:${userId}` : `ip:${hashIp(ip)}`;
    const provider = input.provider || 'unknown';
    const model = input.model || null;
    await logUsageEvent({
      request_id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      actor_type: userId ? 'user' : 'guest',
      user_id: userId,
      identity_key,
      ip_hash: hashIp(ip),
      tool: input.tool,
      endpoint: input.endpoint,
      provider,
      model,
      outcome: input.success ? 'SUCCESS_CHARGED' : (input.error_code === 'AI_LIMIT_REACHED' ? 'BLOCKED_QUOTA' : input.error_code === 'AI_DUPLICATE_REQUEST' ? 'BLOCKED_RATE_LIMIT' : userId ? 'ERROR_UPSTREAM' : 'UNAUTHORIZED'),
      http_status: input.http_status ?? null,
      error_code: input.error_code ?? null,
      retryable: !!input.error_code,
      units: input.charged_units ?? 1,
      charged_units: input.success ? (input.charged_units ?? 1) : 0,
      membership: input.membership ?? null,
      latency_ms: input.latency_ms ?? null,
      user_agent: input.req?.headers?.['user-agent'] || input.req?.headers?.['User-Agent'] || null,
      estimated_cost_usd: estimateCostUSD({ provider, model, charged_units: input.success ? (input.charged_units ?? 1) : 0, tool: input.tool }),
      // extra fields are ignored by typed function but DB can have them if mapped later
    } as any);
  } catch {
    // ignore
  }
}
