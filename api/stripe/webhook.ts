import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    console.log("🔥 STRIPE WEBHOOK HIT");

    const body = await new Promise<string>((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });

    console.log("Webhook Headers:", req.headers);

    await supabase.from("analytics_events").insert({
      event_name: "stripe_webhook_received",
      event_payload: {
        timestamp: Date.now(),
        hasBody: !!body
      }
    });

    return res.status(200).json({ received: true });

  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err);

    await supabase.from("analytics_events").insert({
      event_name: "stripe_webhook_error",
      event_payload: {
        message: err.message
      }
    });

    return res.status(500).send('Webhook Error');
  }
}
