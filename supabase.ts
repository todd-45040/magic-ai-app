
import { createClient } from '@supabase/supabase-js';

// FIX: Use (import.meta as any).env to resolve the error where TypeScript does not recognize the 'env' property on ImportMeta.
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
