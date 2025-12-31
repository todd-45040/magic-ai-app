
import { supabase } from '../supabase';
import type { User, Membership } from '../types';
import { ADMIN_EMAIL } from '../constants';

export const getUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*');
  
  if (error) {
    console.error("Failed to get users:", error);
    return [];
  }
  return data as User[];
};

export const getUserProfile = async (uid: string): Promise<User | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
        
    if (error) return null;
    
    // Map snake_case to camelCase
    return {
        id: data.id,
        email: data.email,
        membership: data.membership,
        isAdmin: data.is_admin,
        trialEndDate: data.trial_end_date ? new Date(data.trial_end_date).getTime() : undefined,
        generationCount: data.generation_count || 0,
        lastResetDate: data.last_reset_date || new Date().toISOString(),
        emailVerified: data.email_verified
    } as User;
};

export const registerOrUpdateUser = async (user: User, uid: string): Promise<void> => {
    const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', uid)
        .single();

    if (existing) {
        await supabase
            .from('profiles')
            .update({ email: user.email })
            .eq('id', uid);
    } else {
        const trialEndDate = Date.now() + 14 * 24 * 60 * 60 * 1000;
        await supabase
            .from('profiles')
            .insert([{
                id: uid,
                email: user.email,
                membership: 'trial',
                trial_end_date: new Date(trialEndDate).toISOString(),
                is_admin: user.email === ADMIN_EMAIL,
                generation_count: 0,
                last_reset_date: new Date().toISOString()
            }]);
    }
};

export const updateUserMembership = async (email: string, membership: Membership): Promise<User[]> => {
    await supabase
        .from('profiles')
        .update({ 
            membership,
            trial_end_date: membership === 'trial' ? new Date(Date.now() + 1209600000).toISOString() : null 
        })
        .eq('email', email);
    
    return await getUsers();
};

export const deleteUser = async (email: string): Promise<User[]> => {
    await supabase.from('profiles').delete().eq('email', email);
    return await getUsers();
};

// FIX: Export addUser function
export const addUser = async (email: string, membership: Membership): Promise<User[] | { error: string }> => {
    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).single();
    if (existing) return { error: 'User already exists' };

    const trialEndDate = membership === 'trial' ? new Date(Date.now() + 1209600000).toISOString() : null;

    await supabase.from('profiles').insert([{
        email,
        membership,
        trial_end_date: trialEndDate,
        is_admin: email === ADMIN_EMAIL,
        generation_count: 0,
        last_reset_date: new Date().toISOString()
    }]);

    return await getUsers();
};

export const checkAndUpdateUserTrialStatus = async (user: User, uid: string): Promise<User> => {
    if (user.membership === 'trial' && user.trialEndDate && user.trialEndDate < Date.now()) {
        const updatedUser = { ...user, membership: 'expired' as Membership };
        await supabase
            .from('profiles')
            .update({ membership: 'expired', trial_end_date: null })
            .eq('id', uid);
        return updatedUser;
    }
    return user;
};
