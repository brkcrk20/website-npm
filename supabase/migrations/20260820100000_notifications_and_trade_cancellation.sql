-- =============================================================================
-- ÜRÜN/SİSTEM TASARIM RAPORU — FAZ 1 DEVAMI
-- (bkz. swaloop-urun-sistem-tasarimi.md §6 madde 2-3; rapor md. 31, 44-45)
--
-- İki iş:
--
--   1) BİLDİRİM SİSTEMİ (md. 44-45). Bildirimler bugüne kadar tamamen sahte
--      bir listeydi (`INITIAL_NOTIFICATIONS`); gerçek olaylardan hiç
--      tetiklenmiyordu. Artık `public.notifications` tablosu ve onu besleyen
--      trigger'lar var. En önemlisi md. 45'teki "ARADIĞIN BULUNDU":
--      biri, senin açık bir ihtiyacına uyan ilan yayınladığında bildirim
--      alırsın. Uygulamayı tekrar açtıran en güçlü mekanizma budur.
--
--   2) TAKAS İPTALİ + NEDEN (md. 31). Devam eden bir takas iptal
--      edilemiyordu; dolayısıyla önceki migration'da eklenen "iptal edilince
--      ilanların kilidini çöz" trigger'ını tetikleyecek hiçbir akış yoktu.
--      Ayrıca iptal/ret nedeni hiçbir yere yazılmıyordu — oysa bu bilgi
--      ileride güven sisteminin girdisi olacak.
-- =============================================================================


-- ── 1) İptal / ret nedeni ───────────────────────────────────────────────
-- Neden kümesi rapor md. 31'den birebir alındı. Kod tarafındaki karşılığı
-- src/types/index.ts → TradeCancellationReason (contract testi var).
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'trade_cancellation_reason'
  ) then
    create type public.trade_cancellation_reason as enum (
      'item_unavailable',   -- Ürün artık uygun değil
      'no_agreement',       -- Karşı tarafla anlaşamadım
      'delivery_problem',   -- Teslimat konusunda sorun oldu
      'no_response',        -- Karşı taraf yanıt vermedi
      'other'               -- Başka bir sorun
    );
  end if;
end $$;

alter table public.trade_offers
  add column if not exists cancellation_reason public.trade_cancellation_reason,
  add column if not exists cancellation_note text;

alter table public.trades
  add column if not exists cancellation_reason public.trade_cancellation_reason,
  add column if not exists cancellation_note text;

comment on column public.trade_offers.cancellation_reason is
  'Teklif reddedilirken/iptal edilirken seçilen neden (rapor md. 31). Serbest metin değil, sabit küme — güven sisteminde kullanılabilsin diye.';


-- ── 2) Bildirimler ──────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Değerler src/types/index.ts → NotificationItem['type'] ile birebir
  -- aynı olmalı (contract testi bunu doğrular).
  type text not null check (type in (
    'trade_offer',    -- yeni takas teklifi geldi
    'counter_offer',  -- karşı teklif geldi
    'trade_status',   -- teklif/takas durumu değişti
    'need_matched',   -- "aradığın bir ürün eklendi"
    'message',        -- yeni mesaj
    'review_request', -- takas bitti, değerlendirme bekleniyor
    'loop',
    'badge',
    'system'
  )),
  title text not null,
  message text not null,
  link_url text,
  listing_id uuid references public.listings(id) on delete cascade,
  offer_id uuid references public.trade_offers(id) on delete cascade,
  need_id uuid references public.needs(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where is_read = false;

-- Aynı ilan + aynı ihtiyaç için ikinci kez "aradığın bulundu" gönderilmesin.
create unique index if not exists notifications_need_match_unique_idx
  on public.notifications (user_id, listing_id, need_id)
  where type = 'need_matched';

alter table public.notifications enable row level security;

-- Bildirimler tamamen kişiseldir: sahibinden başkası okuyamaz (md. 109).
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (auth.uid() = user_id);

-- INSERT politikası bilinçli olarak YOK: bildirimleri yalnızca aşağıdaki
-- security definer trigger'lar üretir. Böylece bir kullanıcı başkasına
-- (ya da kendine) sahte bildirim yazamaz.

create or replace function public.push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link_url text default null,
  p_listing_id uuid default null,
  p_offer_id uuid default null,
  p_need_id uuid default null,
  p_conversation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (
    user_id, type, title, message, link_url,
    listing_id, offer_id, need_id, conversation_id
  )
  values (
    p_user_id, p_type, p_title, p_message, p_link_url,
    p_listing_id, p_offer_id, p_need_id, p_conversation_id
  )
  on conflict do nothing;
end;
$$;


-- ── 2a) Yeni teklif / karşı teklif ──────────────────────────────────────
create or replace function public.notify_on_new_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  sender_name text;
  is_counter boolean := new.parent_offer_id is not null;
