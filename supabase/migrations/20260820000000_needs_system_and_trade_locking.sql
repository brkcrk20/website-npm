-- =============================================================================
-- ÜRÜN/SİSTEM TASARIM RAPORU — FAZ 1 ÇEKİRDEĞİ
-- (bkz. swaloop-urun-sistem-tasarimi.md; rapor madde 30, 32, 78-82, 117-119)
--
-- Bu migration üç işi yapar:
--
--   1) İHTİYAÇ ("Need") kavramını sisteme birinci sınıf veri olarak ekler.
--      Bugüne kadar "ne arıyorum" bilgisi sadece `listings.looking_for`
--      içinde SERBEST METİN olarak duruyordu; yani ilanı olmayan bir
--      kullanıcı hiçbir şey arayamıyordu ve arama motoru bu metni makine
--      olarak okuyamıyordu. Yeni `needs` tablosu + `looking_for_categories`
--      kolonu bunu çözer (rapor 78-82).
--
--   2) Teklif ömrünü gerçek bir DB alanına bağlar (rapor 32). `expiresAt`
--      şimdiye kadar frontend'de "created_at + 2 gün" olarak UYDURULUYORDU;
--      artık `trade_offers.expires_at` gerçek bir kolon ve süresi geçen
--      teklifleri kapatan bir fonksiyon var.
--
--   3) GÜVENLİK DÜZELTMESİ — ilan kilitleme (rapor 30). Canlı veritabanında
--      `lock_listings_on_trade_start()` fonksiyonu var ama migration
--      geçmişinde karşılığı yok (bkz. 20260818130000_sync_remote_schema_
--      structure.sql başlığı: "trigger'ların bir kısmı kapsam dışı"). Bu
--      fonksiyonun tehlikeli davranışı: yeni bir trade oluştuğunda
--      kullanıcının TÜM aktif ilanlarını `in_trade` yapmak. Sonuç: takasa
--      dahil olmayan ilanlar da keşiften düşer ve kullanıcı sebebini
--      anlamaz. Aşağıda fonksiyon, SADECE ilgili teklifin kalemlerini
--      (trade_offer_items) kilitleyecek şekilde yeniden tanımlanıyor ve
--      takas bitince kilidi çözen ikinci bir trigger ekleniyor.
-- =============================================================================


-- ── 0) Ortak yardımcı: updated_at otomatik güncelleme ───────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ── 1) Profil: ilgi alanı ve aranan kategoriler ─────────────────────────
-- Rapor 13: "ilgi alanı" ile "ihtiyaç" aynı şey değildir.
--   * interests         → profil kişiselleştirmesi (fotoğrafçılık, müzik…)
--   * wanted_categories → eşleştirme motorunun okuduğu kaba filtre
-- Bu iki alan frontend'de (UserProfile.interests / wantedCategories) zaten
-- vardı ama HİÇBİR YERE YAZILMIYORDU; kayıt formunda seçilen değerler
-- sayfa yenilenince kayboluyordu. Değerler `categories.slug` ile aynı
-- kümeden gelir (electronics, photography, …).
alter table public.profiles
  add column if not exists interests text[] not null default '{}',
  add column if not exists wanted_categories text[] not null default '{}';

comment on column public.profiles.interests is
  'Profil kişiselleştirmesi için ilgi alanları. Değerler categories.slug kümesinden gelir.';
comment on column public.profiles.wanted_categories is
  'Kullanıcının genel olarak aradığı kategoriler (eşleştirme motoru girdisi). Değerler categories.slug kümesinden gelir.';


-- ── 2) İlan: yapılandırılmış "arıyorum" ─────────────────────────────────
-- Rapor 20: `looking_for` serbest metni KALIYOR (insan okuması için), yanına
-- makine tarafından okunabilir kategori listesi ekleniyor.
alter table public.listings
  add column if not exists looking_for_categories text[] not null default '{}';

comment on column public.listings.looking_for_categories is
  'İlan sahibinin karşılığında aradığı kategoriler (categories.slug). looking_for serbest metnini TAMAMLAR, yerine geçmez.';

create index if not exists listings_looking_for_categories_idx
  on public.listings using gin (looking_for_categories);


-- ── 3) İHTİYAÇ (needs) tablosu ──────────────────────────────────────────
-- Rapor 78-80: kullanıcı ilan vermeden de "bunu arıyorum" diyebilmeli.
-- `needs` bilinçli olarak `listings`'ten AYRI bir nesnedir:
--   listings = "elimde bu var", needs = "buna ihtiyacım var".
create table if not exists public.needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category_id uuid references public.categories(id),
  note text,
  -- active    : aktif olarak aranıyor
  -- paused    : kullanıcı geçici olarak durdurdu (bildirim gelmesin)
  -- fulfilled : karşılandı (takas tamamlandı ya da kullanıcı kapattı)
  status text not null default 'active'
    check (status in ('active', 'paused', 'fulfilled')),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint needs_title_not_blank check (btrim(title) <> '')
);

