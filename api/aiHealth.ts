import { createClient } from '@supabase/supabase-js';

function parseBearer(req: any): string | null {
  const h = req?.headers?.authorization || req?.headers?.Authorization;
  if (!h || typeof h !== 'string') return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Lightweight server-side AI configuration check.
 *
 * This is intentionally safe: it does NOT reveal secrets.
 * Use it from the browser to confirm the deployment can run AI calls.
 */
export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Require a valid Supabase JWT (hard block).
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = parseBearer(request);

  if (!supabaseUrl || !serviceKey) {
    return response.status(503).json({ error: 'Server auth is not configured.' });
  }
  if (!token || token === 'guest') {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  const hasApiKey = !!process.env.API_KEY;
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // We treat AI as "Gemini via /api/generate" in the current build.
  return response.status(200).json({
    provider: 'gemini',
    proxyRoute: '/api/generate',
    env: {
      API_KEY: hasApiKey,
      SUPABASE_URL: hasSupabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceRole,
    },
  });
}
