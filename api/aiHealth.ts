import { requireSupabaseAuth } from '../server/auth';
import { getGeminiApiKey } from '../server/gemini';

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
  const auth = await requireSupabaseAuth(request);
  if (!auth.ok) {
    return response.status(auth.status).json({ error: auth.error });
  }

  const hasApiKey = !!getGeminiApiKey();
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
