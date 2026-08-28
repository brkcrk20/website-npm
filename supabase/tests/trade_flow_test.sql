\set ON_ERROR_STOP on
begin;

-- ─────────────────────────────────────────────────────────────────────────
-- Test koşum yardımcıları.
--
-- Eski sürüm her kontrolü `select <ifade> as ad;` ile yazıyordu: sonuç `f`
-- olsa bile psql çıkışı 0 döndüğü için test "geçmiş" sayılıyordu ve
-- bozulmalar sessizce gözden kaçıyordu. Artık her kontrol başarısızlıkta
-- exception fırlatıyor, ON_ERROR_STOP ile koşum orada duruyor.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.ok(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'BAŞARISIZ: %', label;
  end if;
  raise notice '  ok  %', label;
end;
$$;

-- Verilen SQL'in gerçekten hata fırlattığını doğrular (kısıtlar için).
create or replace function pg_temp.rejects(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice '  ok  % (reddedildi: %)', label, left(sqlerrm, 60);
    return;
  end;
  raise exception 'BAŞARISIZ: % — kabul edilmemeliydi ama kabul edildi.', label;
end;
$$;


-- ── Sabit veri ──────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('44444444-4444-4444-4444-444444444444');

insert into public.profiles (id, phone, full_name) values
  ('11111111-1111-1111-1111-111111111111', '+905550000001', 'Ayşe'),
  ('22222222-2222-2222-2222-222222222222', '+905550000002', 'Mehmet'),
  ('44444444-4444-4444-4444-444444444444', '+905550000003', 'Zeynep');

insert into public.categories (id, name, slug) values
  ('33333333-3333-3333-3333-333333333333', 'Elektronik', 'electronics');

insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Kulaklık', 'very_good', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Bisiklet', 'good', 'active');


\echo ''
\echo '=== 1) profil eklenince trust_profiles satırı açılıyor mu?'
select pg_temp.ok(
  (select count(*) from public.trust_profiles) = 3,
  'her profil için trust_profiles satırı oluştu');


\echo ''
\echo '=== 2) favori sayacı senkron mu?'
insert into public.favorites (user_id, listing_id)
  values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok(
  (select favorite_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'favori eklenince sayaç arttı');

delete from public.favorites where listing_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.ok(
  (select favorite_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
  'favori silinince sayaç azaldı');


\echo ''
\echo '=== 3) teklif oluşturma ve kalem sahipliği kısıtı'
-- created_at bilerek geçmişe atılıyor: aynı transaction içinde now() sabit
-- olduğu için, updated_at tetikleyicisinin gerçekten çalıştığı ancak
-- oluşturma anı ile güncelleme anı farklıysa gözlemlenebilir.
insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method, created_at, updated_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'in_person', now() - interval '1 day', now() - interval '1 day');

select pg_temp.ok(
  (select status from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 'pending',
  'teklif "pending" olarak açıldı');

-- Karşı tarafın ilanı "verilen" olarak eklenemez (rapor: sahiplik kısıtı).
select pg_temp.rejects($$
  insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
    ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'offered')
$$, 'başkasının ilanı "offered" olarak eklenemiyor');

-- role kümesi dışında bir değer.
select pg_temp.rejects($$
  insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
    ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'given')
$$, 'trade_offer_items.role kümesi dışına kapalı');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'offered'),
  -- owner_id bilerek YANLIŞ veriliyor; trigger gerçek ilan sahibiyle düzeltmeli.
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'requested');

select pg_temp.ok(
  (select owner_id from public.trade_offer_items
    where listing_id = 'aaaaaaaa-0000-0000-0000-000000000002') = '22222222-2222-2222-2222-222222222222',
  'kalem owner_id, ilanın gerçek sahibiyle düzeltildi');


\echo ''
\echo '=== 4) teklif durum kümesi ve geçişleri'
select pg_temp.rejects($$
  update public.trade_offers set status = 'offer_sent' where id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'trade_offers.status kümesi dışına kapalı');

update public.trade_offers set status = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

