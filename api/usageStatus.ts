export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized.' });
    }

    // Dynamic import keeps ESM/CJS load issues inside try/catch.
    const { getAiUsageStatus } = await import('./lib/usage');

    const status = await getAiUsageStatus(request);
    if (!status.ok) {
      return response
        .status(status.status || 503)
        .json({ error: status.error || 'Usage status unavailable.' });
    }

    return response.status(200).json(status);
  } catch (err: any) {
    console.error('usageStatus error:', err);
    return response.status(500).json({ error: err?.message || 'Usage status failed.' });
  }
}
