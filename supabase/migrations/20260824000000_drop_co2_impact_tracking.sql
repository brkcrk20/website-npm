-- SVS / çevresel etki (CO2e, su, enerji) takibi uygulamadan tamamen
-- kaldırıldı. Bu migration, artık hiçbir kod yolunun yazmadığı ilgili
-- DB nesnelerini temizler.
--
-- NOT: Bu dosya sadece hazırlanmıştır, otomatik uygulanmamıştır.
-- Kullanıcı kendi ortamında `supabase db push` ile canlıya almalı ve
-- ardından `supabase gen types typescript` ile src/types/supabase.ts
-- dosyasını yeniden üretmelidir.

drop table if exists public.impact_records;

alter table public.community_posts
  drop column if exists trade_co2_saved;
