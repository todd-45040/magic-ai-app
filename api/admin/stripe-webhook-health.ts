import { createClient } from '@supabase/supabase-js';

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export default async function handler(_req: any, res: any) {
  try {
    const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');
    const signature_verification_active = Boolean(webhookSecret); // our webhook verifies signature when secret is set

    const SUPABASE_URL = getEnv('SUPABASE_URL');
    const SERVICE_ROLE = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    let last_event_received_at: string | null = null;
    let last_event_type: string | null = null;
    let last_event_id: string | null = null;
    let livemode: boolean | null = null;

    if (SUPABASE_URL && SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

      const { data, error } = await admin
        .from('maw_stripe_webhook_events')
        .select('stripe_event_id,event_type,livemode,received_at')
        .order('received_at', { ascending: false })
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        last_event_id = String((data[0] as any).stripe_event_id || '') || null;
        last_event_type = String((data[0] as any).event_type || '') || null;
        livemode = typeof (data[0] as any).livemode === 'boolean' ? (data[0] as any).livemode : null;
        last_event_received_at = String((data[0] as any).received_at || '') || null;
      }
    }

    // Do not expose the secret itself; only whether it's configured.
    return res.status(200).json({
      ok: true,
      webhook_secret_configured: Boolean(webhookSecret),
      signature_verification_active,
      expects_raw_body: true,
      last_event_received_at,
      last_event_type,
      last_event_id,
      livemode,
    });
  } catch (e: any) {
    return res.status(200).json({
      ok: true,
      webhook_secret_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      signature_verification_active: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      expects_raw_body: true,
      last_event_received_at: null,
      error: e?.message || 'unknown_error',
    });
  }
}
