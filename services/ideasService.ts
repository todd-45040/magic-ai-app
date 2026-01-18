import { supabase } from '../supabase';
import type { IdeaType, SavedIdea } from '../types';

// --- DB row shape (maps to SavedIdea used by the UI) ---
type DbIdeaRow = {
  id: string;
  user_id: string;
  type: IdeaType;
  title: string | null;
  content: string;
  tags: string[] | null;
  created_at: string | null;
};

function mapRowToIdea(row: DbIdeaRow): SavedIdea {
  const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? undefined,
    content: row.content,
    // The DB enforces tags as NOT NULL with default {} but older rows or
    // mismatched inserts can still surface null in API responses.
    tags: row.tags ?? [],
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
  };
}

/**
 * ideasService.ts
 *
 * Supabase table: public.ideas
 * Expected columns (minimum):
 *   - id (uuid/text PK)
 *   - user_id (uuid/text, references auth.users)
 *   - type (text)              // e.g., 'text' | 'image' | 'rehearsal'
 *   - content (text)
 *   - created_at (timestamptz, default now())
 *
 * Optional (recommended):
 *   - tags (text[], default '{}')
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Not authenticated.');
  return uid;
}

export async function getSavedIdeas(): Promise<SavedIdea[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((r: unknown) => mapRowToIdea(r as DbIdeaRow));
}

/**
 * Fetch only rehearsal sessions (type='rehearsal') for the current user.
 * Keeps payload small vs. fetching all ideas and filtering client-side.
 */
export async function getRehearsalSessions(limit = 50): Promise<SavedIdea[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .eq('user_id', uid)
    .eq('type', 'rehearsal')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((r: unknown) => mapRowToIdea(r as DbIdeaRow));
}

/**
 * Backward-compatible saveIdea.
 *
 * New usage (preferred):
 *   saveIdea({ type: 'text', content: '...', title?: '...', tags?: [...] })
 *
 * Legacy usage (still supported):
 *   saveIdea('text', 'content', 'optional title')
 */
export function saveIdea(type: IdeaType, content: string, title?: string, tags?: string[]): Promise<SavedIdea>;
export function saveIdea(idea: { type: IdeaType; content: string; title?: string; tags?: string[] }): Promise<SavedIdea>;
export async function saveIdea(
  a: IdeaType | { type: IdeaType; content: string; title?: string; tags?: string[] },
  b?: string,
  c?: string,
  d?: string[]
): Promise<SavedIdea> {
  const uid = await requireUserId();

  const payload =
    typeof a === 'string'
      ? ({ type: a, content: b ?? '', title: c, tags: d } as const)
      : a;

  const { data, error } = await supabase
    .from('ideas')
    .insert({
      user_id: uid,
      type: payload.type,
      content: payload.content,
      title: payload.title ?? null,
      // DB requires tags NOT NULL; never send null.
      tags: Array.isArray(payload.tags) ? payload.tags : [],
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapRowToIdea(data as DbIdeaRow);
}

/**
 * Update a single idea row and return the updated row.
 * IMPORTANT: This throws on Supabase errors (including RLS denial).
 */
export async function updateIdea(id: string, updates: Partial<SavedIdea>): Promise<SavedIdea> {
  if (!id) throw new Error('updateIdea: missing id');
  await requireUserId();

  // Map UI model -> DB columns (ignore timestamp; created_at is managed by DB)
  const dbUpdates: Partial<DbIdeaRow> = {};
  if (typeof updates.type !== 'undefined') dbUpdates.type = updates.type as IdeaType;
  if (typeof updates.title !== 'undefined') dbUpdates.title = updates.title ?? null;
  if (typeof updates.content !== 'undefined') dbUpdates.content = updates.content;
  if (typeof updates.tags !== 'undefined') dbUpdates.tags = Array.isArray(updates.tags) ? updates.tags : [];

  const { data, error } = await supabase
    .from('ideas')
    .update(dbUpdates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapRowToIdea(data as DbIdeaRow);
}

export async function deleteIdea(id: string): Promise<void> {
  if (!id) throw new Error('deleteIdea: missing id');
  await requireUserId();

  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw error;
}
