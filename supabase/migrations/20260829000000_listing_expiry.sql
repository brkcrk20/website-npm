-- ═══════════════════════════════════════════════════════════════════════════
-- İLAN SÜRESİ — "hâlâ takasa açık mı?" (rapor md. 119)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SORUN: İlanlar sonsuza kadar `active` kalıyordu. `trade_offers` 20260820000000
-- ile bir ömre (`expires_at`, +48 saat) bağlanmıştı ama ilanlar bağlanmamıştı;
-- yani keşif akışı, aylar önce takas edilmiş ya da sahibinin unuttuğu
-- ilanlarla dolmaya açıktı. Kullanıcı açısından en kötü hâli şu: bir ilana
-- teklif gönderiyorsunuz, karşı taraf o ilanı 4 ay önce koymuş ve elinde
-- ürün yok. Ürünün güven vaadi ("teklif ettiğim şey gerçekten duruyor")
-- burada kırılıyor.
--
-- ÇÖZÜM: `trade_offers.expires_at` deseni ilanlara da uygulanıyor.
--   * Her ilan varsayılan olarak 30 gün yayında kalır (public.listing_lifetime()).
--   * Bitmeden 3 gün önce sahibine "süresi doluyor" bildirimi gider.
--   * Süre dolunca ilan `expired` olur ve keşiften düşer — SİLİNMEZ.
--   * Sahibi `renew_listing()` ile tek dokunuşla 30 gün daha uzatır.
--
-- SÜRE NEDEN KOLONDA DEĞİL DE FONKSİYONDA: üç ayrı yerde (default, yenileme,
-- takas sonrası uzatma) aynı sabit gerekiyor; tek kaynakta tutulmazsa
-- üçünden biri unutulur.
--
-- Bu dosya 20260828000000 üzerine kuruluyor: `enforce_listing_status_transition()`
-- ve `release_listings_on_trade_end()` oradan gelen gövdeler üzerine
-- yazılıyor. SIRAYLA uygulanmalı.


-- ── 1) Ömür sabiti ─────────────────────────────────────────────────────────
create or replace function public.listing_lifetime()
returns interval
language sql
immutable
set search_path to 'public'
as $$ select interval '30 days' $$;

comment on function public.listing_lifetime() is
  'Bir ilanın yayında kalma süresi. Tek kaynak: default, renew_listing() ve '
  'takas sonrası uzatma bu değeri okur.';


-- ── 2) Kolonlar ────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists expires_at timestamptz,
  add column if not exists renewed_at timestamptz,
  -- "süresi doluyor" bildirimi bir kez gitsin diye: dolu ise uyarı gönderilmiş
  -- demektir, yenilemede tekrar null'a çekilir.
  add column if not exists expiry_reminder_at timestamptz;

-- Geriye dönük doldurma. Bilinçli olarak `created_at + 30 gün` DEĞİL:
-- migration'dan önce açılmış ilanların çoğu 30 günden eski ve o hesapla
-- hepsi ilk cron turunda birden düşerdi (kullanıcı hiçbir uyarı almadan
-- ilanlarının yok olduğunu görür). Herkese migration anından itibaren tam
-- bir ömür veriliyor.
update public.listings
set expires_at = now() + public.listing_lifetime()
where expires_at is null;

alter table public.listings alter column expires_at set not null;
alter table public.listings
  alter column expires_at set default (now() + public.listing_lifetime());

-- Cron'un her turda taradığı sorgu: status='active' + expires_at karşılaştırması.
create index if not exists listings_active_expiry_idx
  on public.listings (expires_at)
  where status = 'active';


-- ── 3) `expired` durumu ────────────────────────────────────────────────────
-- src/types/index.ts → Listing['status'] ile birebir aynı küme
-- (backendHardening testinde doğrulanıyor).
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('active', 'in_trade', 'traded', 'paused', 'expired', 'removed'));


-- ── 4) Durum geçişi: `expired`'a yalnızca sistem yazar ─────────────────────
-- Gövde 20260828000000'deki hâlin üzerine iki kural ekliyor. `listings_update_own`
-- politikası ilan sahibine tüm kolonlarda UPDATE izni verdiği için, aksi hâlde
-- kullanıcı süresi dolmuş ilanını elle `active` yapıp süre kuralını tamamen
-- atlayabilirdi.
--
-- İki ayrı bayrak var ve karıştırılmamalı:
--   swaloop.trade_lock        → takas tetikleyicileri (in_trade / traded)
--   swaloop.listing_lifecycle → süre işleri (expired / yenileme)
create or replace function public.enforce_listing_status_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
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

  -- Süresi dolan ilan elle yayına alınamaz: yenileme renew_listing()
  -- üzerinden gider, çünkü süre de orada yeniden hesaplanıyor. Aksi hâlde
  -- status='active' olur ama expires_at geçmişte kalır ve ilan bir sonraki
  -- cron turunda yine düşer (kullanıcı için anlaşılmaz bir döngü).
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
  before update of status on public.listings
  for each row execute function public.enforce_listing_status_transition();


