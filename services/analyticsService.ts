import { supabase, isSupabaseConfigValid } from '../supabase';

type EventPayload = Record<string, unknown>;

type PartnerSource = string | null;

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

const ANALYTICS_EVENTS_TABLE = 'analytics_events';

// Legacy/local keys used by older builds. These are fallbacks only.
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

function normalizePartnerSource(value: unknown): PartnerSource {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (['ibm', 'sam', 'admc', 'genii', 'direct'].includes(lowered)) return lowered;
  return lowered;
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
      // Keep checking other possible keys.
    }
  }

  return null;
}

function resolveUserId(user: SessionLikeUser | null): string | null {
  return normalizeText(user?.id) || normalizeText(user?.user?.id) || normalizeText(user?.uid);
}

function resolvePartnerSourceFromUser(user: SessionLikeUser | null): PartnerSource {
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

function resolvePartnerSourceFromPayload(payload: EventPayload): PartnerSource {
  return (
    normalizePartnerSource(payload.partner_source) ||
    normalizePartnerSource(payload.partnerSource) ||
    normalizePartnerSource(payload.signup_source) ||
    normalizePartnerSource(payload.signupSource) ||
    normalizePartnerSource(payload.source)
  );
}

async function getPartnerSourceFromProfile(userId: string | null): Promise<PartnerSource> {
  if (!userId || !isSupabaseConfigValid) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('partner_source, signup_source')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return normalizePartnerSource((data as any).partner_source) || normalizePartnerSource((data as any).signup_source);
  } catch {
    return null;
  }
}

/**
 * Lightweight product-intelligence telemetry.
 *
 * This function is intentionally best-effort:
 * - it never blocks or breaks user-facing UX
 * - it uses the active Supabase auth session as the source of truth for user_id
 * - it keeps older/local user resolution as fallback support
 *
 * Usage:
 *   void logEvent('activation_generate_clicked', { magic_type: 'Cards' });
 *
 * Optional legacy signature is also supported:
 *   void logEvent('activation_started', {}, user.id, user.partnerSource);
 */
export async function logEvent(
  eventName: string,
  payload: EventPayload = {},
  explicitUserId?: string | null,
  explicitPartnerSource?: string | null
): Promise<void> {
  try {
    const normalizedEventName = normalizeText(eventName);
    if (!normalizedEventName) return;
    if (!isSupabaseConfigValid) return;

    const localUser = getLocalSessionUser();

    let authUser: any = null;
    try {
      const { data } = await supabase.auth.getSession();
      authUser = data?.session?.user ?? null;
    } catch {
      authUser = null;
    }

    // Fallback for rare cases where the session has not hydrated yet.
    if (!authUser) {
      try {
        const { data } = await supabase.auth.getUser();
        authUser = data?.user ?? null;
      } catch {
        authUser = null;
      }
    }

    const authUserWrapper: SessionLikeUser | null = authUser
      ? { id: authUser.id, email: authUser.email, user_metadata: authUser.user_metadata }
      : null;

    const userId =
      normalizeText(explicitUserId) ||
      resolveUserId(authUserWrapper) ||
      resolveUserId(localUser);

    const partnerSource =
      normalizePartnerSource(explicitPartnerSource) ||
      resolvePartnerSourceFromPayload(payload) ||
      resolvePartnerSourceFromUser(authUserWrapper) ||
      resolvePartnerSourceFromUser(localUser) ||
      (await getPartnerSourceFromProfile(userId));

    const { error } = await supabase.from(ANALYTICS_EVENTS_TABLE).insert({
      user_id: userId,
      event_name: normalizedEventName,
      event_payload: payload ?? {},
      partner_source: partnerSource,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Telemetry insert error:', error);
    }
  } catch (err) {
    console.error('Telemetry failed:', err);
    // Never block UX.
  }
}
