import { supabase } from '../supabase';

export type ContractStatus = 'draft' | 'sent' | 'signed';

export interface ContractRow {
  id: string;
  show_id: string;
  user_id: string;
  client_id: string | null;
  version: number;
  content: string;
  status: ContractStatus;
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

const safeSelect = async <T = any>(queryFn: () => Promise<{ data: any; error: any }>, fallback: T): Promise<T> => {
  try {
    const { data, error } = await queryFn();
    if (error) throw error;
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
};

// Retry helpers to survive schema drift (missing optional columns in some envs).
const safeInsert = async (table: string, payload: any) => {
  let current: any = Array.isArray(payload) ? payload.map((p: any) => ({ ...p })) : { ...payload };
  for (let i = 0; i < 8; i++) {
    const { data, error } = await supabase.from(table).insert(current).select().single();
    if (!error) return { data, error: null };
    const msg = String((error as any)?.message ?? error ?? '');
    const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    const missingCol = m?.[1];
    const missingTable = m?.[2];
    if (missingCol && (!missingTable || missingTable === table)) {
      if (Array.isArray(current)) {
        current = current.map((row: any) => {
          if (row && Object.prototype.hasOwnProperty.call(row, missingCol)) {
            const next = { ...row };
            delete next[missingCol];
            return next;
          }
          return row;
        });
      } else if (current && Object.prototype.hasOwnProperty.call(current, missingCol)) {
        delete current[missingCol];
      } else {
        break;
      }
      continue;
    }
    throw error;
  }
  throw new Error(`Failed to insert into ${table}.`);
};

const safeUpdate = async (table: string, match: Record<string, any>, changes: any) => {
  let current: any = { ...changes };
  for (let i = 0; i < 8; i++) {
    let q: any = supabase.from(table).update(current);
    Object.entries(match).forEach(([k, v]) => {
      q = q.eq(k, v);
    });
    const { error } = await q;
    if (!error) return;
    const msg = String((error as any)?.message ?? error ?? '');
    const m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
    const missingCol = m?.[1];
    const missingTable = m?.[2];
    if (missingCol && (!missingTable || missingTable === table)) {
      if (current && Object.prototype.hasOwnProperty.call(current, missingCol)) {
        const next = { ...current };
        delete next[missingCol];
        current = next;
        continue;
      }
    }
    throw error;
  }
  throw new Error(`Failed to update ${table}.`);
};

export const listContractsForShow = async (showId: string): Promise<ContractRow[]> => {
  const userId = await getUserIdOrThrow();
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('user_id', userId)
    .eq('show_id', showId)
    .order('version', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ContractRow[];
};

export const getLatestContractForShow = async (showId: string): Promise<ContractRow | null> => {
  const rows = await listContractsForShow(showId);
  return rows.length ? rows[0] : null;
};

export const createContractVersion = async (args: {
  showId: string;
  clientId?: string | null;
  content: string;
  status?: ContractStatus;
  // optional extra fields; will be dropped automatically if columns don't exist
  structured?: any;
  depositPaid?: boolean;
  balancePaid?: boolean;
}): Promise<ContractRow> => {
  const userId = await getUserIdOrThrow();

  // Determine next version number
  const latest = await getLatestContractForShow(args.showId);
  const nextVersion = (latest?.version ?? 0) + 1;

  const payload: any = {
    show_id: args.showId,
    user_id: userId,
    client_id: args.clientId ?? null,
    version: nextVersion,
    content: args.content,
    status: args.status ?? 'draft',
    updated_at: new Date().toISOString(),
  };

  // Optional columns (schema drift safe)
  if (args.structured !== undefined) payload.structured = args.structured;
  if (args.depositPaid !== undefined) payload.deposit_paid = args.depositPaid;
  if (args.balancePaid !== undefined) payload.balance_paid = args.balancePaid;

  const { data } = await safeInsert('contracts', payload);
  return data as ContractRow;
};

export const updateContractStatus = async (contractId: string, status: ContractStatus) => {
  await safeUpdate('contracts', { id: contractId }, { status, updated_at: new Date().toISOString() });
};

export const markDepositPaid = async (contractId: string, paid: boolean) => {
  await safeUpdate('contracts', { id: contractId }, { deposit_paid: paid, updated_at: new Date().toISOString() });
};

export const markBalancePaid = async (contractId: string, paid: boolean) => {
  await safeUpdate('contracts', { id: contractId }, { balance_paid: paid, updated_at: new Date().toISOString() });
};

// Backward-compat check: detect if contracts table exists (best-effort)
export const contractsTableAvailable = async (): Promise<boolean> => {
  // Try a harmless select with limit 1.
  const userId = await getUserIdOrThrow();
  const { error } = await supabase.from('contracts').select('id').eq('user_id', userId).limit(1);
  return !error;
};