-- ── 5) `expires_at` doğrudan yazılamaz ─────────────────────────────────────
-- Durum kısıtı tek başına yetmez: sahibi `expires_at`'i 10 yıl sonrasına
-- çekerse ilan hiç düşmez, yani kural yine yalnızca arayüzde kalır.
-- INSERT'te değer istemciden HİÇ okunmuyor (her ilan aynı ömürle başlar),
-- UPDATE'te yalnızca sistem yolları değiştirebiliyor.
create or replace function public.enforce_listing_expiry()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := now() + public.listing_lifetime();
    new.renewed_at := null;
    new.expiry_reminder_at := null;
    return new;
  end if;

  if new.expires_at is not distinct from old.expires_at then
    return new;
  end if;

  if coalesce(current_setting('swaloop.listing_lifecycle', true), '') = 'on'
     or coalesce(current_setting('swaloop.trade_lock', true), '') = 'on' then
    return new;
  end if;

  raise exception
    'İlan süresi doğrudan değiştirilemez; yenilemek için renew_listing() kullanın.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_listing_expiry_insert on public.listings;
create trigger trg_enforce_listing_expiry_insert
  before insert on public.listings
  for each row execute function public.enforce_listing_expiry();

drop trigger if exists trg_enforce_listing_expiry_update on public.listings;
create trigger trg_enforce_listing_expiry_update
  before update of expires_at on public.listings
  for each row execute function public.enforce_listing_expiry();


-- ── 6) Bildirim tipleri ────────────────────────────────────────────────────
-- Küme src/types/index.ts → NotificationType ile birebir aynı kalmalı
-- (notificationService testi bunu doğrular; test EN SON tanımı okur).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'trade_offer',       -- yeni takas teklifi geldi
    'counter_offer',     -- karşı teklif geldi
    'trade_status',      -- teklif/takas durumu değişti
    'need_matched',      -- "aradığın bir ürün eklendi"
    'message',           -- yeni mesaj
    'review_request',    -- takas bitti, değerlendirme bekleniyor
    'listing_expiring',  -- ilanın süresi doluyor (3 gün kaldı)
    'listing_expired',   -- ilanın süresi doldu, yayından kalktı
    'loop',
    'badge',
    'system'
  ));


-- ── 7) Yenileme ────────────────────────────────────────────────────────────
create or replace function public.renew_listing(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_status text;
  v_expires timestamptz;
begin
  select owner_id, status into v_owner, v_status
  from public.listings where id = p_listing_id;

  if v_owner is null then
    raise exception 'İlan bulunamadı.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from v_owner then
    raise exception 'Bu ilanı yalnızca sahibi yenileyebilir.' using errcode = '42501';
  end if;

  if v_status not in ('active', 'paused', 'expired') then
    raise exception
      'Yalnızca yayındaki, duraklatılmış ya da süresi dolmuş ilanlar yenilenebilir.'
      using errcode = 'check_violation';
  end if;

  v_expires := now() + public.listing_lifetime();

  perform set_config('swaloop.listing_lifecycle', 'on', true);

  update public.listings
  set expires_at = v_expires,
      renewed_at = now(),
      -- Uyarı bayrağı sıfırlanıyor: yeni dönemin sonunda tekrar uyarılsın.
      expiry_reminder_at = null,
      status = case when status = 'expired' then 'active' else status end,
      updated_at = now()
  where id = p_listing_id;

  perform set_config('swaloop.listing_lifecycle', 'off', true);

  return v_expires;
end;
$$;

comment on function public.renew_listing(uuid) is
  'İlanın yayın süresini bugünden itibaren listing_lifetime() kadar uzatır; '
  'süresi dolmuş ilanı yeniden yayına alır. Dönen değer: yeni expires_at.';

revoke all on function public.renew_listing(uuid) from public;
grant execute on function public.renew_listing(uuid) to authenticated;


-- ── 8) Süre işi ────────────────────────────────────────────────────────────
-- Tek fonksiyon iki adım yapıyor: önce uyarı, sonra düşürme. Ayrı iki cron
-- işi olsaydı uyarı işi düşürme işinden sonra çalıştığında ilan hiç
-- uyarılmadan düşebilirdi.
create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_expired integer := 0;
  r record;
