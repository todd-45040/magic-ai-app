import { requireAdmin } from '../lib/server/auth/index.js';
import { resolveProvider, type AIProvider } from '../lib/server/providers/index.js';
import { TOOL_SUPPORT, getProviderLimitations } from '../lib/server/ai/toolSupport.js';

type Source = 'db' | 'env' | 'default';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function clampDays(v: any, fallback = 7) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(90, Math.round(n)));
}

function isoAgo(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function normProvider(v: any): AIProvider | null {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'gemini' || s === 'openai' || s === 'anthropic') return s as AIProvider;
  return null;
}

function hasGeminiKey(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.API_KEY
  );
}

function percentile(nums: number[], p: number): number | null {
  const arr = (nums || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.ceil(p * arr.length) - 1));
  return arr[idx];
}

function isErrorOutcome(outcome: any): boolean {
  const o = String(outcome || '').toLowerCase();
  if (!o) return false;
  return o !== 'success' && o !== 'ok';
}

function sanitizeErrorRow(r: any) {
  return {
    occurred_at: r?.occurred_at ? String(r.occurred_at) : null,
    provider: r?.provider ? String(r.provider) : null,
    tool: r?.tool ? String(r.tool) : null,
    endpoint: r?.endpoint ? String(r.endpoint) : null,
    outcome: r?.outcome ? String(r.outcome) : null,
    http_status: r?.http_status ?? null,
    error_code: r?.error_code ?? null,
    request_id: r?.request_id ? String(r.request_id).slice(0, 18) : null,
  };
}

function rollup(rows: any[]) {
  const lat: number[] = [];
  let calls = 0;
  let errors = 0;
  let cost = 0;
  for (const r of rows || []) {
    calls += 1;
    if (isErrorOutcome(r?.outcome)) errors += 1;
    const c = Number(r?.estimated_cost_usd || 0);
    if (Number.isFinite(c)) cost += c;
    const l = Number(r?.latency_ms);
    if (Number.isFinite(l)) lat.push(l);
  }
  const p95 = percentile(lat, 0.95);
  const error_rate = calls > 0 ? errors / calls : null;
  return {
    calls,
    errors,
    error_rate,
    p95_latency_ms: p95,
    cost_usd: Math.round(cost * 10000) / 10000,
  };
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req as any);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    const days = clampDays(req?.query?.days, 7);
    const sinceIso = isoAgo(days * 24 * 60 * 60 * 1000);
    const since60mIso = isoAgo(60 * 60 * 1000);
    const since24hIso = isoAgo(24 * 60 * 60 * 1000);

    // Determine DB provider (for source reporting)
    let dbProvider: AIProvider | null = null;
    const { data: settingRow, error: settingErr } = await auth.admin
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_defaults')
      .maybeSingle();

    if (!(settingErr && String(settingErr.message || '').includes('does not exist'))) {
      const v = (settingRow as any)?.value;
      dbProvider = normProvider(v?.provider);
    }

    const envProvider = normProvider(process.env.AI_PROVIDER);
    const envOverrideActive = Boolean(envProvider);
    const runtimeProvider = await resolveProvider(req);
    const source: Source = envOverrideActive ? 'env' : dbProvider ? 'db' : 'default';

    // last 60 minutes rollup
    const { data: ev60, error: ev60Err } = await auth.admin
      .from('ai_usage_events')
      .select('provider,outcome,latency_ms,estimated_cost_usd,occurred_at')
      .gte('occurred_at', since60mIso)
      .limit(50000);
    if (ev60Err) return json(res, 500, { error: 'Telemetry scan failed (60m)', details: ev60Err });

    // last 24h rollup
    const { data: ev24, error: ev24Err } = await auth.admin
      .from('ai_usage_events')
      .select('provider,outcome,latency_ms,estimated_cost_usd,occurred_at')
      .gte('occurred_at', since24hIso)
      .limit(200000);
    if (ev24Err) return json(res, 500, { error: 'Telemetry scan failed (24h)', details: ev24Err });

    // window rollup (days)
    const { data: evWin, error: evWinErr } = await auth.admin
      .from('ai_usage_events')
      .select('provider,outcome,latency_ms,estimated_cost_usd,occurred_at')
      .gte('occurred_at', sinceIso)
      .limit(200000);
    if (evWinErr) return json(res, 500, { error: 'Telemetry scan failed (window)', details: evWinErr });

    // Provider breakdown over window
    const bucket: Record<string, any[]> = { gemini: [], openai: [], anthropic: [] };
    for (const r of (evWin || []) as any[]) {
      const p = normProvider(r?.provider) || 'gemini';
      (bucket[p] = bucket[p] || []).push(r);
    }

    const by_provider = (['gemini', 'openai', 'anthropic'] as AIProvider[]).map((p) => ({
      provider: p,
      ...rollup(bucket[p] || []),
    }));

    // Recent errors (last 10)
    const { data: errRows } = await auth.admin
      .from('ai_usage_events')
      .select('request_id,provider,tool,endpoint,outcome,http_status,error_code,occurred_at')
      .gte('occurred_at', since24hIso)
      .neq('outcome', 'success')
      .order('occurred_at', { ascending: false })
      .limit(10);

    const recent_errors = ((errRows || []) as any[]).map(sanitizeErrorRow);

    const limitationInfo = getProviderLimitations(runtimeProvider);

    return json(res, 200, {
      ok: true,
      runtimeProvider,
      source,
      envOverrideActive,
      tool_support: TOOL_SUPPORT,
      limitations: limitationInfo.limitations,
      limitations_count: limitationInfo.limitations_count,
      key_status: {
        openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
        gemini: { configured: hasGeminiKey() },
        anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY) },
      },
      last_60m: rollup((ev60 || []) as any[]),
      last_24h: rollup((ev24 || []) as any[]),
      window: {
        days,
        sinceIso,
        ...rollup((evWin || []) as any[]),
      },
      by_provider,
      recent_errors,
    });
  } catch (e: any) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
