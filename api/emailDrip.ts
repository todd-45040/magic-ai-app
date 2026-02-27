import { createClient } from '@supabase/supabase-js';
import { sendMail, isMailerConfigured } from './_lib/mailer.js';
import { renderFoundingEmail, type FoundingEmailKey } from './_lib/foundingCircleEmailTemplates.js';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getAdminClient() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

export default async function handler(req: any, res: any) {
  // This endpoint is designed for Vercel Cron (or manual admin trigger).
  // Keep it locked with a secret.
  const secret = getEnv('EMAIL_DRIP_SECRET');
  if (secret) {
    const got = String(req?.headers?.['x-cron-secret'] || req?.query?.secret || '');
    if (got !== secret) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const admin = getAdminClient();
  if (!admin) return res.status(503).json({ ok: false, error: 'Supabase admin unavailable' });

  if (!isMailerConfigured()) {
    return res.status(503).json({ ok: false, error: 'Mailer not configured (SMTP_* env vars missing)' });
  }

  const limit = Math.min(50, Math.max(1, Number(req?.query?.limit || 20)));

  try {
    const nowIso = new Date().toISOString();

    const { data: queue, error } = await admin
      .from('maw_email_queue')
      .select('id,to_email,template_key,payload')
      .eq('status', 'queued')
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true })
      .limit(limit);

    if (error) {
      return res.status(500).json({ ok: false, error: 'Queue read failed', details: error });
    }

    let sent = 0;
    let failed = 0;

    for (const item of (queue || []) as any[]) {
      const id = String(item.id || '');
      const to = String(item.to_email || '').trim();
      const template = String(item.template_key || '') as FoundingEmailKey;
      const payload = (item.payload || {}) as any;

      if (!id || !to || !template) continue;

      const rendered = renderFoundingEmail(template, { name: payload?.name ?? null, email: to });
      const r = await sendMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });

      if (r.ok) {
        sent += 1;
        await admin
          .from('maw_email_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
          .eq('id', id);
      } else {
        failed += 1;
        await admin
          .from('maw_email_queue')
          .update({ status: 'error', last_error: r.error })
          .eq('id', id);
      }
    }

    return res.status(200).json({ ok: true, processed: (queue || []).length, sent, failed });
  } catch (e: any) {
    console.error('emailDrip error', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
