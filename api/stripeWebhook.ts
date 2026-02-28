// Stripe webhook (Founder Allocation Enforcement + Stripe scaffold)
//
// IMPORTANT:
// - Signature verification requires raw body. When you turn Stripe fully live,
//   switch bodyParser off and verify Stripe-Signature properly.
// - This implementation focuses on *allocation enforcement* as a safety net.
//   The primary enforcement should happen pre-checkout in /api/stripeCheckout.
//
// Behavior:
// - If STRIPE_WEBHOOK_SECRET is not set, returns 200 (no-op).
// - If founder pricing is detected and caps are exceeded, cancels the subscription
//   immediately via Stripe API (best-effort), and logs the condition.

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { sendMail, isMailerConfigured } from './_lib/mailer.js';
import { renderFoundingEmail, FOUNDING_EMAIL_TEMPLATE_VERSION } from './_lib/foundingCircleEmailTemplates.js';

export const config = {
  api: {
    // Required for Stripe signature verification.
    bodyParser: false,
  },
};

async function readRawBody(req: any): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string): { ok: boolean; reason?: string } {
  if (!signatureHeader) return { ok: false, reason: 'missing_signature_header' };

  // Stripe-Signature: t=...,v1=...,v1=...
  const parts = signatureHeader.split(',').map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith('t='));
  const v1Parts = parts.filter((p) => p.startsWith('v1='));
  if (!tPart || v1Parts.length === 0) return { ok: false, reason: 'invalid_signature_header' };

  const timestamp = Number(tPart.slice(2));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { ok: false, reason: 'invalid_timestamp' };

  // Tolerance: 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return { ok: false, reason: 'timestamp_out_of_tolerance' };

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');

  for (const p of v1Parts) {
    const sig = p.slice(3);
    if (timingSafeEqual(expected, sig)) return { ok: true };
  }
  return { ok: false, reason: 'signature_mismatch' };
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function getAdminClient() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}


async function enqueueAndMaybeMarkSent(admin: any, row: any) {
  // Insert queue row (best-effort). Supports older schemas where some columns may not exist.
  try {
    const { error } = await admin.from('maw_email_queue').insert(row as any);
    if (!error) return { ok: true };
    return { ok: false, error };
  } catch (e: any) {
    return { ok: false, error: e };
  }
}

