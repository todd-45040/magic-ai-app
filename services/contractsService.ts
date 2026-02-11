import { supabase } from '../supabase';

export type ContractStatus = 'draft' | 'sent' | 'signed';

export interface ContractRow {
  id: string;
  user_id: string;
  show_id: string;
  client_id: string | null;
  version: number;
  content: string;
  status: ContractStatus;
  structured?: any | null;
  deposit_paid?: boolean;
  balance_paid?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Helpers
const getUserIdOrThrow = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
};

// Remove missing columns dynamically if schema cache is behind or some envs differ.
const safeInsertSingle = async (table: string, payload: any) => {
  let current: any = { ...payload };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).insert(current).select('*').single();
    if (!error) return data;
    const msg = String((error as any)?.message ?? error ?? '');

    // Missing column pattern from Supabase PostgREST
    const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    const missingCol = m?.[1];
    const missingTable = m?.[2];
    if (missingCol && (!missingTable || missingTable === table)) {
      if (Object.prototype.hasOwnProperty.call(current, missingCol)) {
        const next = { ...current };
        delete next[missingCol];
        current = next;
        continue;
      }
    }
    throw error;
  }
  throw new Error('Insert failed after retries.');
};

const safeUpdateById = async (table: string, id: string, patch: any) => {
  let current: any = { ...patch };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).update(current).eq('id', id).select('*').single();
    if (!error) return data;
    const msg = String((error as any)?.message ?? error ?? '');
    const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    const missingCol = m?.[1];
    const missingTable = m?.[2];
    if (missingCol && (!missingTable || missingTable === table)) {
      if (Object.prototype.hasOwnProperty.call(current, missingCol)) {
        const next = { ...current };
        delete next[missingCol];
        current = next;
        continue;
      }
    }
    throw error;
  }
  throw new Error('Update failed after retries.');
};

export const listContractsForShow = async (showId: string): Promise<ContractRow[]> => {
  const userId = await getUserIdOrThrow();
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('show_id', showId)
    .eq('user_id', userId)
    .order('version', { ascending: false });

  if (error) throw error;
  return (data ?? []) as any;
};

export const getLatestContractForShow = async (showId: string): Promise<ContractRow | null> => {
  const rows = await listContractsForShow(showId);
  return rows.length ? rows[0] : null;
};

export const createContractVersion = async (args: {
  showId: string;
  clientId?: string;
  content: string;
  structured?: any;
  status?: ContractStatus;
}): Promise<ContractRow> => {
  const userId = await getUserIdOrThrow();

  // Determine next version
  const { data: latest, error: latestErr } = await supabase
    .from('contracts')
    .select('version')
    .eq('show_id', args.showId)
    .eq('user_id', userId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  // If the table exists but RLS blocks select, this may error. In that case, default to version 1.
  let nextVersion = 1;
  if (!latestErr && latest?.version) nextVersion = Number(latest.version) + 1;

  const payload: any = {
    show_id: args.showId,
    user_id: userId,
    client_id: args.clientId ?? null,
    version: nextVersion,
    content: args.content,
    status: args.status ?? 'draft',
    structured: args.structured ?? null,
  };

  const inserted = await safeInsertSingle('contracts', payload);
  return inserted as any;
};

export const updateContractStatus = async (contractId: string, status: ContractStatus): Promise<ContractRow> => {
  return (await safeUpdateById('contracts', contractId, { status })) as any;
};

export const markDepositPaid = async (contractId: string, paid: boolean): Promise<ContractRow> => {
  return (await safeUpdateById('contracts', contractId, { deposit_paid: paid })) as any;
};

export const markBalancePaid = async (contractId: string, paid: boolean): Promise<ContractRow> => {
  return (await safeUpdateById('contracts', contractId, { balance_paid: paid })) as any;
};
