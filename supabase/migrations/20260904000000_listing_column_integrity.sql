-- =============================================================================
-- İLAN KOLONLARI: SAHİBİ HER ŞEYİ YAZABİLİYORDU
--
-- `listings_update_own` politikası ilan sahibine TÜM kolonlar üzerinde
-- UPDATE veriyor. Postgres'te kolon bazlı RLS yok, yani politika "hangi
-- satır" der, "hangi kolon" demez. Sonuçlar:
--
-- 1. **Sayaçlar şişirilebiliyor.** `20260827000000`, `increment_listing_view()`
--    fonksiyonunu özellikle "sahibi kendi sayacını şişirebilirdi" gerekçesiyle
--    RPC yaptı — ama politika kapatılmadığı için RPC hiçbir şeyi kapatmadı:
--    `PATCH /rest/v1/listings?id=eq.<id>` ile `{"view_count": 99999}` hâlâ
--    yazılabiliyor. Aynı şey `favorite_count` için de geçerli. İkisi de
--    ilan kartında "sosyal kanıt" olarak gösteriliyor.
--
-- 2. **Sıralama ele geçirilebiliyor.** Keşif, arama ve "ilanlarım"
--    sorgularının HEPSİ `order('created_at', desc)`. `created_at`'i her gün
--    tazeleyen bir kullanıcı listenin başında kalıcı olarak oturuyor;
--    yeni ilan verenler hiç görünmüyor. Bir takas pazarının en kırılgan
--    yeri burası, çünkü görünürlük doğrudan takas şansı demek.
--
-- 3. **Paylaşılmış bağlantılar kırılabiliyor.** `slug` UNIQUE ve
--    `/ilan/<slug>` organik trafiğin ana kapısı (public/robots.txt).
--    Yazılabilir olduğu için sahibi slug'ı değiştirdiğinde daha önce
--    paylaşılmış her bağlantı 404 oluyor.
--
-- 4. **INSERT tarafı hiç korunmuyordu.** `enforce_listing_status_transition()`
--    yalnızca UPDATE'e bağlıydı; ilan doğrudan `status = 'in_trade'` ile
--    OLUŞTURULABİLİYORDU. Böyle bir ilan ne düzeltilebiliyor ne
--    kaldırılabiliyor: aynı tetikleyici `in_trade`'den çıkışı yasaklıyor
--    ve o ilan kalıcı olarak çöp hâline geliyor.
--
-- 5. **`condition` kapalı küme değildi.** İstemci beş değer tanıyor
--    (`src/types/index.ts`: zero / like_new / very_good / good / acceptable);
--    veritabanı herhangi bir metni kabul ediyordu. Tanınmayan bir değer
--    arayüzde ham olarak basılıyor.
--
-- Oturum bayrağı deseni depoda zaten var: `swaloop.trade_lock`
-- (20260828000000), `swaloop.listing_lifecycle` (20260829000000),
-- `swaloop.trade_confirm` (20260830000000). Buradaki bayrak
-- `swaloop.listing_counter`.
--
-- SIRA: 20260829000000 (ilan süresi) ve 20260827000000'den SONRA.
-- =============================================================================


-- ── §1. Kimlik kolonları ve sayaçlar ────────────────────────────────────

create or replace function public.enforce_listing_immutability()
returns trigger
language plpgsql
-- search_path sabitleniyor: depodaki tüm public fonksiyonlar için geçerli
-- kural (trade_flow_test.sql §15 bunu doğruluyor).
set search_path to 'public'
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at
     or new.slug is distinct from old.slug then
    raise exception
      'İlanın sahibi, oluşturulma zamanı ve bağlantı adresi değiştirilemez.'
      using errcode = '42501';
  end if;

  -- Sayaçları yalnızca onları yöneten iki fonksiyon yazabilir:
  -- increment_listing_view() ve sync_listing_favorite_count().
  if (new.view_count is distinct from old.view_count
      or new.favorite_count is distinct from old.favorite_count)
     and coalesce(current_setting('swaloop.listing_counter', true), '') <> 'on' then
    raise exception
      'Görüntülenme ve favori sayaçları istemciden değiştirilemez.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_listing_immutability on public.listings;
create trigger trg_enforce_listing_immutability
  before update on public.listings
  for each row execute function public.enforce_listing_immutability();


-- ── §2. Sayacı yazan iki meşru yeri bayrakla sar ────────────────────────
-- Gövdeler 20260827000000 ve 20260818135000'deki hâlleriyle aynı; eklenen
-- tek şey bayrak. `set_config(..., true)` işlem yereldir: bayrak aynı
-- işlemin dışına sızmaz.

create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('swaloop.listing_counter', 'on', true);

  update public.listings
  set view_count = view_count + 1
  where id = p_listing_id
    -- İlan sahibinin kendi ilanını açması sayaca yazılmaz.
    and owner_id is distinct from auth.uid();

  perform set_config('swaloop.listing_counter', 'off', true);
