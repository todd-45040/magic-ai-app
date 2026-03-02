import { getShows } from './showsService';
import { getSavedIdeas } from './ideasService';
import { getClients } from './clientsService';
import { getFeedback } from './feedbackService';
import { getQuestions } from './questionsService';
import { getUserProfile } from './usersService';
import { getBookingPitches } from './pitchesService';
import { getClientProposals } from './proposalsService';
import { fetchShowFeedback } from './showFeedbackService';

import type { ContractRow } from './contractsService';
import type { BookingPitch } from './pitchesService';
import type { ClientProposal } from './proposalsService';
import type { Feedback } from '../types';

export type BackupSectionKey =
  | 'shows'
  | 'ideas'
  | 'clients'
  | 'feedback'
  | 'questions'
  | 'profile'
  | 'contracts'
  | 'bookingPitches'
  | 'clientProposals'
  | 'showFeedback'
  | 'suggestions'
  | 'dashboardLayout'
  | 'showFeedbackTokens';

export type ExportSelection = Partial<Record<BackupSectionKey, boolean>>;

// Define the structure of the backup file
interface BackupData {
  timestamp: number;
  version: string;

  // Core data
  shows?: any[];
  ideas?: any[];
  clients?: any[];
  feedback?: any[];
  questions?: any[];

  // Account/profile snapshot (single-user)
  profile?: any;

  // Advanced/optional data
  contracts?: ContractRow[];
  bookingPitches?: BookingPitch[];
  clientProposals?: ClientProposal[];
  showFeedback?: Feedback[];
  suggestions?: any[];

  // UI prefs / local-only
  dashboardLayout?: any;
  showFeedbackTokens?: Record<string, string>;

  meta?: {
    selection: ExportSelection;
    counts: Record<string, number>;
  };
}

// Keys used in localStorage
const KEYS = {
  shows: 'magician_show_planner_shows',
  ideas: 'magician_saved_ideas',
  clients: 'magician_clients_db',
  feedback: 'magician_audience_feedback',
  questions: 'magician_audience_questions',
  users: 'magician_ai_users_db',
  dashboard: 'magician_dashboard_layout',
  showFeedbackTokens: 'maw_show_feedback_tokens_v1',
} as const;

const DEFAULT_SELECTION: ExportSelection = {
  shows: true,
  ideas: true,
  clients: true,
  feedback: true,
  questions: true,
  profile: true,
  contracts: true,
  bookingPitches: true,
  clientProposals: true,
  showFeedback: true,
  suggestions: true,
  dashboardLayout: true,
  showFeedbackTokens: true,
};

