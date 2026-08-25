-- =============================================================================
-- GÜVENLİK DÜZELTMESİ: Aşağıdaki 15 tabloda RLS hiç açık değildi:
--   profiles, categories, listings, listing_images, favorites, loops,
--   loop_participants, trade_offers, trade_offer_items, trades, trade_events,
--   reviews, trust_profiles, trust_events, impact_records.
--
-- Bu, anon/authenticated Supabase key'iyle (frontend'de zaten açık) herkesin
-- PostgREST üzerinden bu tablolara doğrudan erişip başka kullanıcıların
-- ilanlarını/tekliflerini/profillerini okuyup değiştirebileceği anlamına
-- geliyordu.
--
-- Politikalar, src/services/*.ts içindeki GERÇEK sorgu/insert/update
-- desenlerine bakılarak yazıldı (bkz. yorumlar). Amaç: uygulamanın hâlihazırda
-- yaptığı hiçbir çağrıyı kırmadan, sahip olunmayan satırlara erişimi kapatmak.
--
-- UYGULAMA: Bu dosyayı incelemeden canlıya `supabase db push` ile
-- uygulamayın — özellikle loops/loop_participants politikaları, mevcut
-- katılımcıların loop durumunu güncelleyebilmesi için kasıtlı olarak
-- "sadece creator" değil, "creator VEYA katılımcı" şeklinde yazıldı (bkz.
-- ilgili blok). Kendi iş kurallarınıza göre daraltmak isteyebilirsiniz.
-- =============================================================================

-- ── profiles ────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true); -- profiller genel olarak görüntülenebilir (ilan sahibi, takas karşı tarafı vb.)

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- delete politikası yok: hesap silme akışı bugün yok, gerekirse ayrıca eklenir.

-- ── categories ──────────────────────────────────────────────────────────
alter table public.categories enable row level security;

drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories
  for select using (true); -- referans/statik veri, herkes okuyabilir

-- insert/update/delete politikası kasıtlı olarak yok: kategoriler sadece
-- admin/service role tarafından (RLS'i bypass eden) yönetilmeli.

-- ── listings ────────────────────────────────────────────────────────────
alter table public.listings enable row level security;

drop policy if exists "listings_select_all" on public.listings;
create policy "listings_select_all" on public.listings
  for select using (true); -- ilanlar herkese açık şekilde taranabilir olmalı

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own" on public.listings
  for insert with check (auth.uid() = owner_id);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own" on public.listings
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own" on public.listings
  for delete using (auth.uid() = owner_id);

-- ── listing_images ──────────────────────────────────────────────────────
alter table public.listing_images enable row level security;

drop policy if exists "listing_images_select_all" on public.listing_images;
create policy "listing_images_select_all" on public.listing_images
  for select using (true); -- ilan görselleri herkese açık (storage bucket'ı zaten public)

drop policy if exists "listing_images_manage_own_listing" on public.listing_images;
create policy "listing_images_manage_own_listing" on public.listing_images
  for all using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.owner_id = auth.uid()
    )
  );

-- ── favorites ───────────────────────────────────────────────────────────
alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id); -- favoriler özel, sadece sahibi görebilir

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- ── loops ───────────────────────────────────────────────────────────────
alter table public.loops enable row level security;

drop policy if exists "loops_select_all" on public.loops;
create policy "loops_select_all" on public.loops
  for select using (true); -- döngüler keşfedilebilir olmalı (katılmak için görülmesi gerekiyor)

drop policy if exists "loops_insert_own" on public.loops;
create policy "loops_insert_own" on public.loops
  for insert with check (auth.uid() = creator_id);

-- NOT: loopService.joinLoop() döngü dolunca `loops.status`'u kilitliyor,
-- bunu çağıran kullanıcı creator olmayabilir (kendini yeni katılımcı olarak
-- ekleyen kişi). Bu yüzden update, "creator VEYA o döngüde katılımcı olan
-- herkes" ile sınırlandırıldı — tamamen açık bırakmaktan güvenlidir, ama
-- "sadece creator" kadar sıkı değildir. İş kurallarınız gerektiriyorsa bunu
-- ileride bir Postgres function'a (SECURITY DEFINER) taşıyıp daraltabilirsiniz.
drop policy if exists "loops_update_creator_or_participant" on public.loops;
create policy "loops_update_creator_or_participant" on public.loops
  for update using (
    auth.uid() = creator_id
    or exists (
      select 1 from public.loop_participants lp
      where lp.loop_id = loops.id and lp.user_id = auth.uid()
    )
  );

drop policy if exists "loops_delete_own" on public.loops;
create policy "loops_delete_own" on public.loops
  for delete using (auth.uid() = creator_id);

-- ── loop_participants ───────────────────────────────────────────────────
alter table public.loop_participants enable row level security;

drop policy if exists "loop_participants_select_all" on public.loop_participants;
create policy "loop_participants_select_all" on public.loop_participants
  for select using (true); -- döngü detay sayfasında katılımcı listesi herkese görünür

drop policy if exists "loop_participants_insert_own" on public.loop_participants;
create policy "loop_participants_insert_own" on public.loop_participants
  for insert with check (auth.uid() = user_id); -- kullanıcı sadece kendini katılımcı ekleyebilir

-- completeLoop() tüm katılımcıların durumunu 'completed' yapıyor; bunu
-- muhtemelen döngü sahibi tetikliyor. Bu yüzden update: kendi satırı
-- (confirmParticipantStep) VEYA döngünün creator'ı (completeLoop).
drop policy if exists "loop_participants_update_own_or_loop_creator" on public.loop_participants;
create policy "loop_participants_update_own_or_loop_creator" on public.loop_participants
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from public.loops l
      where l.id = loop_participants.loop_id and l.creator_id = auth.uid()
    )
  );

drop policy if exists "loop_participants_delete_own" on public.loop_participants;
create policy "loop_participants_delete_own" on public.loop_participants
  for delete using (auth.uid() = user_id); -- döngüden ayrılma

-- ── trade_offers ────────────────────────────────────────────────────────
alter table public.trade_offers enable row level security;

drop policy if exists "trade_offers_select_parties" on public.trade_offers;
create policy "trade_offers_select_parties" on public.trade_offers
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "trade_offers_insert_own" on public.trade_offers;
create policy "trade_offers_insert_own" on public.trade_offers
  for insert with check (auth.uid() = sender_id);

-- accept/reject/counter-offer her iki tarafça da yapılabildiği için
-- (acceptOffer, rejectOffer, createCounterOffer) update iki tarafa da açık.
drop policy if exists "trade_offers_update_parties" on public.trade_offers;
create policy "trade_offers_update_parties" on public.trade_offers
  for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- createTradeOffer() item insert'i başarısız olursa teklifi geri alıyor
-- (rollback) — bu yüzden sender'ın kendi teklifini silebilmesi gerekiyor.
drop policy if exists "trade_offers_delete_own" on public.trade_offers;
create policy "trade_offers_delete_own" on public.trade_offers
  for delete using (auth.uid() = sender_id);

-- ── trade_offer_items ───────────────────────────────────────────────────
alter table public.trade_offer_items enable row level security;

drop policy if exists "trade_offer_items_select_parties" on public.trade_offer_items;
create policy "trade_offer_items_select_parties" on public.trade_offer_items
  for select using (
    exists (
      select 1 from public.trade_offers o
      where o.id = trade_offer_items.offer_id
        and (auth.uid() = o.sender_id or auth.uid() = o.receiver_id)
    )
  );

drop policy if exists "trade_offer_items_insert_own_offer" on public.trade_offer_items;
create policy "trade_offer_items_insert_own_offer" on public.trade_offer_items
  for insert with check (
    exists (
      select 1 from public.trade_offers o
      where o.id = trade_offer_items.offer_id and auth.uid() = o.sender_id
    )
  );

drop policy if exists "trade_offer_items_delete_own_offer" on public.trade_offer_items;
create policy "trade_offer_items_delete_own_offer" on public.trade_offer_items
  for delete using (
    exists (
      select 1 from public.trade_offers o
      where o.id = trade_offer_items.offer_id and auth.uid() = o.sender_id
    )
  );

-- ── trades ──────────────────────────────────────────────────────────────
alter table public.trades enable row level security;

drop policy if exists "trades_select_parties" on public.trades;
create policy "trades_select_parties" on public.trades
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "trades_insert_parties" on public.trades;
create policy "trades_insert_parties" on public.trades
  for insert with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "trades_update_parties" on public.trades;
create policy "trades_update_parties" on public.trades
  for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- ── trade_events ────────────────────────────────────────────────────────
alter table public.trade_events enable row level security;

drop policy if exists "trade_events_select_parties" on public.trade_events;
create policy "trade_events_select_parties" on public.trade_events
  for select using (
    exists (
      select 1 from public.trades t
      where t.id = trade_events.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );

-- advanceTradeStep() bazı event'lerde actor_id set etmiyor (null bırakıyor),
-- bu yüzden "actor_id is null OR actor_id = auth.uid()" olarak yazıldı.
drop policy if exists "trade_events_insert_parties" on public.trade_events;
create policy "trade_events_insert_parties" on public.trade_events
  for insert with check (
    (trade_events.actor_id is null or trade_events.actor_id = auth.uid())
    and exists (
      select 1 from public.trades t
      where t.id = trade_events.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );

-- ── reviews ─────────────────────────────────────────────────────────────
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_all" on public.reviews;
create policy "reviews_select_all" on public.reviews
  for select using (true); -- güven puanı/yorumlar profil sayfasında herkese açık gösteriliyor

drop policy if exists "reviews_insert_trade_party" on public.reviews;
create policy "reviews_insert_trade_party" on public.reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.trades t
      where t.id = reviews.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );

-- update/delete politikası kasıtlı olarak yok: değerlendirmeler oluşturulduktan
-- sonra değiştirilemez (bütünlük için).

-- ── trust_profiles ──────────────────────────────────────────────────────
alter table public.trust_profiles enable row level security;

drop policy if exists "trust_profiles_select_all" on public.trust_profiles;
create policy "trust_profiles_select_all" on public.trust_profiles
  for select using (true); -- güven skoru profil kartlarında herkese gösteriliyor

-- insert/update politikası yok: satırlar create_trust_profile trigger'ı
-- (SECURITY DEFINER) tarafından otomatik yönetiliyor, istemci tarafından
-- doğrudan yazılmıyor (bkz. src/services/authService.ts yorumu).

-- ── trust_events ────────────────────────────────────────────────────────
alter table public.trust_events enable row level security;

drop policy if exists "trust_events_select_own" on public.trust_events;
create policy "trust_events_select_own" on public.trust_events
  for select using (auth.uid() = user_id); -- kişisel güven geçmişi, sadece sahibi görsün

-- insert politikası yok: sistem/trigger tarafından üretiliyor, istemciden
-- doğrudan yazma gözlenmedi.

-- ── impact_records ──────────────────────────────────────────────────────
alter table public.impact_records enable row level security;

drop policy if exists "impact_records_select_trade_parties" on public.impact_records;
create policy "impact_records_select_trade_parties" on public.impact_records
  for select using (
    exists (
      select 1 from public.trades t
      where t.id = impact_records.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );

drop policy if exists "impact_records_insert_trade_parties" on public.impact_records;
create policy "impact_records_insert_trade_parties" on public.impact_records
  for insert with check (
    exists (
      select 1 from public.trades t
      where t.id = impact_records.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );
