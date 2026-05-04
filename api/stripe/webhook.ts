import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req: any, res: any) {
  console.log("🔥 STRIPE WEBHOOK HIT");

  const sig = req.headers['stripe-signature'];
  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: any) {
    console.error("Webhook signature error:", err.message);

    await supabase.from("analytics_events").insert({
      event_name: "stripe_webhook_error",
      event_payload: { message: err.message }
    });

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  await supabase.from("analytics_events").insert({
    event_name: "stripe_webhook_received",
    event_payload: {
      event_type: event.type,
      event_id: event.id,
      timestamp: Date.now()
    }
  });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string;

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (user) {
      await supabase.from("analytics_events").insert([
        {
          event_name: "checkout_completed",
          user_id: user.id
        },
        {
          event_name: "upgrade_completed",
          user_id: user.id
        }
      ]);
    }
  }

  res.status(200).json({ received: true });
}
