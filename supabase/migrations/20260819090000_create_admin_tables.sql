-- =============================================================================
-- Admin paneli GERÇEK veriye bağlanıyor.
--
-- Önceki durum: KPI/raporlar/disputes/audit log tamamen `adminService.ts`
-- içinde modül-seviyesi değişkenlerde (in-memory) tutuluyordu. Sayfa
-- yenilendiğinde (F5) ya da sekme kapatılıp açıldığında JS modülü sıfırdan
-- yüklendiği için TÜM veri kayboluyordu — bir admin bir raporu "çözüldü"
-- işaretlese bile bu hiçbir yerde kalıcı olmuyordu.
--
-- Bu migration üç eksik tabloyu ekliyor (reports, disputes, admin_audit_logs)
-- ve profiles tablosuna basit bir is_admin bayrağı ekliyor ki admin
-- yazma işlemleri (rapor/dispute çözme, ilan kaldırma) sadece gerçekten
-- admin olan kullanıcılara RLS seviyesinde kısıtlanabilsin.
--
-- ÖNEMLİ GÜVENLİK NOTU: rapor.txt'de de belirtildiği gibi /admin route'una
-- şu an giriş kontrolü olmadan (auth guard yok) doğrudan URL ile
-- gidilebiliyor. Bu migration veritabanı seviyesinde admin-only yazmayı
-- KORUMAYA ALIYOR (RLS ile), ama uygulama tarafında da is_admin=false olan
-- kullanıcıları /admin'den yönlendiren bir route guard eklenmesi önerilir
-- (bu değişiklikte AdminDashboardPage'e temel bir guard eklendi, ama
-- kapsamlı bir rol/izin sistemi bu migration'ın kapsamı dışında).
-- =============================================================================

-- ── profiles.is_admin ───────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Kendi is_admin durumunu YÜKSELTEMESİN diye profiles_update_own politikası
-- burada daraltılıyor: kullanıcı kendi satırını güncelleyebilir ama
-- is_admin sütununu WITH CHECK ile sabitliyoruz (eski değerle aynı olmalı).
-- Not: Postgres RLS kolon bazlı check desteklemediği için bunu bir
-- trigger ile yapıyoruz (satırın diğer alanlarını etkilemeden).
create or replace function public.prevent_self_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.is_admin is distinct from old.is_admin and auth.uid() = old.id then
    -- Kullanıcı kendi is_admin bayrağını (ne yöne olursa olsun) client
    -- tarafından değiştiremez; sadece service_role (server/CLI) değiştirebilir.
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_admin_escalation on public.profiles;
create trigger trg_prevent_self_admin_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_admin_escalation();

-- is_admin() helper: RLS politikalarında tekrar tekrar alt sorgu yazmamak
-- ve olası recursive-RLS sorunlarını önlemek için SECURITY DEFINER fonksiyon.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ── reports ─────────────────────────────────────────────────────────────
-- Kullanıcıların bir ilanı/kullanıcıyı/takası/mesajı şikayet ettiği kayıtlar.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('user', 'listing', 'trade', 'message')),
  target_id uuid not null,
  target_title text,
  reason text not null check (reason in ('fraud', 'inappropriate', 'no_response', 'broken_item', 'fake_account', 'other')),
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'pending' check (status in ('pending', 'investigating', 'resolved', 'dismissed')),
  evidence_images text[] not null default '{}',
  resolution_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

drop policy if exists "reports_select_own_or_admin" on public.reports;
create policy "reports_select_own_or_admin" on public.reports
  for select using (auth.uid() = reporter_id or public.is_admin());

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = reporter_id);

-- Sadece admin: durum/çözüm notu güncelleyebilir.
drop policy if exists "reports_update_admin_only" on public.reports;
create policy "reports_update_admin_only" on public.reports
  for update using (public.is_admin()) with check (public.is_admin());

-- ── disputes ────────────────────────────────────────────────────────────
-- Bir takas sırasında taraflardan biri anlaşmazlık açtığında oluşan kayıt.
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id),
  initiator_id uuid not null references public.profiles(id),
  respondent_id uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved_return', 'resolved_cancel', 'dismissed')),
  evidence_photos text[] not null default '{}',
  admin_decision text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.disputes enable row level security;

drop policy if exists "disputes_select_parties_or_admin" on public.disputes;
create policy "disputes_select_parties_or_admin" on public.disputes
  for select using (
    auth.uid() = initiator_id or auth.uid() = respondent_id or public.is_admin()
  );

-- Sadece ilgili takasın gerçek tarafı (initiator) dispute açabilir.
drop policy if exists "disputes_insert_trade_party" on public.disputes;
create policy "disputes_insert_trade_party" on public.disputes
  for insert with check (
    auth.uid() = initiator_id
    and exists (
      select 1 from public.trades t
      where t.id = disputes.trade_id
        and (auth.uid() = t.sender_id or auth.uid() = t.receiver_id)
    )
  );

-- Sadece admin karar/çözüm durumunu güncelleyebilir.
drop policy if exists "disputes_update_admin_only" on public.disputes;
create policy "disputes_update_admin_only" on public.disputes
  for update using (public.is_admin()) with check (public.is_admin());

-- ── admin_audit_logs ────────────────────────────────────────────────────
-- Her admin işleminin (rapor çözme, dispute çözme, ilan kaldırma vb.)
-- kalıcı izi. NOT: IP adresi tarayıcı JS'inden güvenilir şekilde
-- alınamaz (önceki kodda '194.27.12.8' sabit/sahte değeriydi) — bu yüzden
-- burada ip_address kolonu bilerek YOK. Gerçek IP loglamak isterseniz bunu
-- bir sunucu tarafı (Edge Function) üzerinden request header'ından almanız
-- gerekir.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  admin_name text not null,
  action text not null,
  target text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_audit_logs_select_admin_only" on public.admin_audit_logs;
create policy "admin_audit_logs_select_admin_only" on public.admin_audit_logs
  for select using (public.is_admin());

drop policy if exists "admin_audit_logs_insert_admin_only" on public.admin_audit_logs;
create policy "admin_audit_logs_insert_admin_only" on public.admin_audit_logs
  for insert with check (public.is_admin() and auth.uid() = admin_id);

create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_disputes_status on public.disputes(status);
create index if not exists idx_disputes_trade_id on public.disputes(trade_id);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);

-- =============================================================================
-- Kendinizi admin yapmak için (Supabase Studio → SQL Editor'de, service_role
-- ile) tek seferlik şunu çalıştırın:
--   update public.profiles set is_admin = true where id = '<kendi-user-id>';
-- =============================================================================
