import { supabase } from '../supabase';
import type { Feedback } from '../types';

const TOKEN_STORAGE_KEY = 'maw_show_feedback_tokens_v1';
const TABLE = 'show_feedback';

type TokenMap = Record<string, string>; // showId -> token

function getBasePath(): string {
  try {
    return window.location.pathname.startsWith('/app') ? '/app' : '';
  } catch {
    return '';
  }
}

function loadTokenMap(): TokenMap {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TokenMap;
  } catch {
    // ignore
  }
  return {};
}

function saveTokenMap(map: TokenMap) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function generateToken(): string {
  // 24+ chars, URL-safe
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36)
  ).replace(/[^a-z0-9]/gi, '');
}

export function getOrCreateShowFeedbackToken(showId: string): string {
  const map = loadTokenMap();
  const existing = map[showId];
  if (existing) return existing;
  const token = generateToken();
  map[showId] = token;
  saveTokenMap(map);
  return token;
}

export function rotateShowFeedbackToken(showId: string): string {
  const map = loadTokenMap();
  const token = generateToken();
  map[showId] = token;
  saveTokenMap(map);
  return token;
}

export function buildShowFeedbackUrl(showId: string, token?: string): string {
  const t = token ?? getOrCreateShowFeedbackToken(showId);
  const base = `${window.location.origin}${getBasePath()}/`;
  const url = new URL(base);
  url.searchParams.set('mode', 'audience-feedback');
  url.searchParams.set('showId', showId);
  url.searchParams.set('token', t);
  return url.toString();
}

export async function submitShowFeedback(input: {
  showId: string;
  token: string;
  rating: number;
  reaction?: Feedback['reaction'];
  tags?: string[];
  comment?: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }>
{
  // Public insert (anon) into Supabase. Requires RLS policy that allows INSERT.
  const payload: any = {
    show_id: input.showId,
    token: input.token,
    rating: input.rating,
    reaction: input.reaction ?? null,
    tags: input.tags ?? [],
    comment: input.comment ?? null,
    name: input.name ?? null,
  };

  try {
    const { error } = await supabase.from(TABLE).insert(payload);
    if (error) {
      console.error('submitShowFeedback failed:', error);
      return { ok: false, error: (error as any)?.message ?? 'Insert failed' };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('submitShowFeedback exception:', e);
    return { ok: false, error: e?.message ?? 'Insert failed' };
  }
}

export async function fetchShowFeedback(showId?: string): Promise<Feedback[]> {
  // Authenticated read for the magician (RLS should restrict by ownership via shows table)
  const q = supabase
    .from(TABLE)
    .select('id, show_id, rating, reaction, tags, comment, name, created_at')
    .order('created_at', { ascending: false });

  const query = showId ? q.eq('show_id', showId) : q;
  const { data, error } = await query;
  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    id: String(row.id),
    showId: String(row.show_id),
    rating: Number(row.rating ?? 0),
    reaction: row.reaction ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    comment: row.comment ?? '',
    name: row.name ?? undefined,
    timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  })) as Feedback[];
}