end;
$$;

create or replace function public.sync_listing_favorite_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('swaloop.listing_counter', 'on', true);

  if (tg_op = 'INSERT') then
    update public.listings
      set favorite_count = favorite_count + 1
      where id = new.listing_id;
    perform set_config('swaloop.listing_counter', 'off', true);
    return new;
  elsif (tg_op = 'DELETE') then
    update public.listings
      set favorite_count = greatest(favorite_count - 1, 0)
      where id = old.listing_id;
    perform set_config('swaloop.listing_counter', 'off', true);
    return old;
  end if;

  perform set_config('swaloop.listing_counter', 'off', true);
  return null;
end;
$$;


-- ── §3. INSERT tarafı: sistem durumlarıyla ilan oluşturulamaz ───────────
-- Gövde 20260829000000'deki hâliyle aynı; eklenen tek şey INSERT dalı.
-- Tetikleyicideki kolon listesi (`of status`) yalnızca UPDATE olayına
-- uygulanır, bu yüzden `before insert or update of status` geçerlidir.

create or replace function public.enforce_listing_status_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    -- Sistem durumları (`in_trade`, `traded`, `expired`, `removed`) yalnızca
    -- akışın içinde oluşur. İlan doğrudan bunlarla açılırsa bir daha
    -- düzeltilemez hâle geliyordu; sessizce `active`'e çekiliyor.
    if new.status is null or new.status not in ('active', 'paused') then
      new.status := 'active';
    end if;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Sistem (takas tetikleyicisi) yapıyorsa serbest.
  if coalesce(current_setting('swaloop.trade_lock', true), '') = 'on' then
    return new;
  end if;

  -- Sistem (süre işi / renew_listing) yapıyorsa serbest.
  if coalesce(current_setting('swaloop.listing_lifecycle', true), '') = 'on' then
    return new;
  end if;

  -- Moderasyon: admin her ilanı kaldırabilir (listings_update_admin
  -- politikasının tetikleyici tarafındaki karşılığı).
  if new.status = 'removed' and public.is_admin() then
    return new;
  end if;

  if old.status = 'in_trade' then
    raise exception
      'Devam eden bir takasta kilitli ilanın durumu değiştirilemez. Önce takası tamamlayın ya da iptal edin.'
      using errcode = 'check_violation';
  end if;

  if old.status = 'traded' and new.status <> 'removed' then
    raise exception
      'Takas edilmiş bir ilan yeniden yayına alınamaz; yalnızca kaldırılabilir.'
      using errcode = 'check_violation';
  end if;

  if old.status = 'expired' and new.status <> 'removed' then
    raise exception
      'Süresi dolan ilan yalnızca "Yenile" ile tekrar yayına alınır.'
      using errcode = 'check_violation';
  end if;

  if new.status in ('in_trade', 'traded', 'expired') then
    raise exception
      'İlan durumu "%" yalnızca sistem tarafından yazılabilir.', new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_listing_status_transition on public.listings;
create trigger trg_enforce_listing_status_transition
  before insert or update of status on public.listings
  for each row execute function public.enforce_listing_status_transition();


-- ── §4. `condition` kapalı küme ─────────────────────────────────────────
-- İstemcinin tanıdığı beş değer (src/types/index.ts → ListingCondition).
-- Tanınmayan mevcut değerler NULL'a çekiliyor: 'good' gibi bir değer
-- yazmak, kullanıcının ürünü hakkında bilmediğimiz bir şeyi iddia etmek
-- olurdu. Kolon NOT NULL YAPILMIYOR.

update public.listings
   set condition = null
 where condition is not null
   and condition not in ('zero', 'like_new', 'very_good', 'good', 'acceptable');

alter table public.listings drop constraint if exists listings_condition_check;
alter table public.listings
  add constraint listings_condition_check
  check (condition is null or condition in ('zero', 'like_new', 'very_good', 'good', 'acceptable'));


-- =============================================================================
-- UYGULADIKTAN SONRA: şişirilmiş sayaç var mı?
--
--   select id, title, view_count, favorite_count
--   from public.listings
--   where view_count > 10000
--      or favorite_count > (select count(*) from public.profiles);
--
-- `favorite_count`, favorites tablosundan yeniden türetilebilir:
--
--   select set_config('swaloop.listing_counter', 'on', true);
--   update public.listings l
--      set favorite_count = coalesce(f.n, 0)
--     from (select listing_id, count(*) as n from public.favorites group by 1) f
--    where f.listing_id = l.id;
--
-- `view_count` türetilemez (kaynak tablo yok); bariz şişkinlikler elle
-- düzeltilmeli.
-- =============================================================================
