"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = exports.isSupabaseConfigValid = void 0;
var supabase_js_1 = require("@supabase/supabase-js");
// IMPORTANT (Vite): use import.meta.env on the client.
// Using process.env in browser code can crash production builds ("process is not defined").
var supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
var supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// DEBUG (safe): expose whether Vite injected required Supabase env vars.
// This does NOT expose the key values.
if (typeof window !== 'undefined') {
    window.__SUPABASE_ENV_CHECK__ = {
        hasUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
        hasAnonKey: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY),
        ts: Date.now(),
    };
}
// Chainable mock for Supabase to prevent crashes during development/preview without keys
var mockSupabase = {
    from: function () { return ({
        select: function () { return ({
            eq: function () { return ({
                order: function () { return Promise.resolve({ data: [], error: null }); },
                single: function () { return Promise.resolve({ data: null, error: null }); },
                limit: function () { return Promise.resolve({ data: [], error: null }); }
            }); },
            single: function () { return Promise.resolve({ data: null, error: null }); },
            order: function () { return Promise.resolve({ data: [], error: null }); }
        }); },
        insert: function () { return ({ select: function () { return ({ single: function () { return Promise.resolve({ data: null, error: null }); } }); } }); },
        update: function () { return ({ eq: function () { return Promise.resolve({ data: null, error: null }); } }); },
        delete: function () { return ({ eq: function () { return Promise.resolve({ data: null, error: null }); } }); },
    }); },
    auth: {
        getUser: function () { return Promise.resolve({ data: { user: null }, error: null }); },
        getSession: function () { return Promise.resolve({ data: { session: null }, error: null }); },
        signInWithPassword: function () { return Promise.resolve({ data: {}, error: new Error("Supabase not configured. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your environment variables.") }); },
        signUp: function () { return Promise.resolve({ data: {}, error: new Error("Supabase not configured") }); },
        signOut: function () { return Promise.resolve({ error: null }); },
        resetPasswordForEmail: function () { return Promise.resolve({ error: new Error("Supabase not configured") }); },
        onAuthStateChange: function () { return ({ data: { subscription: { unsubscribe: function () { } } } }); },
    },
    rpc: function () { return Promise.resolve({ error: null }); }
};
var isConfigValid = !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== "undefined" && supabaseUrl !== "";
// Exported so the app/UI can gracefully disable auth/cloud features when env vars are missing.
exports.isSupabaseConfigValid = isConfigValid;
exports.supabase = isConfigValid
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
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
