-- =============================================================================
-- (bkz. swaloop-urun-sistem-tasarimi.md §6; rapor md. 33, 106)
--
--   1) Sohbet kartları için bildirim düzeltmesi. Teklif gönderildiğinde
--      sohbete otomatik bir "PS5 ↔ Kamera" kartı düşüyor (md. 33). Ama
--      `notify_on_new_message` her mesaj satırı için bildirim ürettiğinden
--      kullanıcı aynı olay için İKİ bildirim alıyordu: "Yeni takas teklifi"
--      + "Yeni mesaj: PS5 ↔ Kamera". Artık yalnızca gerçek (yazılmış)
--      mesajlar bildirim üretiyor.
--
--   2) ENGELLEME (md. 106). Şikayet altyapısı (`reports`) vardı ama
--      kullanıcı engelleme hiç yoktu. Engelleme sadece arayüzde bir filtre
--      olarak kalmamalı: engellenen kişi DB seviyesinde de mesaj
--      gönderememeli ve teklif verememeli.
-- =============================================================================


-- ── 1) Sadece gerçek mesajlar bildirim üretsin ──────────────────────────
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
  -- trade_card / counter_card / delivery_card / system_card: bunlar
  -- kullanıcının yazdığı mesajlar değil, sistemin sohbete düşürdüğü
  -- bağlam kartları. İlgili olayın kendi bildirimi zaten var.
  if new.type <> 'text' then
    return new;
  end if;

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


-- ── 2) Engelleme ────────────────────────────────────────────────────────
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocked_users is
  'Kullanıcı engelleme (rapor md. 106). Engelleyen, engellenenin ilanlarını görmez; engellenen mesaj gönderemez ve teklif veremez.';

create index if not exists blocked_users_blocker_idx on public.blocked_users (blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

-- Kimin kimi engellediği gizlidir: kullanıcı yalnızca KENDİ engel listesini
-- görebilir. (Engellendiğini karşı tarafın görmesi taciz riskini artırır.)
drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own" on public.blocked_users
  for select using (auth.uid() = blocker_id);

drop policy if exists "blocked_users_insert_own" on public.blocked_users;
create policy "blocked_users_insert_own" on public.blocked_users
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "blocked_users_delete_own" on public.blocked_users;
create policy "blocked_users_delete_own" on public.blocked_users
  for delete using (auth.uid() = blocker_id);

-- İki yönlü engel kontrolü: taraflardan biri diğerini engellemişse true.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Mesajlaşma: engelli çift arasında yeni mesaj yazılamaz. Mevcut politika
-- (20260818140000) korunuyor, üzerine engel koşulu ekleniyor.
drop policy if exists "messages_insert_own_conversation" on public.messages;
create policy "messages_insert_own_conversation" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (auth.uid() = c.participant_one_id or auth.uid() = c.participant_two_id)
        and not public.is_blocked_between(c.participant_one_id, c.participant_two_id)
    )
  );

-- Teklif: engellediğin kişi sana teklif gönderemez.
drop policy if exists "trade_offers_insert_own" on public.trade_offers;
create policy "trade_offers_insert_own" on public.trade_offers
  for insert with check (
    auth.uid() = sender_id
    and not public.is_blocked_between(sender_id, receiver_id)
  );

-- Bildirim: engelli çift arasında bildirim üretilmesin (ör. "aradığın
-- bulundu" bildirimi engellenen kişinin ilanı için gelmemeli).
--
-- DİKKAT: fonksiyona yeni bir parametre (p_actor_id) ekleniyor. Postgres'te
-- `create or replace` farklı imzalı bir fonksiyonu DEĞİŞTİRMEZ, YENİSİNİ
-- oluşturur; o yüzden eski 9 parametreli sürüm önce düşürülmeli. Aksi
-- hâlde 9 argümanlı çağrılar "function is not unique" hatası verir.
drop function if exists public.push_notification(
  uuid, text, text, text, text, uuid, uuid, uuid, uuid
);

create or replace function public.push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link_url text default null,
  p_listing_id uuid default null,
  p_offer_id uuid default null,
  p_need_id uuid default null,
  p_conversation_id uuid default null,
  p_actor_id uuid default null
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

  if p_actor_id is not null and public.is_blocked_between(p_user_id, p_actor_id) then
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

-- "Aradığın bulundu" artık ilan sahibini de aktör olarak geçiriyor, böylece
-- engellenen kullanıcıların ilanları bildirim üretmiyor.
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
      n.id,
      null,
      new.owner_id
    );
  end loop;

  return new;
end;
$$;
