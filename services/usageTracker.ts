import type { User } from '../types';
import { normalizeTier, type CanonicalTier } from './membershipService';

export type UsageMetric = 'image' | 'video_upload' | 'live_minutes';

type Limits = {
  image: number; // images per day
  video_upload: number; // video analyses per day
  live_minutes: number; // live rehearsal minutes per day
};

const DAILY_LIMITS: Record<CanonicalTier, Limits> = {
  free: { image: 0, video_upload: 0, live_minutes: 0 },
  expired: { image: 0, video_upload: 0, live_minutes: 0 },
  trial: { image: 5, video_upload: 5, live_minutes: 10 },
  performer: { image: 25, video_upload: 20, live_minutes: 30 },
  professional: { image: 100, video_upload: 9999, live_minutes: 120 },
};

function getTodayKeyUTC(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function storageKey(user: User | null, dateKey = getTodayKeyUTC()): string {
  const who = user?.email ? user.email.toLowerCase() : 'anon';
  return `maw_usage_v1:${dateKey}:${who}`;
}

type Stored = {
  dateKey: string;
  image?: number;
  video_upload?: number;
  live_minutes?: number; // integer minutes used
};

function load(user: User | null): Stored {
  const dateKey = getTodayKeyUTC();
  const key = storageKey(user, dateKey);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { dateKey };
    const parsed = JSON.parse(raw) as Stored;
    return parsed?.dateKey === dateKey ? parsed : { dateKey };
  } catch {
    return { dateKey };
  }
}

function save(user: User | null, s: Stored) {
  const key = storageKey(user, s.dateKey);
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    // ignore (private mode)
  }
}

function emitLocalUsageUpdate(user: User | null, metric: UsageMetric) {
  try {
    if (typeof window === 'undefined') return;
    if (!user) return;
    const cur = getUsage(user, metric);
    window.dispatchEvent(
      new CustomEvent('maw-usage-local-update', {
        detail: { metric, ...cur, ts: Date.now() },
      })
    );
  } catch {
    // ignore
  }
}

export function getDailyLimits(user: User): Limits {
  const tier = normalizeTier(user.membership);
  return DAILY_LIMITS[tier] ?? DAILY_LIMITS.trial;
}

export function getUsage(user: User, metric: UsageMetric): { used: number; limit: number; remaining: number } {
  const tier = normalizeTier(user.membership);
  const limits = DAILY_LIMITS[tier] ?? DAILY_LIMITS.trial;
  const s = load(user);
  const used = Math.max(0, Math.round((s as any)[metric] ?? 0));
  const limit = Math.max(0, limits[metric]);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining };
}

export function canConsume(user: User, metric: UsageMetric, amount = 1): { ok: boolean; remaining: number; limit: number; used: number } {
  const cur = getUsage(user, metric);
  return { ok: cur.remaining >= amount, ...cur };
}

export function consume(user: User, metric: UsageMetric, amount = 1): { ok: boolean; remaining: number; limit: number; used: number } {
  const check = canConsume(user, metric, amount);
  if (!check.ok) return check;
  const s = load(user);
  (s as any)[metric] = Math.max(0, Math.round(((s as any)[metric] ?? 0) + amount));
  save(user, s);
  const cur = getUsage(user, metric) as any;
  emitLocalUsageUpdate(user, metric);
  return cur;
}

export function consumeLiveMinutes(user: User, minutes: number): { ok: boolean; remaining: number; limit: number; used: number } {
  const amt = Math.max(0, Math.ceil(minutes));
  return consume(user, 'live_minutes', amt);
}
