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
  console.log("BUILD ENV MERGED CHECK:", {
    hasGeminiKey: Boolean(env.VITE_GEMINI_API_KEY),
    hasGeminiLiveKey: Boolean(env.VITE_GEMINI_LIVE_API_KEY),
  });
  // Only expose VITE_* variables to the client bundle
  const clientEnv = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('VITE_')));

  return {
    plugins: [react()],

    resolve: {
      dedupe: ["react", "react-dom"],
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          app: resolve(__dirname, "app/index.html"),
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
