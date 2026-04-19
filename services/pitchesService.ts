import { supabase } from '../supabase';

export type BookingPitch = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source?: {
    showTitle?: string;
    targetAudience?: string;
    performanceStyle?: string;
    campaignStyle?: string;
  };
};

type DbRow = {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  source: any | null;
  created_at: string | null;
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Not authenticated');
  return uid;
}

function mapRow(row: DbRow): BookingPitch {
  const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    id: row.id,
    title: row.title ?? 'Untitled Pitch',
    content: row.content,
    createdAt: Number.isFinite(ts) ? ts : Date.now(),
    source: row.source ?? undefined,
  };
}

/**
 * pitchesService.ts
 *
 * Supabase table (recommended): public.booking_pitches
 * Columns (minimum):
 *   - id uuid primary key default gen_random_uuid()
 *   - user_id uuid not null references auth.users(id) on delete cascade
 *   - title text
 *   - content text not null
 *   - source jsonb null
 *   - created_at timestamptz default now()
 */
export async function createBookingPitch(input: {
  title: string;
  content: string;
  source?: BookingPitch['source'];
}): Promise<{ pitch: BookingPitch; savedToIdeasFallback: boolean }> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('booking_pitches')
    .insert({
      user_id: userId,
      title: input.title,
      content: input.content,
      source: input.source ?? null,
    })
    .select('*')
    .single();

  if (!error && data) {
    return { pitch: mapRow(data as DbRow), savedToIdeasFallback: false };
  }

  const msg = String((error as any)?.message ?? error ?? '');
  const isMissingTable =
    (error as any)?.code === '42P01' || /relation .*booking_pitches.* does not exist/i.test(msg);

  if (isMissingTable) {
    const { saveIdea } = await import('./ideasService');
    const idea = await saveIdea({
      type: 'text',
      title: input.title,
      content: input.content,
      tags: ['booking-pitch', 'marketing-campaign', 'tier3.5-fallback'],
    });
    return {
      pitch: {
        id: idea.id,
        title: input.title,
        content: input.content,
        createdAt: idea.timestamp,
        source: input.source,
      },
      savedToIdeasFallback: true,
    };
  }

  throw error ?? new Error('Failed to create booking pitch');
}

export async function getBookingPitches(): Promise<BookingPitch[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('booking_pitches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error && Array.isArray(data)) {
    return (data as DbRow[]).map(mapRow);
  }

  const msg = String((error as any)?.message ?? error ?? '');
  const isMissingTable =
    (error as any)?.code === '42P01' || /relation .*booking_pitches.* does not exist/i.test(msg);
  if (isMissingTable) return [];
  throw error ?? new Error('Failed to load booking pitches');
}

export async function deleteBookingPitch(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('booking_pitches').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
