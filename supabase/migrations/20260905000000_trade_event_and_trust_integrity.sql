-- =============================================================================
-- TAKASIN GEÇMİŞİ UYDURULABİLİYOR, GÜVEN SAYAÇLARI KAYNAKTAN GELMİYOR
--
-- İki ayrı sorun, aynı kök: kanıt olarak kullanılan veri, kanıtlanacak
-- şeyin kendisinden türetilmiyor.
--
-- ── 1. Takas zaman çizelgesi taraflarca yazılabiliyor ───────────────────
--
-- `trade_events_insert_parties` politikası (20260819060000) yalnızca
-- "satırı ekleyen, takasın taraflarından biri mi?" diye soruyor.
-- `event_type` ve `note` üzerinde HİÇBİR kısıt yok ve `actor_id is null`
-- açıkça serbest bırakılmış. Yani takasın herhangi bir tarafı şunu
-- yazabiliyor:
--
--   insert into trade_events (trade_id, actor_id, event_type, note)
--   values ('<takas>', null, 'verified', 'İki taraf da teslimatı onayladı.');
--
-- `actor_id` boş olduğu için satır SİSTEM olayı gibi görünüyor. Bu önemli,
-- çünkü:
--
--   * `AdminDashboardPage`'in "son aktivite" akışı doğrudan bu tablodan
--     besleniyor — anlaşmazlık incelemesinde yöneticinin baktığı kanıt,
--     saldırganın yazdığı satır oluyor.
--   * `tradeService.hydrateOffers` olayları okuyup takasın zaman
--     çizelgesini kuruyor (`delivery_planned`, `verified`, `completed`),
--     yani karşı taraf ekranda olmamış bir onayı görüyor.
--   * Tabloda UPDATE/DELETE politikası yok: satır bir kez yazıldığında
--     kimse silemiyor.
--
-- ── 2. Güven sayaçları kör `+1` ile artıyor ─────────────────────────────
--
-- `trg_trades_update_trust_counters` (20260819120000) `completed_trades`
-- ve `cancelled_trades`'i doğrudan artırıyor; `recalc_trust_score` ise bu
-- sayaçları KAYNAĞINDAN doğrulamadan okuyup güven puanını hesaplıyor.
-- Sayaç bir kez bozulduğunda (çift tetikleme, elle müdahale, taşınan veri)
-- düzelten hiçbir yol yok ve hata güven puanına kalıcı olarak geçiyor.
--
-- Doğrusu: sayaç `trades` tablosundan TÜRETİLİR. Böylece her yeniden
-- hesaplama aynı zamanda bir onarımdır.
--
-- SIRA: 20260830000000 ve 20260902000000'den SONRA (ikisi de
-- `trade_events`'e yazan fonksiyonları tanımlıyor).
-- =============================================================================


-- ── §1. Olay türü kapalı küme ───────────────────────────────────────────
-- Kullanılan türler: sunucu `offer_accepted` (accept_trade_offer) ve
-- `verified` (confirm_trade_receipt); istemci `delivery_planned`,
-- `completed`, `cancelled` (tradeService). `disputed` anlaşmazlık için.
--
-- NOT VALID: mevcut satırlara dokunmuyor, bundan sonraki her INSERT için
-- uygulanıyor.

alter table public.trade_events drop constraint if exists trade_events_event_type_check;
alter table public.trade_events
  add constraint trade_events_event_type_check
  check (event_type in (
    'offer_accepted',
    'delivery_planned',
    'in_transit',
    'verified',
    'completed',
    'cancelled',
    'disputed'
  )) not valid;


-- ── §2. Olayın kaynağı: kim yazdı, ne yazabilir ─────────────────────────

create or replace function public.enforce_trade_event_source()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Sistem fonksiyonları bayrağı açıyor (aşağıda §3).
  if coalesce(current_setting('swaloop.trade_event', true), '') = 'on' then
    return new;
  end if;

  -- İstemciden gelen her olay, onu yazan kişiye bağlanır. `actor_id`'nin
  -- boş bırakılabilmesi, satırın SİSTEM olayı gibi görünmesini sağlıyordu.
  new.actor_id := auth.uid();

  -- Bu iki tür yalnızca sunucu tarafından üretilir:
  --   offer_accepted → accept_trade_offer()
  --   verified       → confirm_trade_receipt() (iki taraflı onay sonrası)
  -- Elle yazılabilmeleri, olmamış bir kabulü/onayı kanıt hâline getiriyordu.
  if new.event_type in ('offer_accepted', 'verified') then
    raise exception
      '"%" olayı yalnızca sistem tarafından yazılabilir.', new.event_type
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_event_source on public.trade_events;
create trigger trg_enforce_trade_event_source
  before insert on public.trade_events
  for each row execute function public.enforce_trade_event_source();


