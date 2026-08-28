\set ON_ERROR_STOP on
begin;

-- ═════════════════════════════════════════════════════════════════════════
-- TAKAS KOLON DEĞİŞMEZLİĞİ TESTİ
--
-- 20260830000000_trade_column_immutability.sql'in kapattığı üç açığın
-- gerçekten kapandığını, meşru akışın ise bozulmadığını doğrular.
--
-- Çalıştırma: supabase/tests/README.md
-- ═════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.ok(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'BAŞARISIZ: %', label;
  end if;
  raise notice '  ok  %', label;
end;
$$;

create or replace function pg_temp.rejects(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ok  % (reddedildi: %)', label, left(sqlerrm, 70);
    return;
  end;
  raise exception 'BAŞARISIZ: % — kabul edilmemeliydi ama kabul edildi.', label;
end;
$$;


-- ── Sabit veri ──────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, phone, full_name) values
  ('11111111-1111-1111-1111-111111111111', '+905550000001', 'Saldırgan A'),
  ('22222222-2222-2222-2222-222222222222', '+905550000002', 'Kurban B');

-- Teste özel bir slug: 20260901000000 gerçek kategorileri tohumluyor,
-- 'electronics' artık seed'den geliyor ve fixture onunla çakışırdı.
insert into public.categories (id, name, slug) values
  ('33333333-3333-3333-3333-333333333333', 'Test Kategorisi', 'test-kategori');

insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'A ürünü', 'good', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'B ürünü', 'good', 'active');

insert into public.trade_offers (id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'offered'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 'requested');

insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');


\echo ''
\echo '=== 1) Onay damgaları istemciden yazılamaz'
select pg_temp.rejects($$
  update public.trades
     set sender_confirmed_at = now(), receiver_confirmed_at = now()
   where id = 'dddddddd-0000-0000-0000-000000000004'
$$, 'onay damgalarını doğrudan yazmak');

select pg_temp.rejects($$
  update public.trades
     set status = 'completed', sender_confirmed_at = now(), receiver_confirmed_at = now()
   where id = 'dddddddd-0000-0000-0000-000000000004'
$$, 'onay + tamamlandı tek UPDATE ile (eski sömürü)');


\echo ''
\echo '=== 2) Takasın tarafları değiştirilemez'
select pg_temp.rejects($$
  update public.trades set receiver_id = '11111111-1111-1111-1111-111111111111'
   where id = 'dddddddd-0000-0000-0000-000000000004'
$$, 'takasın alıcısını kendine çevirmek');


\echo ''
\echo '=== 3) Teklifin tarafları ve ömrü değiştirilemez'
select pg_temp.rejects($$
  update public.trade_offers set receiver_id = '11111111-1111-1111-1111-111111111111'
   where id = 'cccccccc-0000-0000-0000-000000000003'
$$, 'teklifin alıcısını kendine çevirmek (eski sömürü)');

select pg_temp.rejects($$
  update public.trade_offers set expires_at = now() + interval '10 years'
   where id = 'cccccccc-0000-0000-0000-000000000003'
$$, 'teklif ömrünü uzatmak');


\echo ''
\echo '=== 4) Kendine teklif / kendine takas açılamaz'
select pg_temp.rejects($$
  insert into public.trade_offers (sender_id, receiver_id, status)
  values ('11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111', 'pending')
$$, 'kendine teklif açmak');

select pg_temp.rejects($$
  insert into public.trades (offer_id, sender_id, receiver_id, status)
  values ('cccccccc-0000-0000-0000-000000000003',
          '11111111-1111-1111-1111-111111111111',
          '11111111-1111-1111-1111-111111111111', 'locked')
$$, 'kendine takas açmak');


\echo ''
\echo '=== 5) Meşru akış bozulmadı'
update public.trades set status = 'delivery_planned'
 where id = 'dddddddd-0000-0000-0000-000000000004';

select pg_temp.ok(
  (select status from public.trades where id = 'dddddddd-0000-0000-0000-000000000004')
    = 'delivery_planned',
  'takas durumu normal şekilde ilerliyor');

