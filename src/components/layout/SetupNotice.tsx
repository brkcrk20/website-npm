import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Supabase ayarları eksikken gösterilen kurulum ekranı.
 * Beyaz ekran yerine ne yapılması gerektiğini söyler.
 */
export const SetupNotice: React.FC = () => (
  <div className="min-h-dvh bg-stone-950 text-stone-100 flex items-center justify-center p-6">
    <div className="max-w-md w-full space-y-4">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle className="w-5 h-5" />
        <h1 className="text-lg font-bold">Supabase bağlantısı yapılandırılmamış</h1>
      </div>

      <p className="text-sm text-stone-300 leading-relaxed">
        Uygulamanın çalışması için Supabase proje bilgileri gerekiyor. Proje kökünde bir{' '}
        <code className="px-1 py-0.5 rounded bg-stone-800 text-emerald-300">.env</code> dosyası
        oluştur ve şu iki değeri gir:
      </p>

      <pre className="p-4 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-emerald-300 overflow-x-auto">
        {`VITE_SUPABASE_URL="https://<proje-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-public-key>"`}
      </pre>

      <p className="text-xs text-stone-400 leading-relaxed">
        Bu değerleri Supabase panelinde <strong>Project Settings → API</strong> bölümünde
        bulabilirsin. Dosyayı kaydettikten sonra geliştirme sunucusunu yeniden başlat.
      </p>

      <p className="text-xs text-stone-400 leading-relaxed">
        Ayrıca <code className="px-1 py-0.5 rounded bg-stone-800">supabase/migrations</code>{' '}
        altındaki dosyaların veritabanına uygulanmış olması gerekir:{' '}
        <code className="px-1 py-0.5 rounded bg-stone-800">supabase db push</code>
      </p>
    </div>
  </div>
);