begin
  select coalesce(full_name, 'Bir kullanıcı') into sender_name
  from public.profiles where id = new.sender_id;

  perform public.push_notification(
    new.receiver_id,
    case when is_counter then 'counter_offer' else 'trade_offer' end,
    case when is_counter then 'Karşı teklif geldi' else 'Yeni takas teklifi' end,
    sender_name || (case when is_counter
      then ' teklifine karşılık alternatif bir takas önerdi.'
      else ' sana bir takas teklifi gönderdi.' end),
    '/teklif/' || new.id,
    null,
    new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_offer on public.trade_offers;
create trigger trg_notify_on_new_offer
  after insert on public.trade_offers
  for each row execute function public.notify_on_new_offer();


-- ── 2b) Teklif durumu değişti (kabul / ret / karşı teklif / süre doldu) ─
create or replace function public.notify_on_offer_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  receiver_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(full_name, 'Karşı taraf') into receiver_name
  from public.profiles where id = new.receiver_id;

  if new.status = 'accepted' then
    perform public.push_notification(
      new.sender_id, 'trade_status', 'Teklifin kabul edildi',
      receiver_name || ' teklifini kabul etti. Ürünler takas için ayrıldı.',
      '/takas-sureci/' || new.id, null, new.id
    );
  elsif new.status = 'rejected' then
    perform public.push_notification(
      new.sender_id, 'trade_status', 'Teklifin geri çevrildi',
      receiver_name || ' bu teklifi kabul etmedi.',
      '/teklif/' || new.id, null, new.id
    );
  elsif new.status = 'expired' then
    perform public.push_notification(
      new.sender_id, 'trade_status', 'Teklifin süresi doldu',
      'Teklif 48 saat içinde yanıtlanmadığı için kapandı.',
      '/teklif/' || new.id, null, new.id
    );
  elsif new.status = 'cancelled' then
    -- İptali yapan taraf bildirim almasın diye iki tarafa da değil,
    -- yalnızca teklifi alan tarafa gidiyor (gönderen zaten iptal eden).
    perform public.push_notification(
      new.receiver_id, 'trade_status', 'Teklif geri çekildi',
      'Gönderen bu teklifi geri çekti.',
      '/teklif/' || new.id, null, new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_offer_status on public.trade_offers;
create trigger trg_notify_on_offer_status
  after update of status on public.trade_offers
  for each row execute function public.notify_on_offer_status();


-- ── 2c) Takas durumu değişti ────────────────────────────────────────────
create or replace function public.notify_on_trade_status()
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
    perform public.push_notification(
      new.sender_id, 'review_request', 'Takas tamamlandı',
      'Takas nasıl geçti? Karşı tarafı değerlendirebilirsin.',
      '/takas-tamamlandi/' || new.offer_id, null, new.offer_id
    );
    perform public.push_notification(
      new.receiver_id, 'review_request', 'Takas tamamlandı',
      'Takas nasıl geçti? Karşı tarafı değerlendirebilirsin.',
      '/takas-tamamlandi/' || new.offer_id, null, new.offer_id
    );

  elsif new.status = 'cancelled' then
    perform public.push_notification(
      new.sender_id, 'trade_status', 'Takas iptal edildi',
      'Takas iptal edildi, ilanlar yeniden takasa açıldı.',
      '/teklif/' || new.offer_id, null, new.offer_id
    );
    perform public.push_notification(
      new.receiver_id, 'trade_status', 'Takas iptal edildi',
      'Takas iptal edildi, ilanlar yeniden takasa açıldı.',
      '/teklif/' || new.offer_id, null, new.offer_id
    );

  elsif new.status = 'delivery_planned' then
    perform public.push_notification(
      new.sender_id, 'trade_status', 'Teslimat planlandı',
      'Takasın teslimat aşamasına geçti.',
      '/takas-sureci/' || new.offer_id, null, new.offer_id
    );
    perform public.push_notification(
      new.receiver_id, 'trade_status', 'Teslimat planlandı',
      'Takasın teslimat aşamasına geçti.',
      '/takas-sureci/' || new.offer_id, null, new.offer_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_on_trade_status on public.trades;
create trigger trg_notify_on_trade_status
  after update of status on public.trades
  for each row execute function public.notify_on_trade_status();


-- ── 2d) Yeni mesaj ──────────────────────────────────────────────────────
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target_id uuid;
  sender_name text;
