-- İlanlar için SEO-dostu, Türkçe karakter duyarlı slug alanı ekler.
-- Amaç: /ilan/:id (uuid) yerine /ilan/deneme-ilanlari-2 gibi okunabilir
-- linkler üretmek. Slug, ilan oluşturulurken DB tetikleyicisi (trigger)
-- tarafından başlıktan otomatik türetilir; aynı başlıkla ikinci bir ilan
-- açılırsa sonuna -2, -3... eklenerek benzersizlik garanti edilir.

-- 1) Kolonu ekle (önce nullable, sondaki backfill'den sonra NOT NULL yapılacak)
alter table public.listings
  add column if not exists slug text;

-- 2) Türkçe karakterleri Latin karşılıklarına çeviren, sonra slug'layan
--    yardımcı fonksiyon (frontend'deki src/utils/slugify.ts ile birebir
--    aynı mantık).
create or replace function public.slugify_tr(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text;
begin
  if input is null then
    return '';
  end if;

  -- İ, I, ı -> i | Ş, ş -> s | Ğ, ğ -> g | Ü, ü -> u | Ö, ö -> o | Ç, ç -> c
  result := translate(input, 'İIıŞşĞğÜüÖöÇç', 'iiissgguuoocc');
  result := lower(result);
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  result := regexp_replace(result, '(^-+)|(-+$)', '', 'g');

  return result;
end;
$$;

-- 3) INSERT tetikleyicisi: slug elle verilmediyse başlıktan üretir ve
--    çakışma varsa -2, -3... ekleyerek benzersiz hale getirir.
--    NOT: Sadece INSERT'te çalışır — başlık sonradan değiştirilse bile
--    mevcut linkler kırılmasın diye slug bir daha otomatik değişmez.
create or replace function public.set_listing_slug()
returns trigger
language plpgsql
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

drop trigger if exists trg_set_listing_slug on public.listings;

create trigger trg_set_listing_slug
before insert on public.listings
for each row
execute function public.set_listing_slug();

-- 4) Mevcut ilanlar için geriye dönük slug üretimi (hepsi "deneme ilanı"
--    olduğu için created_at sırasına göre -2, -3... ile ayrıştırılır).
do $$
declare
  r record;
  base_slug text;
  candidate text;
  counter int;
begin
  for r in
    select id, title
    from public.listings
    where slug is null or length(trim(slug)) = 0
    order by created_at asc
  loop
    base_slug := public.slugify_tr(coalesce(r.title, 'ilan'));

    if base_slug = '' then
      base_slug := 'ilan';
    end if;

    candidate := base_slug;
    counter := 1;

    while exists (
      select 1 from public.listings
      where slug = candidate and id <> r.id
    ) loop
      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    end loop;

    update public.listings set slug = candidate where id = r.id;
  end loop;
end $$;

-- 5) Artık her satırda slug garanti olduğu için NOT NULL + UNIQUE yap.
alter table public.listings
  alter column slug set not null;

alter table public.listings
  drop constraint if exists listings_slug_key;

alter table public.listings
  add constraint listings_slug_key unique (slug);

create index if not exists listings_slug_idx on public.listings (slug);