begin
  -- 1) Süresi yaklaşanlara tek seferlik uyarı.
  for r in
    select l.id, l.owner_id, l.title, l.slug, l.expires_at
    from public.listings l
    where l.status = 'active'
      and l.expires_at > now()
      and l.expires_at <= now() + interval '3 days'
      and l.expiry_reminder_at is null
  loop
    perform public.push_notification(
      r.owner_id,
      'listing_expiring',
      'İlanının süresi doluyor',
      format(
        '"%s" ilanının süresi %s gün içinde doluyor. Ürün hâlâ takasa açıksa yenile.',
        r.title,
        greatest(1, ceil(extract(epoch from (r.expires_at - now())) / 86400))::int
      ),
      '/ilanlarim',
      r.id
    );

    update public.listings set expiry_reminder_at = now() where id = r.id;
  end loop;

  -- 2) Süresi dolanları yayından düşür. `in_trade` bilinçli olarak dışarıda:
  -- devam eden takasın ilanı süre dolduğu için ortadan kaybolmamalı
  -- (sorgu zaten status='active' diyor, bu not niyeti kayda geçirmek için).
  perform set_config('swaloop.listing_lifecycle', 'on', true);

  for r in
    select l.id, l.owner_id, l.title
    from public.listings l
    where l.status = 'active'
      and l.expires_at <= now()
  loop
    update public.listings
    set status = 'expired', updated_at = now()
    where id = r.id;

    v_expired := v_expired + 1;

    perform public.push_notification(
      r.owner_id,
      'listing_expired',
      'İlanının süresi doldu',
      format(
        '"%s" ilanı yayından kalktı. Ürün hâlâ duruyorsa "İlanlarım"dan tek dokunuşla yenileyebilirsin.',
        r.title
      ),
      '/ilanlarim',
      r.id
    );
  end loop;

  perform set_config('swaloop.listing_lifecycle', 'off', true);

  return v_expired;
end;
$$;

comment on function public.expire_stale_listings() is
  'Süresi yaklaşan ilanların sahibine uyarı gönderir, süresi dolanları '
  'expired yapar. Dönen değer: düşürülen ilan sayısı.';

revoke all on function public.expire_stale_listings() from public;


-- ── 9) İptal edilen takastan dönen ilana nefes payı ────────────────────────
-- Gövde 20260828000000 ile aynı, tek fark `cancelled` dalındaki süre
-- uzatması. Sebep: 25 günlük bir ilan takasa girip 10 gün kilitli kalırsa,
-- takas iptal edildiğinde ilan `active`'e döner ama `expires_at` çoktan
-- geçmiştir — kullanıcı, kendi hatası olmayan bir gecikme yüzünden ilanının
-- aynı gün düştüğünü görür. Kilitte geçen süre sayılmasın diye, dönen ilana
-- en az 7 gün kalması garanti ediliyor.
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

  perform set_config('swaloop.trade_lock', 'on', true);

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
        expires_at = greatest(l.expires_at, now() + interval '7 days'),
        expiry_reminder_at = null,
        updated_at = now()
    from public.trade_offer_items i
    where i.offer_id = new.offer_id
      and l.id = i.listing_id
      and l.status = 'in_trade';
  end if;

  perform set_config('swaloop.trade_lock', 'off', true);

  -- 'disputed' bilinçli olarak dışarıda (bkz. 20260820000000).
  return new;
end;
$$;


-- ── 10) Zamanlama ──────────────────────────────────────────────────────────
-- 20260828000000'deki `swaloop-expire-offers` işiyle aynı desen: pg_cron her
-- projede etkin değil ve yerel test ortamında hiç yok, bu yüzden blok koşullu
-- ve hata yutuyor. İş kurulmazsa kural kaybolmaz ama KENDİLİĞİNDEN de
-- işlemez — teklif tarafındaki gibi "kabul anında yine kontrol edilir"
-- güvencesi burada YOK, çünkü ilanı düşürecek başka bir yol yok. pg_cron
-- kapalıysa expire_stale_listings() dışarıdan çağrılmalı (bkz. supabase/README.md).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';

    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      if exists (select 1 from cron.job where jobname = 'swaloop-expire-listings') then
        perform cron.unschedule('swaloop-expire-listings');
      end if;

      -- Saatte bir yeter: ilan ömrü gün ölçeğinde, teklif ömrü gibi saat
      -- ölçeğinde değil.
      perform cron.schedule(
        'swaloop-expire-listings',
        '7 * * * *',
        $cron$select public.expire_stale_listings()$cron$
      );

      raise notice 'pg_cron: swaloop-expire-listings saatte bir çalışacak.';
    end if;
  else
    raise notice 'pg_cron yok; expire_stale_listings() elle ya da dış bir zamanlayıcıyla çağrılmalı.';
  end if;
exception when others then
  raise notice 'pg_cron zamanlaması kurulamadı (%); expire_stale_listings() elle çağrılmalı.', sqlerrm;
end $$;