-- ── §3. Sistem INSERT'lerini bayrakla sar ───────────────────────────────
-- Bu fonksiyonlar SECURITY DEFINER olsa da `auth.uid()` ÇAĞIRANINKİDİR;
-- bayrak olmadan yukarıdaki kendi kontrollerine takılırlardı.
-- Gövdeler 20260902000000 ve 20260830000000'deki hâlleriyle aynı; eklenen
-- tek şey bayrak.

create or replace function public.accept_trade_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_offer public.trade_offers;
  v_trade_id uuid;
  v_busy_title text;
begin
  select * into v_offer from public.trade_offers where id = p_offer_id for update;

  if v_offer.id is null then
    raise exception 'Teklif bulunamadı.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is distinct from v_offer.receiver_id then
    raise exception 'Bu teklifi yalnızca teklifin gönderildiği kişi kabul edebilir.'
      using errcode = '42501';
  end if;

  select id into v_trade_id from public.trades where offer_id = p_offer_id;

  if v_trade_id is not null then
    return v_trade_id;
  end if;

  perform 1
  from public.listings l
  join public.trade_offer_items i on i.listing_id = l.id
  where i.offer_id = p_offer_id
  for update of l;

  select l.title into v_busy_title
  from public.listings l
  join public.trade_offer_items i on i.listing_id = l.id
  where i.offer_id = p_offer_id
    and l.status <> 'active'
  limit 1;

  if v_busy_title is not null then
    raise exception
      'Bu tekliften "%" artık takasa açık değil; teklif kabul edilemez.', v_busy_title
      using errcode = 'check_violation';
  end if;

  if not exists (
       select 1 from public.trade_offer_items
       where offer_id = p_offer_id and role = 'offered'
     )
     or not exists (
       select 1 from public.trade_offer_items
       where offer_id = p_offer_id and role = 'requested'
     )
  then
    raise exception 'Teklif eksik: en az bir verilen ve bir istenen ürün olmalı.'
      using errcode = 'check_violation';
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

  perform set_config('swaloop.trade_event', 'on', true);

  insert into public.trade_events (trade_id, actor_id, event_type, note)
  values (v_trade_id, v_offer.receiver_id, 'offer_accepted',
          'Teklif kabul edildi, ürünler kilitlendi.');

  perform set_config('swaloop.trade_event', 'off', true);

  return v_trade_id;
end;
$$;


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

  if v_trade.sender_id = v_trade.receiver_id then
    raise exception 'Bir kullanıcı kendisiyle takas yapamaz.' using errcode = 'check_violation';
  end if;

  if v_trade.status in ('completed', 'cancelled', 'disputed') then
    raise exception 'Sonuçlanmış bir takas için onay verilemez (%).', v_trade.status
      using errcode = 'check_violation';
  end if;

  perform set_config('swaloop.trade_confirm', 'on', true);

  if v_actor = v_trade.sender_id and v_trade.sender_confirmed_at is null then
    update public.trades set sender_confirmed_at = now() where id = p_trade_id;
    v_trade.sender_confirmed_at := now();
  elsif v_actor = v_trade.receiver_id and v_trade.receiver_confirmed_at is null then
    update public.trades set receiver_confirmed_at = now() where id = p_trade_id;
    v_trade.receiver_confirmed_at := now();
  end if;

  perform set_config('swaloop.trade_confirm', 'off', true);

  if v_trade.sender_confirmed_at is null or v_trade.receiver_confirmed_at is null then
    perform public.push_notification(
      case when v_actor = v_trade.sender_id then v_trade.receiver_id else v_trade.sender_id end,
      'trade_status',
      'Karşı taraf teslimatı onayladı',
      'Sen de onayladığında takas tamamlanacak.',
      '/takas-sureci/' || v_trade.offer_id,
      null,
      v_trade.offer_id
    );

    return 'waiting';
  end if;

  if public.trade_status_rank(v_trade.status) < public.trade_status_rank('received') then
    update public.trades set status = 'received' where id = p_trade_id;

    perform set_config('swaloop.trade_event', 'on', true);

    insert into public.trade_events (trade_id, actor_id, event_type, note)
    values (p_trade_id, v_actor, 'verified', 'İki taraf da teslimatı onayladı.');

    perform set_config('swaloop.trade_event', 'off', true);
  end if;

  return 'both_confirmed';