comment on table public.needs is
  'Kullanıcının aradığı şeyler. İlandan bağımsızdır: ilanı olmayan kullanıcı da ihtiyaç yayınlayabilir.';

create index if not exists needs_user_id_idx on public.needs (user_id);
create index if not exists needs_status_idx on public.needs (status);
create index if not exists needs_category_id_idx on public.needs (category_id);
create index if not exists needs_title_lower_idx on public.needs (lower(title));

-- Aynı kullanıcı aynı ihtiyacı iki kez açamaz (rapor 118 — spam kontrolü).
-- Karşılanmış (fulfilled) ihtiyaçlar geçmiş kaydı olarak kalır, o yüzden
-- kısıt sadece açık ihtiyaçlar için geçerli.
create unique index if not exists needs_user_title_unique_idx
  on public.needs (user_id, lower(btrim(title)))
  where status <> 'fulfilled';

drop trigger if exists trg_needs_set_updated_at on public.needs;
create trigger trg_needs_set_updated_at
  before update on public.needs
  for each row execute function public.set_updated_at();

-- fulfilled_at, status ile tutarlı kalsın (elle set edilmesi gerekmesin).
create or replace function public.sync_need_fulfilled_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'fulfilled' and new.fulfilled_at is null then
    new.fulfilled_at = now();
  elsif new.status <> 'fulfilled' then
    new.fulfilled_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_needs_sync_fulfilled_at on public.needs;
create trigger trg_needs_sync_fulfilled_at
  before insert or update on public.needs
  for each row execute function public.sync_need_fulfilled_at();

-- Rapor 117: kötüye kullanım önleme. Bir kullanıcının aynı anda açık
-- tutabileceği ihtiyaç sayısı sınırlı — aksi halde tek hesap "her şeyi
-- arıyorum" diyerek bütün eşleştirme bildirimlerini kendine çekebilir.
create or replace function public.enforce_active_need_limit()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
  max_active constant integer := 20;
begin
  if new.status = 'active' then
    select count(*) into active_count
    from public.needs
    where user_id = new.user_id
      and status = 'active'
      and id <> new.id;

    if active_count >= max_active then
      raise exception
        'Aynı anda en fazla % açık ihtiyacın olabilir. Yenisini eklemek için birini kapat.', max_active
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_needs_active_limit on public.needs;
create trigger trg_needs_active_limit
  before insert or update on public.needs
  for each row execute function public.enforce_active_need_limit();

-- RLS: ihtiyaçlar herkese açık okunabilir (rapor 77 — "bu ürünü arayan
-- kişiler" listesi bunun üzerine kurulur), ama sadece sahibi yazabilir.
alter table public.needs enable row level security;

drop policy if exists "needs_select_all" on public.needs;
create policy "needs_select_all" on public.needs
  for select using (true);

drop policy if exists "needs_insert_own" on public.needs;
create policy "needs_insert_own" on public.needs
  for insert with check (auth.uid() = user_id);

drop policy if exists "needs_update_own" on public.needs;
create policy "needs_update_own" on public.needs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "needs_delete_own" on public.needs;
create policy "needs_delete_own" on public.needs
  for delete using (auth.uid() = user_id);


-- ── 4) Teklif ömrü (rapor 32) ───────────────────────────────────────────
-- Önce nullable ekle → mevcut satırları created_at + 48 saat ile doldur →
-- sonra varsayılanı ve NOT NULL'u koy. (Doğrudan default'lu eklenirse eski
-- teklifler de "şimdiden 48 saat sonra" ölecekmiş gibi görünürdü.)
alter table public.trade_offers
  add column if not exists expires_at timestamptz;

update public.trade_offers
set expires_at = created_at + interval '48 hours'
where expires_at is null;

alter table public.trade_offers
  alter column expires_at set default (now() + interval '48 hours');

alter table public.trade_offers
  alter column expires_at set not null;

comment on column public.trade_offers.expires_at is
  'Teklifin otomatik kapanma anı. Varsayılan: oluşturulma + 48 saat (rapor 32). Süre testlerle değişebilir.';

create index if not exists trade_offers_expires_at_idx
  on public.trade_offers (expires_at)
  where status = 'pending';

