-- =============================================================================
-- Güvenlik sertleştirmesi: telefon numarası gizliliği + mesaj bütünlüğü
--
-- 1. phone_exists(): kayıt akışındaki "bu numara kayıtlı mı" kontrolü
--    istemciden `profiles` tablosuna atılan bir SELECT ile yapılıyordu.
--    `profiles_select_all` politikası `using (true)` olduğu için, anon
--    anahtarına sahip herkes bu uç noktayı numara numara deneyerek hangi
--    telefonların kayıtlı olduğunu çıkarabiliyordu. Kontrol, yalnızca
--    boolean döndüren bir RPC'ye taşınıyor.
--
-- 2. messages UPDATE: politika, konuşmanın her iki tarafına da satırın
--    TAMAMINI güncelleme izni veriyordu. Yani karşı taraf, gönderilmiş bir
--    mesajın metnini sonradan değiştirebiliyordu. Politikanın yorumu
--    "uygulama tarafı sadece is_read günceller" diyor — ama bu bir niyet
--    beyanı, kısıt değil. Trigger ile gerçek kısıta çevriliyor.
--
-- BİLİNEN KALAN BOŞLUK: `profiles.phone` ve `profiles.email` kolonları, RLS
-- satır bazlı olduğu için giriş yapmış kullanıcılara hâlâ açık. Uygulama
-- tarafındaki tüm join'ler bu turda açık kolon listesine çevrildi (telefon
-- artık normal kullanımda istemciye inmiyor), ancak anon anahtarla doğrudan
-- REST çağrısı yapan bir saldırgan tabloyu `select=*` ile okuyabilir. Tam
-- çözüm için yalnızca güvenli kolonları gösteren bir `profiles_public`
-- view'ı açılıp embedded join'lerin oraya taşınması, kendi telefonunun ise
-- auth oturumundan (auth.users.phone) okunması gerekiyor.
-- =============================================================================


-- ── 1. phone_exists() ───────────────────────────────────────────────────────

create or replace function public.phone_exists(check_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where phone = check_phone
  );
$$;

comment on function public.phone_exists(text) is
  'Kayıt/giriş akışı için: verilen telefon numarasının kayıtlı olup olmadığını '
  'döndürür. Numara listesini dışarı vermemek için tablo okuması yerine bu '
  'fonksiyon kullanılır (bkz. src/services/authService.ts).';

revoke all on function public.phone_exists(text) from public;
grant execute on function public.phone_exists(text) to anon, authenticated;


-- ── 2. messages: yalnızca is_read değiştirilebilir ──────────────────────────

create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
as $$
begin
  -- Kendi mesajını gönderen de dahil, hiç kimse gönderilmiş bir mesajın
  -- içeriğini/sahipliğini sonradan değiştiremez. Değişmesine izin verilen
  -- tek alan `is_read`.
  if new.id is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.content is distinct from old.content
     or new.type is distinct from old.type
     or new.trade_offer_id is distinct from old.trade_offer_id
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'Gönderilmiş bir mesaj değiştirilemez; yalnızca is_read güncellenebilir.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_immutable on public.messages;
create trigger messages_immutable
  before update on public.messages
  for each row
  execute function public.enforce_message_immutability();
