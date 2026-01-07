import { getAiUsageStatus } from './lib/usage';

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return response.status(401).json({ error: 'Unauthorized.' });
  }

  const status = await getAiUsageStatus(request);
  if (!status.ok) {
    return response.status(status.status || 503).json({ error: status.error || 'Usage status unavailable.' });
  }

  return response.status(200).json(status);
}
