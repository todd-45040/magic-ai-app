import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-04-22.dahlia',
});

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

function readRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
    });

    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function logAnalytics(event_name: string, event_payload: Record<string, any>, user_id?: string | null) {
  const payload: Record<string, any> = {
    event_name,
    event_payload,
  };

  if (user_id) {
    payload.user_id = user_id;
  }

  const { error } = await supabase.from('analytics_events').insert(payload);

  if (error) {
    console.error(`Analytics insert failed for ${event_name}:`, error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

function asStripeId(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof value.id === 'string') return value.id;
  return null;
}

function extractCustomerId(event: Stripe.Event): string | null {
  const object: any = event.data.object;

  // Checkout Session, Invoice, Subscription, and PaymentIntent can all carry customer.
  const directCustomer = asStripeId(object?.customer);
  if (directCustomer) return directCustomer;

  // Some nested invoice/payment objects can carry customer_details but not a Stripe customer id.
  // Do not use email matching here unless deliberately added later; customer id is safer.
  return null;
}

function normalizeEmail(value: any): string | null {
  const email = String(value || '').trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

function extractUserId(event: Stripe.Event): string | null {
  const object: any = event.data.object;
  const candidates = [
    object?.metadata?.user_id,
    object?.client_reference_id,
    object?.subscription_details?.metadata?.user_id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return null;
}

function extractCustomerEmail(event: Stripe.Event): string | null {
  const object: any = event.data.object;
  const candidates = [
    object?.customer_details?.email,
    object?.customer_email,
    object?.receipt_email,
    object?.billing_details?.email,
  ];

  for (const candidate of candidates) {
    const email = normalizeEmail(candidate);
    if (email) return email;
  }
  return null;
}

async function syncCustomerMapping(params: {
  userId: string;
  customerId: string;
  email?: string | null;
  eventType: string;
  eventId: string;
}) {
  const nowIso = new Date().toISOString();

  const { error: userUpdateError } = await supabase
    .from('users')
    .update({ stripe_customer_id: params.customerId })
    .eq('id', params.userId);

  if (userUpdateError) {
    await logAnalytics('stripe_webhook_error', {
      stage: 'customer_mapping_user_update',
      event_type: params.eventType,
      event_id: params.eventId,
      customerId: params.customerId,
      message: userUpdateError.message,
    }, params.userId);
  }

  const { error: billingCustomerError } = await supabase
    .from('billing_customers')
    .upsert([{
      user_id: params.userId,
      stripe_customer_id: params.customerId,
      email: params.email || null,
      billing_provider: 'stripe',
      provider_status: 'webhook_mapped',
      synced_at: nowIso,
      source_updated_at: nowIso,
    }], { onConflict: 'user_id' });

  if (billingCustomerError) {
    await logAnalytics('stripe_webhook_error', {
      stage: 'customer_mapping_billing_customer_upsert',
      event_type: params.eventType,
      event_id: params.eventId,
      customerId: params.customerId,
      message: billingCustomerError.message,
    }, params.userId);
  }
}

async function resolveUserForEvent(event: Stripe.Event, customerId: string) {
  const metadataUserId = extractUserId(event);
  const customerEmail = extractCustomerEmail(event);

  // 1. Canonical match: Stripe customer id on users table.
  let { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, stripe_customer_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (userError) return { user: null, error: userError, matchedBy: 'stripe_customer_id', metadataUserId, customerEmail };
  if (user) return { user, error: null, matchedBy: 'stripe_customer_id', metadataUserId, customerEmail };

  // 2. Fallback match: checkout metadata/client_reference_id. This is the safest fallback
  // because create-checkout-session sends the authenticated Supabase user id to Stripe.
  if (metadataUserId) {
    const byId = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('id', metadataUserId)
      .maybeSingle();

    if (byId.error) return { user: null, error: byId.error, matchedBy: 'metadata_user_id', metadataUserId, customerEmail };
    if (byId.data) {
      await syncCustomerMapping({
        userId: byId.data.id,
        customerId,
        email: normalizeEmail(byId.data.email) || customerEmail,
        eventType: event.type,
        eventId: event.id,
      });
      return { user: { ...byId.data, stripe_customer_id: customerId }, error: null, matchedBy: 'metadata_user_id', metadataUserId, customerEmail };
    }
  }

  // 3. Last-resort fallback: checkout customer email. Only use this for checkout sessions,
  // where the purchaser's email is directly associated with the authenticated checkout flow.
  if (event.type === 'checkout.session.completed' && customerEmail) {
    const byEmail = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .ilike('email', customerEmail)
      .maybeSingle();

    if (byEmail.error) return { user: null, error: byEmail.error, matchedBy: 'customer_email', metadataUserId, customerEmail };
    if (byEmail.data) {
      await syncCustomerMapping({
        userId: byEmail.data.id,
        customerId,
        email: customerEmail,
        eventType: event.type,
        eventId: event.id,
      });
      return { user: { ...byEmail.data, stripe_customer_id: customerId }, error: null, matchedBy: 'customer_email', metadataUserId, customerEmail };
    }
  }

  return { user: null, error: null, matchedBy: null, metadataUserId, customerEmail };
}

function isRevenueSignal(eventType: string): boolean {
  return [
    'checkout.session.completed',
    'invoice.paid',
    'invoice.payment_succeeded',
    'customer.subscription.created',
    'customer.subscription.updated',
    'payment_intent.succeeded',
  ].includes(eventType);
}

function shouldLogCheckoutCompleted(eventType: string): boolean {
  return eventType === 'checkout.session.completed';
}

function shouldLogUpgradeCompleted(eventType: string): boolean {
  return isRevenueSignal(eventType);
}


async function reserveStripeEvent(event: Stripe.Event) {
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('stripe_webhook_events')
    .insert({
      event_id: event.id,
      event_type: event.type,
      status: 'processing',
      received_at: nowIso,
    });

  if (!error) {
    return { reserved: true, duplicate: false, protectionUnavailable: false, error: null as string | null };
  }

  if (error.code === '23505') {
    const existing = await supabase
      .from('stripe_webhook_events')
      .select('status, received_at')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing.error) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'idempotency_existing_lookup_failed',
        event_type: event.type,
        event_id: event.id,
        message: existing.error.message,
      });
      return { reserved: false, duplicate: true, protectionUnavailable: false, error: existing.error.message };
    }

    const status = existing.data?.status;
    const receivedAt = existing.data?.received_at ? new Date(existing.data.received_at).getTime() : 0;
    const isStaleProcessing = status === 'processing' && receivedAt > 0 && Date.now() - receivedAt > 15 * 60 * 1000;
    const canRetry = status === 'failed' || isStaleProcessing;

    if (canRetry) {
      const retry = await supabase
        .from('stripe_webhook_events')
        .update({
          status: 'processing',
          event_type: event.type,
          received_at: nowIso,
          processed_at: null,
          message: status === 'failed' ? 'retry_after_failed' : 'retry_after_stale_processing',
        })
        .eq('event_id', event.id)
        .in('status', ['failed', 'processing']);

      if (!retry.error) {
        return { reserved: true, duplicate: false, protectionUnavailable: false, error: null as string | null };
      }

      await logAnalytics('stripe_webhook_error', {
        stage: 'idempotency_retry_reserve_failed',
        event_type: event.type,
        event_id: event.id,
        message: retry.error.message,
      });
    }

    return { reserved: false, duplicate: true, protectionUnavailable: false, error: null as string | null };
  }

  // Fail open if the migration has not been applied yet, so billing does not break.
  // Run the included migration to enable real idempotency protection.
  if (error.code === '42P01') {
    await logAnalytics('stripe_webhook_error', {
      stage: 'idempotency_table_missing',
      event_type: event.type,
      event_id: event.id,
      message: 'stripe_webhook_events table is missing; run the idempotency migration',
    });
    return { reserved: true, duplicate: false, protectionUnavailable: true, error: error.message };
  }

  await logAnalytics('stripe_webhook_error', {
    stage: 'idempotency_reserve_failed',
    event_type: event.type,
    event_id: event.id,
    message: error.message,
  });

  // Fail closed for unexpected idempotency errors. Stripe will retry this event later.
  return { reserved: false, duplicate: false, protectionUnavailable: false, error: error.message };
}

async function markStripeEventProcessed(params: {
  event: Stripe.Event;
  customerId?: string | null;
  userId?: string | null;
  status: 'processed' | 'skipped' | 'failed';
  message?: string | null;
}) {
  const { event, customerId, userId, status, message } = params;

  const { error } = await supabase
    .from('stripe_webhook_events')
    .update({
      status,
      stripe_customer_id: customerId || null,
      user_id: userId || null,
      message: message || null,
      processed_at: new Date().toISOString(),
    })
    .eq('event_id', event.id);

  if (error && error.code !== '42P01') {
    console.error('Stripe event status update failed:', error.message);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  console.log('🔥 STRIPE WEBHOOK HIT');

  let body = '';
  let event: Stripe.Event;

  try {
    body = await readRawBody(req);

    const sig = req.headers['stripe-signature'];

    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error('❌ Stripe webhook signature/body error:', err.message);

    await logAnalytics('stripe_webhook_error', {
      stage: 'construct_event',
      message: err.message,
      hasBody: !!body,
    });

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await logAnalytics('stripe_webhook_received', {
      event_type: event.type,
      event_id: event.id,
      timestamp: Date.now(),
    });

    if (!isRevenueSignal(event.type)) {
      return res.status(200).json({ received: true, skipped: 'non_revenue_event' });
    }

    const idempotency = await reserveStripeEvent(event);

    if (idempotency.duplicate) {
      await logAnalytics('stripe_webhook_duplicate_skipped', {
        event_type: event.type,
        event_id: event.id,
      });

      return res.status(200).json({
        received: true,
        duplicate: true,
        skipped: 'duplicate_stripe_event',
        event_type: event.type,
      });
    }

    if (!idempotency.reserved) {
      return res.status(500).json({
        received: false,
        error: 'stripe_event_idempotency_reserve_failed',
        event_type: event.type,
      });
    }

    const customerId = extractCustomerId(event);

    await logAnalytics('stripe_webhook_customer_extracted', {
      event_type: event.type,
      event_id: event.id,
      customerId,
    });

    if (!customerId) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'customer_extraction',
        event_type: event.type,
        event_id: event.id,
        message: 'No Stripe customer ID found on revenue signal event',
      });

      await markStripeEventProcessed({
        event,
        customerId: null,
        status: 'skipped',
        message: 'no_customer',
      });

      return res.status(200).json({ received: true, skipped: 'no_customer' });
    }

    const resolved = await resolveUserForEvent(event, customerId);
    const user = resolved.user;
    const userError = resolved.error;

    if (userError) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'user_lookup',
        event_type: event.type,
        event_id: event.id,
        customerId,
        matchedBy: resolved.matchedBy,
        metadataUserId: resolved.metadataUserId,
        customerEmail: resolved.customerEmail,
        message: userError.message,
      });

      await markStripeEventProcessed({
        event,
        customerId,
        status: 'failed',
        message: 'user_lookup_error',
      });

      return res.status(200).json({ received: true, skipped: 'user_lookup_error' });
    }

    if (!user) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'user_match',
        event_type: event.type,
        event_id: event.id,
        customerId,
        metadataUserId: resolved.metadataUserId,
        customerEmail: resolved.customerEmail,
        message: 'No user found for Stripe customer ID, metadata user id, or checkout customer email',
      });

      await markStripeEventProcessed({
        event,
        customerId,
        status: 'failed',
        message: 'no_user_match',
      });

      return res.status(200).json({ received: true, skipped: 'no_user_match' });
    }

    await logAnalytics('stripe_webhook_user_matched', {
      event_type: event.type,
      event_id: event.id,
      customerId,
      matchedBy: resolved.matchedBy,
      metadataUserId: resolved.metadataUserId,
      customerEmail: resolved.customerEmail,
    }, user.id);

    const analyticsRows: Array<Record<string, any>> = [];

    if (shouldLogCheckoutCompleted(event.type)) {
      analyticsRows.push({
        event_name: 'checkout_completed',
        user_id: user.id,
        event_payload: {
          event_type: event.type,
          event_id: event.id,
          customerId,
        },
      });
    }

    if (shouldLogUpgradeCompleted(event.type)) {
      analyticsRows.push({
        event_name: 'upgrade_completed',
        user_id: user.id,
        event_payload: {
          event_type: event.type,
          event_id: event.id,
          customerId,
          source: event.type === 'checkout.session.completed' ? 'checkout_session' : 'revenue_fallback',
        },
      });
    }

    analyticsRows.push({
      event_name: 'stripe_webhook_analytics_inserted',
      user_id: user.id,
      event_payload: {
        event_type: event.type,
        event_id: event.id,
        customerId,
        inserted_events: analyticsRows.map((row) => row.event_name),
      },
    });

    const { error: insertError } = await supabase.from('analytics_events').insert(analyticsRows);

    if (insertError) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'revenue_analytics_insert',
        event_type: event.type,
        event_id: event.id,
        customerId,
        message: insertError.message,
      }, user.id);

      await markStripeEventProcessed({
        event,
        customerId,
        userId: user.id,
        status: 'failed',
        message: 'revenue_analytics_insert_failed',
      });

      return res.status(200).json({ received: true, warning: 'revenue_analytics_insert_failed' });
    }

    await markStripeEventProcessed({
      event,
      customerId,
      userId: user.id,
      status: 'processed',
      message: idempotency.protectionUnavailable ? 'processed_without_idempotency_table' : null,
    });

    console.log('✅ Stripe revenue analytics logged for user:', user.id, 'event:', event.type);

    return res.status(200).json({
      received: true,
      revenue_logged: true,
      event_type: event.type,
      idempotency: idempotency.protectionUnavailable ? 'unavailable_table_missing' : 'reserved',
    });
  } catch (err: any) {
    console.error('❌ Stripe webhook processing error:', err.message);

    await logAnalytics('stripe_webhook_error', {
      stage: 'processing',
      event_type: event?.type,
      event_id: event?.id,
      message: err.message,
    });

    // Return 200 so Stripe does not endlessly retry non-critical analytics failures.
    return res.status(200).json({ received: true, warning: err.message });
  }
}
