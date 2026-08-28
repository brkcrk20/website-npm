-- =============================================================================
-- TAKAS KOLONLARININ DEĞİŞMEZLİĞİ
--
-- 20260828000000 §5, "Takas tamamlanması artık İKİ TARAFIN onayına bağlı"
-- kuralını getiriyor ve bunu `enforce_trade_transition()` içindeki şu
-- kontrole dayandırıyor:
--
--     if new.status in ('received', 'completed')
--        and (new.sender_confirmed_at is null or new.receiver_confirmed_at is null)
--     then raise exception ...
--
-- Kuralın iki ayrı deliği var:
--
--   1. Kontrol OLD değil **NEW** satırı okuyor. Yani onay damgalarını
--      status ile AYNI UPDATE içinde yazan bir istek kontrolü geçer.
--
--   2. `trg_enforce_trade_transition` `before update OF STATUS` olarak
--      bağlı. Yalnızca onay damgalarını yazan bir UPDATE tetikleyiciyi
--      HİÇ çalıştırmaz.
--
-- Üstelik RLS tarafında kolon kısıtı yok — `trades_update_parties` ve
-- `trade_offers_update_parties` tüm satıra UPDATE veriyor ve `with check`
-- yazılmadığı için `using` ifadesi check olarak da kullanılıyor:
--
--     create policy "trades_update_parties" on public.trades
--       for update using (auth.uid() = sender_id or auth.uid() = receiver_id);
--
-- Postgres'te kolon bazlı RLS yoktur; bu yüzden kolon koruması trigger ile
-- yapılmalı (aynı gerekçe `profiles.phone` için 20260828000000'de kolon
-- bazlı GRANT ile çözülmüştü).
--
-- ── SÖMÜRÜ 1: takası tek taraflı tamamlamak ─────────────────────────────
--   PATCH /rest/v1/trades?id=eq.<id>
--   {"status":"completed",
--    "sender_confirmed_at":"...","receiver_confirmed_at":"..."}
-- Karşı taraf hiçbir şey onaylamadan takas tamamlanır. Sonuçları:
--   * `release_listings_on_trade_end()` karşı tarafın ilanını `traded`
--     yapar ve `enforce_listing_status_transition()` `traded`'dan geri
--     dönüşü yasakladığı için o ilan KALICI olarak yayından kalkar,
--   * `trg_trades_update_trust_counters` İKİ tarafın `completed_trades`
--     sayacını artırır ve güven puanını yeniden hesaplar,
--   * `reviews_insert_trade_party` artık `status = 'completed'` şartını
--     sağladığı için saldırgan, hiç gerçekleşmemiş bir takas üzerinden
--     karşı tarafa değerlendirme yazabilir.
--
-- ── SÖMÜRÜ 2: teklifin alıcısını kendine çevirmek ───────────────────────
--   1) A, B'ye kurallara uygun bir teklif açar (kalemler doğrulanır).
--   2) `update trade_offers set receiver_id = A where id = <offer>;`
--      Hiçbir trigger görmez: `trg_enforce_trade_offer_transition` da
--      `before update OF STATUS`, `enforce_trade_offer_item_ownership` ise
--      yalnızca `trade_offer_items` yazımında çalışır.
--   3) A kendi teklifini `accept_trade_offer()` ile kabul eder.
-- `lock_listings_on_trade_start()` teklifin TÜM kalemlerini kilitlediği
-- için B'nin ilanı da kilitlenir ve takas tamamlandığında `traded` olur.
-- Ayrıca sender = receiver olduğu için sayaç trigger'ı tek sahte takastan
-- iki kez işler ve `confirm_trade_receipt()` içindeki if/elsif zinciri
-- ikinci çağrıda karşı tarafın onayını da yazar.
--
-- Bu migration üç kapıyı da kapatıyor:
--   §1  kendine teklif / kendine takas yasak
--   §2  trade_offers kimlik ve ömür kolonları değişmez
--   §3  trades kimlik kolonları ve onay damgaları değişmez
--       (onayı yalnızca confirm_trade_receipt() yazabilir)
--
-- Oturum bayrağı deseni depoda zaten kullanılıyor: `swaloop.trade_lock`
-- (20260828000000) ve `swaloop.listing_lifecycle` (20260829000000).
-- Buradaki bayrak `swaloop.trade_confirm`.
--
-- SIRA: bu dosya 20260827000000, 20260828000000 ve 20260829000000'den
-- SONRA uygulanmalı — üçü de henüz canlıya uygulanmadı (supabase/README.md).
-- =============================================================================


-- ── §1. Kendine teklif / kendine takas ──────────────────────────────────
-- `blocked_users_not_self` ve `reviews_not_self_check` zaten var; takasın
-- kendisinde bu kısıt hiç yoktu.
--
-- Kısıtlar bilerek NOT VALID: mevcut satırlara dokunmuyor (veri silmiyoruz),
-- ama bundan sonraki her INSERT/UPDATE için tam olarak uygulanıyor. Canlıda
-- bozuk satır olup olmadığını görmek için dosyanın sonundaki sorguya bakın.

alter table public.trade_offers drop constraint if exists trade_offers_not_self_check;
alter table public.trade_offers
  add constraint trade_offers_not_self_check check (sender_id <> receiver_id) not valid;

alter table public.trades drop constraint if exists trades_not_self_check;
alter table public.trades
  add constraint trades_not_self_check check (sender_id <> receiver_id) not valid;


-- ── §2. trade_offers: kimlik ve ömür kolonları değişmez ─────────────────
-- İstemci `trade_offers` üzerinde yalnızca `status` ve iptal alanlarını
-- yazıyor (src/services/tradeService.ts → rejectOffer / cancelTrade /
-- createCounterOffer), bu yüzden kısıt hiçbir mevcut akışı kırmaz.

