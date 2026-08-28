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
\echo '=== TÜM KONTROLLER GEÇTİ ==='

rollback;
