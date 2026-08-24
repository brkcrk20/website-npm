-- Rapor 1.2 fix: trade_offer_items.role hiç doğrulanmamış bir varsayımdı.
--
-- Önceki durum: kolon düz `text not null` idi, herhangi bir CHECK/ENUM yoktu.
-- Uygulama kodu (tradeService.ts) 'offered' / 'requested' string değerlerini
-- varsayım olarak kullanıyordu ama bu hiçbir yerde garanti altına alınmamıştı.
--
-- Bu migration, o varsayımı DB seviyesinde resmi bir kurala çevirir:
--   - Sadece 'offered' ve 'requested' değerlerine izin verilir.
--   - Kod ileride yanlışlıkla farklı bir string kullanırsa (örn. 'given'),
--     INSERT/UPDATE anında anlaşılır bir hata verir; sessizce bozuk veri
--     veya "role eşleşmiyor, teklif ekranı boş görünüyor" gibi teşhisi zor
--     bir arıza üretmez.

-- Önce mevcut satırlarda beklenmeyen bir değer var mı diye kontrol et.
-- Varsa migration burada durur ve elle müdahale ister — bu, constraint'i
-- sessizce atlamaktan veya yanlış veriyi olduğu gibi bırakmaktan iyidir.
do $$
declare
  bad_count integer;
begin
  select count(*) into bad_count
  from public.trade_offer_items
  where role not in ('offered', 'requested');

  if bad_count > 0 then
    raise exception
      'trade_offer_items.role için beklenmeyen % satır var. '
      'Constraint eklenmeden önce bu satırlar düzeltilmeli.', bad_count;
  end if;
end $$;

alter table public.trade_offer_items
  drop constraint if exists trade_offer_items_role_check;

alter table public.trade_offer_items
  add constraint trade_offer_items_role_check
  check (role in ('offered', 'requested'));
