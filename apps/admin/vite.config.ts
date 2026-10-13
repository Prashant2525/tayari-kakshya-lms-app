import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the API's HttpOnly refresh cookie (SameSite=Strict) works without CORS.
    proxy: {
      '/api': { target: process.env['VITE_API_PROXY'] ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env['VITE_API_PROXY'] ?? 'http://localhost:4000', changeOrigin: false },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // KI-018: the big libraries in their own files — they stay cached in staff browsers across CMS releases,
        // and download in parallel. Libraries used only by some pages (the rich-text editor, Sentry) stay lazy.
        advancedChunks: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            {
              name: 'vendor-tanstack',
              test: /node_modules[\/]@tanstack[\/](react-query|query-core|react-router|router-core|history|react-store|store|react-table|table-core)/,
            },
            { name: 'vendor-radix', test: /node_modules[\/](radix-ui|@radix-ui)[\/]/ },
            { name: 'vendor-zod', test: /node_modules[\/]zod[\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
