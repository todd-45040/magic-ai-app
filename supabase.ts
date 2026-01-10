import { createClient } from '@supabase/supabase-js';

// IMPORTANT (Vite): use import.meta.env on the client.
// Using process.env in browser code can crash production builds ("process is not defined").
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Chainable mock for Supabase to prevent crashes during development/preview without keys
const mockSupabase = {
  from: () => ({
    select: () => ({ 
      eq: () => ({ 
        order: () => Promise.resolve({ data: [], error: null }), 
        single: () => Promise.resolve({ data: null, error: null }),
        limit: () => Promise.resolve({ data: [], error: null })
      }),
      single: () => Promise.resolve({ data: null, error: null }),
      order: () => Promise.resolve({ data: [], error: null })
    }),
    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
  }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: {}, error: new Error("Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your environment variables.") }),
    signUp: () => Promise.resolve({ data: {}, error: new Error("Supabase not configured") }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: new Error("Supabase not configured") }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  rpc: () => Promise.resolve({ error: null })
} as any;

const isConfigValid = !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== "undefined" && supabaseUrl !== "";

// Exported so the app/UI can gracefully disable auth/cloud features when env vars are missing.
export const isSupabaseConfigValid = isConfigValid;

export const supabase = isConfigValid
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'magic_ai_wizard_auth',
      },
    })
  : mockSupabase;

if (!isConfigValid) {
  console.warn("⚠️ Supabase configuration is missing. Cloud features will be disabled. Check your .env file or hosting provider settings.");
}