-- Süresi geçen bekleyen teklifleri kapatır. Kaç teklifin kapandığını döner.
-- Zamanlanmış çalıştırma (pg_cron) bu migration'ın KAPSAMI DIŞINDA — proje
-- pg_cron kullanmıyor. Şimdilik iki kullanım yolu var:
--   a) Supabase SQL editöründen elle: select public.expire_stale_trade_offers();
--   b) pg_cron etkinleştirilirse:
--      select cron.schedule('expire-offers', '*/15 * * * *',
--                           $cron$select public.expire_stale_trade_offers()$cron$);
create or replace function public.expire_stale_trade_offers()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  affected integer;
begin
  update public.trade_offers
  set status = 'expired',
      updated_at = now()
  where status = 'pending'
    and expires_at < now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;


-- ── 5) GÜVENLİK DÜZELTMESİ: ilan kilitleme kapsamı (rapor 30) ───────────
-- Eski davranış (canlıda): trade oluşunca kullanıcının tüm aktif ilanları
-- `in_trade` yapılıyordu. Yeni davranış: SADECE bu takasın teklifine dahil
-- olan ilanlar kilitlenir.
--
-- Not: Canlıdaki trigger'ın adı bilinmiyor (migration geçmişinde yok), bu
-- yüzden `drop trigger if exists <tahmini ad>` yeterli değil. Aşağıdaki
-- blok, trades tablosunda bu fonksiyona bağlı TÜM trigger'ları adı ne
-- olursa olsun kaldırır; ardından kanonik adla tek bir trigger kurulur.
do $$
declare
  t record;
begin
  for t in
    select tg.tgname
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_class c on c.oid = tg.tgrelid
    where c.relname = 'trades'
      and c.relnamespace = 'public'::regnamespace
      and p.proname in ('lock_listings_on_trade_start', 'release_listings_on_trade_end')
      and not tg.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.trades', t.tgname);
  end loop;
end $$;

create or replace function public.lock_listings_on_trade_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- SADECE bu takasın teklifindeki ilanlar. `status = 'active'` filtresi
  -- bilinçli: zaten başka bir takasta kilitli ya da 'traded' olmuş bir
  -- ilanı bu takas geri alamaz.
  update public.listings l
  set status = 'in_trade',
      updated_at = now()
  from public.trade_offer_items i
  where i.offer_id = new.offer_id
    and l.id = i.listing_id
    and l.status = 'active';

  return new;
end;
$$;

comment on function public.lock_listings_on_trade_start() is
  'Takas başlayınca SADECE ilgili teklifin ilanlarını in_trade yapar (rapor 30). Kullanıcının diğer ilanlarına dokunmaz.';

drop trigger if exists trg_lock_listings_on_trade_start on public.trades;
create trigger trg_lock_listings_on_trade_start
  after insert on public.trades
  for each row execute function public.lock_listings_on_trade_start();

-- Kilidin çözülmesi: bugüne kadar HİÇ yoktu. Takas iptal edilirse ilanlar
-- sonsuza kadar `in_trade` kalıyor, yani keşiften düşüyordu (rapor 31).
create or replace function public.release_listings_on_trade_end()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'completed' then
    update public.listings l
    set status = 'traded',
        updated_at = now()
    from public.trade_offer_items i
    where i.offer_id = new.offer_id
      and l.id = i.listing_id
      and l.status = 'in_trade';

  elsif new.status = 'cancelled' then
    update public.listings l
    set status = 'active',
        updated_at = now()
    from public.trade_offer_items i
    where i.offer_id = new.offer_id
      and l.id = i.listing_id
      and l.status = 'in_trade';
  end if;

  -- 'disputed' bilinçli olarak dışarıda: anlaşmazlık sürerken ilanların
  -- yeniden takasa açılması işi karmaşıklaştırır, kilit korunur.
  return new;
end;
$$;

comment on function public.release_listings_on_trade_end() is
  'Takas tamamlanınca ilanları traded, iptal edilince tekrar active yapar. Sadece ilgili teklifin ilanlarına dokunur.';

drop trigger if exists trg_release_listings_on_trade_end on public.trades;
create trigger trg_release_listings_on_trade_end
  after update of status on public.trades
  for each row execute function public.release_listings_on_trade_end();


-- =============================================================================
-- BACKFILL NOTU
-- Bu migration'dan ÖNCE oluşmuş takaslarda, hatalı (global) kilitleme
-- yüzünden takasla ilgisi olmayan ilanlar `in_trade` kalmış olabilir.
-- Aşağıdaki sorgu bunları bulur — sonucu inceledikten sonra elle
-- çalıştırın, migration otomatik düzeltmez:
--
--   select l.id, l.title, l.owner_id
--   from public.listings l
--   where l.status = 'in_trade'
--     and not exists (
--       select 1
--       from public.trade_offer_items i
--       join public.trades t on t.offer_id = i.offer_id
--       where i.listing_id = l.id
--         and t.status not in ('completed', 'cancelled')
--     );
--
--   -- düzeltme:
--   -- update public.listings set status = 'active' where id in (...);
-- =============================================================================