function isFounderPricing(meta: any): boolean {
  // Founders are indicated by either founding_member=true OR a pricing_lock value.
  const v = String(meta?.pricing_lock ?? meta?.founding_member ?? '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === '29.95' || v === '2995';
}

function normalizeBucket(meta: any): 'admc_2026' | 'reserve_2026' {
  const b = String(meta?.founding_bucket || meta?.founding_source || '').toLowerCase();
  if (b.includes('reserve')) return 'reserve_2026';
  return 'admc_2026';
}

async function cancelSubscriptionBestEffort(subscriptionId: string, reason: string) {
  const stripeKey = getEnv('STRIPE_SECRET_KEY');
  if (!stripeKey) return { ok: false, error: 'no_stripe_key' };

  try {
    // Cancel immediately (Stripe REST; no SDK dependency).
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as any));
      return { ok: false, error: 'stripe_cancel_failed', details: j, reason };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: 'stripe_cancel_exception', details: String(e?.message || e || ''), reason };
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Not live yet: keep webhook as a safe no-op.
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return res.status(200).json({ ok: true, noop: true });
  }

  const admin = getAdminClient();
  if (!admin) {
    return res.status(200).json({ ok: true, received: false, error: 'supabase_not_configured' });
  }

  try {
    const sig = String(req?.headers?.['stripe-signature'] || '').trim();

    const rawBody = await readRawBody(req);
    const verified = verifyStripeSignature(rawBody, sig, webhookSecret);
    if (!verified.ok) {
      // Invalid webhook: reject (Stripe will retry).
      return res.status(400).json({ ok: false, error: 'Invalid Stripe signature', reason: verified.reason });
    }

    const event = JSON.parse(rawBody.toString('utf8') || '{}');
    const type = String(event?.type || '');
    const obj = (event?.data?.object || {}) as any;
    const meta = (obj?.metadata || {}) as any;

    // Record receipt for health checks (best-effort; never blocks webhook).
    try {
      const eventId = String(event?.id || '').trim();
      if (eventId) {
        const stripeCreatedAt = event?.created ? new Date(Number(event.created) * 1000).toISOString() : null;
        const requestId = String(req?.headers?.['stripe-request-id'] || req?.headers?.['request-id'] || '').trim() || null;

        await admin
          .from('maw_stripe_webhook_events')
          .upsert(
            [
              {
                stripe_event_id: eventId,
                event_type: type || 'unknown',
                livemode: Boolean(event?.livemode),
                stripe_created_at: stripeCreatedAt,
                request_id: requestId,
                signature_present: Boolean(sig),
              },
            ],
            { onConflict: 'stripe_event_id' }
          );
      }
    } catch (_) {
      // ignore
    }

    // We only care about events that can carry a subscription id + metadata.
    const relevant =
      type === 'checkout.session.completed' ||
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated';

    if (!relevant) {
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type });
    }

    if (!isFounderPricing(meta)) {
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type, founder: false });
    }

    const userId = String(meta?.user_id || '').trim();
    const desiredBucket = normalizeBucket(meta);

    if (!userId) {
      // Can't enforce without user id; log and return.
      console.warn('[stripeWebhook] founder pricing missing user_id in metadata', { type });
      return res.status(200).json({ ok: true, received: true, hasSignature: Boolean(sig), type, enforced: false, reason: 'missing_user_id' });
    }

    // Atomically claim/verify capacity (safety net; primary enforcement is pre-checkout).
    const { data: claimRows, error: claimErr } = await admin.rpc('maw_claim_founding_bucket', {
      p_user_id: userId,
      p_bucket: desiredBucket,
    });

    const claim = Array.isArray(claimRows) ? (claimRows[0] as any) : (claimRows as any);

    if (claimErr || !claim?.ok) {
      const reason = String(claim?.reason || claimErr?.message || 'limit_reached');
      console.warn('[stripeWebhook] founder allocation exceeded; canceling subscription', { reason, userId, type });

      // Best-effort cancellation if we have a subscription id.
      const subscriptionId =
        type === 'checkout.session.completed'
          ? String(obj?.subscription || '').trim()
          : String(obj?.id || '').trim();

      let cancel: any = null;
      if (subscriptionId) {
        cancel = await cancelSubscriptionBestEffort(subscriptionId, reason);
      }

      return res.status(200).json({
        ok: true,
        received: true,
        hasSignature: Boolean(sig),
        type,
        enforced: true,
        allocation_ok: false,
        reason,
        subscriptionCanceled: Boolean(cancel?.ok),
      });
    }

    // Best-effort user sync + hard lock pricing tier marker.
    // Note: DB trigger `maw_enforce_pricing_lock` prevents pricing_lock from being unset.
    try {
      if (type === 'checkout.session.completed') {
        const customerId = String(obj?.customer || '').trim();
        const subscriptionId = String(obj?.subscription || '').trim();
        await admin
          .from('users')
          .update({
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subscriptionId || null,
            pricing_lock: '29.95',
            founding_circle_member: true,
            founding_bucket: desiredBucket,
          })
          .eq('id', userId);
      }

      if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
        const subscriptionId = String(obj?.id || '').trim();
        const status = String(obj?.status || '').trim();
        const priceId = String(obj?.items?.data?.[0]?.price?.id || '').trim();
        const periodEnd = obj?.current_period_end ? new Date(Number(obj.current_period_end) * 1000).toISOString() : null;

        const patch: any = {
          stripe_subscription_id: subscriptionId || null,
          stripe_price_id: priceId || null,
          stripe_status: status || null,
          stripe_current_period_end: periodEnd,
        };

        // Only grant membership upgrades; never auto-downgrade founders.
        if (status === 'active' || status === 'trialing') {
          patch.membership = 'professional';
        }

        await admin.from('users').update(patch).eq('id', userId);
      }
    } catch (e) {
      console.warn('[stripeWebhook] best-effort user sync failed', String((e as any)?.message || e || ''));
    }

    
        let founderToEmail = '';
    let founderName: string | null = null;

