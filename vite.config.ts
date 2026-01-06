import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  // Merge Vercel/CI env with .env files (if any)
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };
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
