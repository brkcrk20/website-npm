import { supabase } from '../lib/supabase';
import { convertAvatarToWebp, convertManyToWebp, ConvertedImage } from '../utils/image';

/**
 * Supabase Storage yükleme katmanı.
 *
 * Uygulamadaki TÜM kullanıcı görselleri buradan geçer ve istisnasız
 * WebP'e çevrilerek yüklenir (bkz. `src/utils/image.ts`).
 *
 * Dosya yolu kuralı her iki bucket'ta da `{auth.uid()}/{dosya}` —
 * RLS politikaları `(storage.foldername(name))[1] = auth.uid()::text`
 * kontrolüne dayandığı için bu kural zorunludur (bkz.
 * supabase/migrations/20260818150000_create_listing_images_storage_bucket.sql
 * ve 20260824090000_create_avatars_storage_bucket.sql).
 */

export const LISTING_IMAGES_BUCKET = 'listing-images';
export const AVATARS_BUCKET = 'avatars';

export interface UploadedImage {
  url: string;
  bytes: number;
  isWebp: boolean;
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Oturumdaki gerçek kullanıcı id'sini döndürür. RLS kontrolü
 * `auth.uid()`'e göre yapıldığı için yükleme yolunda uygulamanın
 * önbellekteki kullanıcısı değil, HER ZAMAN bu değer kullanılır.
 */
async function requireSessionUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    console.error(
      'Yükleme yapılamadı: geçerli bir Supabase oturumu yok. Kullanıcının ' +
        'telefon + OTP ile tekrar giriş yapması gerekiyor.',
      error
    );
    return null;
  }

  return data.user.id;
}

async function uploadOne(
  bucket: string,
  ownerId: string,
  converted: ConvertedImage,
  prefix?: string
): Promise<UploadedImage | null> {
  const extension = converted.isWebp ? 'webp' : converted.file.name.split('.').pop() || 'jpg';
  const path = [ownerId, prefix, `${randomId()}.${extension}`].filter(Boolean).join('/');

  const { error } = await supabase.storage.from(bucket).upload(path, converted.file, {
    cacheControl: '31536000',
    contentType: converted.file.type,
    upsert: false,
  });

  if (error) {
    console.error(`Görsel yüklenemedi (${bucket}):`, converted.file.name, error);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { url: publicUrl, bytes: converted.bytes, isWebp: converted.isWebp };
}

export const storageService = {
  /**
   * İlan fotoğraflarını WebP'e çevirip yükler.
   *
   * Dönen dizi `files` ile AYNI SIRA ve AYNI UZUNLUKTADIR — bir dosya
   * yüklenemezse o index'te `null` döner, böylece çağıran taraf hangi
   * slotun başarısız olduğunu bilir (filtreleyip sıra kaydırmaz).
   */
  async uploadListingImages(files: File[]): Promise<(UploadedImage | null)[]> {
    if (!files.length) return [];

    const ownerId = await requireSessionUserId();
    if (!ownerId) return files.map(() => null);

    const converted = await convertManyToWebp(files);

    const results: (UploadedImage | null)[] = [];
    for (const item of converted) {
      results.push(await uploadOne(LISTING_IMAGES_BUCKET, ownerId, item));
    }

    return results;
  },

  /**
   * Profil fotoğrafını WebP'e çevirip yükler.
   *
   * `avatars` bucket'ı henüz oluşturulmadıysa (migration canlıya
   * uygulanmadıysa) ilan görselleriyle aynı bucket'a `{uid}/avatar/...`
   * yolunda yüklenir — böylece profil fotoğrafı yükleme, migration
   * beklemeden de çalışır.
   */
  async uploadAvatar(file: File): Promise<UploadedImage | null> {
    const ownerId = await requireSessionUserId();
    if (!ownerId) return null;

    const converted = await convertAvatarToWebp(file);

    const primary = await uploadOne(AVATARS_BUCKET, ownerId, converted);
    if (primary) return primary;

    return uploadOne(LISTING_IMAGES_BUCKET, ownerId, converted, 'avatar');
  },
};
