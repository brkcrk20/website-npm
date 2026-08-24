-- Takas çekirdeğindeki üç eksiği kapatan migration.
--
-- 1) profiles.journey_target
--    "Takas Yolculuğum" ekranındaki nihai hedef (ör. "Şehir bisikleti")
--    hiçbir yerde saklanmıyordu; sayfa yenilenince kayboluyordu.
--
-- 2) trade_offers.delivery_method
--    Teklif ekranında seçilen teslimat yöntemi DB'ye hiç yazılmıyordu:
--    `trades.delivery_method` ancak teklif KABUL EDİLİNCE oluşuyor, yani
--    teklifi gönderenin tercihi kabul anına kadar kayboluyordu (bkz.
--    tradeService.createTradeOffer içindeki eski NOT). Artık teklifle
--    birlikte kaydediliyor ve kabul edilince `trades` satırına taşınıyor.
--
-- 3) increment_listing_view()
--    listings.view_count kolonu vardı ama hiç artırılmıyordu; kullanıcı
--    kendi olmayan bir ilanı UPDATE edemeyeceği için (RLS) bu ancak
--    security definer bir fonksiyonla yapılabilir.

-- 4) profiles.interests / profiles.wanted_categories
--    "Dolaşıma soktuğun kategoriler" ve "aradığın kategoriler" profil
--    düzenleme ekranında seçilebiliyordu ama hiçbir yere yazılmıyordu;
--    kaydet'e basıldığında sessizce kayboluyorlardı.

alter table public.profiles
  add column if not exists journey_target text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists wanted_categories text[] not null default '{}';

alter table public.trade_offers
  add column if not exists delivery_method text not null default 'in_person';

create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.listings
  set view_count = coalesce(view_count, 0) + 1
  where id = p_listing_id;
end;
$$;

grant execute on function public.increment_listing_view(uuid) to anon, authenticated;

-- Sık kullanılan filtreler için index'ler. Keşfet ekranı her açılışta
-- `status = 'active'` + `created_at desc` sorgusu atıyor; ilan sayısı
-- büyüdüğünde bu index olmadan sıralama tüm tabloyu tarar.
create index if not exists listings_active_created_idx
  on public.listings (status, created_at desc);

create index if not exists listings_owner_idx
  on public.listings (owner_id, created_at desc);

create index if not exists trade_offers_receiver_idx
  on public.trade_offers (receiver_id, created_at desc);

create index if not exists trade_offers_sender_idx
  on public.trade_offers (sender_id, created_at desc);

create index if not exists reviews_reviewed_user_idx
  on public.reviews (reviewed_user_id, created_at desc);

-- =============================================================================
-- 5) Takas tamamlandığında sayaçların ve ilan durumlarının OTOMATİK güncellenmesi
--
-- Bu zamana kadar `trust_profiles.completed_trades` hiçbir yerde
-- artırılmıyordu: takas 6. adıma gelse bile kullanıcının profilinde
-- "0 başarılı takas" yazıyordu ve güven puanı sabit 5'te kalıyordu.
-- Ayrıca takaslanan ilanlar `active` kalmaya devam ediyor, keşfet
-- ekranında hâlâ takas edilebilir gibi görünüyordu.
--
-- Bunları uygulama katmanında yapmak mümkün değil: bir kullanıcı karşı
-- tarafın `trust_profiles` satırını ya da ilanını RLS nedeniyle
-- güncelleyemez. Bu yüzden sunucu tarafında, `security definer` bir
-- tetikleyiciyle yapılıyor.
-- =============================================================================

create or replace function public.apply_trade_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'completed' then
    insert into public.trust_profiles (user_id, completed_trades)
    values (new.sender_id, 1), (new.receiver_id, 1)
    on conflict (user_id) do update
      set completed_trades = trust_profiles.completed_trades + 1,
          updated_at = now();

    -- Takasa konu olan ilanlar artık dolaşımda değil.
    update public.listings
    set status = 'traded', updated_at = now()
    where id in (
      select listing_id from public.trade_offer_items where offer_id = new.offer_id
    );

  elsif new.status = 'cancelled' then
    insert into public.trust_profiles (user_id, cancelled_trades)
    values (new.sender_id, 1), (new.receiver_id, 1)
    on conflict (user_id) do update
      set cancelled_trades = trust_profiles.cancelled_trades + 1,
          updated_at = now();

    -- İptal edilen takasın ilanları tekrar yayına döner.
    update public.listings
    set status = 'active', updated_at = now()
    where status = 'in_trade'
      and id in (
        select listing_id from public.trade_offer_items where offer_id = new.offer_id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_trade_completion on public.trades;
create trigger trg_apply_trade_completion
  after update of status on public.trades
  for each row execute function public.apply_trade_completion();

-- Takas kabul edilip `trades` satırı açıldığında ilgili ilanlar kilitlenir.
create or replace function public.lock_listings_on_trade_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.listings
  set status = 'in_trade', updated_at = now()
  where status = 'active'
    and id in (
      select listing_id from public.trade_offer_items where offer_id = new.offer_id
    );

  return new;
end;
$$;

drop trigger if exists trg_lock_listings_on_trade_start on public.trades;
create trigger trg_lock_listings_on_trade_start
  after insert on public.trades
  for each row execute function public.lock_listings_on_trade_start();

-- =============================================================================
-- 6) Güven puanının değerlendirmelerden hesaplanması
--
-- `trust_profiles.trust_score` de hiç güncellenmiyordu; herkes sonsuza
-- kadar 5.00 puanlıydı. Artık her yeni değerlendirmede, o kullanıcının
-- aldığı tüm puanların ortalaması yazılır (hiç yorum yoksa başlangıç
-- değeri 5 kalır).
-- =============================================================================

create or replace function public.recalculate_trust_score()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_user uuid := coalesce(new.reviewed_user_id, old.reviewed_user_id);
  avg_rating numeric;
begin
  select avg(rating) into avg_rating
  from public.reviews
  where reviewed_user_id = target_user;

  insert into public.trust_profiles (user_id, trust_score)
  values (target_user, coalesce(avg_rating, 5))
  on conflict (user_id) do update
    set trust_score = round(coalesce(avg_rating, 5), 2),
        updated_at = now();

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_recalculate_trust_score on public.reviews;
create trigger trg_recalculate_trust_score
  after insert or update or delete on public.reviews
  for each row execute function public.recalculate_trust_score();

-- =============================================================================
-- 7) Şikayet (report) tablosu
--
-- Uygulamada "bu ilanı şikayet et" formu vardı ama gönderilen şikayet
-- HİÇBİR YERE yazılmıyordu: form kapanıp "şikayetiniz alındı" mesajı
-- gösteriliyor, veri kayboluyordu. Bu tablo o formu gerçek yapar.
--
-- Okuma politikası bilerek dar: kullanıcı yalnızca kendi gönderdiği
-- şikayetleri görebilir. İnceleme tarafı (moderasyon) uygulama içinden
-- değil, Supabase yönetim arayüzünden yapılır.
-- =============================================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('listing', 'user', 'trade')),
  target_id uuid not null,
  reason text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own" on public.reports
  for select to authenticated
  using (auth.uid() = reporter_id);