-- confirm_trade_receipt() security definer; auth.uid() stub'ı
-- request.jwt.claim.sub üzerinden okuyor (bkz. 00_supabase_stub.sql).
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.ok(
  public.confirm_trade_receipt('dddddddd-0000-0000-0000-000000000004') = 'waiting',
  'A onayladı, karşı taraf bekleniyor');

select pg_temp.ok(
  (select sender_confirmed_at is not null and receiver_confirmed_at is null
     from public.trades where id = 'dddddddd-0000-0000-0000-000000000004'),
  'yalnızca A''nın onayı yazıldı');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.ok(
  public.confirm_trade_receipt('dddddddd-0000-0000-0000-000000000004') = 'both_confirmed',
  'B de onayladı');

select pg_temp.ok(
  (select status = 'received' and sender_confirmed_at is not null
          and receiver_confirmed_at is not null
     from public.trades where id = 'dddddddd-0000-0000-0000-000000000004'),
  'iki onaydan sonra takas "received" adımına geçti');

-- İki taraf da onayladıktan sonra tamamlama serbest.
update public.trades set status = 'completed', completed_at = now()
 where id = 'dddddddd-0000-0000-0000-000000000004';

select pg_temp.ok(
  (select status from public.trades where id = 'dddddddd-0000-0000-0000-000000000004')
    = 'completed',
  'meşru yoldan tamamlanabiliyor');


