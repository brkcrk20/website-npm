-- =============================================================================
-- BİR İLAN AYNI ANDA TEK TAKASTA
--
-- `accept_trade_offer()` teklifi kilitliyor (`for update`) ve aynı teklif
-- için tekrar çağrılmaya karşı korumalı. Ama teklifin ÜRÜNLERİNİN başka
-- bir takasa girip girmediğine BAKMIYOR.
--
-- Yerel PostgreSQL 16 üzerinde doğrulanan senaryo:
--
--   A ve C, ikisi de B'nin AYNI ilanını istiyor (iki ayrı teklif).
--   B önce A'nın teklifini kabul ediyor  → ilan `in_trade` oluyor.
--   B sonra C'nin teklifini de kabul ediyor → İKİNCİ takas da oluşuyor.
--   sonuç: aynı ilana bağlı canlı takas sayısı = 2
--
-- Zararı:
--   * Hangi takas önce tamamlanırsa ilan `traded` olur; diğer takasın
--     karşı tarafı artık var olmayan bir ürünü bekler ve
--     `enforce_listing_status_transition()` geri dönüşü de yasaklar.
--   * Takaslardan biri iptal edilirse `release_listings_on_trade_end()`
--     ilanı `active` yapar — oysa ilan hâlâ DİĞER takasa kilitli.
--   * B, aynı ürünü iki kişiye söz vermiş olur; ikisinden biri mutlaka
--     mağdur olur ve bu doğrudan tamamlanan takas sayısını düşürür.
--
-- Çözüm: kabul anında teklifin tüm ürünleri hâlâ `active` mi diye
-- bakılıyor ve satırlar `for update` ile kilitleniyor (iki eşzamanlı
-- kabul birbirini beklesin).
--
-- SIRA: 20260827000000'den (accept_trade_offer'ın tanımı) sonra.
-- =============================================================================


-- ── §1. Kabul anında ürünlerin hâlâ takasa açık olduğunu doğrula ────────
-- Gövde 20260827000000'deki hâliyle aynı; eklenen tek şey ürün kontrolü.

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

  -- Zaten kabul edilmişse yeniden kabul etmek yerine var olan takas döner
  -- (çift tıklama / yeniden deneme güvenli).
  select id into v_trade_id from public.trades where offer_id = p_offer_id;

  if v_trade_id is not null then
    return v_trade_id;
  end if;

  -- Teklifteki ilanları KİLİTLE: iki eşzamanlı kabul aynı ilanı
  -- görmesin, ikincisi birincisini beklesin.
  perform 1
  from public.listings l
  join public.trade_offer_items i on i.listing_id = l.id
  where i.offer_id = p_offer_id
  for update of l;

  -- Ürünlerden biri başka bir takasa girdiyse (ya da takas edildi /
  -- kaldırıldı / süresi doldu) bu teklif kabul edilemez.
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

  -- BOŞ YA DA TEK TARAFLI TEKLİF KABUL EDİLEMEZ.
  --
  -- `trade_offer_items_role_check` yalnızca değerin ('offered','requested')
  -- içinde olmasını zorluyor; kalem SAYISI hiçbir yerde doğrulanmıyordu.
  -- `createTradeOffer` önce teklifi, sonra kalemleri yazdığı için ağ
  -- koptuğunda SIFIR kalemli bir teklif kalıcı olarak kalıyor ve kabul
  -- edilebiliyordu: hiçbir ilan kilitlenmiyor, hiçbir ürün el değiştirmiyor,
  -- ama takas 'completed' olduğunda İKİ TARAFIN DA `completed_trades`
  -- sayacı artıyordu. Güven sayacını şişirmenin en ucuz yolu buydu.
  --
  -- Aynı boşluk, karşılığında hiçbir şey vermeyen "ver bana" isteklerini de
  -- mümkün kılıyordu — takas ürününün temel varsayımına aykırı.
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

  insert into public.trade_events (trade_id, actor_id, event_type, note)
  values (v_trade_id, v_offer.receiver_id, 'offer_accepted',
          'Teklif kabul edildi, ürünler kilitlendi.');

  return v_trade_id;
end;
$$;


-- ── §2 DÜŞÜNÜLDÜ, YAPILMADI ────────────────────────────────────────────
--
-- İlan takasa kapanınca ona bağlı BEKLEYEN teklifleri otomatik kapatmak
-- da denendi. İki yolu var ve ikisi de bu turda yapılmadı:
--
--   * `expired` yazmak: `enforce_trade_offer_transition()` bunu yalnızca
--     GERÇEKTEN süresi geçmiş tekliflere izin veriyor (bilinçli bir kural).
--   * `cancelled` yazmak: aynı fonksiyon bunu yalnızca teklifi GÖNDERENE
--     izin veriyor; sistem tarafından yazılabilmesi için o güvenlik
--     kontrolüne bir atlama kapısı açmak gerekirdi.
--
-- Kazanç buna değmiyor: §1 sayesinde teklif artık kabul EDİLEMİYOR ve
-- kullanıcı nedenini okuyor; teklif zaten `expires_at` (48 saat) dolunca
-- `expire_stale_trade_offers()` ile kapanıyor. Yani "sonsuza kadar
-- bekliyor" durumu kalmıyor, yalnızca kapanması gecikiyor.
--
-- İleride yapılacaksa doğru yol: `enforce_trade_offer_transition()`e
-- `swaloop.offer_lifecycle` bayrağı eklemek (aynı desen: `swaloop.trade_lock`).

-- =============================================================================
-- UYGULADIKTAN SONRA: mevcut çift kilitleri görün
--
--   select i.listing_id, l.title, count(*) as canli_takas
--   from public.trade_offer_items i
--   join public.trades t on t.offer_id = i.offer_id
--   join public.listings l on l.id = i.listing_id
--   where t.status not in ('completed', 'cancelled')
--   group by i.listing_id, l.title
--   having count(*) > 1;
--
-- Çıkan her satır, aynı ürünün iki kişiye birden söz verildiği bir
-- durumdur; hangisinin geçerli olacağına elle karar verilmeli.
-- =============================================================================
