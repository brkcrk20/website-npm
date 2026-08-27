-- =============================================================================
-- BACKEND SERTLEŞTİRME — KALAN BOŞLUKLAR
--
-- 20260827000000 şema bütünlüğünü (durum kümeleri, atomik kabul, FK'ler)
-- kapattı. Bu migration, kod tarafında hâlâ "varsayım" olarak duran ya da
-- açıkça "kalan boşluk" diye not düşülmüş kuralları gerçek kısıta çevirir:
--
--   1. profiles.phone / profiles.email artık istemciye HİÇ inmiyor
--      (20260825000000'in "BİLİNEN KALAN BOŞLUK" notu kapatılıyor)
--   2. listings.status kümesi + kilitli ilanın sahibi tarafından
--      serbest bırakılamaması
--   3. delete_listing(): teklife konu olmuş ilan silinemiyordu (FK), artık
--      arşivleniyor; devam eden takastaki ilan hiç silinemiyor
--   4. Teklif durumunu KİMİN değiştirebileceği (alıcı kabul/ret eder,
--      gönderen geri çeker)
--   5. Takas tamamlanması artık İKİ TARAFIN onayına bağlı
--      (arayüz bunu zaten vaat ediyordu, veri tarafında karşılığı yoktu)
--   6. Döngüye yalnızca kendi aktif ilanınla katılabilirsin
--   7. reviews.trustworthiness_rating (kod bu kolonu arıyordu, yoktu)
--   8. expire_stale_trade_offers() zamanlanmış çalıştırma (pg_cron varsa)
-- =============================================================================


-- ── 1) Telefon ve e-posta artık istemciye inmiyor ───────────────────────────
-- 20260825000000 şunu yazıp çözümü sonraya bırakmıştı:
--
--   "BİLİNEN KALAN BOŞLUK: profiles.phone ve profiles.email kolonları, RLS
--    satır bazlı olduğu için giriş yapmış kullanıcılara hâlâ açık. (…) anon
--    anahtarla doğrudan REST çağrısı yapan bir saldırgan tabloyu select=* ile
--    okuyabilir."
--
-- Postgres'te kolon bazlı RLS yok ama kolon bazlı GRANT var. Tablo
-- seviyesindeki SELECT hakkı geri alınıp yalnızca güvenli kolonlar
-- veriliyor; phone/email hiçbir istemci rolünde okunamaz hâle geliyor.
-- INSERT/UPDATE hakları değişmiyor: kullanıcı kendi telefonunu/e-postasını
-- yazmaya devam edebilir (profiles_insert_own / profiles_update_own).
--
-- Kullanıcının KENDİ telefonu artık profiles'tan değil, Supabase oturumundan
-- (auth.users.phone / auth.users.email) okunuyor — bkz. src/services/authService.ts.
--
-- Kolon listesi katalogdan türetiliyor: canlı şemada bu migration'ın
-- bilmediği kolonlar varsa (bkz. supabase/README.md — bazı değişiklikler
-- Studio üzerinden elle uygulandı) onlar da otomatik kapsanır.
--
-- DİKKAT: profiles'a İLERİDE eklenen bir kolon bu grant'a dahil olmaz;
-- yeni kolon ekleyen migration `grant select (yeni_kolon) on public.profiles
-- to anon, authenticated;` satırını da yazmalı.
--
-- KAPSAM DIŞI (bilinçli): `is_admin` ve `sms_verification_enabled` hâlâ
-- okunabilir. İkisi de düşük şiddetli sızıntı (kimin yönetici olduğu, hedefin
-- iki adımlı doğrulama kullanıp kullanmadığı) ama gizlenmeleri yönetici
-- yönlendirmesinin ve şifreli giriş akışının ayrı birer RPC'ye taşınmasını
-- gerektiriyor; o değişiklik bu turun kapsamı dışında. Uygulama tarafında
-- başka bir kullanıcının profili çekilirken bu iki kolon zaten istenmiyor
-- (bkz. authService.PROFILE_PUBLIC_COLUMNS).
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name not in ('phone', 'email');

  if v_columns is null then
    raise exception 'public.profiles bulunamadı.';
  end if;

  execute 'revoke select on public.profiles from anon, authenticated';
  execute format('grant select (%s) on public.profiles to anon, authenticated', v_columns);
end $$;

comment on column public.profiles.phone is
  'GİZLİ. anon/authenticated rollerinde SELECT hakkı yoktur (bkz. 20260828000000). '
  'Kullanıcı kendi numarasını auth oturumundan (auth.users.phone) okur; '
  '"bu numara kayıtlı mı" kontrolü phone_exists() RPC üzerinden yapılır.';

comment on column public.profiles.email is
  'GİZLİ. anon/authenticated rollerinde SELECT hakkı yoktur (bkz. 20260828000000).';


-- ── 2) İlan durumu: kapalı küme + kilidi sahibi çözemez ─────────────────────
-- `listings.status` 20260818130000'den beri düz `text` ve `default 'active'`.
-- Kodun tanıdığı küme (src/types/index.ts) active/in_trade/traded/paused/
-- removed; DB'de hiçbir kısıt yoktu, yani updateListing() ile herhangi bir
-- metin yazılabiliyordu.
--
-- Asıl sorun ikinci kısımda: `listings_update_own` politikası ilan sahibine
-- TÜM kolonlarda UPDATE izni veriyor. Yani devam eden bir takasta kilitli
-- (`in_trade`) bir ilanın sahibi, durumunu elle `active` yapıp aynı ilanı
-- ikinci bir kişiye teklif edebiliyordu — takas kilidi (rapor 30) yalnızca
-- arayüzde vardı.
update public.listings set status = 'active'
where status not in ('active', 'in_trade', 'traded', 'paused', 'removed');

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in ('active', 'in_trade', 'traded', 'paused', 'removed'));