select pg_temp.ok(
  (select updated_at > created_at from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  'teklif güncellenince updated_at ilerledi');

select pg_temp.rejects($$
  update public.trade_offers set status = 'rejected' where id = 'bbbbbbbb-0000-0000-0000-000000000001'
$$, 'sonuçlanmış teklifin durumu bir daha değişmiyor');


\echo ''
\echo '=== 5) takas başlayınca ilanlar kilitleniyor mu?'
insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');

select pg_temp.ok(
  (select bool_and(status = 'in_trade') from public.listings),
  'teklifteki ilanlar in_trade oldu');

-- Aynı teklif için ikinci bir takas satırı: fetchTradeRowByOfferId()
-- .maybeSingle() kullandığı için bu durumda teklif detayı kalıcı olarak
-- açılamaz hâle geliyordu.
select pg_temp.rejects($$
  insert into public.trades (offer_id, sender_id, receiver_id, status) values
    ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked')
$$, 'bir teklife ikinci takas satırı açılamıyor');

-- Teklifle taraf uyuşmazlığı: uydurma takas ile güven sayacı şişirme.
select pg_temp.rejects($$
  insert into public.trade_offers (id, sender_id, receiver_id, status) values
    ('bbbbbbbb-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted');
  insert into public.trades (offer_id, sender_id, receiver_id, status) values
    ('bbbbbbbb-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'locked')
$$, 'takas tarafları teklifin taraflarından farklı olamıyor');

select pg_temp.rejects($$
  update public.trades set status = 'verified' where id = 'cccccccc-0000-0000-0000-000000000001'
$$, 'trades.status kümesi dışına kapalı');


\echo ''
\echo '=== 6) takas tamamlanınca sayaçlar ve ilan durumları'
-- Takas artık tek taraflı tamamlanamıyor: iki tarafın da teslimat onayı
-- (confirm_trade_receipt) gerekiyor. Eskiden tek bir taraf status'u
-- 'completed' yapıp İKİ profilin de güven sayacını artırabiliyordu.
select pg_temp.rejects($$
  update public.trades set status = 'completed', completed_at = now()
    where id = 'cccccccc-0000-0000-0000-000000000001'
$$, 'iki taraf onaylamadan takas tamamlanamıyor');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok(
  public.confirm_trade_receipt('cccccccc-0000-0000-0000-000000000001') = 'waiting',
  'ilk onaydan sonra takas beklemede');

select pg_temp.ok(
  (select status from public.trades where id = 'cccccccc-0000-0000-0000-000000000001') = 'locked',
  'tek taraflı onay takası ilerletmedi');

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select pg_temp.rejects($$
  select public.confirm_trade_receipt('cccccccc-0000-0000-0000-000000000001')
$$, 'takasın tarafı olmayan onay veremiyor');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok(
  public.confirm_trade_receipt('cccccccc-0000-0000-0000-000000000001') = 'both_confirmed',
  'ikinci onayla iki taraf da onaylamış oldu');

select pg_temp.ok(
  (select status from public.trades where id = 'cccccccc-0000-0000-0000-000000000001') = 'received',
  'iki onaydan sonra takas "received" adımına geçti');

set local request.jwt.claim.sub = '';
update public.trades set status = 'completed', completed_at = now()
  where id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.ok(
  (select bool_and(completed_trades = 1) from public.trust_profiles
    where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  'iki tarafın completed_trades sayacı arttı');

select pg_temp.ok(
  (select bool_and(status = 'traded') from public.listings),
  'ilanlar traded oldu');


\echo ''
\echo '=== 7) değerlendirme kuralları ve güven puanı'
select pg_temp.rejects($$
  insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating) values
    ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 5)
$$, 'kendini değerlendirmek reddediliyor');

select pg_temp.rejects($$
  insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating) values
    ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 9)
$$, 'aralık dışı puan reddediliyor');

insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 4);

select pg_temp.rejects($$
  insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating) values
    ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 5)
$$, 'aynı takasa ikinci kez değerlendirme yazılamıyor');

