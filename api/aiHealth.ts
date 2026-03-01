import { getGoogleAiApiKey } from '../server/gemini.js';
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

  const hasGoogleAiKey = !!getGoogleAiApiKey();
  const hasSupabaseUrl = !!process.env.SUPABASE_URL;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // We treat AI as "Gemini via /api/generate" in the current build.
  return response.status(200).json({
    provider: 'gemini',
    proxyRoute: '/api/generate',
    env: {
      GOOGLE_AI_API_KEY: hasGoogleAiKey,
      SUPABASE_URL: hasSupabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceRole,
    },
  });
}
