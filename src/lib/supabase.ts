/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

/**
 * Supabase istemcisi.
 *
 * Ortam değişkenleri eksikse eskiden burada `throw` ediliyordu; bu, modül
 * yüklenirken patladığı için uygulamayı bomboş beyaz bir ekrana
 * düşürüyordu ve hatanın nedeni yalnızca konsolda görünüyordu. Artık
 * istemci güvenli bir yer tutucuyla kuruluyor ve `isSupabaseConfigured`
 * false dönüyor; App bunu görüp ne yapılması gerektiğini anlatan bir
 * kurulum ekranı gösteriyor.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured) {
  console.error(
    'Supabase ayarları eksik. Proje kökünde bir .env dosyası oluşturup ' +
      'VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY değerlerini girin ' +
      '(örnek için .env.example dosyasına bakın).'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost:54321',
  supabasePublishableKey || 'public-anon-key-placeholder'
);
