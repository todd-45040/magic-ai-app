import { requireAdmin } from '../lib/server/auth/index.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

type FeedbackRow = {
  id: string;
  created_at: string;
  received_at: string | null;
  source: string;
  status: string;
  message_id: string | null;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  meta: any | null;
};

export default async function handler(req: any, res: any) {
  try {
    const auth = await requireAdmin(req as any);
    if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

    const table = 'maw_founder_feedback';

    if (req.method === 'GET') {
      const q = (req?.query || {}) as any;
      const limit = Math.min(500, Math.max(1, Number(q.limit || 200)));
      const status = String(q.status || 'new'); // new | archived | all

      let query = auth.admin.from(table).select('*').order('received_at', { ascending: false }).limit(limit);
      if (status !== 'all') query = query.eq('status', status);

      const { data, error } = await query;
      if (error) return json(res, 500, { ok: false, error: error.message });

      return json(res, 200, { ok: true, rows: (data || []) as FeedbackRow[] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const row = {
        received_at: body.received_at || null,
        source: body.source || 'manual',
        status: body.status || 'new',
        message_id: body.message_id || null,
        from_email: String(body.from_email || '').trim(),
        from_name: body.from_name || null,
        subject: body.subject || null,
        body_text: body.body_text || null,
        body_html: body.body_html || null,
        meta: body.meta || null,
      };

      if (!row.from_email) return json(res, 400, { ok: false, error: 'from_email is required' });

      const { data, error } = await auth.admin.from(table).insert(row).select('*').maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      return json(res, 200, { ok: true, row: data });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = String(body.id || '').trim();
      if (!id) return json(res, 400, { ok: false, error: 'id is required' });

      const patch: any = {};
      for (const k of ['received_at','source','status','message_id','from_email','from_name','subject','body_text','body_html','meta']) {
        if (Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k];
      }

      const { data, error } = await auth.admin.from(table).update(patch).eq('id', id).select('*').maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      return json(res, 200, { ok: true, row: data });
    }

    if (req.method === 'DELETE') {
      const q = (req?.query || {}) as any;
      const id = String(q.id || '').trim();
      if (!id) return json(res, 400, { ok: false, error: 'id is required' });

      const { error } = await auth.admin.from(table).delete().eq('id', id);
      if (error) return json(res, 500, { ok: false, error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
