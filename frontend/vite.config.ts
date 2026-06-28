import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_API_BASE_URL ?? 'http://localhost:9898';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8989,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 8989,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
