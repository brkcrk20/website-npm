-- Adds columns that the front-end (listingService.ts) already reads/writes
-- but which were missing from public.listings, causing "istenen ürün",
-- teslimat tercihleri, etiketler, görüntülenme ve favori sayılarının
-- sayfa yenilendiğinde kaybolmasına neden oluyordu.
--
-- SIRALAMA NOTU: Bu dosyanın zaman damgası, `listings`/`favorites`
-- tablolarını oluşturan 20260818130000_sync_remote_schema_structure.sql
-- dosyasından ÖNCE geliyor. Canlı veritabanında tablolar zaten var
-- olduğu için bu sorun çıkarmıyordu; ama sıfırdan kurulan bir ortamda
-- (`supabase db reset`) "relation public.listings does not exist"
-- hatasıyla patlıyordu.
--
-- Dosya adını değiştirmek, canlıda uygulanmış migration kaydını
-- kopardığı için tercih edilmedi. Bunun yerine burası tablolar henüz
-- yoksa sessizce atlanıyor; aynı kolonlar ve tetikleyici 130000
-- dosyasının sonunda (idempotent şekilde) tekrar tanımlanıyor.

do $$
begin
  if to_regclass('public.listings') is null then
    raise notice 'public.listings henüz yok — bu migration atlanıyor, kolonlar 20260818130000 içinde eklenecek.';
    return;
  end if;

  execute $sql$
    alter table public.listings
      add column if not exists looking_for text not null default '',
      add column if not exists delivery_options text[] not null default array['in_person'],
      add column if not exists tags text[] not null default '{}',
      add column if not exists view_count integer not null default 0,
      add column if not exists favorite_count integer not null default 0
  $sql$;
end
$$;

-- favorite_count'u favorites tablosuyla otomatik senkron tutan trigger.
-- Böylece uygulama tarafında manuel sayaç güncellemeye gerek kalmaz.
create or replace function public.sync_listing_favorite_count()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (tg_op = 'INSERT') then
    update public.listings
      set favorite_count = favorite_count + 1
      where id = new.listing_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.listings
      set favorite_count = greatest(favorite_count - 1, 0)
      where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;

do $$
begin
  if to_regclass('public.favorites') is null then
    return;
  end if;

  drop trigger if exists trg_sync_listing_favorite_count on public.favorites;

  create trigger trg_sync_listing_favorite_count
    after insert or delete on public.favorites
    for each row execute function public.sync_listing_favorite_count();
end
$$;
