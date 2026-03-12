import { handleAiRequest } from '../../../server/ai/handleAiRequest.js';

export default async function handler(req: any, res: any) {
  return handleAiRequest(req, res, {
    tool: 'live_rehearsal_start',
    endpoint: '/api/ai/live-rehearsal/start',
    costTier: 'high',
    cooldownMs: 30_000,
    run: async () => ({ sessionMode: 'local-fallback', enabled: false, message: 'Live rehearsal server session broker is not enabled in this build.' }),
    normalize: (result) => result,
  });
}