const safeJsonParse = (raw: string | null) => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const getAuthUid = async (): Promise<string | null> => {
  try {
    const { supabase } = await import('../supabase');
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Export a backup file to the user's local system.
 * Supports selective export (only chosen categories).
 */
export const exportData = async (selection?: ExportSelection): Promise<void> => {
  const include: ExportSelection = { ...DEFAULT_SELECTION, ...(selection ?? {}) };
  const counts: Record<string, number> = {};

  const data: BackupData = {
    timestamp: Date.now(),
    version: '1.1',
    meta: { selection: include, counts },
  };

  // Core DB-backed
  if (include.shows) {
    try {
      const v = await getShows();
      data.shows = v as any[];
      counts.shows = Array.isArray(v) ? v.length : 0;
    } catch {
      data.shows = [];
      counts.shows = 0;
    }
  }
  if (include.ideas) {
    try {
      const v = await getSavedIdeas();
      data.ideas = v as any[];
      counts.ideas = Array.isArray(v) ? v.length : 0;
    } catch {
      data.ideas = [];
      counts.ideas = 0;
    }
  }

  // Local-first
  if (include.clients) {
    try {
      const v = getClients();
      data.clients = v as any[];
      counts.clients = Array.isArray(v) ? v.length : 0;
    } catch {
      data.clients = [];
      counts.clients = 0;
    }
  }
  if (include.feedback) {
    try {
      const v = getFeedback();
      data.feedback = v as any[];
      counts.feedback = Array.isArray(v) ? v.length : 0;
    } catch {
      data.feedback = [];
      counts.feedback = 0;
    }
  }
  if (include.questions) {
    try {
      const v = getQuestions();
      data.questions = v as any[];
      counts.questions = Array.isArray(v) ? v.length : 0;
    } catch {
      data.questions = [];
      counts.questions = 0;
    }
  }

  // Profile snapshot (single-user only)
  if (include.profile) {
    try {
      const uid = await getAuthUid();
      if (uid) {
        const v = await getUserProfile(uid);
        data.profile = v;
        counts.profile = v ? 1 : 0;
      } else {
        data.profile = null;
        counts.profile = 0;
      }
    } catch {
      data.profile = null;
      counts.profile = 0;
    }
  }

  // Optional/advanced DB-backed tables (safe if missing)
  if (include.contracts) {
    try {
      const { listAllContractsForUser } = await import('./contractsService');
      const v = await listAllContractsForUser();
      data.contracts = v;
      counts.contracts = Array.isArray(v) ? v.length : 0;
    } catch {
      data.contracts = [];
      counts.contracts = 0;
    }
  }
  if (include.bookingPitches) {
    try {
      const v = await getBookingPitches();
      data.bookingPitches = v;
      counts.bookingPitches = Array.isArray(v) ? v.length : 0;
    } catch {
      data.bookingPitches = [];
      counts.bookingPitches = 0;
    }
  }
  if (include.clientProposals) {
    try {
      const v = await getClientProposals();
      data.clientProposals = v;
      counts.clientProposals = Array.isArray(v) ? v.length : 0;
    } catch {
      data.clientProposals = [];
      counts.clientProposals = 0;
    }
  }
  if (include.showFeedback) {
    try {
      const v = await fetchShowFeedback();
      data.showFeedback = v;
      counts.showFeedback = Array.isArray(v) ? v.length : 0;
    } catch {
      data.showFeedback = [];
      counts.showFeedback = 0;
    }
  }
  if (include.suggestions) {
    try {
      const { getMySuggestions } = await import('./suggestionService');
      const v = await getMySuggestions();
      data.suggestions = v as any[];
      counts.suggestions = Array.isArray(v) ? v.length : 0;
    } catch {
      data.suggestions = [];
      counts.suggestions = 0;
    }
  }

  // Local-only UI state
  if (include.dashboardLayout) {
    const v = safeJsonParse(localStorage.getItem(KEYS.dashboard));
    data.dashboardLayout = v;
    counts.dashboardLayout = v ? 1 : 0;
  }
  if (include.showFeedbackTokens) {
    const v = safeJsonParse(localStorage.getItem(KEYS.showFeedbackTokens));
    data.showFeedbackTokens = v && typeof v === 'object' ? (v as any) : undefined;
    counts.showFeedbackTokens = data.showFeedbackTokens ? Object.keys(data.showFeedbackTokens).length : 0;
  }

  try {
    localStorage.setItem('maw_last_backup_at', String(Date.now()));
  } catch {}

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  const short = Object.entries(include)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .slice(0, 4)
    .join('-');
  a.download = `maw_backup_${stamp}${short ? `_${short}` : ''}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Import a backup file.
 * NOTE: This restore is intentionally local-only to avoid destructive overwrites in Supabase.
 * It restores legacy/local stores (clients, questions, etc.) and UI prefs.
 */
export const importData = (file: File, selection?: ExportSelection): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as BackupData;

        const include: ExportSelection = { ...DEFAULT_SELECTION, ...(selection ?? {}) };

        const hasAny = Boolean(
          data.shows ||
            data.ideas ||
            data.clients ||
            data.feedback ||
            data.questions ||
            data.contracts ||
            data.bookingPitches ||
            data.clientProposals ||
            data.showFeedback
        );
        if (!hasAny) throw new Error('Invalid backup file format.');

        // Restore best-effort local stores
        if (include.shows && data.shows) localStorage.setItem(KEYS.shows, JSON.stringify(data.shows));
        if (include.ideas && data.ideas) localStorage.setItem(KEYS.ideas, JSON.stringify(data.ideas));
        if (include.clients) localStorage.setItem(KEYS.clients, JSON.stringify(data.clients || []));
        if (include.feedback) localStorage.setItem(KEYS.feedback, JSON.stringify(data.feedback || []));
        if (include.questions) localStorage.setItem(KEYS.questions, JSON.stringify(data.questions || []));
        if (include.dashboardLayout && data.dashboardLayout)
          localStorage.setItem(KEYS.dashboard, JSON.stringify(data.dashboardLayout));
        if (include.showFeedbackTokens && data.showFeedbackTokens)
          localStorage.setItem(KEYS.showFeedbackTokens, JSON.stringify(data.showFeedbackTokens));

        // Legacy key (kept for compatibility)
        if ((data as any).users) localStorage.setItem(KEYS.users, JSON.stringify((data as any).users));

        resolve();
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const clearAllData = (): void => {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  // Note: This does not clear authentication state (magician_ai_user) to keep user logged in.
};
