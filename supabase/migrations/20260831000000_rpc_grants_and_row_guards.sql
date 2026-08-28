-- =============================================================================
-- RPC YETKİLERİ VE SATIR KORUMALARI
--
-- Dört ayrı boşluk. Ortak nokta: RLS satır bazlıdır, kolon bazlı değildir —
-- ve `security definer` bir fonksiyon, aksi söylenmedikçe HERKESE açıktır
-- (Postgres varsayılanı: `execute` yetkisi PUBLIC'e verilir).
-- =============================================================================


-- ── §1. push_notification(): sahte bildirim / oltalama ──────────────────
--
-- Tasarım kararı şuydu (swaloop-urun-sistem-tasarimi.md §4.5):
--
--   "Bildirim üretiminin istemcide değil DB'de olması bilinçli: …
--    `notifications` tablosunda kullanıcıya INSERT politikası yok — yani
--    kimse başkasına sahte bildirim yazamaz."
--
-- Tablo tarafı doğru: `notifications` üzerinde SELECT/UPDATE/DELETE
-- politikaları var, INSERT yok. Ama `push_notification()` `security
-- definer` ve yetkisi hiç kısıtlanmamış:
--
--   select proname, proacl from pg_proc where proname = 'push_notification';
--   -- proacl = NULL  →  execute PUBLIC'te
--
-- Yani `anon` DAHİ şunu çağırabiliyordu:
--
--   POST /rest/v1/rpc/push_notification
--   {"p_user_id":"<kurban>", "p_type":"trade_status",
--    "p_title":"Takasın tamamlandı",
--    "p_message":"Puanını girmek için tıkla",
--    "p_link_url":"https://kotu-site.example/giris"}
--
-- Bildirim, uygulamanın kendi bildirim listesinde gerçek bir bildirim gibi
-- görünüyor. Belgelenen güvence tam olarak buydu ve tutmuyordu.
--
-- Fonksiyonu yalnızca trigger'lar çağırıyor; onlar da `security definer`
-- olduğu için sahibinin (postgres) yetkisiyle çalışıyor ve bu iptalden
-- etkilenmiyorlar.

revoke all on function public.push_notification(
  uuid, text, text, text, text, uuid, uuid, uuid, uuid, uuid
) from public, anon, authenticated;

-- `recalc_trust_score()` de aynı durumda: istemciden çağrılması gereken bir
-- şey değil, `reviews`/`trades` trigger'ları çağırıyor.
revoke all on function public.recalc_trust_score(uuid) from public, anon, authenticated;

-- `expire_stale_trade_offers()` zamanlanmış iş (pg_cron) tarafından
-- çağrılır. `expire_stale_listings()` zaten yalnızca postgres'e açıktı;
-- ikisi aynı olsun.
revoke all on function public.expire_stale_trade_offers() from public, anon, authenticated;

-- NOT: `is_admin()` ve `is_blocked_between()` BİLEREK açık bırakılıyor —
-- ikisi de RLS politikalarının içinden çağrılıyor ve politika ifadeleri
-- sorguyu atan rolün yetkisiyle çalışır. Yetkileri alınırsa politikalar
-- çalışmaz.


-- ── §2. conversations: karşı taraf değiştirilemez ───────────────────────
--
-- `conversations_update_participants` kolon ayrımı yapmıyor ve `with check`
-- yazılmadığı için `using` ifadesi check olarak da kullanılıyor:
--
--   create policy "conversations_update_participants" on public.conversations
--     for update using (auth.uid() = participant_one_id
--                    or auth.uid() = participant_two_id);
--
-- Yani sohbetteki bir kullanıcı `participant_two_id`'yi ÜÇÜNCÜ BİR KİŞİYE
-- çevirebiliyor. `messages_select_own_conversation` sohbetin katılımcısına
-- baktığı için o kişi, o ana kadarki tüm özel yazışmayı okuyabiliyor —
-- karşı tarafın haberi olmadan.
--
-- `active_trade_offer_id` ve `updated_at` meşru olarak güncelleniyor
-- (messageService.attachTradeToConversation, touch trigger'ı); onlar açık.

create or replace function public.enforce_conversation_immutability()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.participant_one_id is distinct from old.participant_one_id
     or new.participant_two_id is distinct from old.participant_two_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Sohbetin tarafları sonradan değiştirilemez.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_conversation_immutability on public.conversations;
create trigger trg_enforce_conversation_immutability
  before update on public.conversations
  for each row
  execute function public.enforce_conversation_immutability();


-- ── §3. trade_offer_items: kabul edilmiş teklifin kalemleri kilitlenir ──
--
-- `trade_offer_items_insert_own_offer` / `..._delete_own_offer` yalnızca
-- "teklifi gönderen benim" diye bakıyor, teklifin DURUMUNA bakmıyor. Teklif
-- kabul edildikten sonra bile gönderen kalem ekleyip silebiliyor.
--
-- Zararı somut: `lock_listings_on_trade_start()` kabul anında kalemlerdeki
-- ilanları `in_trade` yapıyor; `release_listings_on_trade_end()` ise takas
-- bitince yine KALEMLER üzerinden gidip kilidi çözüyor. Kalem silinirse
-- ilan o listede olmadığı için kilidi hiç çözülmüyor: karşı tarafın ilanı
-- sonsuza kadar `in_trade` kalıyor ve
-- `enforce_listing_status_transition()` sahibinin elle geri almasını da
-- engelliyor.

create or replace function public.enforce_offer_items_locked_after_accept()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_status text;
  v_offer_id uuid := coalesce(new.offer_id, old.offer_id);
begin
  select status into v_status from public.trade_offers where id = v_offer_id;

  -- Teklif hâlâ yanıt bekliyorsa (ya da kaydı yoksa) kalemler serbest.
  if v_status is null or v_status = 'pending' then
    return coalesce(new, old);
  end if;

  raise exception
    'Yanıtlanmış bir teklifin ürünleri değiştirilemez (teklif durumu: %).', v_status
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_offer_items_locked on public.trade_offer_items;
create trigger trg_enforce_offer_items_locked
  before insert or delete or update on public.trade_offer_items
  for each row
  execute function public.enforce_offer_items_locked_after_accept();


-- ── §4. reports / disputes: yönetici alanları istemciden yazılamaz ──────
--
-- `reports_insert_own` yalnızca `auth.uid() = reporter_id` diyor; satırın
-- geri kalanı serbest. Yani şikayeti açan kişi aynı INSERT içinde
-- `status = 'resolved'`, `resolution_note = 'İncelendi, haksız bulundu'`,
-- `resolved_by = <bir yöneticinin id'si>` yazabiliyor. Aynısı `disputes`
-- için `admin_decision` ile geçerli. Yönetim panelindeki liste bu alanları
-- olduğu gibi gösteriyor — yani uydurma bir "yönetici kararı" gerçek gibi
-- görünüyor.
--
-- Yönetici olmayan bir kullanıcının INSERT'inde bu alanlar sessizce
-- varsayılana çekiliyor (reddetmek yerine sıfırlamak: şikayet kaydı
-- kaybolmasın, sadece uydurma karar taşımasın).

create or replace function public.strip_admin_fields_on_report()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.status := 'pending';
  new.priority := 'normal';
  new.resolution_note := null;
  new.resolved_by := null;
  new.resolved_at := null;

  return new;
end;
$$;

drop trigger if exists trg_strip_admin_fields_on_report on public.reports;
create trigger trg_strip_admin_fields_on_report
  before insert on public.reports
  for each row
  execute function public.strip_admin_fields_on_report();

create or replace function public.strip_admin_fields_on_dispute()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.status := 'open';
  new.admin_decision := null;
  new.resolved_by := null;
  new.resolved_at := null;

  return new;
end;
$$;

drop trigger if exists trg_strip_admin_fields_on_dispute on public.disputes;
create trigger trg_strip_admin_fields_on_dispute
  before insert on public.disputes
  for each row
  execute function public.strip_admin_fields_on_dispute();


-- =============================================================================
-- UYGULADIKTAN SONRA
--
-- Eski açığın kullanılıp kullanılmadığını görmek için: yönetici olmayan
-- biri tarafından "çözülmüş" gelen şikayetler şüphelidir.
--
--   select r.id, r.reporter_id, r.status, r.resolved_by, r.created_at
--   from public.reports r
--   where r.status <> 'pending' and r.resolved_by is null;
--
-- Kilidi çözülmemiş ilanlar (kalem silinmiş olabilir):
--
--   select l.id, l.title, l.owner_id
--   from public.listings l
--   where l.status = 'in_trade'
--     and not exists (
--       select 1 from public.trade_offer_items i
--       join public.trades t on t.offer_id = i.offer_id
--       where i.listing_id = l.id and t.status not in ('completed','cancelled')
--     );
-- =============================================================================