begin
  select case when c.participant_one_id = new.sender_id
              then c.participant_two_id
              else c.participant_one_id end
  into target_id
  from public.conversations c
  where c.id = new.conversation_id;

  select coalesce(full_name, 'Bir kullanıcı') into sender_name
  from public.profiles where id = new.sender_id;

  perform public.push_notification(
    target_id, 'message', 'Yeni mesaj',
    sender_name || ': ' || left(new.content, 80),
    '/mesajlar/' || new.conversation_id,
    null, null, null, new.conversation_id
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_on_new_message on public.messages;
create trigger trg_notify_on_new_message
  after insert on public.messages
  for each row execute function public.notify_on_new_message();


-- ── 2e) "ARADIĞIN BULUNDU" (rapor md. 45) ───────────────────────────────
-- Yeni bir ilan yayınlandığında, o ilana uyan AÇIK ihtiyaçların sahiplerine
-- bildirim gider. Eşleştirme mantığı istemcideki
-- `needService.scoreNeedAgainstListing()` ile aynı iki sinyale dayanır:
-- kategori eşleşmesi VEYA ihtiyaç başlığındaki bir kelimenin ilan
-- başlığında geçmesi. (İstemci ayrıca şehir/etiket de bakar; burada
-- kasıtlı olarak daha DAR tutuldu — yanlış bildirim, eksik bildirimden
-- daha rahatsız edicidir.)
create or replace function public.notify_needs_on_new_listing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  for n in
    select needs.id, needs.user_id, needs.title
    from public.needs
    where needs.status = 'active'
      and needs.user_id <> new.owner_id
      and (
        (needs.category_id is not null and needs.category_id = new.category_id)
        or exists (
          select 1
          from regexp_split_to_table(lower(needs.title), '[^[:alnum:]]+') as word
          where length(word) >= 3
            and lower(new.title) like '%' || word || '%'
        )
      )
    limit 200
  loop
    perform public.push_notification(
      n.user_id,
      'need_matched',
      'Aradığın bir ürün eklendi',
      '"' || n.title || '" aramanla eşleşen yeni bir ilan var: ' || new.title,
      '/ilan/' || coalesce(new.slug, new.id::text),
      new.id,
      null,
      n.id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_needs_on_new_listing on public.listings;
create trigger trg_notify_needs_on_new_listing
  after insert on public.listings
  for each row execute function public.notify_needs_on_new_listing();
