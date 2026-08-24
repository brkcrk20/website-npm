-- Profil fotoğrafı yüklemesi için Supabase Storage bucket'ı.
--
-- Önceden profil fotoğrafı hiç yüklenemiyordu: EditProfilePage'teki
-- "kamera" düğmesi sadece sabit bir Unsplash URL'ini geri yazıyordu.
-- Artık kullanıcı kendi fotoğrafını seçiyor, tarayıcıda WebP'e
-- çevriliyor (bkz. src/utils/image.ts) ve buraya yükleniyor.
--
-- Dosya yolu kuralı listing-images ile aynı: {auth.uid()}/{dosya}
-- Böylece RLS "sadece kendi klasörüne yazabilir" kuralını path'in ilk
-- parçasına bakarak uygulayabiliyor.
--
-- Boyut limiti bilerek küçük (2 MB): avatarlar istemcide 512px WebP'e
-- indirildiği için gerçekte birkaç on KB'ı geçmez.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- listing-images bucket'ı WebP'i zaten kabul ediyordu; burada sadece
-- açıkça yeniden yazılıyor ki yeni kurulan ortamlarda da garanti olsun.
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
where id = 'listing-images';
