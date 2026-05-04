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

      return res.status(200).json({ received: true, skipped: 'no_customer' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, stripe_customer_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (userError) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'user_lookup',
        event_type: event.type,
        event_id: event.id,
        customerId,
        message: userError.message,
      });

      return res.status(200).json({ received: true, skipped: 'user_lookup_error' });
    }

    if (!user) {
      await logAnalytics('stripe_webhook_error', {
        stage: 'user_match',
        event_type: event.type,
        event_id: event.id,
        customerId,
        message: 'No user found for Stripe customer ID',
      });

      return res.status(200).json({ received: true, skipped: 'no_user_match' });
    }

    await logAnalytics('stripe_webhook_user_matched', {
      event_type: event.type,
      event_id: event.id,
      customerId,
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

      return res.status(200).json({ received: true, warning: 'revenue_analytics_insert_failed' });
    }

    console.log('✅ Stripe revenue analytics logged for user:', user.id, 'event:', event.type);

    return res.status(200).json({ received: true, revenue_logged: true, event_type: event.type });
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