-- trust_score = ortalama puan * 0.7 + güvenilirlik * 5 * 0.3
-- (bkz. 20260819120000_add_badge_trust_tracking.sql → recalc_trust_score)
-- Tek 4 puan, hiç iptal yok: 4 * 0.7 + 1 * 5 * 0.3 = 4.30
select pg_temp.ok(
  (select trust_score = 4.30 and average_rating = 4.00 and review_count = 1
     from public.trust_profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  'değerlendirme sonrası güven puanı yeniden hesaplandı');

\echo '--- 7b) değerlendirme SİLİNİNCE yeniden hesaplanıyor mu? (DELETE dalı)'
-- Bu adım iki hatayı birden yakalıyordu: (a) trust_events.review_id FK'si
-- `on delete` davranışı olmadığı için değerlendirme hiç silinemiyordu,
-- (b) trg_reviews_recalc_trust yalnızca INSERT'te çalıştığı için silme
-- sonrası ortalama donuyordu.
delete from public.reviews where trade_id = 'cccccccc-0000-0000-0000-000000000001';

select pg_temp.ok(
  (select trust_score = 5.00 and review_count = 0
     from public.trust_profiles where user_id = '22222222-2222-2222-2222-222222222222'),
  'değerlendirme silinince güven puanı yeniden hesaplandı');


\echo ''
\echo '=== 8) görüntülenme sayacı RPC'
-- auth.uid() burada NULL (oturum yok) → ilan sahibi kontrolü sayacı engellemez.
select public.increment_listing_view('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok(
  (select view_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'increment_listing_view() sayacı artırdı');

-- İlan sahibi kendi ilanını açtığında sayaç artmamalı.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.increment_listing_view('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok(
  (select view_count from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1,
  'ilan sahibinin kendi görüntülemesi sayılmadı');
set local request.jwt.claim.sub = '';


\echo ''
\echo '=== 9) iptal edilen takas ilanları geri yayına alıyor mu?'
-- 6. adımdaki ilanlar artık 'traded'; onları elle geri 'in_trade' yapmak
-- (eski test kurulumu) yeni durum tetikleyicisi tarafından reddediliyor —
-- bu senaryo için iki yeni ilan açılıyor.
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Gitar', 'good', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Amfi', 'good', 'active');

insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'in_person');
insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'offered'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000012', '22222222-2222-2222-2222-222222222222', 'requested');
update public.trade_offers set status = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000002';

insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');

select pg_temp.ok(
  (select bool_and(status = 'in_trade') from public.listings
    where id in ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000012')),
  'takas açılınca yeni ilanlar da kilitlendi');

-- Kilitli ilanın sahibi kilidi kendi eliyle çözemez (rapor 30): eskiden
-- `listings_update_own` politikası buna izin veriyordu ve aynı ilan ikinci
-- bir kişiye teklif edilebiliyordu.
select pg_temp.rejects($$
  update public.listings set status = 'active' where id = 'aaaaaaaa-0000-0000-0000-000000000011'
$$, 'kilitli ilanın durumunu sahibi değiştiremiyor');

update public.trades set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000002';

select pg_temp.ok(
  (select bool_and(status = 'active') from public.listings
    where id in ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000012')),
  'iptalden sonra ilanlar tekrar active');

select pg_temp.ok(
  (select bool_and(cancelled_trades = 1) from public.trust_profiles
    where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  'iptal sayaçları arttı');


\echo ''
\echo '=== 10) süresi dolmuş teklif kabul edilemiyor'
insert into public.trade_offers (id, sender_id, receiver_id, status, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', now() - interval '1 hour');

select pg_temp.rejects($$
  update public.trade_offers set status = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000003'
$$, 'süresi dolmuş teklif kabul edilemiyor');

select pg_temp.ok(
  public.expire_stale_trade_offers() >= 1,
  'expire_stale_trade_offers() süresi geçen teklifi kapattı');

select pg_temp.ok(
  (select status from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000003') = 'expired',
  'teklif "expired" oldu');


\echo ''
\echo '=== 11) döngü durumları'
insert into public.loops (id, creator_id, title, category, max_participants) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Kamera döngüsü', 'electronics', 3);

select pg_temp.ok(
  (select status from public.loops where id = 'dddddddd-0000-0000-0000-000000000001') = 'matching',
  'yeni döngünün varsayılan durumu "matching" (eskiden "active" idi ve KPI sorgusuyla uyuşmuyordu)');

insert into public.loop_participants (loop_id, user_id, offering_listing_id, role) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000011', 'creator');

select pg_temp.rejects($$
  insert into public.loop_participants (loop_id, user_id, offering_listing_id, role) values
    ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000011', 'member')
$$, 'aynı kullanıcı bir döngüye iki kez katılamıyor');

-- Döngüye BAŞKASININ ilanıyla katılma (trade_offer_items'ta kapatılan
-- açığın döngüdeki eşi): joinLoop() ilanın sahibini hiç kontrol etmiyordu.
select pg_temp.rejects($$
  insert into public.loop_participants (loop_id, user_id, offering_listing_id, role) values
    ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000011', 'member')
$$, 'döngüye başkasının ilanıyla katılınamıyor');

-- Takas edilmiş / yayında olmayan bir ilan döngüye konamaz.
select pg_temp.rejects($$
  insert into public.loop_participants (loop_id, user_id, offering_listing_id, role) values
    ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'member')
$$, 'yayında olmayan ilan döngüye konamıyor');

update public.loop_participants set status = 'completed'
  where loop_id = 'dddddddd-0000-0000-0000-000000000001';

select pg_temp.ok(
  (select completed_loops from public.trust_profiles
    where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'döngü tamamlanınca completed_loops arttı');


\echo ''
\echo '=== 12) mesaj bütünlüğü'
insert into public.conversations (id, participant_one_id, participant_two_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
insert into public.messages (id, conversation_id, sender_id, content) values
  ('ffffffff-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'merhaba');

select pg_temp.rejects($$
  update public.messages set content = 'değiştirildi' where id = 'ffffffff-0000-0000-0000-000000000001'
$$, 'gönderilmiş mesajın içeriği değiştirilemiyor');

update public.messages set is_read = true where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.ok(
  (select is_read from public.messages where id = 'ffffffff-0000-0000-0000-000000000001'),
  'is_read güncellenebiliyor');

select pg_temp.ok(
  (select count(*) from public.notifications
    where user_id = '22222222-2222-2222-2222-222222222222' and type = 'message') = 1,
  'yeni mesaj bildirimi üretildi');


\echo ''
\echo '=== 13) takas adımları geriye alınamıyor / atlanamıyor'
select pg_temp.rejects($$
  update public.trades set status = 'locked' where id = 'cccccccc-0000-0000-0000-000000000001'
$$, 'tamamlanmış takas geri alınamıyor');

insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'pending', 'in_person');
-- Bu takas doğrudan 'received' olarak açılıyor (adım sırası testi için);
-- tamamlanabilmesi için iki tarafın onayı da kayıtlı olmalı.
insert into public.trades (id, offer_id, sender_id, receiver_id, status, sender_confirmed_at, receiver_confirmed_at) values
  ('cccccccc-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'received', now(), now());

select pg_temp.rejects($$
  update public.trades set status = 'delivery_planned' where id = 'cccccccc-0000-0000-0000-000000000004'
$$, 'takas adımı geriye alınamıyor');

-- Anlaşmazlık açılıp kapanabilmeli: takas ya tamamlanır ya iptal edilir.
update public.trades set status = 'disputed' where id = 'cccccccc-0000-0000-0000-000000000004';
select pg_temp.rejects($$
  update public.trades set status = 'in_transit' where id = 'cccccccc-0000-0000-0000-000000000004'
$$, 'anlaşmazlıktaki takas kaldığı yerden devam edemiyor');

update public.trades set status = 'completed' where id = 'cccccccc-0000-0000-0000-000000000004';
select pg_temp.ok(
  (select status from public.trades where id = 'cccccccc-0000-0000-0000-000000000004') = 'completed',
  'anlaşmazlık "takas geçerli" diye kapatılabiliyor (eskiden hiçbir çıkış yolu yoktu)');


\echo ''
\echo '=== 14) accept_trade_offer(): atomik kabul + yetki'
insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'cargo');
insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'offered');

-- Teklifi GÖNDEREN kendi teklifini kabul edemez.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.rejects($$
  select public.accept_trade_offer('bbbbbbbb-0000-0000-0000-000000000005')
$$, 'teklifi gönderen kendi teklifini kabul edemiyor');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.ok(
  public.accept_trade_offer('bbbbbbbb-0000-0000-0000-000000000005') is not null,
  'alıcı teklifi kabul edebiliyor');

select pg_temp.ok(
  (select status from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000005') = 'accepted'
  and (select count(*) from public.trades where offer_id = 'bbbbbbbb-0000-0000-0000-000000000005') = 1
  and (select count(*) from public.trade_events te join public.trades t on t.id = te.trade_id
        where t.offer_id = 'bbbbbbbb-0000-0000-0000-000000000005' and te.event_type = 'offer_accepted') = 1,
  'kabul tek işlemde teklif durumunu, takası ve olay kaydını oluşturdu');

-- Tekrar çağrılırsa yeni satır açmaz, var olan takası döner (idempotent).
select pg_temp.ok(
  public.accept_trade_offer('bbbbbbbb-0000-0000-0000-000000000005')
    = (select id from public.trades where offer_id = 'bbbbbbbb-0000-0000-0000-000000000005'),
  'tekrar kabul aynı takası döndürüyor (çift tıklama güvenli)');

-- Teklif anında seçilen teslimat tercihi kabul sırasında takasa taşınmalı
-- (rapor 1.3): eskiden bu kopyalama istemcideki acceptOffer'daydı.
select pg_temp.ok(
  (select delivery_method from public.trades
    where offer_id = 'bbbbbbbb-0000-0000-0000-000000000005') = 'cargo',
  'teslimat tercihi teklif -> takas taşındı');
set local request.jwt.claim.sub = '';


\echo ''
\echo '=== 14b) conversations.last_message_id'
insert into public.messages (id, conversation_id, sender_id, content) values
  ('ffffffff-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'ikinci mesaj');

select pg_temp.ok(
  (select last_message_id from public.conversations where id = 'eeeeeeee-0000-0000-0000-000000000001')
    = 'ffffffff-0000-0000-0000-000000000002',
  'yeni mesaj konuşmanın son mesajı olarak işaretlendi');

delete from public.messages where id = 'ffffffff-0000-0000-0000-000000000002';

select pg_temp.ok(
  (select last_message_id from public.conversations where id = 'eeeeeeee-0000-0000-0000-000000000001')
    = 'ffffffff-0000-0000-0000-000000000001',
  'son mesaj silinince bir öncekine geri dönüldü');


\echo ''
\echo '=== 15) search_path sabitlenmemiş fonksiyon kalmadı'
select pg_temp.ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
      )
  ),
  'public şemasındaki tüm fonksiyonlarda search_path sabit');


\echo ''
\echo '=== 16) profiles.phone / profiles.email istemci rollerine kapalı'
-- 20260825000000 bunu "BİLİNEN KALAN BOŞLUK" olarak bırakmıştı: RLS satır
-- bazlı olduğu için anon anahtarla `select=*` atan biri bütün telefon
-- numaralarını okuyabiliyordu. Kolon bazlı GRANT ile kapatıldı.
set local role authenticated;

select pg_temp.rejects($$
  select phone from public.profiles limit 1
$$, 'authenticated rolü phone kolonunu okuyamıyor');

select pg_temp.rejects($$
  select email from public.profiles limit 1
$$, 'authenticated rolü email kolonunu okuyamıyor');

select pg_temp.rejects($$
  select * from public.profiles limit 1
$$, 'select * artık reddediliyor (gizli kolonlar dahil olduğu için)');

select pg_temp.ok(
  (select count(*) from public.profiles) >= 3,
  'güvenli kolonlar okunmaya devam ediyor');

reset role;
set local role anon;

select pg_temp.rejects($$
  select phone from public.profiles limit 1
$$, 'anon rolü phone kolonunu okuyamıyor');

reset role;

-- Kayıt akışındaki "bu numara kayıtlı mı" kontrolü hâlâ çalışıyor.
select pg_temp.ok(
  public.phone_exists('+905550000001') and not public.phone_exists('+905559999999'),
  'phone_exists() numarayı sızdırmadan kontrol etmeye devam ediyor');


\echo ''
\echo '=== 17) teklifi kim yanıtlayabilir'
insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'in_person'),
  ('bbbbbbbb-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'in_person');

-- Gönderen, accept_trade_offer()'ı atlayıp doğrudan UPDATE ile de kendi
-- teklifini "kabul edilmiş" gösteremez.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.rejects($$
  update public.trade_offers set status = 'accepted' where id = 'bbbbbbbb-0000-0000-0000-000000000006'
$$, 'teklifi gönderen doğrudan UPDATE ile de kabul edemiyor');

select pg_temp.rejects($$
  update public.trade_offers set status = 'rejected' where id = 'bbbbbbbb-0000-0000-0000-000000000006'
$$, 'teklifi gönderen kendi teklifini reddedemiyor');

-- Gönderen teklifini geri çekebilir.
update public.trade_offers set status = 'cancelled' where id = 'bbbbbbbb-0000-0000-0000-000000000006';
select pg_temp.ok(
  (select status from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000006') = 'cancelled',
  'teklifi gönderen geri çekebiliyor');

-- Alıcı, teklifi gönderen adına geri çekemez ama reddedebilir.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.rejects($$
  update public.trade_offers set status = 'cancelled' where id = 'bbbbbbbb-0000-0000-0000-000000000007'
$$, 'alıcı teklifi gönderen adına geri çekemiyor');

update public.trade_offers set status = 'rejected' where id = 'bbbbbbbb-0000-0000-0000-000000000007';
select pg_temp.ok(
  (select status from public.trade_offers where id = 'bbbbbbbb-0000-0000-0000-000000000007') = 'rejected',
  'alıcı teklifi reddedebiliyor');

-- Süresi dolmamış bir teklif elle "expired" yapılamaz.
insert into public.trade_offers (id, sender_id, receiver_id, status, expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', now() + interval '10 hours');
select pg_temp.rejects($$
  update public.trade_offers set status = 'expired' where id = 'bbbbbbbb-0000-0000-0000-000000000008'
$$, 'süresi dolmamış teklif "expired" yapılamıyor');
set local request.jwt.claim.sub = '';


\echo ''
\echo '=== 18) delete_listing(): arşivleme ve devam eden takas koruması'
-- Eskiden ilan silme, teklife konu olmuş her ilanda ham bir foreign key
-- hatasıyla başarısız oluyordu (trade_offer_items.listing_id, on delete
-- davranışı olmadan tanımlı) — kullanıcı ilanını BİR DAHA HİÇ kaldıramıyordu.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000021', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Tripod', 'good', 'active');

select pg_temp.ok(
  public.delete_listing('aaaaaaaa-0000-0000-0000-000000000021') = 'deleted',
  'hiç teklife girmemiş ilan gerçekten siliniyor');

select pg_temp.ok(
  not exists (select 1 from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000021'),
  'silinen ilan tabloda kalmadı');

-- Başkasının ilanı kaldırılamaz.
select pg_temp.rejects($$
  select public.delete_listing('aaaaaaaa-0000-0000-0000-000000000012')
$$, 'başkasının ilanı kaldırılamıyor');

-- 14. adımdaki teklif (bbbbbbbb-…-05) 'aaaaaaaa-…-01' ilanını kapsıyor ve
-- takası hâlâ açık: bu ilan kaldırılamaz.
select pg_temp.rejects($$
  select public.delete_listing('aaaaaaaa-0000-0000-0000-000000000001')
$$, 'devam eden takastaki ilan kaldırılamıyor');

update public.trades set status = 'cancelled' where offer_id = 'bbbbbbbb-0000-0000-0000-000000000005';

select pg_temp.ok(
  public.delete_listing('aaaaaaaa-0000-0000-0000-000000000001') = 'archived',
  'teklif geçmişi olan ilan siliniyor değil arşivleniyor');

select pg_temp.ok(
  (select status from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'removed',
  'arşivlenen ilan "removed" oldu ve takas geçmişi bozulmadı');

-- Döngüde geçen ilan da referanslıdır: `loop_participants.offering_listing_id`
-- aynı şekilde `on delete` davranışı olmadan tanımlı. 11. adımdaki döngü
-- 'aaaaaaaa-…-11' ilanını taşıyor ve hâlâ açık.
select pg_temp.rejects($$
  select public.delete_listing('aaaaaaaa-0000-0000-0000-000000000011')
$$, 'devam eden döngüdeki ilan kaldırılamıyor');

update public.loops set status = 'completed' where id = 'dddddddd-0000-0000-0000-000000000001';

select pg_temp.ok(
  public.delete_listing('aaaaaaaa-0000-0000-0000-000000000011') = 'archived',
  'döngü geçmişi olan ilan da siliniyor değil arşivleniyor');
set local request.jwt.claim.sub = '';


\echo ''
\echo '=== 19) reviews.trustworthiness_rating'
select pg_temp.ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reviews'
      and column_name = 'trustworthiness_rating'
  ),
  'güvenilirlik puanı için kolon var (eskiden kullanıcının verdiği puan atılıyordu)');

select pg_temp.rejects($$
  insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating, trustworthiness_rating)
  values ('cccccccc-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222', 5, 9)
$$, 'aralık dışı güvenilirlik puanı reddediliyor');



\echo ''
\echo '=== 20) ilan süresi (md. 119)'
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Süreli ilan', 'good', 'active');

select pg_temp.ok(
  (select expires_at from public.listings where id = 'aaaaaaaa-0000-0000-0000-0000000000f1')
    between now() + interval '29 days' and now() + interval '31 days',
  'yeni ilan varsayılan ömürle (30 gün) açılıyor');

-- İstemci `expires_at` göndermeye kalkarsa yok sayılır: aksi hâlde kural
-- yalnızca arayüzde olurdu.
insert into public.listings (id, owner_id, category_id, title, condition, status, expires_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000f2', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Sonsuz ilan', 'good', 'active', now() + interval '10 years');

select pg_temp.ok(
  (select expires_at from public.listings where id = 'aaaaaaaa-0000-0000-0000-0000000000f2')
    < now() + interval '31 days',
  'istemcinin verdiği expires_at yok sayılıyor');

select pg_temp.rejects($$
  update public.listings set expires_at = now() + interval '10 years'
    where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'
$$, 'expires_at doğrudan güncellenemiyor');

select pg_temp.rejects($$
  update public.listings set status = 'expired'
    where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'
$$, 'ilan elle "expired" yapılamıyor');

-- Süreyi geriye çekmek yalnızca sistem yolundan mümkün; test burada
-- bilinçli olarak o yolu kullanıyor (cron'un göreceği durumu kurmak için).
set local swaloop.listing_lifecycle = 'on';
update public.listings set expires_at = now() - interval '1 hour'
  where id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
update public.listings set expires_at = now() + interval '2 days'
  where id = 'aaaaaaaa-0000-0000-0000-0000000000f2';
set local swaloop.listing_lifecycle = 'off';

select pg_temp.ok(
  public.expire_stale_listings() = 1,
  'süresi dolan ilan sayısı doğru dönüyor');

select pg_temp.ok(
  (select status from public.listings where id = 'aaaaaaaa-0000-0000-0000-0000000000f1') = 'expired',
  'süresi dolan ilan "expired" oldu (silinmedi)');

select pg_temp.ok(
  exists (
    select 1 from public.notifications
    where type = 'listing_expired' and listing_id = 'aaaaaaaa-0000-0000-0000-0000000000f1'
  ),
  'süresi dolunca sahibine bildirim gitti');

-- Yaklaşan süre uyarısı: 2 gün kalan ilan uyarılıyor, ama yalnızca bir kez.
select pg_temp.ok(
  (select count(*) from public.notifications
    where type = 'listing_expiring' and listing_id = 'aaaaaaaa-0000-0000-0000-0000000000f2') = 1,
  'süresi yaklaşan ilan için uyarı bildirimi gitti');

select public.expire_stale_listings();

select pg_temp.ok(
  (select count(*) from public.notifications
    where type = 'listing_expiring' and listing_id = 'aaaaaaaa-0000-0000-0000-0000000000f2') = 1,
  'aynı ilan için ikinci uyarı gönderilmiyor');

-- Süresi dolan ilan elle yayına alınamaz (expires_at geçmişte kalırdı).
select pg_temp.rejects($$
  update public.listings set status = 'active'
    where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'
$$, 'süresi dolan ilan elle yayına alınamıyor');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.rejects($$
  select public.renew_listing('aaaaaaaa-0000-0000-0000-0000000000f1')
$$, 'başkasının ilanı yenilenemiyor');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.ok(
  public.renew_listing('aaaaaaaa-0000-0000-0000-0000000000f1')
    between now() + interval '29 days' and now() + interval '31 days',
  'yenileme süreyi 30 gün ileri alıyor');

select pg_temp.ok(
  (select status from public.listings where id = 'aaaaaaaa-0000-0000-0000-0000000000f1') = 'active',
  'yenilenen ilan tekrar yayında');

select pg_temp.ok(
  (select expiry_reminder_at is null and renewed_at is not null
     from public.listings where id = 'aaaaaaaa-0000-0000-0000-0000000000f1'),
  'yenilemede uyarı bayrağı sıfırlanıyor (yeni dönemde tekrar uyarılsın)');

set local request.jwt.claim.sub = '';

-- Takasta kilitli kalan ilan, takas iptal edilince aynı gün düşmemeli.
insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-0000000000f3', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Kilitli ilan', 'good', 'active'),
  ('aaaaaaaa-0000-0000-0000-0000000000f4', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Karşı ilan', 'good', 'active');

-- Teklif ÖNCE 'pending' açılır, kalemler öyle eklenir, sonra kabul edilir —
-- gerçek akış bu (tradeService.createTradeOffer → accept_trade_offer) ve
-- 20260831000000 kabul edilmiş teklifin kalemlerini artık kilitliyor.
insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'pending', 'in_person');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f3', '11111111-1111-1111-1111-111111111111', 'offered'),
  ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f4', '22222222-2222-2222-2222-222222222222', 'requested');

update public.trade_offers set status = 'accepted'
  where id = 'bbbbbbbb-0000-0000-0000-0000000000f1';

insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-0000000000f1', 'bbbbbbbb-0000-0000-0000-0000000000f1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');

set local swaloop.listing_lifecycle = 'on';
update public.listings set expires_at = now() - interval '5 days'
  where id in ('aaaaaaaa-0000-0000-0000-0000000000f3', 'aaaaaaaa-0000-0000-0000-0000000000f4');
set local swaloop.listing_lifecycle = 'off';

update public.trades set status = 'cancelled', cancellation_reason = 'no_agreement'
  where id = 'cccccccc-0000-0000-0000-0000000000f1';

select pg_temp.ok(
  (select bool_and(status = 'active' and expires_at > now() + interval '6 days')
     from public.listings
    where id in ('aaaaaaaa-0000-0000-0000-0000000000f3', 'aaaaaaaa-0000-0000-0000-0000000000f4')),
  'iptal edilen takastan dönen ilana en az 7 gün nefes payı veriliyor');


\echo ''
\echo '✅ tüm veritabanı testleri geçti'
rollback;
