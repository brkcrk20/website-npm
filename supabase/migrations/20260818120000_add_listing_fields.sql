-- =============================================================================
-- BU MIGRATION ARTIK BİLİNÇLİ OLARAK BOŞ (no-op).
--
-- Dosya, `20260818135000_add_listing_fields.sql` ile BİREBİR AYNIYDI: aynı
-- kolonlar, aynı trigger. Ama bu sürüm, `public.listings` tablosunu
-- oluşturan `20260818130000_sync_remote_schema_structure.sql`'den ÖNCE
-- çalışıyor. Sonuç: canlı veritabanında sorun çıkarmıyordu (tablolar zaten
-- vardı) ama sıfırdan bir kurulumda (`supabase db reset` / yeni ortam) ilk
-- adımda "relation public.listings does not exist" hatası veriyor ve şema
-- hiç kurulamıyordu.
--
-- Dosya SİLİNMEDİ: canlı veritabanının `supabase_migrations.schema_migrations`
-- geçmişinde bu sürüm kayıtlı; dosyayı silmek `supabase db push`'un
-- "remote migration versions not found locally" hatası vermesine yol açar.
-- Bunun yerine içeriği boşaltıldı — kolonların ve trigger'ın gerçek tanımı
-- 20260818135000'de duruyor ve orası doğru sırada çalışıyor.
-- =============================================================================

select 1;
