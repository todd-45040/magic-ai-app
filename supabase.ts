import { createClient } from '@supabase/supabase-js';

// IMPORTANT (Vite): use import.meta.env on the client.
// Using process.env in browser code can crash production builds ("process is not defined").
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// DEBUG (safe): expose whether Vite injected required Supabase env vars.
// This does NOT expose the key values.
if (typeof window !== 'undefined') {
  (window as any).__SUPABASE_ENV_CHECK__ = {
    hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
    hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
    ts: Date.now(),
  };
}

const isConfigValid =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  supabaseUrl !== 'undefined' &&
  supabaseAnonKey !== 'undefined' &&
  supabaseUrl !== '' &&
  supabaseAnonKey !== '';

const isLocalBrowserDev =
  typeof window !== 'undefined' &&
  (import.meta.env.DEV || /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname));

const failFastMessage =
  'Supabase client configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. In deployed environments this now fails fast instead of silently falling back to a mock client.';

// Exported so the app/UI can gracefully disable auth/cloud features when env vars are missing in local development only.
export const isSupabaseConfigValid = isConfigValid;

// Chainable mock for local development only
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
    signInWithPassword: () => Promise.resolve({ data: {}, error: new Error(failFastMessage) }),
    signUp: () => Promise.resolve({ data: {}, error: new Error(failFastMessage) }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: new Error(failFastMessage) }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  rpc: () => Promise.resolve({ error: null })
} as any;

if (!isConfigValid && typeof window !== 'undefined' && !isLocalBrowserDev) {
  console.error(failFastMessage);
  throw new Error(failFastMessage);
}

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

if (!isConfigValid && isLocalBrowserDev) {
  console.warn('⚠️ Supabase configuration is missing in local development. Mock client enabled for local-only resilience.');
}