\echo ''
\echo '=== 6) RPC yetkileri: istemci sahte bildirim yazamaz (20260831000000)'
select pg_temp.ok(
  not has_function_privilege('authenticated',
    'public.push_notification(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'push_notification authenticated''a kapalı');

select pg_temp.ok(
  not has_function_privilege('anon',
    'public.push_notification(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid)', 'execute'),
  'push_notification anon''a kapalı');

select pg_temp.ok(
  not has_function_privilege('authenticated', 'public.recalc_trust_score(uuid)', 'execute'),
  'recalc_trust_score istemciye kapalı');

select pg_temp.ok(
  not has_function_privilege('authenticated', 'public.expire_stale_trade_offers()', 'execute'),
  'expire_stale_trade_offers istemciye kapalı');

-- RLS politikalarının içinden çağrıldıkları için bunlar AÇIK kalmalı.
select pg_temp.ok(
  has_function_privilege('authenticated', 'public.is_blocked_between(uuid,uuid)', 'execute'),
  'is_blocked_between açık kaldı (RLS politikaları çağırıyor)');


\echo ''
\echo '=== 7) Sohbetin karşı tarafı değiştirilemez'
insert into public.conversations (id, participant_one_id, participant_two_id)
values ('eeeeeeee-0000-0000-0000-000000000005',
        '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select pg_temp.rejects($$
  update public.conversations
     set participant_two_id = '11111111-1111-1111-1111-111111111111'
   where id = 'eeeeeeee-0000-0000-0000-000000000005'
$$, 'sohbetin karşı tarafını değiştirmek (özel yazışma sızdırma)');

-- Meşru güncelleme (aktif takas bağlama) çalışmaya devam etmeli.
update public.conversations set active_trade_offer_id = 'cccccccc-0000-0000-0000-000000000003'
 where id = 'eeeeeeee-0000-0000-0000-000000000005';
select pg_temp.ok(true, 'sohbete aktif takas bağlanabiliyor');


\echo ''
\echo '=== 8) Yanıtlanmış teklifin kalemleri kilitli'
-- Teklif hâlâ 'pending' iken kalem silmek MEŞRU (kullanıcı teklifini
-- düzenliyor); kilit ancak teklif yanıtlandıktan sonra devreye girer.
delete from public.trade_offer_items
 where offer_id = 'cccccccc-0000-0000-0000-000000000003' and role = 'requested';
select pg_temp.ok(true, 'bekleyen teklifin kalemi silinebiliyor');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 'requested');

update public.trade_offers set status = 'accepted'
 where id = 'cccccccc-0000-0000-0000-000000000003';

select pg_temp.rejects($$
  delete from public.trade_offer_items
   where offer_id = 'cccccccc-0000-0000-0000-000000000003'
     and role = 'requested'
$$, 'kabul edilmiş teklifin kalemini silmek (ilan sonsuza kadar in_trade kalır)');


\echo ''
\echo '=== 9) Şikayette yönetici alanları istemciden yazılamaz'
insert into public.reports (id, reporter_id, target_type, target_id, reason, description,
                            status, priority, resolution_note, resolved_by)
values ('ffffffff-0000-0000-0000-000000000006',
        '11111111-1111-1111-1111-111111111111', 'listing',
        'aaaaaaaa-0000-0000-0000-000000000002', 'fraud', 'test',
        'resolved', 'low', 'İncelendi, haksız bulundu',
        '22222222-2222-2222-2222-222222222222');

select pg_temp.ok(
  (select status = 'pending' and priority = 'normal'
          and resolution_note is null and resolved_by is null
     from public.reports where id = 'ffffffff-0000-0000-0000-000000000006'),
  'uydurma yönetici kararı sıfırlandı, şikayet kaydı korundu');



\echo ''
\echo '=== 10) Bir ilan aynı anda tek takasta (20260902000000)'
insert into auth.users (id) values ('99999999-9999-9999-9999-999999999999');
insert into public.profiles (id, phone, full_name)
values ('99999999-9999-9999-9999-999999999999', '+905550000009', 'Üçüncü kişi C');

-- Bu bölüm için taze ilanlar: yukarıdaki takas tamamlandığı için B'nin
-- ilk ilanı artık `traded` ve yeniden kilitlenemez.
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000009', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'C ürünü', 'good', 'active'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'B''nin ikinci ürünü', 'good', 'active');

-- C, B'nin ikinci ilanını istiyor.
insert into public.trade_offers (id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000009',
   '99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'pending');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('cccccccc-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000009',
   '99999999-9999-9999-9999-999999999999', 'offered'),
  ('cccccccc-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-00000000000b',
   '22222222-2222-2222-2222-222222222222', 'requested');

-- O ilan başka bir takasta kilitliymiş gibi davran. `in_trade` yalnızca
-- sistem tarafından yazılabildiği için (20260828000000) kilit bayrağıyla.
set local swaloop.trade_lock = 'on';
update public.listings set status = 'in_trade'
 where id = 'aaaaaaaa-0000-0000-0000-00000000000b';
set local swaloop.trade_lock = 'off';

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.rejects($$
  select public.accept_trade_offer('cccccccc-0000-0000-0000-000000000009')
$$, 'aynı ürün için ikinci teklifi de kabul etmek');



\echo ''
\echo '=== 11) "Aradığın bulundu" bildirimi ekrandaki eşleşmeyle aynı şeyi söylüyor'
-- Eski kural: 3+ harfli HERHANGİ bir kelime ilan başlığında geçiyorsa
-- bildirim. Dolgu kelimeler elenmediği için "Bir bisiklet arıyorum"
-- ihtiyacındaki "bir", içinde "bir" geçen HER ilanla eşleşiyordu.

select pg_temp.ok(
  public.need_content_word_count('Bir bisiklet arıyorum') = 1,
  'dolgu kelimeler (bir / arıyorum) içerik sayılmıyor');

select pg_temp.ok(
  public.need_word_hits('Bir bisiklet arıyorum', 'Birinci el kitap seti') = 0,
  '"bir" artık "Birinci el kitap" ile eşleşmiyor (bildirim çöplüğü)');

select pg_temp.ok(
  public.need_word_hits('Bir bisiklet arıyorum', 'Bira bardağı') = 0,
  '"bir" artık "Bira bardağı" ile eşleşmiyor');

select pg_temp.ok(
  public.need_word_hits('Bir bisiklet arıyorum', 'Bisikletim takasa açık') = 1,
  'ek almış başlıkla eşleşiyor (bisiklet → bisikletim)');

select pg_temp.ok(
  public.need_word_hits('bisiklet', 'BISIKLET SATILIK') = 1,
  'Türkçe klavyesiz yazılmış başlıkla da eşleşiyor');

select pg_temp.ok(
  public.fold_tr('BISIKLET') = 'bisiklet' and public.fold_tr('Kılıf') = 'kilif',
  'fold_tr, istemcideki foldTurkish ile aynı sonucu veriyor');

select pg_temp.ok(
  not has_function_privilege('authenticated', 'public.need_word_hits(text,text)', 'execute'),
  'yardımcı eşleştirme fonksiyonları istemciye kapalı');


\echo ''
\echo '=== 12) Boş ya da tek taraflı teklif kabul edilemez (20260902000000)'
-- `trade_offer_items_role_check` yalnızca değerin ('offered','requested')
-- içinde olmasını zorluyordu; kalem SAYISI hiç doğrulanmıyordu. Sıfır
-- kalemli bir teklif kabul edilebiliyor, hiçbir ürün el değiştirmeden
-- iki tarafın da `completed_trades` sayacı artıyordu.

insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-00000000000c', '99999999-9999-9999-9999-999999999999',
   '33333333-3333-3333-3333-333333333333', 'C''nin ikinci ürünü', 'good', 'active'),
  ('aaaaaaaa-0000-0000-0000-00000000000d', '22222222-2222-2222-2222-222222222222',
   '33333333-3333-3333-3333-333333333333', 'B''nin üçüncü ürünü', 'good', 'active');

