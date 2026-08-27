-- =============================================================================
-- BACKEND BÜTÜNLÜK DÜZELTMELERİ
--
-- Bu migration, servis katmanının (src/services/*.ts) ve yorumların VAR
-- SAYDIĞI ama veritabanında hiç karşılığı olmayan kuralları gerçek kısıtlara
-- çevirir. Hepsi `supabase/tests/trade_flow_test.sql` ile doğrulanıyor.
--
-- Kapsam:
--   1. trade_offers.status / trades.status CHECK kısıtları + doğru default
--   2. trades.offer_id benzersiz + teklifle taraf tutarlılığı (FK)
--   3. Teklif durum geçişleri (kabul edilmiş teklif tekrar kabul edilemez,
--      süresi dolmuş teklif kabul edilemez)
--   4. trade_offer_items: kalem sahibi ile ilan sahibi aynı olmalı
--   5. reviews: tekrar değerlendirme yok, kendini değerlendirme yok, puan
--      aralığı, silme/güncelleme sonrası güven puanı yeniden hesabı
--   6. increment_listing_view(): görüntülenme sayacı (hiç yoktu)
--   7. loops/loop_participants durum değerleri koda göre normalize
--   8. updated_at tetikleyicileri (rejectOffer'ın zaman damgası donuyordu)
--   9. search_path'i sabitlenmemiş fonksiyonların sertleştirilmesi
-- =============================================================================


-- ── 0) Ortak yardımcı (20260820000000'de tanımlı; search_path sabitleniyor) ──
-- Postgres'te `search_path` ayarlanmamış bir fonksiyon, çağıran oturumun
-- search_path'ini kullanır; kötü niyetli bir search_path ile aynı isimli
-- sahte bir tablo/fonksiyon öne alınabilir. Supabase linter'ı da bunu
-- (`function_search_path_mutable`) uyarı olarak raporlar.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify_tr(input text)
returns text
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  result text;
begin
  if input is null then
    return '';
  end if;

  result := translate(input, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc');
  result := lower(result);
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  result := regexp_replace(result, '(^-+)|(-+$)', '', 'g');

  return result;
end;
$$;

create or replace function public.set_listing_slug()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  base_slug text;
  candidate text;
  counter int := 1;
begin
  if new.slug is not null and length(trim(new.slug)) > 0 then
    new.slug := public.slugify_tr(new.slug);
  else
    base_slug := public.slugify_tr(coalesce(new.title, 'ilan'));

    if base_slug = '' then
      base_slug := 'ilan';
    end if;

    candidate := base_slug;

    while exists (select 1 from public.listings where slug = candidate) loop
      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    end loop;

    new.slug := candidate;
  end if;

  return new;
end;
$$;

create or replace function public.sync_need_fulfilled_at()
returns trigger
language plpgsql
set search_path to 'public'
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

create or replace function public.enforce_active_need_limit()
returns trigger
language plpgsql
set search_path to 'public'
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

create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.content is distinct from old.content
     or new.type is distinct from old.type
     or new.trade_offer_id is distinct from old.trade_offer_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Gönderilmiş bir mesaj değiştirilemez; yalnızca is_read güncellenebilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;


-- ── 1) Durum kümeleri gerçek kısıta çevriliyor ──────────────────────────────
-- tradeService.ts, `trade_offers_status_check` ve `trades_status_check`
-- adlı iki CHECK constraint'in VAR OLDUĞUNU yazıyordu (bkz. oradaki
-- yorumlar) — ama hiçbir migration bunları oluşturmuyordu. Yani kod,
-- olmayan bir garantiye dayanıyordu: `status` alanına herhangi bir metin
-- yazılabiliyordu ve hydrateOffer() tanımadığı bir değeri olduğu gibi
-- TradeStatus'a cast ettiği için arayüz sessizce bozuk bir durum gösteriyordu.
--
-- 20260818130000, trade_offers.status'u `default 'offer_sent'` ile
-- oluşturuyor; bu değer kodun yazdığı kümede yok. Sıfırdan kurulan bir
-- ortamda status'u açıkça vermeyen her INSERT geçersiz bir satır üretirdi.

update public.trade_offers set status = 'pending'
where status not in ('pending', 'accepted', 'rejected', 'countered', 'cancelled', 'expired');

alter table public.trade_offers alter column status set default 'pending';

alter table public.trade_offers drop constraint if exists trade_offers_status_check;
alter table public.trade_offers
  add constraint trade_offers_status_check
  check (status in ('pending', 'accepted', 'rejected', 'countered', 'cancelled', 'expired'));

update public.trades set status = 'locked'
where status not in ('locked', 'delivery_planned', 'in_transit', 'received', 'completed', 'disputed', 'cancelled');

alter table public.trades alter column status set default 'locked';

alter table public.trades drop constraint if exists trades_status_check;
alter table public.trades
  add constraint trades_status_check
  check (status in ('locked', 'delivery_planned', 'in_transit', 'received', 'completed', 'disputed', 'cancelled'));


-- ── 2) Bir teklifin EN FAZLA bir takası olur ────────────────────────────────
-- `fetchTradeRowByOfferId()` .maybeSingle() kullanıyor: aynı offer_id için
-- iki `trades` satırı varsa PostgREST hata döndürür ve o teklifin detay
-- sayfası KALICI olarak açılmaz hâle gelir. acceptOffer() iki kez
-- çağrıldığında (çift tıklama, iki sekme) bu satır gerçekten iki kez
-- oluşuyordu — hiçbir kısıt engellemiyordu.
--
-- Ayrıca `trades_insert_parties` politikası yalnızca "auth.uid() taraflardan
-- biri olsun" diyordu; satırın teklifle ilgisi hiç doğrulanmıyordu. Yani bir
-- kullanıcı kendi teklifinin id'siyle sender_id/receiver_id'yi istediği gibi
-- yazıp takas uydurabilir, sonra status'u 'completed' yaparak
-- trg_trades_update_trust_counters üzerinden kendi güven sayaçlarını
-- şişirebilirdi. Bileşik FK bunu şemada imkânsız kılıyor.

-- Aynı teklife bağlı fazla satırlar varsa en eskisi korunur.
delete from public.trades t
using public.trades keep
where t.offer_id = keep.offer_id
  and (t.started_at, t.id) > (keep.started_at, keep.id);

-- SIRALAMA: bileşik FK, aşağıdaki unique index'e bağımlı. Migration yeniden
-- çalıştırılabilir olmalı (bkz. supabase/README.md — Studio'dan elle
-- uygulanan dosyalar CLI geçmişine düşmediği için `db push` bunları tekrar
-- çalıştırmayı deneyebilir), bu yüzden önce FK düşürülüyor: aksi hâlde ikinci
-- çalıştırmada "cannot drop constraint ... because other objects depend on it"
-- hatası alınır.
alter table public.trades drop constraint if exists trades_offer_parties_fkey;

alter table public.trades drop constraint if exists trades_offer_id_key;
alter table public.trades add constraint trades_offer_id_key unique (offer_id);

alter table public.trade_offers drop constraint if exists trade_offers_id_parties_key;
alter table public.trade_offers
  add constraint trade_offers_id_parties_key unique (id, sender_id, receiver_id);

-- Eski (tutarsız) satırlar varsa bileşik FK eklenemez; önce teklifle eşitle.
update public.trades t
set sender_id = o.sender_id,
    receiver_id = o.receiver_id
from public.trade_offers o
where o.id = t.offer_id
  and (t.sender_id is distinct from o.sender_id or t.receiver_id is distinct from o.receiver_id);

alter table public.trades
  add constraint trades_offer_parties_fkey
  foreign key (offer_id, sender_id, receiver_id)
  references public.trade_offers (id, sender_id, receiver_id);

comment on constraint trades_offer_parties_fkey on public.trades is
  'Bir takas satırının tarafları, bağlı olduğu teklifin taraflarıyla aynı olmak zorunda. Uydurma takas satırı ile güven sayaçlarını şişirmeyi engeller.';

-- Takası yalnızca teklifi ALAN taraf başlatabilir (kabul eden odur).
drop policy if exists "trades_insert_parties" on public.trades;
create policy "trades_insert_parties" on public.trades
  for insert with check (
    auth.uid() = receiver_id
    and exists (
      select 1 from public.trade_offers o
      where o.id = trades.offer_id
        and o.receiver_id = auth.uid()
        and o.status = 'accepted'
    )
  );


-- ── 3) Teklif durum geçişleri ───────────────────────────────────────────────
-- acceptOffer() teklifin mevcut durumuna hiç bakmıyordu: reddedilmiş,
-- iptal edilmiş ya da süresi dolmuş bir teklif de "kabul edildi" yapılabiliyor
-- ve arkasından bir takas açılabiliyordu. Kural DB'ye taşındı ki hangi
-- ekrandan çağrılırsa çağrılsın geçerli olsun.
create or replace function public.enforce_trade_offer_transition()
returns trigger
language plpgsql
set search_path to 'public'
as $$
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

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_offer_transition on public.trade_offers;
create trigger trg_enforce_trade_offer_transition
  before update of status on public.trade_offers
  for each row execute function public.enforce_trade_offer_transition();


-- ── 4) Teklif kalemleri gerçek ilan sahibine bağlı olmalı ───────────────────
-- `trade_offer_items.owner_id` uygulama tarafından yazılıyordu ve hiç
-- doğrulanmıyordu: teklifi gönderen, karşı tarafın ilanını 'offered'
-- (yani "ben veriyorum") olarak ekleyebiliyordu. Takas kabul edilince
-- lock_listings_on_trade_start() o ilanı da kilitliyordu.
create or replace function public.enforce_trade_offer_item_ownership()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_listing_owner uuid;
  v_sender uuid;
  v_receiver uuid;
begin
  select owner_id into v_listing_owner from public.listings where id = new.listing_id;
  select sender_id, receiver_id into v_sender, v_receiver
    from public.trade_offers where id = new.offer_id;

  if v_listing_owner is null or v_sender is null then
    raise exception 'Teklif kalemi geçersiz ilan/teklif referansı içeriyor.'
      using errcode = 'foreign_key_violation';
  end if;

  -- owner_id her zaman ilanın GERÇEK sahibidir; uygulamanın gönderdiği
  -- değere güvenilmez, sessizce düzeltilir.
  new.owner_id := v_listing_owner;

  if new.role = 'offered' and v_listing_owner <> v_sender then
    raise exception
      'Teklife "verilen" olarak yalnızca teklifi gönderenin kendi ilanı eklenebilir.'
      using errcode = 'check_violation';
  end if;

  if new.role = 'requested' and v_listing_owner <> v_receiver then
    raise exception
      'Teklifte "istenen" olarak yalnızca karşı tarafın ilanı eklenebilir.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_offer_item_ownership on public.trade_offer_items;
create trigger trg_enforce_trade_offer_item_ownership
  before insert or update on public.trade_offer_items
  for each row execute function public.enforce_trade_offer_item_ownership();


-- ── 5) Değerlendirmeler ─────────────────────────────────────────────────────
-- (a) trust_events.review_id FK'si `on delete` davranışı olmadan
--     tanımlanmıştı: bir değerlendirme ARTIK HİÇ SİLİNEMİYORDU (service_role
--     ile bile), çünkü trg_reviews_recalc_trust her insert'te trust_events'e
--     satır yazıyor ve o satır referansı tutuyordu. Moderasyon için silme
--     şart; referans birlikte düşmeli.
alter table public.trust_events drop constraint if exists trust_events_review_id_fkey;
alter table public.trust_events
  add constraint trust_events_review_id_fkey
  foreign key (review_id) references public.reviews(id) on delete cascade;

alter table public.trust_events drop constraint if exists trust_events_trade_id_fkey;
alter table public.trust_events
  add constraint trust_events_trade_id_fkey
  foreign key (trade_id) references public.trades(id) on delete cascade;

-- (b) Aynı takas için aynı kişi iki kez değerlendirme yazamaz. Yazabildiği
--     için review_count ve average_rating istediği kadar şişirilebiliyordu.
delete from public.reviews r
using public.reviews keep
where r.trade_id = keep.trade_id
  and r.reviewer_id = keep.reviewer_id
  and (r.created_at, r.id) > (keep.created_at, keep.id);

alter table public.reviews drop constraint if exists reviews_one_per_reviewer_key;
alter table public.reviews
  add constraint reviews_one_per_reviewer_key unique (trade_id, reviewer_id);

-- (c) Kendini değerlendirme ve aralık dışı puan.
delete from public.reviews where reviewer_id = reviewed_user_id;

alter table public.reviews drop constraint if exists reviews_not_self_check;
alter table public.reviews
  add constraint reviews_not_self_check check (reviewer_id <> reviewed_user_id);

update public.reviews set rating = least(5, greatest(1, rating)) where rating < 1 or rating > 5;

alter table public.reviews drop constraint if exists reviews_rating_range_check;
alter table public.reviews
  add constraint reviews_rating_range_check check (
    rating between 1 and 5
    and (communication_rating is null or communication_rating between 1 and 5)
    and (item_accuracy_rating is null or item_accuracy_rating between 1 and 5)
    and (delivery_rating is null or delivery_rating between 1 and 5)
  );

-- (d) Değerlendirme yalnızca TAMAMLANMIŞ bir takasa yazılabilir ve
--     değerlendirilen kişi o takasın diğer tarafı olmalı. Eski politika
--     "takasın taraflarından biriyim" ile yetiniyordu: kilitli (henüz
--     teslim edilmemiş) bir takasa da, hatta takasla ilgisi olmayan üçüncü
--     bir kişiye de değerlendirme yazılabiliyordu.
drop policy if exists "reviews_insert_trade_party" on public.reviews;
create policy "reviews_insert_trade_party" on public.reviews
  for insert with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.trades t
      where t.id = reviews.trade_id
        and t.status = 'completed'
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
        and reviews.reviewed_user_id in (t.sender_id, t.receiver_id)
        and reviews.reviewed_user_id <> auth.uid()
    )
  );

-- (e) trg_reviews_recalc_trust yalnızca INSERT'te çalışıyordu. Bir
--     değerlendirme silinince ya da puanı güncellenince trust_profiles
--     eski ortalamada donuyordu (supabase/tests §6 bunu doğruluyor).
create or replace function public.trg_reviews_recalc_trust()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_trust_score(old.reviewed_user_id);
    return old;
  end if;

  perform public.recalc_trust_score(new.reviewed_user_id);

  -- Puanı değişen bir değerlendirme için yeni bir trust_events satırı
  -- açılmaz; olay "değerlendirme alındı"dır, her düzenlemede tekrarlamaz.
  if tg_op = 'INSERT' then
    insert into public.trust_events (user_id, event_type, note, review_id, trade_id)
    values (
      new.reviewed_user_id,
      'review_received',
      'Yeni değerlendirme sonrası güven puanı yeniden hesaplandı.',
      new.id,
      new.trade_id
    );
  end if;

  -- Değerlendirilen kişi değiştiyse eski kişinin de puanı düzeltilmeli.
  if tg_op = 'UPDATE' and old.reviewed_user_id is distinct from new.reviewed_user_id then
    perform public.recalc_trust_score(old.reviewed_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reviews_recalc_trust on public.reviews;
create trigger trg_reviews_recalc_trust
  after insert or update or delete on public.reviews
  for each row execute function public.trg_reviews_recalc_trust();


-- ── 6) Görüntülenme sayacı ──────────────────────────────────────────────────
-- `listings.view_count` kolonu 20260818135000'den beri var ve ilan detay
-- kartında gösteriliyordu, ama HİÇBİR kod yolu onu artırmıyordu: her ilan
-- sonsuza kadar "0 görüntülenme" idi. İstemciden doğrudan UPDATE de
-- yapılamaz (listings_update_own politikası sadece ilan sahibine izin verir
-- ve sahibi kendi sayacını istediği gibi şişirebilirdi), bu yüzden
-- security definer bir RPC olarak ekleniyor.
create or replace function public.increment_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.listings
  set view_count = view_count + 1
  where id = p_listing_id
    -- İlan sahibinin kendi ilanını açması sayaca yazılmaz.
    and owner_id is distinct from auth.uid();
end;
$$;

comment on function public.increment_listing_view(uuid) is
  'İlan görüntülenme sayacını 1 artırır. İlan sahibinin kendi görüntülemesi sayılmaz.';

revoke all on function public.increment_listing_view(uuid) from public;
grant execute on function public.increment_listing_view(uuid) to anon, authenticated;


-- ── 7) Döngü durum değerleri ────────────────────────────────────────────────
-- 20260818130000 `loops.status` ve `loop_participants.status` için
-- `default 'active'` yazıyor; kodun tanıdığı küme ise
-- matching/locked/in_delivery/completed/cancelled ve
-- pending/confirmed/delivered/completed. adminService.getKPIs() "aktif
-- döngü" sayısını `status = 'active'` ile sorguladığı için bu KPI her zaman
-- 0 dönüyordu. Default'lar koda göre düzeltiliyor ve küme kısıta bağlanıyor.
update public.loops set status = 'matching' where status = 'active';
update public.loops set status = 'matching'
where status not in ('matching', 'locked', 'in_delivery', 'completed', 'cancelled');

alter table public.loops alter column status set default 'matching';

alter table public.loops drop constraint if exists loops_status_check;
alter table public.loops
  add constraint loops_status_check
  check (status in ('matching', 'locked', 'in_delivery', 'completed', 'cancelled'));

update public.loop_participants set status = 'pending' where status = 'active';
update public.loop_participants set status = 'pending'
where status not in ('pending', 'confirmed', 'delivered', 'completed');

alter table public.loop_participants alter column status set default 'pending';

alter table public.loop_participants drop constraint if exists loop_participants_status_check;
alter table public.loop_participants
  add constraint loop_participants_status_check
  check (status in ('pending', 'confirmed', 'delivered', 'completed'));

-- Aynı kullanıcı bir döngüye iki kez katılamaz (joinLoop() kontrol etmiyordu).
delete from public.loop_participants p
using public.loop_participants keep
where p.loop_id = keep.loop_id
  and p.user_id = keep.user_id
  and (p.joined_at, p.id) > (keep.joined_at, keep.id);

alter table public.loop_participants drop constraint if exists loop_participants_unique_member_key;
alter table public.loop_participants
  add constraint loop_participants_unique_member_key unique (loop_id, user_id);


-- ── 8) updated_at tetikleyicileri ───────────────────────────────────────────
-- `trade_offers.updated_at` yalnızca oluşturulma anında yazılıyordu.
-- hydrateOffer() reddedilen teklifin zaman damgasını buradan okuduğu için
-- zaman çizelgesinde "Teklif reddedildi" her zaman teklifin GÖNDERİLME
-- saatini gösteriyordu. Aynı sorun listings/loops/profiles'ta da vardı.
drop trigger if exists trg_trade_offers_set_updated_at on public.trade_offers;
create trigger trg_trade_offers_set_updated_at
  before update on public.trade_offers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_listings_set_updated_at on public.listings;
create trigger trg_listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_loops_set_updated_at on public.loops;
create trigger trg_loops_set_updated_at
  before update on public.loops
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_set_updated_at on public.profiles;
create trigger trg_profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ── 9) Eksik indeksler ──────────────────────────────────────────────────────
-- Servis katmanının her istekte attığı sorgular (gelen/giden teklifler,
-- bir teklifin takası, bir takasın olayları) indekssizdi.
create index if not exists trade_offers_receiver_idx on public.trade_offers (receiver_id, created_at desc);
create index if not exists trade_offers_sender_idx on public.trade_offers (sender_id, created_at desc);
create index if not exists trade_offer_items_offer_idx on public.trade_offer_items (offer_id);
create index if not exists trade_events_trade_idx on public.trade_events (trade_id, created_at);
create index if not exists reviews_reviewed_user_idx on public.reviews (reviewed_user_id, created_at desc);
create index if not exists reviews_trade_idx on public.reviews (trade_id);
create index if not exists listings_owner_idx on public.listings (owner_id, created_at desc);
create index if not exists listings_status_created_idx on public.listings (status, created_at desc);
create index if not exists favorites_user_idx on public.favorites (user_id);
create index if not exists loop_participants_loop_idx on public.loop_participants (loop_id, joined_at);


-- ── 10) Takas adımlarının sırası ────────────────────────────────────────────
-- advanceTradeStep() hedef adımı doğrudan yazıyordu; mevcut duruma hiç
-- bakmıyordu. Yani "kilitli" bir takas tek çağrıda "tamamlandı" yapılabiliyor
-- ve trg_trades_update_trust_counters üzerinden iki tarafın da
-- completed_trades sayacı, teslimat hiç gerçekleşmeden artıyordu.
create or replace function public.trade_status_rank(p_status text)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case p_status
    when 'locked' then 1
    when 'delivery_planned' then 2
    when 'in_transit' then 3
    when 'received' then 4
    when 'completed' then 5
    else 0
  end;
$$;

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

  if old.status = 'disputed' then
    raise exception 'Anlaşmazlıktaki bir takas yalnızca tamamlanabilir ya da iptal edilebilir.'
      using errcode = 'check_violation';
  end if;

  if public.trade_status_rank(new.status) <= public.trade_status_rank(old.status) then
    raise exception 'Takas adımı geriye alınamaz (% -> %).', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_transition on public.trades;
create trigger trg_enforce_trade_transition
  before update of status on public.trades
  for each row execute function public.enforce_trade_transition();


-- ── 11) Teklif kabulü tek ve atomik bir işlem ───────────────────────────────
-- acceptOffer() istemcide iki ayrı isteğe bölünmüştü: önce
-- `trade_offers.status = 'accepted'`, sonra `trades` INSERT. İkincisi
-- başarısız olursa (ağ kopması, RLS reddi) teklif "kabul edildi" görünüp
-- arkasında hiçbir takas olmuyordu; o teklif kalıcı olarak ilerletilemez
-- hâle geliyordu. İki işlem tek fonksiyona alındı; yetki kontrolü de
-- istemciden alınıp buraya taşındı.
create or replace function public.accept_trade_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_offer public.trade_offers;
  v_trade_id uuid;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id for update;

  if v_offer.id is null then
    raise exception 'Teklif bulunamadı.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is distinct from v_offer.receiver_id then
    raise exception 'Bu teklifi yalnızca teklifin gönderildiği kişi kabul edebilir.'
      using errcode = '42501';
  end if;

  -- Zaten kabul edilmişse yeniden kabul etmek yerine var olan takas döner
  -- (çift tıklama / yeniden deneme güvenli).
  select id into v_trade_id from public.trades where offer_id = p_offer_id;

  if v_trade_id is not null then
    return v_trade_id;
  end if;

  if v_offer.status <> 'accepted' then
    update public.trade_offers set status = 'accepted' where id = p_offer_id;
  end if;

  insert into public.trades (
    offer_id, sender_id, receiver_id, status,
    delivery_method, delivery_scheduled_at, delivery_location_name, delivery_notes
  )
  values (
    v_offer.id, v_offer.sender_id, v_offer.receiver_id, 'locked',
    v_offer.delivery_method, v_offer.delivery_scheduled_at,
    v_offer.delivery_location_name, v_offer.delivery_notes
  )
  returning id into v_trade_id;

  insert into public.trade_events (trade_id, actor_id, event_type, note)
  values (v_trade_id, v_offer.receiver_id, 'offer_accepted',
          'Teklif kabul edildi, ürünler kilitlendi.');

  return v_trade_id;
end;
$$;

comment on function public.accept_trade_offer(uuid) is
  'Teklifi kabul eder ve takas satırını tek işlemde açar. Yalnızca teklifin alıcısı çağırabilir; tekrar çağrılırsa var olan takası döndürür.';

revoke all on function public.accept_trade_offer(uuid) from public;
grant execute on function public.accept_trade_offer(uuid) to authenticated;


-- ── 12) Konuşmanın son mesajı ───────────────────────────────────────────────
-- messageService, konuşma listesini kurarken HER konuşma için ayrı bir
-- "son mesajı getir" ve bir de "okunmamış say" sorgusu atıyordu; 30 sohbeti
-- olan bir kullanıcıda mesajlar ekranı 61 istek demekti. Son mesaj artık
-- `conversations` satırında tutuluyor (mesaj eklendiğinde aynı tetikleyici
-- yazıyor), böylece konuşma listesi tek sorguyla embed edilebiliyor.
alter table public.conversations
  add column if not exists last_message_id uuid references public.messages(id) on delete set null;

create or replace function public.touch_conversation_on_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.conversations
  set updated_at = new.created_at,
      last_message_id = new.id
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation_on_new_message on public.messages;
create trigger trg_touch_conversation_on_new_message
  after insert on public.messages
  for each row execute function public.touch_conversation_on_new_message();

-- Bir mesaj silinirse son mesaj referansı NULL'a düşer; bir öncekine geri al.
create or replace function public.restore_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.conversations c
  set last_message_id = (
    select m.id from public.messages m
    where m.conversation_id = old.conversation_id
    order by m.created_at desc, m.id desc
    limit 1
  )
  where c.id = old.conversation_id;
  return old;
end;
$$;

drop trigger if exists trg_restore_conversation_last_message on public.messages;
create trigger trg_restore_conversation_last_message
  after delete on public.messages
  for each row execute function public.restore_conversation_last_message();

-- Mevcut konuşmalar için geriye dönük doldurma.
update public.conversations c
set last_message_id = sub.id
from (
  select distinct on (conversation_id) conversation_id, id
  from public.messages
  order by conversation_id, created_at desc, id desc
) sub
where sub.conversation_id = c.id
  and c.last_message_id is distinct from sub.id;
