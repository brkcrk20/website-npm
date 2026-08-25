import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

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
          // Satıcı (vendor) kütüphaneleri ayrı parçalara bölünüyor: bunlar
          // sürüm değişene kadar sabit kaldığı için tarayıcı önbelleğinde
          // kalır, uygulama kodu her deploy'da yeniden inse bile tekrar
          // indirilmez. Sayfa bazlı bölme App.tsx'teki React.lazy ile
          // yapılıyor (rapor.txt §3).
          //
          // NOT: package.json'daki `motion` paketi kodda hiç kullanılmıyor;
          // bu yüzden burada listelenmiyor (listelenirse boş bir parça
          // üretiyor). Bağımlılığın kaldırılması ayrı bir temizlik işi.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            icons: ['lucide-react'],
          },
        },
      },
    },

    server: {
      host: '0.0.0.0',
      // Varsayılan port 4000. Eskiden 3000 sabitlenmişti; o port bu makinede
      // sık sık başka bir süreç tarafından tutuluyordu, bu yüzden varsayılan
      // değiştirildi. `PORT` ortam değişkeni ile hâlâ ezilebilir
      // (ör. `PORT=5000 npm run dev`). strictPort kapalı olduğu için seçilen
      // port meşgulse Vite bir sonraki boş porta geçer.
      port: Number(process.env.PORT) || 4000,
      strictPort: false,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      environment: 'node',
      exclude: ['node_modules/**', 'dist/**', 'build/**'],
      // src/lib/supabase.ts, bu iki değişken yoksa import anında hata
      // fırlatıyor; testlerde gerçek bir Supabase projesine bağlanılmadığı
      // için (istemci hep mock'lanıyor) yer tutucu değerler yeterli.
      // Gerçek bir .env varsa onun değerleri kazanır.
      env: {
        VITE_SUPABASE_URL:
          process.env.VITE_SUPABASE_URL ?? 'http://localhost:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY:
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'test-publishable-key',
      },
    },
  };
});
