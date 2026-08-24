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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      environment: 'node',
      // `proje/` klasörü, kullanıcıya gönderilen proje.zip'in açılmış bir
      // KOPYASIDIR; aynı testleri ikinci kez (ve eski haliyle) çalıştırıp
      // gürültü üretiyordu. Tek doğruluk kaynağı `src/`.
      exclude: ['node_modules/**', 'dist/**', 'build/**', 'proje/**'],
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
