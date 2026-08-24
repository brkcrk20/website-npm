/**
 * Bir File nesnesini tarayıcıda (canvas ile) WebP formatına çevirir.
 * Sunucuya hiçbir ek yük bindirmez; dönüşüm kullanıcının cihazında olur.
 *
 * - Zaten .webp olan dosyalar olduğu gibi bırakılır.
 * - GIF dönüştürülmez (animasyon kaybolur), olduğu gibi yüklenir.
 * - Tarayıcı WebP encode'u desteklemiyorsa (çok nadir/eski tarayıcılar)
 *   veya herhangi bir sebeple dönüşüm başarısız olursa, orijinal dosya
 *   sessizce olduğu gibi kullanılır — kullanıcı için yükleme asla bozulmaz.
 */
export async function convertImageToWebp(
  file: File,
  quality: number = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/webp') return file;
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0);
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
  quality?: number
): Promise<File[]> {
  return Promise.all(files.map((f) => convertImageToWebp(f, quality)));
}