create or replace function public.enforce_trade_offer_immutability()
returns trigger
language plpgsql
-- search_path sabitleniyor: depoda tüm public fonksiyonlar için geçerli
-- kural (trade_flow_test.sql §15 bunu doğruluyor).
set search_path to 'public'
as $$
begin
  if new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.parent_offer_id is distinct from old.parent_offer_id
     or new.created_at is distinct from old.created_at then
    raise exception
      'Teklifin tarafları ve kökeni sonradan değiştirilemez.'
      using errcode = '42501';
  end if;

  -- Teklif ömrü yalnızca sistem tarafından uzatılabilir; aksi hâlde
  -- 48 saatlik süre tek bir UPDATE ile sonsuza taşınabilirdi.
  if new.expires_at is distinct from old.expires_at
     and coalesce(current_setting('swaloop.offer_lifecycle', true), '') <> 'on' then
    raise exception 'Teklif süresi istemciden değiştirilemez.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_offer_immutability on public.trade_offers;
create trigger trg_enforce_trade_offer_immutability
  before update on public.trade_offers
  for each row
  execute function public.enforce_trade_offer_immutability();


-- ── §3. trades: kimlik kolonları ve onay damgaları değişmez ─────────────
-- Onay damgalarını yazmanın tek yolu `confirm_trade_receipt()` olmalı.

create or replace function public.enforce_trade_immutability()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.offer_id is distinct from old.offer_id
     or new.sender_id is distinct from old.sender_id
     or new.receiver_id is distinct from old.receiver_id
     or new.started_at is distinct from old.started_at then
    raise exception 'Takasın tarafları ve kökeni sonradan değiştirilemez.'
      using errcode = '42501';
  end if;

  if (new.sender_confirmed_at is distinct from old.sender_confirmed_at
      or new.receiver_confirmed_at is distinct from old.receiver_confirmed_at)
     and coalesce(current_setting('swaloop.trade_confirm', true), '') <> 'on' then
    raise exception
      'Teslimat onayı yalnızca confirm_trade_receipt() ile verilebilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_trade_immutability on public.trades;
create trigger trg_enforce_trade_immutability
  before update on public.trades
  for each row
  execute function public.enforce_trade_immutability();


-- ── §4. confirm_trade_receipt(): onay yazarken bayrağı aç ───────────────
-- Gövde 20260828000000'deki hâliyle aynı; tek fark, onay damgalarını yazan
-- iki UPDATE'in `swaloop.trade_confirm` bayrağıyla sarılması. Ayrıca
-- sender = receiver durumunda if/elsif zincirinin ikinci çağrıda karşı
-- onayı da yazmasına karşı açık bir kontrol eklendi (§1'deki kısıt bunu
-- zaten engelliyor, bu ikinci kapı).

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
    -- KARŞI TARAFA HABER VER.
    --
    -- Burada çıplak bir `return 'waiting'` vardı. `notify_on_trade_status()`
    -- yalnızca completed/cancelled/delivery_planned durumlarını kapsıyor,
    -- yani A "Teslim Aldım"a bastığında B'ye HİÇBİR ŞEY gitmiyordu. B,
    -- uygulamayı kendiliğinden açmadıkça kendisinden onay beklendiğini
    -- öğrenemiyordu — karşılıklı onay adımının tamamı bu tek bildirime
    -- bağlı olduğu için takas iki taraf birbirini beklerken asılı kalıyordu.
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

  -- İki taraf da onayladı: takas "teslim alındı" adımına geçer.
  if public.trade_status_rank(v_trade.status) < public.trade_status_rank('received') then
    update public.trades set status = 'received' where id = p_trade_id;

    insert into public.trade_events (trade_id, actor_id, event_type, note)
    values (p_trade_id, v_actor, 'verified', 'İki taraf da teslimatı onayladı.');
  end if;

  return 'both_confirmed';
end;
$$;


-- ── §5. expire_stale_trade_offers(): ömür bayrağı ───────────────────────
-- Fonksiyon yalnızca `status` yazıyor, `expires_at`'e dokunmuyor; yine de
-- ileride dokunması gerekirse diye bayrak burada tanımlı kalsın. Bugün
-- `swaloop.offer_lifecycle` bayrağını hiçbir yer açmıyor, yani `expires_at`
-- kolonu tamamen değişmez — DEFAULT ile yazılıp öyle kalıyor.


-- =============================================================================
-- UYGULADIKTAN SONRA: mevcut bozuk satırları görün
--
-- Kısıtlar NOT VALID olarak eklendi (veri silinmedi). Canlıda kendine
-- açılmış teklif/takas var mı:
--
--   select 'offer' as tur, id, sender_id from public.trade_offers
--   where sender_id = receiver_id
--   union all
--   select 'trade', id, sender_id from public.trades
--   where sender_id = receiver_id;
--
-- Sonuç boşsa kısıtları tam doğrulanmış hâle getirebilirsiniz:
--
--   alter table public.trade_offers validate constraint trade_offers_not_self_check;
--   alter table public.trades       validate constraint trades_not_self_check;
--
-- Ayrıca eski açığın kullanılıp kullanılmadığını görmek için: onay damgası
-- dolu ama karşılık gelen bir `trade_events` 'verified' kaydı olmayan
-- tamamlanmış takaslar şüphelidir.
--
--   select t.id, t.sender_id, t.receiver_id, t.completed_at
--   from public.trades t
--   where t.status = 'completed'
--     and not exists (
--       select 1 from public.trade_events e
--       where e.trade_id = t.id and e.event_type = 'verified'
--     );
-- =============================================================================
