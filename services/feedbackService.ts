import type { Feedback } from '../types';
import { supabase } from '../supabaseClient';

const FEEDBACK_STORAGE_KEY = 'magician_audience_feedback';
const SUPABASE_TABLE = 'app_suggestions';
const SUPABASE_TYPE = 'audience_feedback';

/**
 * Local-first: read cached feedback immediately.
 * Source of truth: Supabase (app_suggestions.type = 'audience_feedback') when available.
 */
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

const saveFeedbackLocal = (feedback: Feedback[]) => {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
  } catch (error) {
    console.error('Failed to save feedback to localStorage', error);
  }
};

const toSupabaseRow = async (fb: Feedback) => {
  // Optional attribution
  let user_id: string | null = null;
  let user_email: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    user_id = data.session?.user?.id ?? null;
    user_email = (data.session?.user?.email as string | undefined) ?? null;
  } catch {
    // ignore (anon / auth not initialized)
  }

  return {
    id: fb.id,                 // app_suggestions.id is text (no default)
    type: SUPABASE_TYPE,       // required text
    content: JSON.stringify(fb), // required text
    timestamp: fb.timestamp,   // required bigint
    status: 'new',             // optional
    user_id,                   // optional uuid
    user_email,                // optional text
  };
};

/**
 * Adds feedback locally immediately, then attempts to persist to Supabase.
 * Returns the created Feedback object (callers may ignore the Promise).
 */
export const addFeedback = async (
  feedbackData: Omit<Feedback, 'id' | 'timestamp'>
): Promise<Feedback> => {
  const allFeedback = getFeedback();

  const newFeedback: Feedback = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    ...feedbackData,
    timestamp: Date.now(),
  };

  // 1) Local-first save so the UI updates even if network/RLS fails
  const updatedFeedback = [newFeedback, ...allFeedback];
  saveFeedbackLocal(updatedFeedback);

  // 2) Best-effort Supabase persistence (never blocks UI)
  try {
    const row = await toSupabaseRow(newFeedback);

    const { error } = await supabase
      .from(SUPABASE_TABLE)
      .insert(row);

    if (error) {
      console.error('Failed to save feedback to Supabase', error);
    }
  } catch (error) {
    console.error('Failed to save feedback to Supabase', error);
  }

  return newFeedback;
};

/**
 * Optional helper: refresh local cache from Supabase.
 * Safe to call on page load if you want the latest across devices.
 */
export const syncFeedbackFromSupabase = async (): Promise<Feedback[]> => {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE)
      .select('content, timestamp')
      .eq('type', SUPABASE_TYPE)
      .order('timestamp', { ascending: false })
      .limit(200);

    if (error) throw error;

    const parsed: Feedback[] =
      (data ?? [])
        .map((r: any) => {
          try {
            const fb = JSON.parse(r.content) as Feedback;
            // Ensure timestamp exists (fallback to row timestamp)
            if (!fb.timestamp && r.timestamp) fb.timestamp = Number(r.timestamp);
            return fb;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Feedback[];

    // update local cache
    saveFeedbackLocal(parsed);
    return parsed;
  } catch (e) {
    console.error('Failed to sync feedback from Supabase', e);
    return getFeedback();
  }
};
