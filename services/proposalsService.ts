import { supabase } from '../supabase';

export type ClientProposal = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  // Optional metadata for future use
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

function mapRow(row: DbRow): ClientProposal {
  const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
  return {
    id: row.id,
    title: row.title ?? 'Untitled Proposal',
    content: row.content,
    createdAt: Number.isFinite(ts) ? ts : Date.now(),
    source: row.source ?? undefined,
  };
}

/**
 * proposalsService.ts
 *
 * Supabase table (recommended): public.client_proposals
 * Columns (minimum):
 *   - id uuid primary key default gen_random_uuid()
 *   - user_id uuid not null references auth.users(id) on delete cascade
 *   - title text
 *   - content text not null
 *   - source jsonb null
 *   - created_at timestamptz default now()
 */
export async function createClientProposal(input: {
  title: string;
  content: string;
  source?: ClientProposal['source'];
}): Promise<{ proposal: ClientProposal; savedToIdeasFallback: boolean }> {
  const userId = await requireUserId();

  // Try real table first
  const { data, error } = await supabase
    .from('client_proposals')
    .insert({
      user_id: userId,
      title: input.title,
      content: input.content,
      source: input.source ?? null,
    })
    .select('*')
    .single();

  if (!error && data) {
    return { proposal: mapRow(data as DbRow), savedToIdeasFallback: false };
  }

  // Graceful fallback: if the table doesn't exist yet, save as an Idea (still not ideal, but prevents data loss).
  const msg = String((error as any)?.message ?? error ?? '');
  const isMissingTable =
    (error as any)?.code === '42P01' || /relation .*client_proposals.* does not exist/i.test(msg);

  if (isMissingTable) {
    const { saveIdea } = await import('./ideasService');
    const idea = await saveIdea({
      type: 'text',
      title: input.title,
      content: input.content,
      tags: ['client-proposal', 'marketing-campaign', 'tier3.5-fallback'],
    });
    return {
      proposal: {
        id: idea.id,
        title: input.title,
        content: input.content,
        createdAt: idea.timestamp,
        source: input.source,
      },
      savedToIdeasFallback: true,
    };
  }

  throw error ?? new Error('Failed to create client proposal');
}

export async function getClientProposals(): Promise<ClientProposal[]> {
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from('client_proposals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!error && Array.isArray(data)) {
    return (data as DbRow[]).map(mapRow);
  }

  // If table missing, return empty list (they can still find fallback proposals in Saved Ideas).
  const msg = String((error as any)?.message ?? error ?? '');
  const isMissingTable =
    (error as any)?.code === '42P01' || /relation .*client_proposals.* does not exist/i.test(msg);

  if (isMissingTable) return [];
  throw error ?? new Error('Failed to load client proposals');
}

export async function deleteClientProposal(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('client_proposals').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
