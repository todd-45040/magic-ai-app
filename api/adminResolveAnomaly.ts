import { requireSupabaseAuth } from './_auth';

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    const { data: me } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const { id, resolved } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

    const isResolved = resolved === false ? false : true;

    const { error } = await admin
      .from('ai_anomaly_flags')
      .update({ resolved: isResolved, resolved_at: isResolved ? new Date().toISOString() : null })
      .eq('id', id);

    if (error) return res.status(500).json({ ok: false, error: 'Update failed', details: error });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('adminResolveAnomaly error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
