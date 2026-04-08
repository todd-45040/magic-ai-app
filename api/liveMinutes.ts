// ESM on Vercel: include extension for relative imports.
import { enforceLiveMinutes, getAiUsageStatus } from '../server/usage.js';

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

      const daily = status.quota?.live_audio_minutes?.daily;
      return response.status(200).json({
        ok: true,
        membership: status.membership,
        liveUsed: daily?.used ?? 0,
        liveLimit: daily?.limit ?? 0,
        liveRemaining: daily?.remaining ?? 0,
      });
    }

    if (request.method !== 'POST') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const minutes = Number(request.body?.minutes ?? 0);
    const result = await enforceLiveMinutes(request, minutes, { route: 'liveMinutes' });
    if (!result.ok) {
      return response.status(result.status || 429).json({
        ok: false,
        code: 'quota_exceeded',
        reason: result.reason,
        message: result.error || 'Daily live rehearsal limit reached.',
        error: result.error || 'Daily live rehearsal limit reached.',
        membership: result.membership,
        usage: {
          remainingDaily: result.remainingDailyMinutes ?? result.liveRemaining ?? 0,
          remainingMonthly: result.remainingMonthlyMinutes ?? 0,
        },
        liveUsed: result.liveUsed,
        liveLimit: result.liveLimit,
        liveRemaining: result.liveRemaining,
        remainingDailyMinutes: result.remainingDailyMinutes,
        remainingMonthlyMinutes: result.remainingMonthlyMinutes,
        burstRemaining: result.burstRemaining,
        burstLimit: result.burstLimit,
      });
    }

    return response.status(200).json({
      ok: true,
      membership: result.membership,
      liveUsed: result.liveUsed,
      liveLimit: result.liveLimit,
      liveRemaining: result.liveRemaining,
      remainingDailyMinutes: result.remainingDailyMinutes,
      remainingMonthlyMinutes: result.remainingMonthlyMinutes,
      burstRemaining: result.burstRemaining,
      burstLimit: result.burstLimit,
    });
  } catch (err: any) {
    console.error('liveMinutes error:', err);
    return response.status(500).json({ error: err?.message || 'liveMinutes failed' });
  }
}