-- Kilidi yalnızca takas tetikleyicileri açıp kapatabilsin diye oturum
-- bazlı bir bayrak kullanılıyor: lock_listings_on_trade_start() ve
-- release_listings_on_trade_end() güncellemeden hemen önce bunu set eder
-- (`is_local => true`, yani işlem bitince kendiliğinden düşer).
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

  -- Moderasyon: admin her ilanı kaldırabilir (aşağıdaki listings_update_admin
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

  if new.status = 'in_trade' or new.status = 'traded' then
    raise exception
      'İlan durumu "%" yalnızca takas akışı tarafından yazılabilir.', new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_listing_status_transition on public.listings;
create trigger trg_enforce_listing_status_transition
  before update of status on public.listings
  for each row execute function public.enforce_listing_status_transition();

-- Kilit/serbest bırakma tetikleyicileri bayrağı set edecek şekilde
-- yeniden tanımlanıyor (gövde 20260820000000 ile aynı, tek fark bayrak).
create or replace function public.lock_listings_on_trade_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('swaloop.trade_lock', 'on', true);

  update public.listings l
  set status = 'in_trade',
      updated_at = now()
  from public.trade_offer_items i
  where i.offer_id = new.offer_id
    and l.id = i.listing_id
    and l.status = 'active';

  perform set_config('swaloop.trade_lock', 'off', true);

  return new;
end;
$$;

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


-- ── 3) İlan silme: teklife konu olmuş ilan artık silinebiliyor ──────────────
-- `trade_offer_items.listing_id`, `listings(id)` referansını `on delete`
-- davranışı OLMADAN tutuyor (20260818130000). Yani bir ilana bir kez teklif
-- geldiyse o ilan BİR DAHA HİÇ SİLİNEMİYORDU: listingService.deleteListing()
-- ham bir foreign key hatası alıp `false` dönüyor, kullanıcı "İlan silinemedi"
-- dışında hiçbir açıklama görmüyordu.
--
-- Doğru davranış silmek değil arşivlemek: takas geçmişi, silinen ilanın
-- başlığını göstermeye devam etmeli. Bu yüzden:
--   * devam eden bir takastaki ilan  → reddedilir (net mesajla)
--   * herhangi bir teklife konu olmuş → status = 'removed' (arşiv)
--   * hiç teklife girmemiş           → gerçekten silinir
create or replace function public.delete_listing(p_listing_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_status text;
  v_referenced boolean;
  v_in_open_trade boolean;
begin
  select owner_id, status into v_owner, v_status
  from public.listings where id = p_listing_id;

  if v_owner is null then
    raise exception 'İlan bulunamadı.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from v_owner then
    raise exception 'Bu ilanı yalnızca sahibi kaldırabilir.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.trade_offer_items i
    join public.trades t on t.offer_id = i.offer_id
    where i.listing_id = p_listing_id
      and t.status not in ('completed', 'cancelled')
  ) into v_in_open_trade;

  if v_in_open_trade or v_status = 'in_trade' then
    raise exception
      'Devam eden bir takasta olan ilan kaldırılamaz. Önce takası tamamlayın ya da iptal edin.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.loop_participants p
    join public.loops l on l.id = p.loop_id
    where p.offering_listing_id = p_listing_id
      and l.status not in ('completed', 'cancelled')
  ) then
    raise exception
      'Devam eden bir döngüde olan ilan kaldırılamaz. Önce döngüden ayrılın.'
      using errcode = 'check_violation';
  end if;

  -- Referans veren HER tablo sayılıyor. `loop_participants.offering_listing_id`
  -- de `listings(id)` referansını `on delete` davranışı olmadan tutuyor
  -- (20260818160000): yalnızca teklife bakmak, bir kez döngüye girmiş ilanda
  -- yine ham bir foreign key hatası demek olurdu.
  select
    exists (select 1 from public.trade_offer_items i where i.listing_id = p_listing_id)
    or exists (select 1 from public.loop_participants p where p.offering_listing_id = p_listing_id)
  into v_referenced;

  if v_referenced then
    -- Takas geçmişi bu ilana referans veriyor; satır korunur, ilan yayından
    -- kalkar. `swaloop.trade_lock` bayrağı, 'traded' -> 'removed' geçişinin
    -- durum tetikleyicisi tarafından reddedilmemesi için set ediliyor.
    perform set_config('swaloop.trade_lock', 'on', true);
    update public.listings set status = 'removed', updated_at = now() where id = p_listing_id;
    perform set_config('swaloop.trade_lock', 'off', true);
    return 'archived';
  end if;

  delete from public.listings where id = p_listing_id;
  return 'deleted';
