import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  // Load local .env values first, then let real runtime env (Vercel/CI) override.
  // This prevents a committed .env.production with an empty value from wiping out
  // the Production key you set in Vercel.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };

  // Build-time sanity check (safe: booleans only)
  // NOTE: No AI keys should be present as VITE_* vars in production.
  console.log("BUILD ENV MERGED CHECK:", {
    hasSupabaseUrl: Boolean(env.VITE_SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(env.VITE_SUPABASE_ANON_KEY),
    hasFounderWindowStart: Boolean(env.VITE_FOUNDER_WINDOW_START),
  });
  // Only expose VITE_* variables to the client bundle
  const clientEnv = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('VITE_')));

  return {
    plugins: [react()],

    resolve: {
      dedupe: ["react", "react-dom"],
      extensions: [".ts", ".tsx", ".mts", ".js", ".jsx", ".json"],
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          app: resolve(__dirname, "app/index.html"),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('@stripe')) return 'vendor-stripe';
              if (id.includes('@google/genai')) return 'vendor-genai';
              if (id.includes('react')) return 'vendor-react';
              return 'vendor';
            }
            if (id.includes('/components/Admin')) return 'admin';
            if (id.includes('/components/LiveRehearsal') || id.includes('/components/VideoRehearsal') || id.includes('/services/geminiService')) return 'studio';
            if (id.includes('/components/Auth') || id.includes('/services/billingClient') || id.includes('/components/FoundingCirclePage')) return 'auth-billing';
          },
        },
      },
    },

    server: {
      port: 3000,
    },

    // Only here to support any legacy references to process.env in tooling.
    // In client code, prefer import.meta.env.*
    define: {
      // Prevent accidental leakage of server env vars into the client bundle
      "process.env": clientEnv,
    },
  };
});
