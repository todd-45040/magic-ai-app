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
  deposit_paid: boolean;
  balance_paid: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ContractMeta = {
  latestStatus: ContractStatus;
  latestVersion: number;
  contractCount: number;
};

type CreateContractArgs = {
  showId: string;
  clientId: string | null;
  content: string;
  status?: ContractStatus;
};

const isUuid = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

export const getContractsMetaForShows = async (showIds: string[]): Promise<Record<string, ContractMeta>> => {
  const uid = await getUserIdOrThrow();
  const ids = (showIds || []).filter(Boolean);
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('contracts')
    .select('show_id, status, version')
    .eq('user_id', uid)
    .in('show_id', ids)
    .order('version', { ascending: false });

  if (error) throw error;

  const rows = (data || []) as any[];
  const meta: Record<string, ContractMeta> = {};

  for (const r of rows) {
    const sid = r.show_id as string;
    if (!sid) continue;
    const st = (r.status || 'draft') as ContractStatus;
    const ver = Number(r.version || 0);

    if (!meta[sid]) {
      meta[sid] = { latestStatus: st, latestVersion: ver, contractCount: 0 };
    }
    meta[sid].contractCount += 1;
  }

  // Ensure any ids with no contracts still return nothing (caller handles undefined)
  return meta;
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

  // client_id must be a UUID (backward compatible with legacy string ids by storing null)
  const safeClientId = isUuid(args.clientId) ? args.clientId : null;

  const payload: any = {
    show_id: args.showId,
    user_id: uid,
    client_id: safeClientId,
    version: nextVersion,
    content: args.content,
    status: args.status ?? 'draft',
  };

  const { data, error } = await supabase.from('contracts').insert(payload).select('*').single();
  if (error) throw error;
  return data as any;
};

export const updateContractStatus = async (contractId: string, status: ContractStatus): Promise<ContractRow> => {
  const uid = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('contracts')
    .update({ status })
    .eq('id', contractId)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (error) throw error;
  return data as any;
};

export const updateContractPayments = async (
  contractId: string,
  patch: { deposit_paid?: boolean; balance_paid?: boolean }
): Promise<ContractRow> => {
  const uid = await getUserIdOrThrow();

  const { data, error } = await supabase
    .from('contracts')
    .update({ ...patch })
    .eq('id', contractId)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (error) throw error;
  return data as any;
};
