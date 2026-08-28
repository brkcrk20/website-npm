/** İlan görsellerinin uzun kenar sınırı (README "Kararlar" bölümü). */
export const LISTING_IMAGE_MAX_PX = 1600;

/** Avatarların uzun kenar sınırı. */
export const AVATAR_MAX_PX = 512;

/**
 * Uzun kenarı `maxDimension`'a indirilmiş boyutu hesaplar. Görsel zaten
 * küçükse BÜYÜTÜLMEZ (yukarı ölçekleme yalnızca dosyayı şişirir).
 */
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  const longest = Math.max(width, height);

  if (!maxDimension || longest <= maxDimension) return { width, height };

  const scale = maxDimension / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Bir File nesnesini tarayıcıda (canvas ile) WebP formatına çevirir ve
 * uzun kenarını `maxDimension` pikselle sınırlar. Sunucuya hiçbir ek yük
 * bindirmez; dönüşüm kullanıcının cihazında olur.
 *
 * - Zaten .webp olan dosyalar olduğu gibi bırakılır.
 * - GIF dönüştürülmez (animasyon kaybolur), olduğu gibi yüklenir.
 * - Tarayıcı WebP encode'u desteklemiyorsa (çok nadir/eski tarayıcılar)
 *   veya herhangi bir sebeple dönüşüm başarısız olursa, orijinal dosya
 *   sessizce olduğu gibi kullanılır — kullanıcı için yükleme asla bozulmaz.
 *
 * NOT: Küçültme README'nin "Kararlar → Görseller her zaman WebP"
 * bölümünde ("ilan görselleri 1600 px, avatarlar 512 px") anlatılıyordu
 * ama KODDA YOKTU: canvas doğrudan `bitmap.width`/`bitmap.height` ile
 * kuruluyordu. Yani telefon kamerasından gelen 4000x3000 bir fotoğraf
 * yalnızca yeniden kodlanıyor, boyutu aynı kalıyordu — belgelenen
 * "birkaç yüz KB'a iner" sonucu gerçekleşmiyor ve bucket'ın 5 MB sınırı
 * zorlanıyordu.
 */
export async function convertImageToWebp(
  file: File,
  quality: number = 0.82,
  maxDimension: number = LISTING_IMAGE_MAX_PX
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/webp') return file;
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Küçültmede kalite: tarayıcının yumuşatmasını en yükseğe al, yoksa
    // ölçeklenen fotoğraf tırtıklı görünür.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    );

    // Bazı eski tarayıcılar toBlob'u 'image/webp' ile desteklemez ve
    // sessizce PNG döner — bu durumda dönüşümü iptal edip orijinali kullan.
    if (!blob || blob.type !== 'image/webp') return file;

    const newName = file.name.replace(/\.[^./\\]+$/, '') + '.webp';

    return new File([blob], newName, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn(
      'Görsel WebP\'ye çevrilemedi, orijinal dosya kullanılacak:',
      file.name,
      err
    );
    return file;
  }
}

/**
 * Bir dosya listesini paralel olarak WebP'ye çevirir.
 */
export async function convertImagesToWebp(
  files: File[],
  quality?: number,
  maxDimension?: number
): Promise<File[]> {
  return Promise.all(files.map((f) => convertImageToWebp(f, quality, maxDimension)));
}
