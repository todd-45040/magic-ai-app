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

async function logAnalytics(event_name: string, event_payload: Record<string, any>, user_id?: string) {
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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;

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
          message: 'No customer ID found on checkout session',
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

      await supabase.from('analytics_events').insert([
        {
          event_name: 'checkout_completed',
          user_id: user.id,
          event_payload: {
            event_type: event.type,
            event_id: event.id,
            customerId,
          },
        },
        {
          event_name: 'upgrade_completed',
          user_id: user.id,
          event_payload: {
            event_type: event.type,
            event_id: event.id,
            customerId,
          },
        },
        {
          event_name: 'stripe_webhook_analytics_inserted',
          user_id: user.id,
          event_payload: {
            event_type: event.type,
            event_id: event.id,
            customerId,
          },
        },
      ]);

      console.log('✅ Revenue events logged for user:', user.id);
    }

    return res.status(200).json({ received: true });
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
