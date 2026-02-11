import { supabase } from '../supabase';

export type ContractStatus = 'draft' | 'sent' | 'signed';

export type ContractRow = {
  id: string;
  show_id: string;
  user_id: string;
  client_id: string | null;
  version: number;
  content: string;
  status: ContractStatus;
  structured?: any;
  created_at?: string;
  updated_at?: string;
};

type CreateContractArgs = {
  showId: string;
  clientId: string | null;
  content: string;
  status?: ContractStatus;
  structured?: any;
};

const getUserIdOrThrow = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Not authenticated. Please sign in again.');
  return uid;
};

export const listContractsForShow = async (showId: string): Promise<ContractRow[]> => {
  if (!showId) return [];
  const uid = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('show_id', showId)
    .eq('user_id', uid)
    .order('version', { ascending: false });

  if (error) throw error;
  return (data || []) as any;
};

export const createContractVersion = async (args: CreateContractArgs): Promise<ContractRow> => {
  const uid = await getUserIdOrThrow();

  // Compute next version number for this show
  const { data: latest, error: latestErr } = await supabase
    .from('contracts')
    .select('version')
    .eq('show_id', args.showId)
    .eq('user_id', uid)
    .order('version', { ascending: false })
    .limit(1);

  if (latestErr) throw latestErr;

  const nextVersion = (latest?.[0]?.version ?? 0) + 1;

  const basePayload: any = {
    show_id: args.showId,
    user_id: uid,
    client_id: args.clientId,
    version: nextVersion,
    content: args.content,
    status: args.status ?? 'draft',
  };

  // Optional column: structured (may not exist in some DB schemas / schema cache)
  // Strategy:
  // 1) Try insert WITH structured only if provided
  // 2) If PostgREST reports missing column (e.g., PGRST204 schema cache), retry WITHOUT structured
  const payloadWithStructured =
    args.structured !== undefined ? { ...basePayload, structured: args.structured } : basePayload;

  let insertRes = await supabase.from('contracts').insert(payloadWithStructured).select('*').single();

  if (insertRes.error && args.structured !== undefined) {
    const msg = (insertRes.error as any)?.message?.toLowerCase?.() ?? '';
    const code = (insertRes.error as any)?.code ?? '';

    const looksLikeMissingStructuredColumn =
      code === 'PGRST204' ||
      (msg.includes('could not find') && msg.includes('structured') && msg.includes('schema cache')) ||
      (msg.includes('column') && msg.includes('structured') && msg.includes('does not exist'));

    if (looksLikeMissingStructuredColumn) {
      insertRes = await supabase.from('contracts').insert(basePayload).select('*').single();
    }
  }

  if (insertRes.error) throw insertRes.error;
  return insertRes.data as any;
};

export const updateContractStatus = async (contractId: string, status: ContractStatus): Promise<void> => {
  const uid = await getUserIdOrThrow();

  const { error } = await supabase
    .from('contracts')
    .update({ status })
    .eq('id', contractId)
    .eq('user_id', uid);

  if (error) throw error;
};
