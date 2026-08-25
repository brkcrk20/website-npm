\set ON_ERROR_STOP on
begin;

-- İki kullanıcı, bir kategori, iki ilan
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.profiles (id, phone, full_name) values
  ('11111111-1111-1111-1111-111111111111', '+905550000001', 'Ayşe'),
  ('22222222-2222-2222-2222-222222222222', '+905550000002', 'Mehmet');

insert into public.categories (id, name, slug) values
  ('33333333-3333-3333-3333-333333333333', 'Elektronik', 'electronics');

insert into public.listings (id, owner_id, category_id, title, condition, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Kulaklık', 'very_good', 'active'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Bisiklet', 'good', 'active');

\echo '--- 1) trust_profiles otomatik oluştu mu?'
select count(*) = 2 as trust_rows_created from public.trust_profiles;

\echo '--- 2) favori sayacı senkron mu?'
insert into public.favorites (user_id, listing_id)
  values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001');
select favorite_count = 1 as favorite_incremented from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from public.favorites where listing_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select favorite_count = 0 as favorite_decremented from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Teklif ve kalemleri
insert into public.trade_offers (id, sender_id, receiver_id, status, delivery_method) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'accepted', 'in_person');

insert into public.trade_offer_items (offer_id, listing_id, owner_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'offered'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'requested');

\echo '--- 3) takas başlayınca ilanlar kilitlendi mi?'
insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');
select bool_and(status = 'in_trade') as listings_locked from public.listings;

\echo '--- 4) takas tamamlanınca sayaçlar ve ilan durumları'
update public.trades set status = 'completed', completed_at = now() where id = 'cccccccc-0000-0000-0000-000000000001';
select bool_and(completed_trades = 1) as both_counters_incremented from public.trust_profiles;
select bool_and(status = 'traded') as listings_traded from public.listings;

\echo '--- 5) değerlendirme güven puanını güncelliyor mu?'
insert into public.reviews (trade_id, reviewer_id, reviewed_user_id, rating) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 4),
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 5);
select trust_score = 4.50 as trust_score_is_average from public.trust_profiles where user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- 6) değerlendirme silinince yeniden hesaplanıyor mu? (DELETE dalı)'
delete from public.reviews where rating = 4;
select trust_score = 5.00 as trust_score_recalculated from public.trust_profiles where user_id = '22222222-2222-2222-2222-222222222222';

\echo '--- 7) görüntülenme sayacı RPC'
select public.increment_listing_view('aaaaaaaa-0000-0000-0000-000000000001');
select view_count = 1 as view_incremented from public.listings where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- 8) iptal edilen takas ilanları geri yayına alıyor mu?'
update public.listings set status = 'in_trade';
insert into public.trades (id, offer_id, sender_id, receiver_id, status) values
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'locked');
update public.trades set status = 'cancelled' where id = 'cccccccc-0000-0000-0000-000000000002';
select bool_and(status = 'active') as listings_reactivated from public.listings;
select bool_and(cancelled_trades = 1) as cancel_counters from public.trust_profiles;

rollback;
