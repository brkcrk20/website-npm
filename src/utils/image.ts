/**
 * Görsel işleme yardımcıları.
 *
 * Uygulamaya yüklenen HER kullanıcı görseli (ilan fotoğrafları ve profil
 * fotoğrafı) tarayıcıda, yükleme isteği gönderilmeden ÖNCE WebP'e çevrilir.
 * Böylece:
 *  - Supabase Storage'a giden veri 3-10 kat küçülür (yükleme çok hızlanır),
 *  - Keşfet/ilan listelerinde indirilen görseller küçük olduğu için
 *    uygulama mobilde belirgin şekilde daha akıcı çalışır,
 *  - `listing-images` bucket'ındaki 5 MB dosya limiti pratikte hiç
 *    aşılmaz (telefon kamerasından gelen 8-12 MB'lık JPEG'ler bile
 *    yeniden boyutlandırma sonrası birkaç yüz KB'a iner).
 *
 * Dönüştürme tamamen istemci tarafında, `canvas.toBlob(..., 'image/webp')`
 * ile yapılır — ek bir kütüphane veya sunucu adımı gerekmez.
 */

export interface WebpConvertOptions {
  /** Uzun kenarın piksel cinsinden üst sınırı. */
  maxDimension?: number;
  /** 0-1 arası WebP kalitesi. */
  quality?: number;
}

export interface ConvertedImage {
  /** Yüklenmeye hazır WebP dosyası (dönüşüm mümkün değilse orijinal dosya). */
  file: File;
  /** Dönüşüm gerçekten WebP ürettiyse true. */
  isWebp: boolean;
  originalBytes: number;
  bytes: number;
  width: number;
  height: number;
}

const DEFAULTS: Required<WebpConvertOptions> = {
  maxDimension: 1600,
  quality: 0.82,
};

let webpSupport: boolean | null = null;

/**
 * Tarayıcı canvas üzerinden WebP kodlayabiliyor mu? (Safari 14+, Chrome,
 * Firefox, Edge destekler; desteklemeyen çok eski tarayıcılarda dönüşüm
 * sessizce atlanır ve orijinal dosya yüklenir.)
 */
export function supportsWebpEncoding(): boolean {
  if (webpSupport !== null) return webpSupport;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webpSupport = false;
  }

  return webpSupport;
}

/** Dosya adının uzantısını .webp yapar (`kedi.HEIC` -> `kedi.webp`). */
function toWebpFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'gorsel';
  // Storage yolunda sorun çıkarabilecek karakterleri temizle.
  const safe = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 40);

  return `${safe || 'gorsel'}.webp`;
}

/**
 * Dosyayı çizilebilir bir kaynağa çevirir. `createImageBitmap` EXIF
 * yönlendirmesini (telefonla yan çekilmiş fotoğraflar) doğru uygular;
 * desteklenmeyen tarayıcılarda `<img>` ile devam edilir.
 */
async function loadDrawable(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // `imageOrientation` seçeneğini bilmeyen tarayıcılar için tekrar dene.
      try {
        const bitmap = await createImageBitmap(file);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        };
      } catch {
        // <img> yoluna düş.
      }
    }
  }

  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Görsel okunamadı.'));
      element.src = url;
    });

    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Tek bir görseli WebP'e çevirir ve `maxDimension` sınırına küçültür.
 *
 * Dönüşüm herhangi bir nedenle başarısız olursa (tarayıcı desteği yok,
 * bozuk dosya, WebP çıktısı orijinalden büyük) ORİJİNAL dosya döner —
 * yükleme akışı hiçbir zaman bu yüzden kırılmaz.
 */
export async function convertToWebp(
  file: File,
  options: WebpConvertOptions = {}
): Promise<ConvertedImage> {
  const { maxDimension, quality } = { ...DEFAULTS, ...options };

  const fallback: ConvertedImage = {
    file,
    isWebp: file.type === 'image/webp',
    originalBytes: file.size,
    bytes: file.size,
    width: 0,
    height: 0,
  };

  if (!file.type.startsWith('image/')) return fallback;

  // Animasyonlu GIF'ler canvas'a çizilince tek kareye düşer; bozmamak için
  // olduğu gibi bırakılır.
  if (file.type === 'image/gif') return fallback;

  if (!supportsWebpEncoding()) return fallback;

  let drawable: Awaited<ReturnType<typeof loadDrawable>>;

  try {
    drawable = await loadDrawable(file);
  } catch (error) {
    console.warn('Görsel WebP’e çevrilemedi, orijinal dosya kullanılıyor:', file.name, error);
    return fallback;
  }

  try {
    const { source, width, height } = drawable;

    if (!width || !height) return fallback;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Şeffaf PNG'ler WebP'e çevrilirken alfa kanalı korunur; ayrıca bir
    // arka plan boyamıyoruz.
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );

    if (!blob || blob.type !== 'image/webp') return fallback;

    // Zaten optimize edilmiş küçük bir WebP'i büyütmenin anlamı yok.
    if (file.type === 'image/webp' && blob.size >= file.size && scale === 1) {
      return { ...fallback, width, height };
    }

    const webpFile = new File([blob], toWebpFileName(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    });

    return {
      file: webpFile,
      isWebp: true,
      originalBytes: file.size,
      bytes: webpFile.size,
      width: targetWidth,
      height: targetHeight,
    };
  } catch (error) {
    console.warn('Görsel WebP’e çevrilemedi, orijinal dosya kullanılıyor:', file.name, error);
    return fallback;
  } finally {
    drawable.release();
  }
}

/** Birden fazla görseli sırayla WebP'e çevirir. */
export async function convertManyToWebp(
  files: File[],
  options: WebpConvertOptions = {}
): Promise<ConvertedImage[]> {
  const results: ConvertedImage[] = [];

  for (const file of files) {
    results.push(await convertToWebp(file, options));
  }

  return results;
}

/** Profil fotoğrafları için kare, küçük ve hafif bir ön ayar. */
export function convertAvatarToWebp(file: File): Promise<ConvertedImage> {
  return convertToWebp(file, { maxDimension: 512, quality: 0.85 });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
