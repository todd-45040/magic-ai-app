import { supabase } from '../supabase';
import type { IdeaCategory, IdeaType, SavedIdea } from '../types';
import { logUserActivity } from './userActivityService';
import { getUserProfile } from './usersService';
import { ConversionFrictionError, getSavedIdeaLimitForFriction, getSavedIdeaLimitMessage, recordConversionFriction } from './conversionFriction';

// --- DB row shape (maps to SavedIdea used by the UI) ---
type DbIdeaRow = {
  id: string;
  user_id: string;
  type: IdeaType;
  title: string | null;
  content: string;
  tags: string[] | null;
  created_at: string | null;
  category?: IdeaCategory | null;
};

const IDEA_METADATA_KEYS = new Set([
  'format',
  'tool',
  'timestamp',
  'meta',
  'raw',
  'structured',
  'createdat',
  'updatedat',
  'userid',
  'id',
  'type',
  'category',
  'tags',
  'provider',
  'model',
  'mime',
  'mimetype',
]);

function flattenReadableStrings(value: unknown, depth = 0): string[] {
  if (value == null || depth > 4) return [];
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned ? [cleaned] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenReadableStrings(item, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, val]) => {
      if (IDEA_METADATA_KEYS.has(String(key).toLowerCase())) return [];
      return flattenReadableStrings(val, depth + 1);
    });
  }
  return [];
}

function sanitizeIdeaContent(content: string): string {
  const text = (content ?? '').toString().trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return content;

  try {
    const parsed: any = JSON.parse(text);

    // Preserve structured MAW payloads verbatim so richer tool output can be
    // stored and rendered later instead of being flattened into plain text.
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.format === 'string' &&
      parsed.format.startsWith('maw.idea.')
    ) {
      return text;
    }

    const direct = [parsed?.display, parsed?.content, parsed?.text, parsed?.body, parsed?.result, parsed?.response, parsed?.markdown]
      .find((value) => typeof value === 'string' && value.trim());
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const readable = Array.from(new Set(flattenReadableStrings(parsed).filter(Boolean)));
    return readable.length ? readable.join('\n\n').trim() : content;
  } catch {
    return content;
  }
}

