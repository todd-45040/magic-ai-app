import { supabase, isSupabaseConfigValid } from '../supabase';

type EventPayload = Record<string, unknown>;

type SessionLikeUser = {
  id?: string;
  user?: {
    id?: string;
    email?: string;
  };
  uid?: string;
  email?: string;
  partnerSource?: string | null;
  partner_source?: string | null;
  signupSource?: string | null;
  signup_source?: string | null;
};

const ANALYTICS_EVENTS_TABLE = 'analytics_events';
const USER_STORAGE_KEY = 'magician_ai_user';

function getSessionUser(): SessionLikeUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionLikeUser;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function resolveUserId(user: SessionLikeUser | null): string | null {
  const value = user?.id || user?.user?.id || user?.uid;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolvePartnerSource(user: SessionLikeUser | null): string | null {
  const value = user?.partnerSource || user?.partner_source || user?.signupSource || user?.signup_source;
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

export async function logEvent(eventName: string, payload: EventPayload = {}): Promise<void> {
  try {
    const normalizedEventName = String(eventName || '').trim();
    if (!normalizedEventName) return;
    if (!isSupabaseConfigValid) return;

    const user = getSessionUser();

    const { error } = await supabase.from(ANALYTICS_EVENTS_TABLE).insert({
      user_id: resolveUserId(user),
      event_name: normalizedEventName,
      event_payload: payload,
      partner_source: resolvePartnerSource(user),
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Telemetry error:', error);
    }
  } catch (err) {
    console.error('Telemetry error:', err);
    // Never block UX.
  }
}