-- (a) Hiç kalemi olmayan teklif.
insert into public.trade_offers (id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-00000000000a',
   '99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'pending');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.rejects($$
  select public.accept_trade_offer('cccccccc-0000-0000-0000-00000000000a')
$$, 'hiç ürünü olmayan teklif kabul edilemiyor');

-- (b) Yalnızca "istenen" kalemi olan teklif: karşılığında hiçbir şey yok.
insert into public.trade_offers (id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-00000000000b',
   '99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'pending');
insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('cccccccc-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000d',
   '22222222-2222-2222-2222-222222222222', 'requested');

select pg_temp.rejects($$
  select public.accept_trade_offer('cccccccc-0000-0000-0000-00000000000b')
$$, 'tek taraflı "ver bana" teklifi kabul edilemiyor');

-- (c) İki tarafı da olan teklif geçiyor (kural fazla geniş olmasın).
insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('cccccccc-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-00000000000c',
   '99999999-9999-9999-9999-999999999999', 'offered');

select pg_temp.ok(
  public.accept_trade_offer('cccccccc-0000-0000-0000-00000000000b') is not null,
  'iki tarafı da olan teklif kabul edilebiliyor');


\echo ''
\echo '=== 13) Tek taraflı onayda karşı tarafa bildirim gidiyor (20260830000000)'
-- `confirm_trade_receipt()` ilk onaydan sonra çıplak `return ''waiting''`
-- diyordu; `notify_on_trade_status()` de bu durumu kapsamıyor. Yani karşı
-- taraf, kendisinden onay beklendiğini uygulamayı kendiliğinden açmadıkça
-- ÖĞRENEMİYORDU ve takas iki taraf birbirini beklerken asılı kalıyordu.

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select pg_temp.ok(
  public.confirm_trade_receipt(
    (select id from public.trades where offer_id = 'cccccccc-0000-0000-0000-00000000000b')
  ) = 'waiting',
  'ilk onay "waiting" dönüyor');

select pg_temp.ok(
  exists (
    select 1 from public.notifications
    where user_id = '22222222-2222-2222-2222-222222222222'
      and type = 'trade_status'
      and title = 'Karşı taraf teslimatı onayladı'
  ),
  'karşı tarafa "sen de onayla" bildirimi gitti');

select pg_temp.ok(
  not exists (
    select 1 from public.notifications
    where user_id = '99999999-9999-9999-9999-999999999999'
      and title = 'Karşı taraf teslimatı onayladı'
  ),
  'onayı veren kendine bildirim almıyor');


\echo ''
\echo '=== 14) İlan kolonları istemciden yazılamaz (20260904000000)'
-- `listings_update_own` politikası ilan sahibine TÜM kolonları açıyordu;
-- Postgres'te kolon bazlı RLS yok. Sonuç: sayaçlar şişirilebiliyor,
-- `created_at` tazelenerek keşif sıralaması kalıcı olarak ele
-- geçirilebiliyor, `slug` değiştirilerek paylaşılmış bağlantılar
-- kırılabiliyordu.

insert into public.listings (id, owner_id, category_id, title, condition, status, slug) values
  ('aaaaaaaa-0000-0000-0000-00000000000e', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Kolon testi ürünü', 'good', 'active',
   'kolon-testi-urunu');

select pg_temp.rejects($$
  update public.listings set view_count = 99999
   where id = 'aaaaaaaa-0000-0000-0000-00000000000e'
$$, 'görüntülenme sayacı istemciden şişirilemiyor');

select pg_temp.rejects($$
  update public.listings set favorite_count = 4242
   where id = 'aaaaaaaa-0000-0000-0000-00000000000e'
$$, 'favori sayacı istemciden şişirilemiyor');

-- NOT: `now()` işlem başlangıç zamanıdır ve satır aynı işlemde
-- eklendiği için `now()` yazmak DEĞİŞİKLİK SAYILMAZ. Gerçek saldırı da
-- zaten "ileri bir zaman" yazmaktır (liste `created_at desc` sıralı).
select pg_temp.rejects($$
  update public.listings set created_at = now() + interval '1 day'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000e'
$$, 'created_at tazelenip sıralama ele geçirilemiyor');

select pg_temp.rejects($$
  update public.listings set slug = 'baska-slug'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000e'
$$, 'slug değiştirilip paylaşılmış bağlantılar kırılamıyor');

select pg_temp.rejects($$
  update public.listings set owner_id = '22222222-2222-2222-2222-222222222222'
   where id = 'aaaaaaaa-0000-0000-0000-00000000000e'
$$, 'ilan başka bir kullanıcıya devredilemiyor');

-- Meşru akış bozulmadı: başlık/açıklama hâlâ düzenlenebiliyor.
update public.listings set title = 'Kolon testi ürünü (düzeltildi)'
 where id = 'aaaaaaaa-0000-0000-0000-00000000000e';
select pg_temp.ok(
  (select title from public.listings where id = 'aaaaaaaa-0000-0000-0000-00000000000e')
    = 'Kolon testi ürünü (düzeltildi)',
  'başlık hâlâ düzenlenebiliyor (kural fazla geniş değil)');

-- Sayacı yazan iki meşru yol çalışmayı sürdürüyor.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.increment_listing_view('aaaaaaaa-0000-0000-0000-00000000000e');
select pg_temp.ok(
  (select view_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-00000000000e') = 1,
  'increment_listing_view() sayacı hâlâ artırabiliyor');

insert into public.favorites (user_id, listing_id)
values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-00000000000e');
select pg_temp.ok(
  (select favorite_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-00000000000e') = 1,
  'favori tetikleyicisi sayacı hâlâ artırabiliyor');

-- İlan sahibi kendi ilanını açtığında sayaç artmıyor (eski kural korundu).
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.increment_listing_view('aaaaaaaa-0000-0000-0000-00000000000e');
select pg_temp.ok(
  (select view_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-00000000000e') = 1,
  'ilan sahibinin kendi görüntülemesi sayılmıyor');

-- INSERT tarafı: sistem durumuyla ilan açılamıyor. Böyle bir ilan bir daha
-- ne düzeltilebiliyor ne kaldırılabiliyordu (in_trade'den çıkış yasak).
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-00000000000f', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Kilitli doğan ilan', 'good', 'in_trade');
select pg_temp.ok(
  (select status from public.listings where id = 'aaaaaaaa-0000-0000-0000-00000000000f') = 'active',
  'sistem durumuyla açılan ilan active''e çekiliyor');

-- `paused` meşru bir başlangıç durumu; korunuyor.
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Duraklatılmış doğan ilan', 'good', 'paused');
select pg_temp.ok(
  (select status from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000010') = 'paused',
  'paused başlangıç durumu korunuyor');

-- `condition` kapalı küme: istemcinin tanıdığı beş değer.
select pg_temp.rejects($$
  insert into public.listings (owner_id, category_id, title, condition)
  values ('11111111-1111-1111-1111-111111111111',
          '33333333-3333-3333-3333-333333333333', 'Uydurma durum', 'mukemmel')
$$, 'tanınmayan condition değeri reddediliyor');


\echo ''
\echo '=== 15) Takasın geçmişi uydurulamıyor (20260905000000)'
-- `trade_events_insert_parties` yalnızca "ekleyen taraflardan biri mi?"
-- diye soruyordu; `event_type`/`note` serbestti ve `actor_id is null`
-- açıkça izinliydi. Yani takasın herhangi bir tarafı, olmamış bir onayı
-- SİSTEM olayı gibi yazabiliyordu — üstelik tabloda DELETE politikası da
-- yok, satır bir daha silinemiyordu. Yöneticinin anlaşmazlıkta baktığı
-- kanıt bu tablodur.

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);

select pg_temp.rejects(format($$
  insert into public.trade_events (trade_id, actor_id, event_type, note)
  values (%L, null, 'verified', 'İki taraf da teslimatı onayladı.')
$$, (select id from public.trades where offer_id = 'cccccccc-0000-0000-0000-00000000000b')),
  'taraf, olmamış bir onayı sistem olayı gibi yazamıyor');

select pg_temp.rejects(format($$
  insert into public.trade_events (trade_id, actor_id, event_type)
  values (%L, null, 'offer_accepted')
$$, (select id from public.trades where offer_id = 'cccccccc-0000-0000-0000-00000000000b')),
  'kabul olayı elle yazılamıyor');

select pg_temp.rejects(format($$
  insert into public.trade_events (trade_id, actor_id, event_type)
  values (%L, null, 'her_sey_yolunda')
$$, (select id from public.trades where offer_id = 'cccccccc-0000-0000-0000-00000000000b')),
  'tanınmayan olay türü reddediliyor');

-- Meşru akış: istemcinin yazdığı türler geçiyor ve olay YAZANA bağlanıyor.
insert into public.trade_events (trade_id, actor_id, event_type)
select id, null, 'delivery_planned'
  from public.trades where offer_id = 'cccccccc-0000-0000-0000-00000000000b';

select pg_temp.ok(
  (select actor_id from public.trade_events
    where event_type = 'delivery_planned'
      and trade_id = (select id from public.trades
                       where offer_id = 'cccccccc-0000-0000-0000-00000000000b'))
    = '99999999-9999-9999-9999-999999999999',
  'boş bırakılan actor_id, olayı yazana bağlanıyor');


\echo ''
\echo '=== 16) Güven sayaçları kaynaktan türetiliyor (20260905000000)'
-- Sayaçlar kör `+1` ile artıyor, `recalc_trust_score` da onları
-- doğrulamadan okuyup güven puanını hesaplıyordu: sayaç bir kez bozulunca
-- düzelten hiçbir yol yoktu ve hata puana kalıcı geçiyordu.

update public.trust_profiles
   set completed_trades = 999, cancelled_trades = 42
 where user_id = '11111111-1111-1111-1111-111111111111';

select public.recalc_trust_score('11111111-1111-1111-1111-111111111111');

select pg_temp.ok(
  (select completed_trades from public.trust_profiles
    where user_id = '11111111-1111-1111-1111-111111111111')
  = (select count(*) from public.trades
      where status = 'completed'
        and (sender_id = '11111111-1111-1111-1111-111111111111'
             or receiver_id = '11111111-1111-1111-1111-111111111111')),
  'şişirilmiş completed_trades kaynaktan onarılıyor');

select pg_temp.ok(
  (select cancelled_trades from public.trust_profiles
    where user_id = '11111111-1111-1111-1111-111111111111')
  = (select count(*) from public.trades
      where status = 'cancelled'
        and (sender_id = '11111111-1111-1111-1111-111111111111'
             or receiver_id = '11111111-1111-1111-1111-111111111111')),
  'şişirilmiş cancelled_trades kaynaktan onarılıyor');

-- Güven profili olmayan bir kullanıcı için satır oluşturuluyor
-- (eskiden `update ... where` sessizce hiçbir şey yapmıyordu).
delete from public.trust_profiles where user_id = '11111111-1111-1111-1111-111111111111';
select public.recalc_trust_score('11111111-1111-1111-1111-111111111111');
select pg_temp.ok(
  exists (select 1 from public.trust_profiles
           where user_id = '11111111-1111-1111-1111-111111111111'),
  'eksik güven profili yeniden oluşturuluyor');


\echo ''
\echo '=== TÜM KONTROLLER GEÇTİ ==='

rollback;