end;
$$;

comment on function public.delete_listing(uuid) is
  'İlanı kaldırır. Takas geçmişinde geçen ilan silinmez, arşivlenir (status = removed); '
  'devam eden takastaki ilan hiç kaldırılamaz. Dönen değer: deleted | archived.';

revoke all on function public.delete_listing(uuid) from public;
grant execute on function public.delete_listing(uuid) to authenticated;


-- ── 3b) Moderasyon: admin gerçekten ilan kaldırabilsin ─────────────────────
-- `listings` üzerinde tek UPDATE politikası `listings_update_own`
-- (auth.uid() = owner_id). Yani adminService.moderateListing() bir BAŞKASININ
-- ilanını kaldırmaya çalıştığında RLS satırı sessizce eliyordu: Supabase
-- hata DÖNDÜRMÜYOR, sadece 0 satır güncelleniyor. Fonksiyon `error` boş
-- olduğu için `true` dönüyor, denetim kaydına "İlan Kaldırıldı" yazılıyor ve
-- ilan yayında kalmaya devam ediyordu — admin panelinin en kritik işlemi
-- baştan beri hiçbir şey yapmıyordu.
drop policy if exists "listings_update_admin" on public.listings;
create policy "listings_update_admin" on public.listings
  for update using (public.is_admin()) with check (public.is_admin());


