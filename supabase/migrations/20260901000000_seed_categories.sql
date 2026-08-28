-- =============================================================================
-- KATEGORİ TOHUMU (seed)
--
-- `public.categories` tablosunu dolduran hiçbir migration ya da seed yoktu.
-- Canlı projede satırlar elle eklenmiş; ama sıfırdan kurulan HER ortamda
-- (`supabase db reset`, yeni bir staging projesi, yerel test veritabanı)
-- tablo boş kalıyor ve ilan verme TAMAMEN çalışmıyor:
--
--   * `listings.category_id` → `categories(id)` yabancı anahtarı,
--   * `listingService.categoryUuidBySlug()` slug bulamayınca null dönüyor,
--   * dolayısıyla `createListing()` sessizce başarısız oluyor.
--
-- Kaynak liste `src/constants/index.ts` içindeki `CATEGORIES`. Tasarım
-- dokümanı "bu liste canlı `categories` tablosuyla birebir eşleşiyor"
-- diyor — eşleşmenin kod tarafında değil, burada garanti altına alınması
-- gerekiyordu.
--
-- `on conflict (slug) do nothing`: canlıda zaten var olan satırlara
-- dokunmaz (id'leri korunur, ilanların yabancı anahtarları kırılmaz),
-- yalnızca eksik olanları ekler. Tekrar tekrar çalıştırılabilir.
-- =============================================================================

-- Slug'ın benzersiz olması bu seed'in (ve `categoryUuidBySlug`'ın) ön şartı.
create unique index if not exists categories_slug_key on public.categories (slug);

insert into public.categories (slug, name, icon) values
  ('electronics',  'Elektronik',     'Laptop'),
  ('sports',       'Spor & Outdoor', 'Bike'),
  ('home-living',  'Ev & Yaşam',     'Home'),
  ('fashion',      'Giyim & Moda',   'Shirt'),
  ('hobby',        'Hobi & Oyun',    'Gamepad2'),
  ('books',        'Kitap',          'BookOpen'),
  ('music',        'Müzik',          'Music'),
  ('photography',  'Fotoğraf',       'Camera'),
  ('collectibles', 'Koleksiyon',     'Gem'),
  ('other',        'Diğer',          'Package')
on conflict (slug) do nothing;

-- Kod tarafındaki `CategoryId` birliği ile DB'deki slug kümesinin
-- ayrışmadığını `src/services/__tests__` altındaki sözleşme testi
-- doğruluyor.
