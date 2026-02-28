import { getSupabaseAdmin } from '../lib/server/auth/index.js';

function json(res: any, status: number, body: any) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function getSecret(req: any): string | null {
  const h: any = req?.headers;
  const v =
    (typeof h?.get === 'function' ? (h.get('x-inbound-secret') || h.get('X-Inbound-Secret')) : (h?.['x-inbound-secret'] || h?.['X-Inbound-Secret'])) ||
    (req?.query ? (req.query.secret || req.query.token) : null);
  return v ? String(v) : null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

    const expected = process.env.INBOUND_MAIL_SECRET ? String(process.env.INBOUND_MAIL_SECRET) : '';
    if (!expected) return json(res, 500, { ok: false, error: 'INBOUND_MAIL_SECRET not configured' });

    const provided = getSecret(req);
    if (!provided || provided !== expected) return json(res, 401, { ok: false, error: 'Unauthorized' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Provider-agnostic payload shape (works with Zapier/webhook forwarders)
    const from_email = String(body.from_email || body.from || body.sender || '').trim();
    const from_name = body.from_name || body.name || null;
    const subject = body.subject || null;
    const body_text = body.body_text || body.text || body.plain || null;
    const body_html = body.body_html || body.html || null;
    const message_id = body.message_id || body.messageId || body.id || null;

    if (!from_email) return json(res, 400, { ok: false, error: 'from_email (or from) is required' });

    const row = {
      received_at: body.received_at || new Date().toISOString(),
      source: body.source || 'webhook',
      status: 'new',
      message_id,
      from_email,
      from_name,
      subject,
      body_text,
      body_html,
      meta: body.meta || body,
    };

    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from('maw_founder_feedback').insert(row).select('id').maybeSingle();
    if (error) {
      // If duplicate message_id (unique index), treat as OK
      if (String(error.message || '').toLowerCase().includes('duplicate')) {
        return json(res, 200, { ok: true, deduped: true });
      }
      return json(res, 500, { ok: false, error: error.message });
    }

    return json(res, 200, { ok: true, id: data?.id });
  } catch (e: any) {
    return json(res, 500, { ok: false, error: e?.message || String(e) });
  }
}