-- ── 4) Teklif durumunu kim değiştirebilir ──────────────────────────────────
-- `trade_offers_update_parties` politikası iki tarafa da UPDATE veriyor
-- (kabul/ret/karşı teklif farklı taraflarca yapıldığı için). Ama HANGİ
-- tarafın HANGİ geçişi yapabileceği hiç kontrol edilmiyordu: teklifi
-- GÖNDEREN, kendi teklifini `accepted` yapabiliyordu. Arkasında bir takas
-- oluşmasa da (trades_insert_parties artık yalnızca alıcıya izin veriyor)
-- karşı tarafa "teklifin kabul edildi" bildirimi düşüyor ve teklif
-- terminal duruma girip bir daha yanıtlanamıyordu.
create or replace function public.enforce_trade_offer_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Terminal durumlar: bir daha değişmez.
  if old.status in ('accepted', 'rejected', 'cancelled', 'expired') then
    raise exception
      'Bu teklif zaten sonuçlanmış (%); durumu değiştirilemez.', old.status
      using errcode = 'check_violation';
  end if;

  -- Karşı teklif verilmiş bir teklif yalnızca iptal edilebilir.
  if old.status = 'countered' and new.status <> 'cancelled' then
    raise exception
      'Karşı teklif verilmiş bir teklif yeniden yanıtlanamaz.'
      using errcode = 'check_violation';
  end if;

  -- Süresi dolmuş bir teklif kabul edilemez (expire_stale_trade_offers()
  -- henüz çalışmamış olabilir; kontrol zamana göre yapılır).
  if new.status = 'accepted' and old.expires_at is not null and old.expires_at < now() then
    raise exception
      'Bu teklifin süresi dolmuş; kabul edilemez.'
      using errcode = 'check_violation';
  end if;

  -- 'expired' yalnızca gerçekten süresi geçmiş bir teklife yazılabilir.
  -- (expire_stale_trade_offers() bunu yapar; elle "süresi doldu" denemez.)
  if new.status = 'expired' and (old.expires_at is null or old.expires_at >= now()) then
    raise exception
      'Süresi dolmamış bir teklif "expired" yapılamaz.'
      using errcode = 'check_violation';
  end if;

  -- Taraf kontrolü. auth.uid() boşsa (SQL editörü, service_role, bakım
  -- işleri) atlanır — istemciden gelen her istekte doludur.
  if v_actor is not null then
    if new.status in ('accepted', 'rejected', 'countered')
       and v_actor is distinct from old.receiver_id then
      raise exception
        'Bir teklifi yalnızca teklifin gönderildiği kişi yanıtlayabilir.'
        using errcode = '42501';
    end if;

    if new.status = 'cancelled' and v_actor is distinct from old.sender_id then
      raise exception
        'Bir teklifi yalnızca gönderen geri çekebilir.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_offer_transition on public.trade_offers;
create trigger trg_enforce_trade_offer_transition
  before update of status on public.trade_offers
  for each row execute function public.enforce_trade_offer_transition();


-- ── 5) Takası tamamlamak iki tarafın onayına bağlı ─────────────────────────
-- Arayüz (TradeDetailPage) teslimat onayından sonra şunu söylüyordu:
-- "Karşı taraf onayladığında takas başarıyla tamamlanacak." Veri tarafında
-- böyle bir şey yoktu: `trades_update_parties` politikası tek bir tarafın
-- status'u doğrudan 'completed' yapmasına izin veriyordu ve
-- trg_trades_update_trust_counters İKİ tarafın da completed_trades
-- sayacını artırıp güven puanını yeniden hesaplıyordu. Yani bir kullanıcı,
-- karşı taraf hiçbir şey onaylamadan takası "tamamlanmış" gösterip her iki
-- profilin güven istatistiğini değiştirebiliyordu.
alter table public.trades
  add column if not exists sender_confirmed_at timestamptz,
  add column if not exists receiver_confirmed_at timestamptz;

comment on column public.trades.sender_confirmed_at is
  'Teklifi gönderenin "ürünü teslim aldım" onayı (confirm_trade_receipt).';
comment on column public.trades.receiver_confirmed_at is
  'Teklifi alanın "ürünü teslim aldım" onayı (confirm_trade_receipt).';

-- Bu migration'dan ÖNCE tamamlanmış takaslar geriye dönük onaylı sayılır;
-- aksi hâlde aşağıdaki kısıt geçmiş veriyi tutarsız gösterirdi.
update public.trades
set sender_confirmed_at = coalesce(sender_confirmed_at, completed_at, started_at),
    receiver_confirmed_at = coalesce(receiver_confirmed_at, completed_at, started_at)
where status = 'completed';