// Immediate Founder Paid Welcome email (0 minutes) — best-effort, idempotent by queue dedupe.
    try {
      if (type === 'checkout.session.completed' && isMailerConfigured()) {
        // Resolve recipient
        const { data: urow } = await admin.from('users').select('email,full_name,name').eq('id', userId).maybeSingle();
        founderName = String(urow?.full_name || urow?.name || obj?.customer_details?.name || meta?.name || '').trim() || null;
        founderToEmail = String(urow?.email || obj?.customer_details?.email || meta?.email || '').trim();

        if (founderToEmail) {
          // Dedupe: avoid re-sending the same template to same email if webhook retries.
          const { data: existing } = await admin
            .from('maw_email_queue')
            .select('id,status')
            .eq('to_email', founderToEmail)
            .eq('template_key', 'founder_paid_welcome')
            .limit(1);

          const alreadyQueuedOrSent = Array.isArray(existing) && existing.length > 0;

          if (!alreadyQueuedOrSent) {
            const name = founderName;

            const baseUrl =
              getEnv('APP_BASE_URL') ||
              getEnv('PUBLIC_APP_URL') ||
              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
              'https://magicaiwizard.com';

            const trackingId = crypto.randomUUID();

            const rendered = renderFoundingEmail(
              'founder_paid_welcome' as any,
              { name, email: founderToEmail },
              {
                trackingId,
                baseUrl,
                templateVersion: (FOUNDING_EMAIL_TEMPLATE_VERSION as any).founder_paid_welcome || 1,
                vars: {
                  founder_claimed: Number(claim?.total_count ?? claim?.total_count ?? claim?.total ?? null),
                  founder_limit: 100,
                },
              } as any
            );

            const sendRes = await sendMail({ to: founderToEmail, subject: rendered.subject, html: rendered.html, text: rendered.text });

            // Record in queue for visibility + future analytics (best-effort).
            const nowIso = new Date().toISOString();
            const queueRow: any = {
              send_at: nowIso,
              to_email: founderToEmail,
              template_key: 'founder_paid_welcome',
              payload: { email: founderToEmail, name, founder_claimed: Number(claim?.total_count ?? null), founder_limit: 100 },
              status: sendRes.ok ? 'sent' : 'error',
              sent_at: sendRes.ok ? nowIso : null,
              last_error: sendRes.ok ? null : (sendRes as any).error || 'send_failed',
              tracking_id: trackingId,
              template_version: (FOUNDING_EMAIL_TEMPLATE_VERSION as any).founder_paid_welcome || 1,
              provider_message_id: sendRes.ok ? (sendRes as any).messageId || null : null,
            };

            // Fallback for older schemas: strip optional columns if insert fails.
            const ins1 = await enqueueAndMaybeMarkSent(admin, queueRow);
            if (!ins1.ok) {
              const minimalRow: any = {
                send_at: nowIso,
                to_email: founderToEmail,
                template_key: 'founder_paid_welcome',
                payload: { email: founderToEmail, name },
                status: sendRes.ok ? 'sent' : 'error',
                sent_at: sendRes.ok ? nowIso : null,
                last_error: sendRes.ok ? null : (sendRes as any).error || 'send_failed',
              };
              await enqueueAndMaybeMarkSent(admin, minimalRow);
            }
          }

          // Queue Founder Activation Email (24h later) — only sent if they have NOT saved an idea yet.
          // This uses /api/emailDrip (cron) and is also idempotent by (to_email + template_key) dedupe.
          try {
            const templateKey = 'founder_activation_day1';
            const { data: existing2 } = await admin
              .from('maw_email_queue')
              .select('id,status')
              .eq('to_email', founderToEmail)
              .eq('template_key', templateKey)
              .limit(1);

            const alreadyQueued = Array.isArray(existing2) && existing2.length > 0;
            if (!alreadyQueued) {
              const sendAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              const trackingId2 = crypto.randomUUID();
              const queueRow2: any = {
                send_at: sendAt,
                to_email: founderToEmail,
                template_key: templateKey,
                payload: { email: founderToEmail, name: founderName, user_id: userId },
                status: 'queued',
                tracking_id: trackingId2,
                template_version: (FOUNDING_EMAIL_TEMPLATE_VERSION as any)[templateKey] || 1,
              };

              const ins2 = await enqueueAndMaybeMarkSent(admin, queueRow2);
              if (!ins2.ok) {
                await admin.from('maw_email_queue').insert({
                  send_at: sendAt,
                  to_email: founderToEmail,
                  template_key: templateKey,
                  payload: { email: founderToEmail, user_id: userId },
                  status: 'queued',
                } as any);
              }
            }
          } catch {
            // ignore
          }

          // Queue Founder Business OS Email (Day 3 ~ 72h later).
          // Goal: Introduce contracts/CRM/finance to increase stickiness.
          try {
            const templateKey = 'founder_business_day3';
            const { data: existing3 } = await admin
              .from('maw_email_queue')
              .select('id,status')
              .eq('to_email', founderToEmail)
              .eq('template_key', templateKey)
              .limit(1);

            const alreadyQueued = Array.isArray(existing3) && existing3.length > 0;
            if (!alreadyQueued) {
              const sendAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
              const trackingId3 = crypto.randomUUID();
              const queueRow3: any = {
                send_at: sendAt,
                to_email: founderToEmail,
                template_key: templateKey,
                payload: { email: founderToEmail, name: founderName, user_id: userId },
                status: 'queued',
                tracking_id: trackingId3,
                template_version: (FOUNDING_EMAIL_TEMPLATE_VERSION as any)[templateKey] || 1,
              };

              const ins3 = await enqueueAndMaybeMarkSent(admin, queueRow3);
              if (!ins3.ok) {
                await admin.from('maw_email_queue').insert({
                  send_at: sendAt,
                  to_email: founderToEmail,
                  template_key: templateKey,
                  payload: { email: founderToEmail, user_id: userId },
                  status: 'queued',
                } as any);
              }
            }
          } catch {
            // ignore
          }
        }
      }


          // Queue Founder Identity Email (Day 5 / 120h later) — emotional lock-in + feedback loop.
          // Encourages a reply (Reply-To: MAIL_REPLY_TO or support@magicaiwizard.com).
          try {
            const templateKey = 'founder_identity_day5';
            const { data: existing4 } = await admin
              .from('maw_email_queue')
              .select('id,status')
              .eq('to_email', founderToEmail)
              .eq('template_key', templateKey)
              .limit(1);

            const alreadyQueued = Array.isArray(existing4) && existing4.length > 0;
            if (!alreadyQueued) {
              const sendAt = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
              const trackingId4 = crypto.randomUUID();
              const queueRow4: any = {
                send_at: sendAt,
                to_email: founderToEmail,
                template_key: templateKey,
                payload: { email: founderToEmail, name: founderName, user_id: userId },
                status: 'queued',
                tracking_id: trackingId4,
                template_version: (FOUNDING_EMAIL_TEMPLATE_VERSION as any)[templateKey] || 1,
              };

              const ins4 = await enqueueAndMaybeMarkSent(admin, queueRow4);
              if (!ins4.ok) {
                await admin.from('maw_email_queue').insert({
                  send_at: sendAt,
                  to_email: founderToEmail,
                  template_key: templateKey,
                  payload: { email: founderToEmail, user_id: userId },
                  status: 'queued',
                } as any);
              }
            }
          } catch {
            // ignore
          }
    } catch (e) {
      console.warn('[stripeWebhook] founder paid welcome email failed', String((e as any)?.message || e || ''));
    }

return res.status(200).json({
      ok: true,
      received: true,
      hasSignature: Boolean(sig),
      type,
      enforced: true,
      allocation_ok: true,
      bucket: desiredBucket,
      admc_count: claim?.admc_count ?? null,
      total_count: claim?.total_count ?? null,
    });
  } catch (e: any) {
    return res.status(200).json({ ok: true, received: false, error: String(e?.message || e || '') });
  }
}
