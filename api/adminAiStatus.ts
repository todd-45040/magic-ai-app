import { requireAdmin } from '../lib/server/auth/index.js';
import { resolveProvider, type AIProvider } from '../lib/server/providers/index.js';
import { getGoogleAiApiKey } from '../server/gemini.js';
import { TOOL_SUPPORT, getProviderLimitations } from '../lib/server/ai/toolSupport.js';

type Source = 'db' | 'env' | 'default';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function normProvider(v: any): AIProvider | null {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'gemini' || s === 'openai' || s === 'anthropic') return s as AIProvider;
  return null;
}

function hasGeminiKey(): boolean {
  return Boolean(getGoogleAiApiKey());
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req as any);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    // DB setting (what admin selected)
    let dbProvider: AIProvider | null = null;
    const { data, error } = await auth.admin
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_defaults')
      .maybeSingle();

    if (!(error && String(error.message || '').includes('does not exist'))) {
      const v = (data as any)?.value;
      dbProvider = normProvider(v?.provider);
    }

    const envProvider = normProvider(process.env.AI_PROVIDER);
    const envOverrideActive = Boolean(envProvider);

    const runtimeProvider = await resolveProvider(req);
    const defaultProvider = (dbProvider || 'gemini') as AIProvider;

    const source: Source = envOverrideActive ? 'env' : dbProvider ? 'db' : 'default';

    const limitationInfo = getProviderLimitations(runtimeProvider);

    return json(res, 200, {
      defaultProvider,
      runtimeProvider,
      source,
      envOverrideActive,
      tool_support: TOOL_SUPPORT,
      limitations: limitationInfo.limitations,
      limitations_count: limitationInfo.limitations_count,
      keys: {
        openai: { configured: Boolean(process.env.OPENAI_API_KEY) },
        gemini: { configured: hasGeminiKey() },
        anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY) },
      },
    });
  } catch (e: any) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