create or replace function public.confirm_trade_receipt(p_trade_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_trade public.trades;
  v_actor uuid := auth.uid();
begin
  select * into v_trade from public.trades where id = p_trade_id for update;

  if v_trade.id is null then
    raise exception 'Takas bulunamadı.' using errcode = 'no_data_found';
  end if;

  if v_actor is null then
    raise exception 'Onay için oturum gerekli.' using errcode = '42501';
  end if;

  if v_actor not in (v_trade.sender_id, v_trade.receiver_id) then
    raise exception 'Bu takası yalnızca tarafları onaylayabilir.' using errcode = '42501';
  end if;

  if v_trade.status in ('completed', 'cancelled') then
    raise exception 'Sonuçlanmış bir takas için onay verilemez (%).', v_trade.status
      using errcode = 'check_violation';
  end if;

  if v_actor = v_trade.sender_id and v_trade.sender_confirmed_at is null then
    update public.trades set sender_confirmed_at = now() where id = p_trade_id;
    v_trade.sender_confirmed_at := now();
  elsif v_actor = v_trade.receiver_id and v_trade.receiver_confirmed_at is null then
    update public.trades set receiver_confirmed_at = now() where id = p_trade_id;
    v_trade.receiver_confirmed_at := now();
  end if;

  if v_trade.sender_confirmed_at is null or v_trade.receiver_confirmed_at is null then
    return 'waiting';
  end if;

  -- İki taraf da onayladı: takas "teslim alındı" adımına geçer.
  if public.trade_status_rank(v_trade.status) < public.trade_status_rank('received') then
    update public.trades set status = 'received' where id = p_trade_id;

    insert into public.trade_events (trade_id, actor_id, event_type, note)
    values (p_trade_id, v_actor, 'verified', 'İki taraf da teslimatı onayladı.');
  end if;

  return 'both_confirmed';
end;
$$;

comment on function public.confirm_trade_receipt(uuid) is
  'Çağıran tarafın teslimat onayını işler. İki taraf da onayladığında takası '
  '"received" adımına taşır. Dönen değer: waiting | both_confirmed.';

revoke all on function public.confirm_trade_receipt(uuid) from public;
grant execute on function public.confirm_trade_receipt(uuid) to authenticated;

create or replace function public.enforce_trade_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('completed', 'cancelled') then
    raise exception 'Sonuçlanmış bir takasın (%) durumu değiştirilemez.', old.status
      using errcode = 'check_violation';
  end if;

  -- İptal ve anlaşmazlık her aşamada açılabilir; anlaşmazlık çözülünce
  -- takas kaldığı yerden değil, ya tamamlanır ya iptal edilir.
  if new.status in ('cancelled', 'disputed') then
    return new;
  end if;

  -- Anlaşmazlıktaki takas kaldığı yerden devam etmez: ya tamamlanır ya
  -- iptal edilir (iptal yukarıda döndü). 20260827000000'de bu kural yorumda
  -- böyle yazılmış ama kod HER geçişi reddediyordu — yani anlaşmazlığı
  -- "takas geçerli" diye kapatmanın hiçbir yolu yoktu.
  if old.status = 'disputed' and new.status <> 'completed' then
    raise exception 'Anlaşmazlıktaki bir takas yalnızca tamamlanabilir ya da iptal edilebilir.'
      using errcode = 'check_violation';
  end if;

  if public.trade_status_rank(new.status) <= public.trade_status_rank(old.status) then
    raise exception 'Takas adımı geriye alınamaz (% -> %).', old.status, new.status
      using errcode = 'check_violation';
  end if;

  -- 'received' ve 'completed' iki tarafın da teslimat onayını gerektirir.
  if new.status in ('received', 'completed')
     and (new.sender_confirmed_at is null or new.receiver_confirmed_at is null) then
    raise exception
      'Takas ancak iki taraf da teslimatı onayladıktan sonra tamamlanabilir (confirm_trade_receipt).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_transition on public.trades;
create trigger trg_enforce_trade_transition
  before update of status on public.trades
  for each row execute function public.enforce_trade_transition();


-- ── 6) Döngüye yalnızca kendi aktif ilanınla katılabilirsin ────────────────
-- `loop_participants_insert_own` yalnızca "satırdaki user_id benim" diyordu;
-- `offering_listing_id` hiç doğrulanmıyordu. joinLoop() de kontrol
-- etmiyordu — yani bir kullanıcı BAŞKASININ ilanını döngüye kendi teklifi
-- gibi koyabiliyor, döngü ekranında o ilan onun adına görünüyordu
-- (trade_offer_items için 20260827000000'de kapatılan açığın döngüdeki eşi).
create or replace function public.enforce_loop_participant_listing()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_owner uuid;
  v_status text;
begin
  if new.offering_listing_id is null then
    return new;
  end if;

  select owner_id, status into v_owner, v_status
  from public.listings where id = new.offering_listing_id;

  if v_owner is null then
    raise exception 'Döngüye eklenen ilan bulunamadı.' using errcode = 'foreign_key_violation';
  end if;

  if v_owner is distinct from new.user_id then
    raise exception 'Döngüye yalnızca kendi ilanını koyabilirsin.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' and v_status <> 'active' then
    raise exception 'Yalnızca yayında olan bir ilan döngüye konabilir (mevcut durum: %).', v_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_loop_participant_listing on public.loop_participants;
create trigger trg_enforce_loop_participant_listing
  before insert or update of offering_listing_id, user_id on public.loop_participants
  for each row execute function public.enforce_loop_participant_listing();


-- ── 7) reviews.trustworthiness_rating ──────────────────────────────────────
-- tradeService.submitReview() dört kategori topluyor (güvenilirlik,
-- iletişim, ürün doğruluğu, teslimat) ama DB'de güvenilirlik kolonu yoktu:
-- kullanıcının verdiği puan sessizce atılıyor, okurken yerine genel puan
-- (rating) gösteriliyordu — "Güvenilirlik: 5" yazan yorumda aslında hiç
-- güvenilirlik puanı yoktu. Kolon ekleniyor ve aralık kısıtına dahil
-- ediliyor.
alter table public.reviews
  add column if not exists trustworthiness_rating integer;

