-- =============================================================================
-- "ARADIĞIN BULUNDU" BİLDİRİMİ İLE EKRANDAKİ EŞLEŞME AYNI ŞEYİ SÖYLESİN
--
-- İki ayrı eşleştirme mantığı vardı ve birbirini tutmuyordu:
--
--   * DB tarafı (`notify_needs_on_new_listing`): kategori aynıysa YA DA
--     ihtiyaç başlığındaki 3+ harfli HERHANGİ bir kelime ilan başlığının
--     içinde geçiyorsa bildirim gönderiyor.
--   * İstemci tarafı (`needService.scoreNeedAgainstListing`): 40 puanlık
--     bir eşik uyguluyor.
--
-- Sonuçları:
--
-- 1. **Bildirim çöplüğü.** DB tarafı dolgu kelimelerini ELEMİYOR. "Bir
--    bisiklet arıyorum" ihtiyacındaki "bir" kelimesi, içinde "bir" geçen
--    HER ilanla eşleşiyor: "Birinci el kitap", "Bira bardağı seti",
--    "Birleşik kaplar"… Kullanıcı alakasız bildirim yağmuru alıyor.
--
-- 2. **Tıklayınca hiçbir şey yok.** Dört kelimelik bir ihtiyaçta tek
--    kelime tutarsa DB bildirim atıyor ama istemcinin skoru eşiğin altında
--    kalıyor; kullanıcı bildirime dokunup "Aradıklarım" ekranına gidiyor ve
--    o ilanı orada BULAMIYOR.
--
-- 3. **Türkçe küçültme farkı.** Postgres'in `lower()`'ı ASCII davranır;
--    istemci `toLocaleLowerCase('tr')` kullanıyordu. "BISIKLET" iki tarafta
--    farklı sonuç veriyordu.
--
-- Bu migration iki tarafı aynı kurallara getiriyor:
--   * ortak sadeleştirme (`fold_tr`): ı/İ/I→i, ş→s, ğ→g, ü→u, ö→o, ç→c
--   * ortak dolgu kelime listesi
--   * en az 4 harf (3 harf "bir"/"ile" gibi kelimeleri geçiriyordu)
--   * bildirim eşiği: kategori tutuyorsa VEYA en az iki içerik kelimesi
--     tutuyorsa VEYA ihtiyaç tek kelimelik ve o kelime tutuyorsa
--
-- Bu kural, istemcideki puanlamanın (kategori 50; kelime kapsaması/gücü;
-- eşik 40) bildirim tarafındaki karşılığıdır.
-- =============================================================================


-- ── Ortak sadeleştirme ──────────────────────────────────────────────────
-- İstemcideki `foldTurkish()` ile birebir aynı eşleme.

create or replace function public.fold_tr(p_text text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select lower(translate(coalesce(p_text, ''),
                         'ıİIşŞğĞüÜöÖçÇâîû',
                         'iiissgguuooccaiu'));
$$;


-- ── Dolgu kelimeler ─────────────────────────────────────────────────────
-- src/services/needService.ts içindeki STOP_WORDS ile aynı küme
-- (sadeleştirilmiş hâlleriyle).

create or replace function public.is_stop_word(p_word text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select p_word = any (array[
    'ile', 'veya', 'ya', 'icin', 'bir', 'bu', 'su',
    'takas', 'ariyorum', 'araniyor', 'istiyorum', 'gibi', 've', 'de', 'da'
  ]);
$$;


-- ── İhtiyaç ↔ ilan kelime örtüşmesi ─────────────────────────────────────

create or replace function public.need_word_hits(p_need_title text, p_listing_title text)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select count(*)::integer
  from regexp_split_to_table(public.fold_tr(p_need_title), '[^[:alnum:]]+') as word
  where length(word) >= 4
    and not public.is_stop_word(word)
    and public.fold_tr(p_listing_title) like '%' || word || '%';
$$;

create or replace function public.need_content_word_count(p_need_title text)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select count(*)::integer
  from regexp_split_to_table(public.fold_tr(p_need_title), '[^[:alnum:]]+') as word
  where length(word) >= 4
    and not public.is_stop_word(word);
$$;


-- ── Bildirim tetikleyicisi ──────────────────────────────────────────────

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
    select needs.id, needs.user_id, needs.title,
           public.need_word_hits(needs.title, new.title) as hits,
           public.need_content_word_count(needs.title) as content_words
    from public.needs
    where needs.status = 'active'
      and needs.user_id <> new.owner_id
      and (
        (needs.category_id is not null and needs.category_id = new.category_id)
        or public.need_word_hits(needs.title, new.title) > 0
      )
    limit 200
  loop
    -- İstemcideki eşiğin karşılığı: kategori tuttuysa yeter; tutmadıysa
    -- ya iki içerik kelimesi ya da tek kelimelik bir ihtiyacın tamamı.
    if n.hits >= 2
       or (n.content_words = 1 and n.hits = 1)
       or exists (
         select 1 from public.needs nn
         where nn.id = n.id
           and nn.category_id is not null
           and nn.category_id = new.category_id
       )
    then
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
    end if;
  end loop;

  return new;
end;
$$;

-- Yardımcı fonksiyonlar yalnızca tetikleyici içinden kullanılıyor.
revoke all on function public.need_word_hits(text, text) from public, anon, authenticated;
revoke all on function public.need_content_word_count(text) from public, anon, authenticated;
