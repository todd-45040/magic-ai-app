
import { supabase } from '../supabase';
import type { User, Membership } from '../types';

const TIER_LIMITS: Record<Membership, number> = {
  'free': 10,
  'trial': 100,
  'amateur': 50,
  'semi-pro': 200,
  'professional': 10000, // Effectively unlimited
  'expired': 0
};

export const checkUsage = async (user: User): Promise<{ canProceed: boolean; remaining: number }> => {
  const now = new Date();
  const lastReset = new Date(user.lastResetDate);
  
  // Reset usage if it's a new day
  if (now.toDateString() !== lastReset.toDateString()) {
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        generation_count: 0, 
        last_reset_date: now.toISOString() 
      })
      .eq('id', user.id)
      .select()
      .single();
    
    if (error) return { canProceed: false, remaining: 0 };
    
    return { 
      canProceed: true, 
      remaining: TIER_LIMITS[user.membership] 
    };
  }

  const remaining = TIER_LIMITS[user.membership] - user.generationCount;
  return { 
    canProceed: remaining > 0, 
    remaining: Math.max(0, remaining) 
  };
};

export const incrementUsage = async (userId: string) => {
  const { error } = await supabase.rpc('increment_generation_count', { user_id: userId });
  if (error) console.error("Failed to increment usage:", error);
};

export const getTierLimit = (membership: Membership): number => {
    return TIER_LIMITS[membership];
};
