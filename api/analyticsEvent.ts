import { requireSupabaseAuth } from './_auth.js';

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePartnerSource(value: unknown): string | null {
  const trimmed = normalizeText(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function safePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function getPartnerSource(admin: any, userId: string, explicitSource: unknown, payload: Record<string, unknown>): Promise<string | null> {
  const explicit =
    normalizePartnerSource(explicitSource) ||
    normalizePartnerSource(payload.partner_source) ||
    normalizePartnerSource(payload.partnerSource) ||
    normalizePartnerSource(payload.signup_source) ||
    normalizePartnerSource(payload.signupSource) ||
    normalizePartnerSource(payload.source);

  if (explicit) return explicit;

  try {
    const { data, error } = await admin
      .from('users')
      .select('partner_source, signup_source')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return (
      normalizePartnerSource((data as any).partner_source) ||
      normalizePartnerSource((data as any).signup_source)
    );
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const auth = await requireSupabaseAuth(req);

    // Telemetry should never break the app UX. Return 200 even when auth/server env is missing.
    if (!auth.ok) {
      return res.status(200).json({ ok: false, skipped: true, error: auth.error });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const eventName = normalizeText(body.event_name || body.eventName);

    if (!eventName) {
      return res.status(200).json({ ok: false, skipped: true, error: 'Missing event_name' });
    }

    const payload = safePayload(body.event_payload ?? body.payload);
    const partnerSource = await getPartnerSource(auth.admin, auth.userId, body.partner_source, payload);

    const { error } = await auth.admin.from('analytics_events').insert({
      user_id: auth.userId,
      event_name: eventName,
      event_payload: payload,
      partner_source: partnerSource,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('analyticsEvent insert failed', error);
      return res.status(200).json({ ok: false, skipped: true, error: 'Insert failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('analyticsEvent failed', err);
    return res.status(200).json({ ok: false, skipped: true, error: 'Telemetry failed' });
  }
}
