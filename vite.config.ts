import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    proxy: {
      // All /api/* requests → Express backend on port 3001
      // This ONLY works when VITE_API_URL=/api (relative), NOT an absolute URL.
      '/api': {
        target:       'http://localhost:3001',
        changeOrigin: true,
        // Do NOT add rewrite — the backend routes are mounted at /api/...
        // so the path must be forwarded as-is.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[vite proxy] Backend unreachable:', err.message);
            console.error('  → Make sure the backend is running: cd backend && npm run dev');
          });
        },
      },
    },
  },
});