-- =============================================================================
-- ROZET SİSTEMİ İÇİN ALT YAPI
--
-- Sorun: trust_profiles.completed_trades / cancelled_trades hiçbir yerde
-- güncellenmiyordu (client kodunda da, trigger'da da) — her zaman 0'da
-- kalıyordu. authService.mapProfile() bu alanları okuyup stats.totalTrades
-- ve trustProfile.successfulTradesCount olarak gösterdiği için, "5 takas
-- yaptım" diyen bir kullanıcı bile arayüzde hep 0 görünüyordu. Rozetler bu
-- sayaçlar üzerine kurulacağı için önce bunları gerçek hale getiriyoruz.
--
-- Ayrıca reviews tablosu vardı ama trust_profiles'a hiç yansımıyordu
-- (authService.ts içinde "averageRating: 5, reviewCount: 0" placeholder
-- olarak sabitti — bkz. oradaki yorum). Bu migration average_rating ve
-- review_count kolonlarını ekleyip gerçek veriyle dolduruyor.
--
-- Eklenen otomatik akış:
--   1) trades.status 'completed' veya 'cancelled' olunca -> ilgili iki
--      kullanıcının completed_trades/cancelled_trades sayacı artar.
--   2) reviews tablosuna yeni satır eklenince -> değerlendirilen kullanıcının
--      average_rating ve review_count'u yeniden hesaplanır.
--   3) Her iki durumda da trust_score, aşağıdaki basit formülle yeniden
--      hesaplanır: %70 değerlendirme ortalaması + %30 güvenilirlik (iptal
--      oranının tersi). Yeni kayıtlar için varsayılan hâlâ 5/5.
--   4) loop_participants.status 'completed' olunca -> completed_loops artar.
--
-- Tüm trigger fonksiyonları "old.status is distinct from new.status" ile
-- korunuyor, yani aynı satır tekrar 'completed' olarak update edilirse
-- (örn. başka bir alan değiştiği için) sayaç tekrar artmaz.
-- =============================================================================

alter table public.trust_profiles
  add column if not exists average_rating numeric(3,2) not null default 5,
  add column if not exists review_count integer not null default 0,
  add column if not exists completed_loops integer not null default 0;

-- ── trust_score'u yeniden hesapla ──────────────────────────────────────────
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

  select coalesce(completed_trades, 0), coalesce(cancelled_trades, 0)
    into v_completed, v_cancelled
    from public.trust_profiles
    where user_id = p_user_id;

  v_total := coalesce(v_completed, 0) + coalesce(v_cancelled, 0);
  v_reliability := case when v_total > 0 then 1 - (v_cancelled::numeric / v_total) else 1 end;

  v_score := round(least(5, greatest(0, (v_avg_rating * 0.7) + (v_reliability * 5 * 0.3))), 2);

  update public.trust_profiles
  set average_rating = round(v_avg_rating, 2),
      review_count = v_review_count,
      trust_score = v_score,
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- ── reviews: yeni değerlendirme -> ortalama + trust_score güncelle ────────
create or replace function public.trg_reviews_recalc_trust()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.recalc_trust_score(new.reviewed_user_id);

  insert into public.trust_events (user_id, event_type, note, review_id, trade_id)
  values (
    new.reviewed_user_id,
    'review_received',
    'Yeni değerlendirme sonrası güven puanı yeniden hesaplandı.',
    new.id,
    new.trade_id
  );

  return new;
end;
$$;

drop trigger if exists trg_reviews_recalc_trust on public.reviews;
create trigger trg_reviews_recalc_trust
  after insert on public.reviews
  for each row execute function public.trg_reviews_recalc_trust();

-- ── trades: tamamlandı/iptal oldu -> completed/cancelled sayaçları ────────
create or replace function public.trg_trades_update_trust_counters()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.trust_profiles set completed_trades = completed_trades + 1 where user_id = new.sender_id;
    update public.trust_profiles set completed_trades = completed_trades + 1 where user_id = new.receiver_id;

    insert into public.trust_events (user_id, event_type, note, trade_id)
    values
      (new.sender_id, 'trade_completed', 'Takas tamamlandı.', new.id),
      (new.receiver_id, 'trade_completed', 'Takas tamamlandı.', new.id);

    perform public.recalc_trust_score(new.sender_id);
    perform public.recalc_trust_score(new.receiver_id);
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.trust_profiles set cancelled_trades = cancelled_trades + 1 where user_id = new.sender_id;
    update public.trust_profiles set cancelled_trades = cancelled_trades + 1 where user_id = new.receiver_id;

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

drop trigger if exists trg_trades_update_trust_counters on public.trades;
create trigger trg_trades_update_trust_counters
  after update on public.trades
  for each row execute function public.trg_trades_update_trust_counters();

-- ── loop_participants: tamamlandı -> completed_loops sayaçı ───────────────
create or replace function public.trg_loop_participants_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.trust_profiles set completed_loops = completed_loops + 1 where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_loop_participants_completed on public.loop_participants;
create trigger trg_loop_participants_completed
  after update on public.loop_participants
  for each row execute function public.trg_loop_participants_completed();

-- NOT: Geçmişte tamamlanmış olup bu migration'dan ÖNCE oluşturulmuş
-- trade/loop/review kayıtları için sayaçlar otomatik geriye dönük
-- işlemez (trigger sadece bundan sonraki UPDATE/INSERT'lerde çalışır).
-- Mevcut canlı veriniz varsa, bir kerelik şu sorguları kendi ortamınızda
-- çalıştırarak sayaçları geçmişe dönük eşitleyebilirsiniz:
--
--   update public.trust_profiles tp set completed_loops = sub.cnt
--   from (select user_id, count(*) cnt from public.loop_participants
--         where status = 'completed' group by user_id) sub
--   where tp.user_id = sub.user_id;
--
--   (trades/reviews için de benzer bir "backfill" sorgusu gerekirse
--   ayrıca yazılabilir — şimdilik yeni veriler üzerinden test edilmesi
--   öneriliyor.)
