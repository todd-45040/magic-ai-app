import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on mode, but also merge in process.env
  // to catch variables set directly in the environment (common in CI/Vercel).
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };

  return {
    plugins: [react()],

    // Multi-page build: marketing site at / and app at /app/
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app/index.html'),
        },
      },
    },

    server: {
      port: 3000,
    },

    // Expose env vars if you were using `define` previously.
    // With Vite, client code should use `import.meta.env.*`.
    define: {
      'process.env': env, // keeps any legacy references from breaking build tools
    },
  };
});