end;
$$;


-- ── §4. Güven sayaçları kaynaktan türetiliyor ───────────────────────────
-- `recalc_trust_score` artık `trust_profiles`'ın kendi sayaçlarını değil,
-- `trades` tablosunu okuyor. Böylece her çağrı aynı zamanda bir onarım:
-- sayaç bir kez bozulsa bile bir sonraki takas/değerlendirmede düzeliyor.

create or replace function public.recalc_trust_score(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avg_rating numeric;
  v_review_count integer;
  v_completed integer;
  v_cancelled integer;
  v_total integer;
  v_reliability numeric;
  v_score numeric;
begin
  select coalesce(avg(rating), 5), count(*)
    into v_avg_rating, v_review_count
    from public.reviews
    where reviewed_user_id = p_user_id;

  -- KAYNAK: trades. Eskiden burada `trust_profiles`'ın kendi sayaçları
  -- okunuyordu — yani hesap, doğrulamadığı bir sayıya güveniyordu.
  select count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'cancelled')
    into v_completed, v_cancelled
    from public.trades
    where sender_id = p_user_id or receiver_id = p_user_id;

  v_total := coalesce(v_completed, 0) + coalesce(v_cancelled, 0);
  v_reliability := case when v_total > 0 then 1 - (v_cancelled::numeric / v_total) else 1 end;

  v_score := round(least(5, greatest(0, (v_avg_rating * 0.7) + (v_reliability * 5 * 0.3))), 2);

  -- Satır yoksa oluşturulur: eskiden `update ... where user_id = ...`
  -- sessizce hiçbir şey yapmıyordu ve kullanıcının güven profili hiç
  -- oluşmuyordu.
  insert into public.trust_profiles (user_id, average_rating, review_count,
                                     completed_trades, cancelled_trades,
                                     trust_score, updated_at)
  values (p_user_id, round(v_avg_rating, 2), v_review_count,
          coalesce(v_completed, 0), coalesce(v_cancelled, 0), v_score, now())
  on conflict (user_id) do update
    set average_rating   = excluded.average_rating,
        review_count     = excluded.review_count,
        completed_trades = excluded.completed_trades,
        cancelled_trades = excluded.cancelled_trades,
        trust_score      = excluded.trust_score,
        updated_at       = now();
end;
$$;


-- Kör `+1` artırmaları kaldırıldı; sayacı artık recalc türetiyor.
-- `trust_events` kaydı korunuyor: kullanıcının güven geçmişi orada.

create or replace function public.trg_trades_update_trust_counters()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.trust_events (user_id, event_type, note, trade_id)
    values
      (new.sender_id, 'trade_completed', 'Takas tamamlandı.', new.id),
      (new.receiver_id, 'trade_completed', 'Takas tamamlandı.', new.id);

    perform public.recalc_trust_score(new.sender_id);
    perform public.recalc_trust_score(new.receiver_id);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.trust_events (user_id, event_type, note, trade_id)
    values
      (new.sender_id, 'trade_cancelled', 'Takas iptal edildi.', new.id),
      (new.receiver_id, 'trade_cancelled', 'Takas iptal edildi.', new.id);

    perform public.recalc_trust_score(new.sender_id);
    perform public.recalc_trust_score(new.receiver_id);
  end if;

  return new;
end;
$$;


-- ── §5. Tek seferlik onarım ─────────────────────────────────────────────
-- Bugüne kadar kör `+1` ile birikmiş her sayaç kaynaktan yeniden
-- hesaplanıyor. Profili olup güven profili olmayan kullanıcılar da
-- tamamlanıyor.

do $$
declare
  v_user uuid;
begin
  for v_user in select id from public.profiles loop
    perform public.recalc_trust_score(v_user);
  end loop;
end;
$$;


-- =============================================================================
-- UYGULADIKTAN SONRA: uydurulmuş sistem olayı var mı?
--
--   select te.id, te.trade_id, te.event_type, te.created_at
--   from public.trade_events te
--   where te.actor_id is null
--     and te.event_type in ('offer_accepted', 'verified')
--   order by te.created_at desc;
--
-- Bu satırlar ya gerçekten eski sistem yazımlarıdır ya da uydurmadır;
-- ayırt etmek için takasın `sender_confirmed_at`/`receiver_confirmed_at`
-- damgalarına bakın — `verified` olayı varken damgalardan biri boşsa o
-- satır uydurmadır.
-- =============================================================================
