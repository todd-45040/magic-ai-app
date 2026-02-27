import { requireSupabaseAuth } from './_auth.js';
import { renderFoundingEmail, type FoundingEmailKey } from './_lib/foundingCircleEmailTemplates.js';

function clampInt(n: any, def = 100, min = 1, max = 2000) {
  const v = Number(n);
  if (!Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

/**
 * Admin-only endpoint to enqueue a single email template to ALL founders.
 *
 * POST /api/adminQueueFoundersEmail
 * Body: { template_key: 'founding_welcome' | ..., send_at?: ISO, delay_hours?: number }
 */
export default async function handler(req: any, res: any) {
  try {
    const auth = await requireSupabaseAuth(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const { admin, userId } = auth as any;

    // Admin-only gate
    const { data: me, error: meErr } = await admin.from('users').select('id,is_admin').eq('id', userId).maybeSingle();
    if (meErr) return res.status(500).json({ ok: false, error: 'Admin check failed', details: meErr });
    if (!me?.is_admin) return res.status(403).json({ ok: false, error: 'Forbidden' });

    const body = typeof req?.body === 'string' ? JSON.parse(req.body) : req?.body || {};
    const template_key = String(body?.template_key || '').trim() as FoundingEmailKey;
    if (!template_key) return res.status(400).json({ ok: false, error: 'template_key is required' });

    // Validate template key early (throws if missing)
    try {
      renderFoundingEmail(template_key, { name: null, email: 'test@example.com' });
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid template_key' });
    }

    const limit = clampInt(body?.limit ?? 500, 500, 1, 2000);
    const delayHours = Number(body?.delay_hours ?? 0);
    const sendAtIso =
      String(body?.send_at || '').trim() ||
      new Date(Date.now() + (Number.isFinite(delayHours) ? delayHours : 0) * 60 * 60 * 1000).toISOString();

    // Founders-only segmentation query
    const { data: founders, error: fErr } = await admin
      .from('users')
      .select('id,email')
      .eq('founding_circle_member', true)
      .not('email', 'is', null)
      .limit(limit);
    if (fErr) return res.status(500).json({ ok: false, error: 'Founder query failed', details: fErr });

    const toEmails = (founders || [])
      .map((u: any) => String(u.email || '').trim())
      .filter(Boolean);

    if (toEmails.length === 0) return res.status(200).json({ ok: true, queued: 0, note: 'No founders with email found' });

    // Best-effort dedupe: do not enqueue if already queued/sent for this template.
    const { data: existing, error: eErr } = await admin
      .from('maw_email_queue')
      .select('to_email')
      .in('to_email', toEmails)
      .eq('template_key', template_key)
      .in('status', ['queued', 'sent', 'error'])
      .limit(5000);
    if (eErr) {
      // If this query fails, still proceed (admin can re-run later).
      console.warn('dedupe query failed', eErr);
    }

    const existingSet = new Set((existing || []).map((r: any) => String(r.to_email || '').toLowerCase()));
    const rows = toEmails
      .filter((email: string) => !existingSet.has(email.toLowerCase()))
      .map((email: string) => ({ to_email: email, template_key, send_at: sendAtIso, payload: { email } }));

    if (rows.length === 0) return res.status(200).json({ ok: true, queued: 0, note: 'All founders already had this template queued/sent' });

    const { error: insErr } = await admin.from('maw_email_queue').insert(rows);
    if (insErr) return res.status(500).json({ ok: false, error: 'Queue insert failed', details: insErr });

    return res.status(200).json({ ok: true, queued: rows.length, send_at: sendAtIso, template_key });
  } catch (e: any) {
    console.error('adminQueueFoundersEmail error', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
