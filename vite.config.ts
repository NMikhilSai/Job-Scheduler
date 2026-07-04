import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isProductionLike = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_PUBLIC_DOMAIN);

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
      allowedHosts: isProductionLike
        ? ['.up.railway.app', 'localhost', '127.0.0.1']
        : ['localhost', '127.0.0.1'],

      // Existing settings
      hmr: !isProductionLike && process.env.DISABLE_HMR !== 'true',
      watch: !isProductionLike && process.env.DISABLE_HMR !== 'true' ? {} : null,
    },

    preview: {
      host: '0.0.0.0',
      allowedHosts: isProductionLike
        ? ['.up.railway.app', 'localhost', '127.0.0.1']
        : ['localhost', '127.0.0.1'],
    },
  };
});
