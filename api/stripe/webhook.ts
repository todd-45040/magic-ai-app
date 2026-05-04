import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  let event;

  try {
    console.log("🔥 STRIPE WEBHOOK HIT");

    const sig = req.headers['stripe-signature'];

    const body = await new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    await supabase.from("analytics_events").insert({
      event_name: "stripe_webhook_received",
      event_payload: {
        event_type: event.type,
        event_id: event.id
      }
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string;

      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (user) {
        await supabase.from("analytics_events").insert({
          event_name: "checkout_completed",
          user_id: user.id
        });

        await supabase.from("analytics_events").insert({
          event_name: "upgrade_completed",
          user_id: user.id
        });

        console.log("✅ Revenue events logged for user:", user.id);
      } else {
        console.log("⚠️ No user found for customer:", customerId);
      }
    }

    return res.status(200).json({ received: true });

  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err.message);

    await supabase.from("analytics_events").insert({
      event_name: "stripe_webhook_error",
      event_payload: {
        message: err.message
      }
    });

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
