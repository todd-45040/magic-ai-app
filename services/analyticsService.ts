import { supabase, isSupabaseConfigValid } from '../supabase';

type EventPayload = Record<string, unknown>;

type SessionLikeUser = {
  id?: string;
  user?: {
    id?: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
  uid?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  partnerSource?: string | null;
  partner_source?: string | null;
  signupSource?: string | null;
  signup_source?: string | null;
};

const USER_STORAGE_KEYS = [
  'magician_ai_user',
  'magic_ai_wizard_user',
  'maw_user',
];

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePartnerSource(value: unknown): string | null {
  const trimmed = normalizeText(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function getLocalSessionUser(): SessionLikeUser | null {
  if (typeof window === 'undefined') return null;

  for (const key of USER_STORAGE_KEYS) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as SessionLikeUser;
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Keep checking fallback keys.
    }
  }

  return null;
}

function resolvePartnerSourceFromUser(user: SessionLikeUser | null): string | null {
  return (
    normalizePartnerSource(user?.partnerSource) ||
    normalizePartnerSource(user?.partner_source) ||
    normalizePartnerSource(user?.signupSource) ||
    normalizePartnerSource(user?.signup_source) ||
    normalizePartnerSource(user?.user_metadata?.partner_source) ||
    normalizePartnerSource(user?.user_metadata?.signup_source) ||
    normalizePartnerSource(user?.user?.user_metadata?.partner_source) ||
    normalizePartnerSource(user?.user?.user_metadata?.signup_source)
  );
}

function resolvePartnerSourceFromPayload(payload: EventPayload): string | null {
  return (
    normalizePartnerSource(payload.partner_source) ||
    normalizePartnerSource(payload.partnerSource) ||
    normalizePartnerSource(payload.signup_source) ||
    normalizePartnerSource(payload.signupSource) ||
    normalizePartnerSource(payload.source)
  );
}

/**
 * Product-intelligence telemetry for activation/retention events.
 *
 * Important design choice:
 * - The browser sends the event to /api/analyticsEvent.
 * - The API endpoint validates the Supabase session and inserts server-side.
 * - This avoids client-side RLS/anon insert issues and keeps telemetry best-effort.
 *
 * Existing usage remains valid:
 *   void logEvent('activation_generate_clicked', { magic_type: 'Cards' });
 *
 * Legacy explicit usage is also supported:
 *   void logEvent('activation_started', {}, user.id, user.partnerSource);
 */
export async function logEvent(
  eventName: string,
  payload: EventPayload = {},
  _explicitUserId?: string | null,
  explicitPartnerSource?: string | null
): Promise<void> {
  try {
    const normalizedEventName = normalizeText(eventName);
    if (!normalizedEventName) return;
    if (!isSupabaseConfigValid) return;

    let accessToken: string | null = null;
    let authUser: any = null;

    try {
      const { data } = await supabase.auth.getSession();
      accessToken = data?.session?.access_token ?? null;
      authUser = data?.session?.user ?? null;
    } catch {
      accessToken = null;
      authUser = null;
    }

    // Without a signed-in Supabase session, we cannot reliably attach user_id.
    if (!accessToken) {
      if (import.meta.env.DEV) {
        console.warn('Telemetry skipped: no Supabase access token for', normalizedEventName);
      }
      return;
    }

    const authUserWrapper: SessionLikeUser | null = authUser
      ? { id: authUser.id, email: authUser.email, user_metadata: authUser.user_metadata }
      : null;

    const partnerSource =
      normalizePartnerSource(explicitPartnerSource) ||
      resolvePartnerSourceFromPayload(payload) ||
      resolvePartnerSourceFromUser(authUserWrapper) ||
      resolvePartnerSourceFromUser(getLocalSessionUser());

    await fetch('/api/analyticsEvent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        event_name: normalizedEventName,
        event_payload: payload ?? {},
        partner_source: partnerSource,
      }),
      keepalive: true,
    });
  } catch (err) {
    console.error('Telemetry failed:', err);
    // Never block UX.
  }
}
