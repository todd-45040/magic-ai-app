import { requireSupabaseAuth } from '../_auth.js';
import { resolveBillingStatusForUser } from '../../server/billing/status.js';

export default async function handler(request: any, response: any) {
  try {
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await requireSupabaseAuth(request);
    if (!auth.ok) {
      return response.status(auth.status).json({ error: auth.error || 'Unauthorized' });
    }

    const status = await resolveBillingStatusForUser(auth.admin, auth.userId);
    return response.status(200).json(status);
  } catch (err: any) {
    console.error('billing/status error:', err);
    return response.status(500).json({ error: err?.message || 'billing status failed' });
  }
}
