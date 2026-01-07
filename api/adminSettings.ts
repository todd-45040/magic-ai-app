import { requireAdmin } from '../server/auth';

type AdminAIProvider = 'gemini' | 'openai' | 'anthropic';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req as any);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    if (req.method === 'GET') {
      const { data, error } = await auth.admin
        .from('app_settings')
        .select('value')
        .eq('key', 'ai_defaults')
        .maybeSingle();

      if (error && String(error.message || '').includes('does not exist')) {
        // Table not created yet; return safe defaults
        return json(res, 200, { defaultProvider: 'gemini' as AdminAIProvider, note: 'app_settings table not found; using defaults.' });
      }

      const provider = (data?.value?.provider as AdminAIProvider) || 'gemini';
      return json(res, 200, { defaultProvider: provider });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const provider: AdminAIProvider = body.defaultProvider || 'gemini';

      const payload = { key: 'ai_defaults', value: { provider }, updated_at: new Date().toISOString() };

      const { error } = await auth.admin
        .from('app_settings')
        .upsert(payload, { onConflict: 'key' });

      if (error) return json(res, 500, { error: error.message || String(error) });

      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e: any) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
