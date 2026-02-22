// ESM on Vercel: include extension for relative imports.
import { enforceLiveMinutes, getAiUsageStatus } from '../server/usage';

export default async function handler(request: any, response: any) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized.' });
    }

    if (request.method === 'GET') {
      // Return combined usage status (includes live fields)
      const status = await getAiUsageStatus(request);
      if (!status.ok) {
        return response.status(status.status || 503).json({ error: status.error || 'Usage status unavailable.' });
      }
      return response.status(200).json({
        ok: true,
        membership: status.membership,
        liveUsed: status.liveUsed ?? 0,
        liveLimit: status.liveLimit ?? 0,
        liveRemaining: status.liveRemaining ?? 0,
      });
    }

    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const minutes = Number(request.body?.minutes ?? 0);
    const result = await enforceLiveMinutes(request, minutes);
    if (!result.ok) {
      return response.status(result.status || 429).json({
        error: result.error || 'Daily live rehearsal limit reached.',
        membership: result.membership,
        liveUsed: result.liveUsed,
        liveLimit: result.liveLimit,
        liveRemaining: result.liveRemaining,
      });
    }

    return response.status(200).json({
      ok: true,
      membership: result.membership,
      liveUsed: result.liveUsed,
      liveLimit: result.liveLimit,
      liveRemaining: result.liveRemaining,
    });
  } catch (err: any) {
    console.error('liveMinutes error:', err);
    return response.status(500).json({ error: err?.message || 'liveMinutes failed' });
  }
}
