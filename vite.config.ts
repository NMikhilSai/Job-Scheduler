import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      // Allow external access
      host: '0.0.0.0',

      // Allow Railway domain and local dev
      allowedHosts: [
        'job-scheduler-production-a426.up.railway.app',
        'localhost',
        '127.0.0.1',
      ],

      // Existing settings
      hmr: process.env.DISABLE_HMR !== 'true' && process.env.NODE_ENV !== 'production',
      watch: process.env.DISABLE_HMR === 'true' || process.env.NODE_ENV === 'production' ? null : {},
    },

    preview: {
      host: '0.0.0.0',
      allowedHosts: [
        'job-scheduler-production-a426.up.railway.app',
        'localhost',
        '127.0.0.1',
      ],
    },
  };
});
