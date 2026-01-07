import { getAiUsageStatus } from '../server/usage';
import { requireSupabaseAuth } from '../server/auth';

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Hard-block invalid/missing Supabase JWT
  const auth = await requireSupabaseAuth(request);
  if (!auth.ok) {
    return response.status(auth.status).json({ error: auth.error });
  }

  try {
    const status = await getAiUsageStatus(request);
    if (!status.ok) {
      return response.status(status.status || 503).json({ error: status.error || 'Usage status unavailable.' });
    }
    return response.status(200).json(status);
  } catch (err: any) {
    // Avoid Vercel FUNCTION_INVOCATION_FAILED by always returning a response
    const message = err?.message || String(err);
    return response.status(500).json({ error: 'Usage status failed.', detail: message });
  }
}
