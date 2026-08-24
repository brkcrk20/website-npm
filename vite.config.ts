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
    build: {
      rollupOptions: {
        output: {
          /**
           * Satıcı kodunu ayrı parçalara böl. Uygulama kodu her yayında
           * değişir ama React/Supabase/ikon paketleri nadiren değişir —
           * ayrı tutulunca tarayıcı önbelleği tekrar tekrar indirmez ve
           * ikinci açılış belirgin şekilde hızlanır.
           */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR, AI Studio'da DISABLE_HMR ile kapatılıyor.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
