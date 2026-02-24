// Demo Mode seed data for conventions / talks.
//
// Goals:
// - Opt-in only (URL ?demo=1 or localStorage flag)
// - Local-only seed data for a polished presentation
// - Idempotent (safe to call multiple times)
// - Does NOT touch Supabase

import type { Show, SavedIdea, Client, Feedback, Task } from '../types';

export const DEMO_FLAG_KEY = 'maw_demo_mode';


function getSafeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    // Accessing localStorage can throw in some privacy modes.
    return window.localStorage;
  } catch {
    return null;
  }
}

const KEYS = {
  shows: 'magician_show_planner_shows',
  ideas: 'magician_saved_ideas',
  clients: 'magician_clients_db',
  feedback: 'magician_audience_feedback',
};

function readJson<T>(key: string, fallback: T): T {
  try {
        const storage = getSafeStorage();
    const raw = storage?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (private browsing / storage blocked)
  }
}

export function isDemoEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    const urlFlag = urlParams.get('demo') === '1';
    const storage = getSafeStorage();
    const lsFlag = storage?.getItem(DEMO_FLAG_KEY) === 'true';
    return urlFlag || lsFlag;
  } catch {
    return false;
  }
}

export function enableDemo(): void {
  try {
        const storage = getSafeStorage();
    storage?.setItem(DEMO_FLAG_KEY, 'true');
  } catch {
    // ignore
  }
}

export function disableDemo(): void {
  try {
        const storage = getSafeStorage();
    storage?.removeItem(DEMO_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function seedDemoData(): void {
  // Do not overwrite real user data; only seed if empty.
  const existingShows = readJson<Show[]>(KEYS.shows, []);
  const existingIdeas = readJson<SavedIdea[]>(KEYS.ideas, []);
  const existingClients = readJson<Client[]>(KEYS.clients, []);
  const existingFeedback = readJson<Feedback[]>(KEYS.feedback, []);

  const now = Date.now();

  const demoClient: Client = {
    id: 'demo-client-1',
    name: 'Cincinnati Event Planner',
    company: 'Riverfront Corporate Events',
    email: 'events@example.com',
    phone: '(555) 013-2026',
    notes: 'Demo client for convention walkthroughs.',
    createdAt: now - 1000 * 60 * 60 * 24 * 7,
  };

  const demoTasks: Task[] = [
    {
      id: 'demo-task-1',
      title: 'Finalize opening script',
      notes: 'Tighten the first 30 seconds and add a clear applause cue.',
      priority: 'High',
      status: 'In Progress',
      dueDate: now + 1000 * 60 * 60 * 24 * 2,
      createdAt: now - 1000 * 60 * 60 * 24,
      tags: ['demo', 'script'],
    },
    {
      id: 'demo-task-2',
      title: 'Prop checklist (walk-around)',
      notes: 'Deck, coins, rubber bands, Sharpie, business cards.',
      priority: 'Medium',
      status: 'Todo',
      dueDate: now + 1000 * 60 * 60 * 24 * 3,
      createdAt: now - 1000 * 60 * 60 * 12,
      tags: ['demo', 'props'],
    },
  ];

  const demoShow: Show = {
    id: 'demo-show-1',
    title: 'Corporate Mixer (15 min)',
    description: 'High-impact walk-around set: fast opener, interactive middle, strong closer.',
    tasks: demoTasks,
    clientId: demoClient.id,
    createdAt: now - 1000 * 60 * 60 * 24 * 4,
    updatedAt: now - 1000 * 60 * 30,
    tags: ['demo', 'corporate'],
    finances: {
      performanceFee: 750,
      expenses: [{ id: 'demo-exp-1', description: 'Parking', amount: 18 }],
    },
  };

  const demoIdea: SavedIdea = {
    id: 'demo-idea-1',
    type: 'patter',
    title: 'Ambitious Card (Closer)',
    content:
      '“You know what I love about a single card? No matter how many times you try to lose it… it refuses to stay lost.”\n\nBeat 1: Quick selection + signature.\nBeat 2: First rise (fast).\nBeat 3: Repeat with a pause for the laugh line.\nBeat 4: Final rise as the applause cue.',
    timestamp: now - 1000 * 60 * 60 * 3,
    tags: ['demo', 'script'],
  };

  const demoFeedback: Feedback = {
    id: 'demo-feedback-1',
    rating: 5,
    tags: ['Amazed', 'Funny'],
    comment: 'Great pacing and the ending hit hard. Perfect for a corporate crowd.',
    name: 'Guest (Demo)',
    timestamp: now - 1000 * 60 * 45,
    showTitle: demoShow.title,
    location: 'Convention Demo',
  };

  if (existingClients.length === 0) writeJson(KEYS.clients, [demoClient]);
  if (existingShows.length === 0) writeJson(KEYS.shows, [demoShow]);
  if (existingIdeas.length === 0) writeJson(KEYS.ideas, [demoIdea]);
  if (existingFeedback.length === 0) writeJson(KEYS.feedback, [demoFeedback]);
}

export function clearDemoData(): void {
  try {
        const storage = getSafeStorage();
    storage?.removeItem(KEYS.shows);
        const storage = getSafeStorage();
    storage?.removeItem(KEYS.ideas);
        const storage = getSafeStorage();
    storage?.removeItem(KEYS.clients);
        const storage = getSafeStorage();
    storage?.removeItem(KEYS.feedback);
  } catch {
    // ignore
  }
}
