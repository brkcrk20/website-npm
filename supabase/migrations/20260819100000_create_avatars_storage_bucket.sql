-- Gerçek profil fotoğrafı (avatar) yüklemesi için Supabase Storage bucket'ı
-- ve RLS politikaları.
--
-- Önceki durum (rapor.txt §2): EditProfilePage'deki kamera butonu hiçbir
-- şey yüklemiyordu, sadece tek bir sabit stok görsele set ediyordu.
-- Bu migration listing-images bucket'ıyla AYNI deseni kullanıyor:
--
-- Dosya yolu kuralı: {auth.uid()}/{dosya-adı}
-- Bu kural sayesinde policy'ler "sadece kendi klasörüne yazabilir"
-- kısıtını path'in ilk parçasına (auth.uid()) bakarak uygulayabiliyor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Herkes (bucket public olduğu için) profil fotoğraflarını görebilir.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- Giriş yapmış kullanıcılar sadece KENDİ klasörüne (auth.uid() ile
-- başlayan path'e) dosya yükleyebilir.
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Kullanıcılar sadece kendi yükledikleri dosyaları güncelleyebilir
-- (örn. aynı path'e upsert ile yeniden yükleme).
drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Kullanıcılar sadece kendi yükledikleri dosyaları silebilir.
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
