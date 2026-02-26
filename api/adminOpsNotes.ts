import { requireSupabaseAuth } from './_auth.js';

function isMissingRelation(err: any) {
  const msg = String(err?.message || err || '');
  return msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('relation') || msg.toLowerCase().includes('42p01');
}

function clampInt(n: any, def = 25, min = 1, max = 200) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate
    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    if (req.method === 'GET') {
      const entity_type = String(req?.query?.entity_type ?? '').trim();
      const entity_id = String(req?.query?.entity_id ?? '').trim();
      const limit = clampInt(req?.query?.limit ?? 25, 25, 1, 200);

      if (!entity_type || !entity_id) return res.status(400).json({ ok: false, error: 'Missing entity_type or entity_id' });

      const { data, error } = await admin
        .from('admin_ops_notes')
        .select('id,entity_type,entity_id,note,created_at,created_by')
        .eq('entity_type', entity_type)
        .eq('entity_id', entity_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingRelation(error)) return res.status(200).json({ ok: false, error: 'admin_ops_notes table not installed' });
        return res.status(500).json({ ok: false, error: 'Failed to load notes', details: error });
      }

      return res.status(200).json({ ok: true, notes: data || [] });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const entity_type = String(body.entity_type ?? '').trim();
      const entity_id = String(body.entity_id ?? '').trim();
      const note = String(body.note ?? '').trim();

      if (!entity_type || !entity_id || !note) return res.status(400).json({ ok: false, error: 'Missing entity_type, entity_id, or note' });

      const { data, error } = await admin
        .from('admin_ops_notes')
        .insert({ entity_type, entity_id, note, created_by: userId })
        .select('id,entity_type,entity_id,note,created_at,created_by')
        .maybeSingle();

      if (error) {
        if (isMissingRelation(error)) return res.status(200).json({ ok: false, error: 'admin_ops_notes table not installed' });
        return res.status(500).json({ ok: false, error: 'Failed to add note', details: error });
      }

      return res.status(200).json({ ok: true, note: data });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('adminOpsNotes error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'adminOpsNotes failed' });
  }
}
