import { supabase } from '../supabase';
import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';

// Supabase table names
// - users: one row per authenticated user (id = auth.users.id)
//   Columns used by the app:
//     id (uuid, pk), email (text), membership (text), is_admin (bool),
//     generation_count (int), last_reset_date (timestamptz/text), trial_end_date (bigint)
const USERS_TABLE = 'users';

const normalizeUserRow = (row: any): User => {
  const email = (row?.email ?? '').toLowerCase();
  return {
    email,
    membership: (row?.membership ?? 'trial') as Membership,
    isAdmin: typeof row?.is_admin === 'boolean' ? row.is_admin : email === ADMIN_EMAIL,
    generationCount: typeof row?.generation_count === 'number' ? row.generation_count : 0,
    lastResetDate: row?.last_reset_date ?? new Date().toISOString(),
    ...(row?.trial_end_date ? { trialEndDate: row.trial_end_date } : {}),

    // Founding Circle identity layer
    foundingCircleMember: Boolean(row?.founding_circle_member ?? false),
    foundingJoinedAt: (row?.founding_joined_at ?? null) as any,
    foundingSource: (row?.founding_source ?? null) as any,
    pricingLock: (row?.pricing_lock ?? null) as any,
  } as User;
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select('*')
      .order('email', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(normalizeUserRow);
  } catch (error) {
    console.error('Failed to get users from Supabase', error);
    return [];
  }
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select('*')
      .eq('id', uid)
      .single();
    if (error) {
      // If the row doesn't exist yet, Supabase returns an error for .single().
      return null;
    }
    return data ? normalizeUserRow(data) : null;
  } catch (error) {
    console.error('Failed to get user profile from Supabase', error);
    return null;
  }
};

export const registerOrUpdateUser = async (user: User, uid: string): Promise<void> => {
  try {
    const email = user.email.toLowerCase();

    // Read existing row (if any) so we never downgrade a paid/admin account during auth hydration.
    let existing: { membership?: string | null; is_admin?: boolean | null; trial_end_date?: any } | null = null;
    try {
      const { data: existingRow } = await supabase
        .from(USERS_TABLE)
        .select('membership,is_admin,trial_end_date')
        .eq('id', uid)
        .maybeSingle();
      existing = (existingRow as any) || null;
    } catch {
      existing = null;
    }

    const existingMembership = String(existing?.membership ?? '').toLowerCase();
    const requestedMembership = String((user as any).membership ?? 'trial').toLowerCase() as Membership;

    const requestedIsAdmin = Boolean((user as any).isAdmin) || email === ADMIN_EMAIL;
    const existingIsAdmin = Boolean(existing?.is_admin) || existingMembership === 'admin';
    const isAdmin = requestedIsAdmin || existingIsAdmin;

    // Start with the best-known membership:
    // - If the UI thinks "trial" but DB already has a paid tier, keep DB tier.
    // - If UI requests a paid tier, honor it.
    let membership: Membership = requestedMembership;
    if (
      membership === 'trial' &&
      existingMembership &&
      existingMembership !== 'trial' &&
      (['amateur', 'professional', 'performer', 'semi-pro', 'admin'] as string[]).includes(existingMembership)
    ) {
      membership = existingMembership as Membership;
    }

    // Admin overrides everything.
    let trialEndDate: number | null =
      (user as any).trialEndDate ?? (typeof existing?.trial_end_date === 'number' ? existing?.trial_end_date : null);

    if (isAdmin || membership === 'admin') {
      membership = 'admin';
      trialEndDate = null;
    }

    // Enforce trial logic ONLY if not a recognized tier.
    if (!(['amateur', 'professional', 'performer', 'semi-pro', 'admin'] as Membership[]).includes(membership)) {
      membership = 'trial';
      if (!trialEndDate) {
        trialEndDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
      }
    }

    const row = {
      id: uid,
      email,
      membership,
      is_admin: isAdmin, // critical: preserve admin flag from DB
      generation_count: typeof user.generationCount === 'number' ? user.generationCount : 0,
      last_reset_date: user.lastResetDate ?? new Date().toISOString(),
      trial_end_date: membership === 'trial' ? trialEndDate : null
    };

    const { error } = await supabase.from(USERS_TABLE).upsert(row);
    if (error) throw error;
  } catch (error) {
    console.error('Failed to register/update user in Supabase', error);
  }
};


export const updateUserMembership = async (email: string, membership: Membership): Promise<User[]> => {
  try {
    const lower = email.toLowerCase();
    const updates: any = {
      membership,
      trial_end_date: membership === 'trial' ? undefined : null
    };

    const { error } = await supabase
      .from(USERS_TABLE)
      .update(updates)
      .eq('email', lower);
    if (error) throw error;
    return await getUsers();
  } catch (error) {
    console.error('Failed to update membership in Supabase', error);
    return [];
  }
};

export const deleteUser = async (email: string): Promise<User[]> => {
  try {
    const lower = email.toLowerCase();
    const { error } = await supabase.from(USERS_TABLE).delete().eq('email', lower);
    if (error) throw error;
    return await getUsers();
  } catch (error) {
    console.error('Failed to delete user in Supabase', error);
    return [];
  }
};

export const addUser = async (email: string, membership: Membership): Promise<User[] | { error: string }> => {
  try {
    const lower = email.toLowerCase();

    // Note: Creating a Supabase Auth user requires admin privileges (service role key) and should
    // be done server-side. This function is kept for UI compatibility and will create a placeholder
    // row in the users table only.
    const placeholderId = `placeholder-${Date.now()}`;
    const newUser: User = {
      email: lower,
      membership,
      isAdmin: lower === ADMIN_EMAIL,
      generationCount: 0,
      lastResetDate: new Date().toISOString()
    };

    const { error } = await supabase.from(USERS_TABLE).insert({
      id: placeholderId,
      email: newUser.email,
      membership: newUser.membership,
      is_admin: newUser.isAdmin,
      generation_count: newUser.generationCount,
      last_reset_date: newUser.lastResetDate,
      trial_end_date: membership === 'trial' ? Date.now() + 14 * 24 * 60 * 60 * 1000 : null
    });

    if (error) throw error;
    return await getUsers();
  } catch (error) {
    console.error('Failed to add user in Supabase', error);
    return { error: 'Failed to add user to database.' };
  }
};

export const checkAndUpdateUserTrialStatus = async (user: User, uid: string): Promise<User> => {
  try {
    const trialEnd = (user as any).trialEndDate;
    if (user.membership === 'trial' && typeof trialEnd === 'number' && trialEnd < Date.now()) {
      const { error } = await supabase
        .from(USERS_TABLE)
        .update({ membership: 'expired', trial_end_date: null })
        .eq('id', uid);
      if (error) throw error;
      return { ...user, membership: 'expired' as Membership };
    }
  } catch (error) {
    console.error('Failed to check/update trial status in Supabase', error);
  }
  return user;
};