function mapRowToIdea(row: DbIdeaRow): SavedIdea {
  const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    id: row.id,
    type: row.type,
    title: row.title ?? undefined,
    content: row.content,
    // DB schema enforces tags NOT NULL (default '{}'), but older rows or stale
    // schema cache can still yield null. Normalize to an array for safety.
    tags: Array.isArray(row.tags) ? row.tags : [],
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    category: (row as any).category ?? undefined,
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


async function enforceSavedIdeaFriction(uid: string, ideaType: IdeaType): Promise<void> {
  // Rehearsal sessions are governed by the Live Rehearsal minute wall; this
  // guard focuses on the general "Saved Ideas" conversion moment.
  if (ideaType === 'rehearsal') return;

  const profile = await getUserProfile(uid);
  const limit = getSavedIdeaLimitForFriction(profile as any);
  if (limit >= Number.MAX_SAFE_INTEGER) return;

  const { count, error } = await supabase
    .from('ideas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .neq('type', 'rehearsal');

  if (error) {
    // Do not create a hard failure when the count check itself fails. The DB/RLS
    // insert will still protect data ownership.
    console.warn('Saved idea friction count check failed:', error);
    return;
  }

  const existingCount = Number(count ?? 0);
  if (existingCount >= limit) {
    const message = getSavedIdeaLimitMessage(existingCount, limit);
    recordConversionFriction('saved_idea_limit', {
      feature: 'saved_ideas',
      existing_count: existingCount,
      limit,
      attempted_type: ideaType,
      source: 'save_idea',
    });
    throw new ConversionFrictionError('saved_idea_limit', message, {
      existing_count: existingCount,
      limit,
      attempted_type: ideaType,
    });
  }
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
 * Fetch only rehearsal sessions (stored as ideas with type='rehearsal').
 * Used by Live Rehearsal History UI.
 */
export async function getRehearsalSessions(limit = 25): Promise<SavedIdea[]> {
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
export function saveIdea(idea: { type: IdeaType; content: string; title?: string; tags?: string[]; category?: IdeaCategory }): Promise<SavedIdea>;
export async function saveIdea(
  a: IdeaType | { type: IdeaType; content: string; title?: string; tags?: string[]; category?: IdeaCategory },
  b?: string,
  c?: string,
  d?: string[]
): Promise<SavedIdea> {
  const uid = await requireUserId();

  const payload =
    typeof a === 'string'
      ? ({ type: a, content: b ?? '', title: c, tags: d } as const)
      : a;

  await enforceSavedIdeaFriction(uid, payload.type);

  const baseInsert = {
    user_id: uid,
    type: payload.type,
    content: sanitizeIdeaContent(payload.content),
    title: payload.title ?? null,
    // DB constraint: tags is NOT NULL. Always send an array.
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  };

  const insertWithCategory = async (includeCategory: boolean) => {
    const insertPayload = includeCategory
      ? { ...baseInsert, category: payload.category ?? null }
      : baseInsert;

    return supabase
      .from('ideas')
      .insert(insertPayload)
      .select('*')
      .single();
  };

  let { data, error } = await insertWithCategory(true);

  // Backward-compatible retry for deployments where the DB schema has not yet
  // picked up the optional `category` column.
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    const details = String((error as any).details || '').toLowerCase();
    const hint = String((error as any).hint || '').toLowerCase();
    const categorySchemaIssue = [msg, details, hint].some((part) =>
      part.includes('category') && (
        part.includes('column') ||
        part.includes('schema cache') ||
        part.includes('could not find') ||
        part.includes('does not exist')
      )
    );

    if (categorySchemaIssue) {
      ({ data, error } = await insertWithCategory(false));
    }
  }

  if (error) throw error;
  const savedIdea = mapRowToIdea(data as DbIdeaRow);
  try {
    localStorage.setItem('magicAiWizard:lastSavedIdeaId', savedIdea.id);
  } catch {
    // localStorage may be unavailable in non-browser contexts.
  }
  void logUserActivity({
    tool_name: String(savedIdea.type || 'idea'),
    event_type: 'idea_saved',
    success: true,
    metadata: {
      idea_id: savedIdea.id,
      idea_type: savedIdea.type,
      title: savedIdea.title ?? null,
      category: savedIdea.category ?? null,
      tag_count: Array.isArray(savedIdea.tags) ? savedIdea.tags.length : 0,
      source: 'idea_create',
    },
  });
  return savedIdea;

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
  if (typeof updates.content !== 'undefined') dbUpdates.content = sanitizeIdeaContent(updates.content);
  if (typeof updates.tags !== 'undefined') {
    dbUpdates.tags = Array.isArray(updates.tags) ? updates.tags : [];
  }
  if (typeof updates.category !== 'undefined') dbUpdates.category = updates.category ?? null;

  const { data, error } = await supabase
    .from('ideas')
    .update(dbUpdates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  const savedIdea = mapRowToIdea(data as DbIdeaRow);
  void logUserActivity({
    tool_name: String(savedIdea.type || 'idea'),
    event_type: 'idea_saved',
    success: true,
    metadata: {
      idea_id: savedIdea.id,
      idea_type: savedIdea.type,
      title: savedIdea.title ?? null,
      category: savedIdea.category ?? null,
      tag_count: Array.isArray(savedIdea.tags) ? savedIdea.tags.length : 0,
      source: 'idea_update',
    },
  });
  return savedIdea;
}

export async function deleteIdea(id: string): Promise<void> {
  if (!id) throw new Error('deleteIdea: missing id');
  await requireUserId();

  const { error } = await supabase.from('ideas').delete().eq('id', id);
  if (error) throw error;
}