comment on column public.reviews.trustworthiness_rating is
  'Değerlendirmenin "güvenilirlik" kategorisi (1-5). Boşsa genel puan (rating) kullanılır.';

update public.reviews
set trustworthiness_rating = least(5, greatest(1, rating))
where trustworthiness_rating is null;

alter table public.reviews drop constraint if exists reviews_rating_range_check;
alter table public.reviews
  add constraint reviews_rating_range_check check (
    rating between 1 and 5
    and (communication_rating is null or communication_rating between 1 and 5)
    and (item_accuracy_rating is null or item_accuracy_rating between 1 and 5)
    and (delivery_rating is null or delivery_rating between 1 and 5)
    and (trustworthiness_rating is null or trustworthiness_rating between 1 and 5)
  );


-- ── 8) Süresi dolan teklifleri kapatan iş ──────────────────────────────────
-- expire_stale_trade_offers() 20260820000000'de yazıldı ama HİÇBİR ŞEY onu
-- çağırmıyordu: "48 saat sonra teklif düşer" kuralı pratikte hiç
-- işlemiyordu (yalnızca kabul anında kontrol ediliyordu, yani teklif
-- listede sonsuza kadar "bekliyor" görünüyordu).
--
-- pg_cron Supabase'te mevcut ama her projede etkin değil ve yerel test
-- ortamında hiç yok; bu yüzden tüm blok koşullu ve hata yutuyor. pg_cron
-- yoksa migration sessizce devam eder, kuralı bir sonraki kabul denemesi
-- yine de uygular.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';

    if exists (select 1 from pg_extension where extname = 'pg_cron') then
      -- Tekrar çalıştırılabilirlik: aynı adlı iş varsa önce kaldırılıyor.
      if exists (select 1 from cron.job where jobname = 'swaloop-expire-offers') then
        perform cron.unschedule('swaloop-expire-offers');
      end if;

      perform cron.schedule(
        'swaloop-expire-offers',
        '*/15 * * * *',
        $cron$select public.expire_stale_trade_offers()$cron$
      );

      raise notice 'pg_cron: swaloop-expire-offers 15 dakikada bir çalışacak.';
    end if;
  else
    raise notice 'pg_cron yok; expire_stale_trade_offers() elle ya da dış bir zamanlayıcıyla çağrılmalı.';
  end if;
exception when others then
  raise notice 'pg_cron zamanlaması kurulamadı (%); expire_stale_trade_offers() elle çağrılmalı.', sqlerrm;
end $$;
