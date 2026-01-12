import type { Feedback } from '../types';

// Local-first storage key (keeps UI snappy even if network/RLS blocks remote insert)
const FEEDBACK_STORAGE_KEY = 'magician_audience_feedback';

// Supabase table that stores app-wide suggestions/feedback
const SUGGESTIONS_TABLE = 'app_suggestions';

function getSupabaseConfig(): { url?: string; anonKey?: string } {
  // Vite exposes env at import.meta.env
  const env = (import.meta as any).env ?? {};
  return {
    url: env.VITE_SUPABASE_URL as string | undefined,
    anonKey: env.VITE_SUPABASE_ANON_KEY as string | undefined,
  };
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function insertSuggestionRow(args: {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  status?: string;
  user_id?: string | null;
  user_email?: string | null;
}): Promise<void> {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return;

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/${SUGGESTIONS_TABLE}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Supabase insert failed:', res.status, text);
  }
}

function getSessionUser(): { user_id?: string; user_email?: string } {
  // Best-effort: avoid coupling to a specific auth implementation.
  try {
    const raw = localStorage.getItem('magician_ai_user');
    if (raw) {
      const u = JSON.parse(raw);
      const user_id = u?.id || u?.user?.id || u?.uid;
      const user_email = u?.email || u?.user?.email;
      return {
        user_id: typeof user_id === 'string' ? user_id : undefined,
        user_email: typeof user_email === 'string' ? user_email : undefined,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

export const getFeedback = (): Feedback[] => {
  try {
    const savedData = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (savedData) {
      const feedback = JSON.parse(savedData) as Feedback[];
      return feedback.sort((a, b) => b.timestamp - a.timestamp);
    }
  } catch (error) {
    console.error('Failed to load feedback from localStorage', error);
  }
  return [];
};

export const addFeedback = (feedbackData: {
  rating: number;
  tags: string[];
  comment: string;
  name?: string;
  showTitle?: string;
  magicianName?: string;
  location?: string;
  performanceDate?: number;
}): void => {
  const allFeedback = getFeedback();

  const newFeedback: Feedback = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...feedbackData,
    timestamp: Date.now(),
  };

  const updatedFeedback = [newFeedback, ...allFeedback];

  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(updatedFeedback));
  } catch (error) {
    console.error('Failed to save feedback to localStorage', error);
  }

  const { user_id, user_email } = getSessionUser();
  void insertSuggestionRow({
    id: newFeedback.id,
    type: 'audience_feedback',
    content: safeJsonStringify(newFeedback),
    timestamp: newFeedback.timestamp,
    status: 'new',
    user_id: user_id ?? null,
    user_email: user_email ?? null,
  });
};
