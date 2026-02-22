import { requireSupabaseAuth } from './_auth.js';

// Admin-only access to App Feedback (public.app_suggestions)
// Supports:
//  - GET    /api/adminSuggestions?status=all|new|reviewing|resolved|archived&limit=200
//  - POST   /api/adminSuggestions  { id: string, status: 'new'|'reviewing'|'resolved'|'archived' }
//  - DELETE /api/adminSuggestions?id=<suggestionId>

const ALLOWED_STATUS = new Set(['new', 'reviewing', 'resolved', 'archived']);

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    const { data: me, error: meErr } = await admin
      .from('users')
      .select('id,is_admin')
      .eq('id', userId)
      .maybeSingle();

    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (req.method === 'GET') {
      const status = String(req?.query?.status ?? 'all');
      const limit = Math.min(500, Math.max(1, Number(req?.query?.limit ?? 200)));

      let q = admin
        .from('app_suggestions')
        .select('id,type,content,timestamp,status,user_id,user_email')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (status !== 'all') {
        if (!ALLOWED_STATUS.has(status)) {
          return res.status(400).json({ ok: false, error: 'Invalid status filter' });
        }
        q = q.eq('status', status);
      }

      const { data, error } = await q;
      if (error) return res.status(500).json({ ok: false, error: 'Read failed', details: error });

      return res.status(200).json({ ok: true, suggestions: data ?? [] });
    }

    if (req.method === 'POST') {
      const { id, status } = (req.body ?? {}) as { id?: string; status?: string };
      if (!id || typeof id !== 'string') return res.status(400).json({ ok: false, error: 'Missing id' });
      if (!status || typeof status !== 'string' || !ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status' });
      }

      const { error } = await admin
        .from('app_suggestions')
        .update({ status })
        .eq('id', id);

      if (error) return res.status(500).json({ ok: false, error: 'Update failed', details: error });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = String(req?.query?.id ?? '');
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      const { error } = await admin.from('app_suggestions').delete().eq('id', id);
      if (error) return res.status(500).json({ ok: false, error: 'Delete failed', details: error });

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  } catch (err: any) {
    console.error('adminSuggestions error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
