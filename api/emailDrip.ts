import { createClient } from '@supabase/supabase-js';
import { sendMail, isMailerConfigured } from './_lib/mailer.js';
import { renderFoundingEmail, type FoundingEmailKey } from './_lib/foundingCircleEmailTemplates.js';

function isUndefinedColumn(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '');
  if (code === '42703') return true; // undefined_column
  if (code === 'PGRST204') return true; // schema cache missing column
  if (/schema\s+cache/i.test(msg) && /could\s+not\s+find/i.test(msg)) return true;
  if (/column\s+.+\s+does not exist/i.test(msg)) return true;
  return false;
}

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
    return res.status(503).json({ ok: false, error: 'Mailer not configured (missing RESEND_API_KEY/MAIL_FROM)' });
  }

  const limit = Math.min(50, Math.max(1, Number(req?.query?.limit || 20)));

  const maxAttempts = Math.min(10, Math.max(1, Number(req?.query?.max_attempts || 5)));
  const baseBackoffMinutes = Math.min(240, Math.max(1, Number(req?.query?.backoff_min || 15))); // default 15m

  try {
    const nowIso = new Date().toISOString();

    // Pull eligible work (queued + retryable error rows) honoring send_at.
    const { data: queue, error } = await admin
      .from('maw_email_queue')
      .select('id,to_email,template_key,template_version,tracking_id,payload,status,send_at,attempt_count')
      .in('status', ['queued', 'error'])
      .lte('send_at', nowIso)
      .order('send_at', { ascending: true })
      .limit(limit);

    if (error) {
      return res.status(500).json({ ok: false, error: 'Queue read failed', details: error });
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of (queue || []) as any[]) {
      const id = String(item.id || '');
      const to = String(item.to_email || '').trim();
      const template = String(item.template_key || '') as FoundingEmailKey;
      const payload = (item.payload || {}) as any;

      const attemptCount = Number(item.attempt_count || 0);

      if (!id || !to || !template) continue;

      // Activation-aware drip: If this is the Day-1 Founder activation nudge,
      // only send if the user has NOT saved an idea yet.
      if (template === ('founder_activation_day1' as any)) {
        try {
          let uid = String(payload?.user_id || '').trim();
          if (!uid) {
            const { data: urow } = await admin.from('users').select('id').eq('email', to).maybeSingle();
            uid = String((urow as any)?.id || '').trim();
          }

          if (uid) {
            const { count, error: cErr } = await admin
              .from('ideas')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid);

            if (!cErr && Number(count || 0) > 0) {
              // Mark skipped so it doesn't retry forever.
              await admin
                .from('maw_email_queue')
                .update({ status: 'skipped', sent_at: new Date().toISOString(), last_error: 'activation_already_complete' } as any)
                .eq('id', id);
              skipped += 1;
              continue;
            }
          }
        } catch {
          // If check fails, default to sending (don't block founders from receiving it).
        }
      }

      if (Number.isFinite(attemptCount) && attemptCount >= maxAttempts) {
        skipped += 1;
        continue;
      }

      // Best-effort claim to reduce double-sends if cron overlaps.
      try {
        await admin
          .from('maw_email_queue')
          .update({ status: 'sending' } as any)
          .eq('id', id)
          .in('status', ['queued', 'error']);
      } catch {
        // ignore
      }

      const baseUrl = getEnv('APP_BASE_URL') || getEnv('PUBLIC_APP_URL') || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || 'https://magicaiwizard.com';
      const rendered = renderFoundingEmail(template, { name: payload?.name ?? null, email: to }, { trackingId: item.tracking_id ?? null, baseUrl, templateVersion: item.template_version ?? null });
      const r = await sendMail({ to, subject: rendered.subject, html: rendered.html, text: rendered.text });

      if (r.ok) {
        sent += 1;
        await admin
          .from('maw_email_queue')
          .update(
            {
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
              last_attempt_at: new Date().toISOString(),
              provider_message_id: (r as any).messageId || null,
              template_version: item.template_version ?? (rendered as any).templateVersion ?? null,
            } as any
          )
          .eq('id', id);
      } else {
        failed += 1;

        // Retry policy:
        const nextAttempt = attemptCount + 1;
        const backoffMinutes = Math.min(24 * 60, baseBackoffMinutes * Math.pow(2, Math.max(0, nextAttempt - 1)));
        const nextSendAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        const updatePayload: any = {
          status: 'error',
          last_error: r.error,
          send_at: nextSendAt,
          last_attempt_at: new Date().toISOString(),
              provider_message_id: (r as any).messageId || null,
              template_version: item.template_version ?? (rendered as any).templateVersion ?? null,
          attempt_count: nextAttempt,
        };

        const { error: updErr } = await admin.from('maw_email_queue').update(updatePayload).eq('id', id);
        if (updErr && isUndefinedColumn(updErr)) {
          await admin
            .from('maw_email_queue')
            .update({ status: 'error', last_error: r.error, send_at: nextSendAt } as any)
            .eq('id', id);
        }
      }
    }

    // Reset any claimed-but-not-updated rows back to error so they can be retried.
    try {
      await admin
        .from('maw_email_queue')
        .update({ status: 'error' } as any)
        .eq('status', 'sending')
        .lte('send_at', nowIso);
    } catch {
      // ignore
    }

    return res.status(200).json({ ok: true, processed: (queue || []).length, sent, failed, skipped });
  } catch (e: any) {
    console.error('emailDrip error', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
