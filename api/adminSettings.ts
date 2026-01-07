import { requireSupabaseAuth } from '../server/auth';
import type { AIProvider } from '../server/providers';
import { getAppSettings, setAppSettings } from '../server/settings';

function normProvider(v: any): AIProvider | null {
  const s = String(v || '').toLowerCase().trim();
  if (s === 'gemini' || s === 'openai' || s === 'anthropic') return s as AIProvider;
  return null;
}

export default async function handler(request: any, response: any) {
  // Require a valid Supabase JWT (hard block).
  const auth = await requireSupabaseAuth(request);
  if (!auth.ok) {
    return response.status(auth.status).json({ error: auth.error });
  }

  const admin = (auth as any).admin as any;
  const userId = (auth as any).userId as string;

  // Enforce admin-only.
  const { data: me, error: meErr } = await admin
    .from('users')
    .select('id, is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (meErr) console.error('AdminSettings check error:', meErr);
  if (!me?.is_admin) {
    return response.status(403).json({ error: 'Admin access required.' });
  }

  if (request.method === 'GET') {
    const settings = await getAppSettings(admin);
    return response.status(200).json({ settings });
  }

  if (request.method === 'POST') {
    const next = normProvider(request.body?.aiProvider);
    if (!next) return response.status(400).json({ error: 'Invalid aiProvider.' });

    const settings = await setAppSettings(admin, { aiProvider: next });
    return response.status(200).json({ settings });
  }

  return response.status(405).json({ error: 'Method not allowed' });
}
