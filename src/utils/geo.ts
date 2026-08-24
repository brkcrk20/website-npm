/**
 * Konum yardımcıları.
 *
 * Uygulama önceden her ilan için sabit "0.8 km" yazıyordu: `listings`
 * tablosundaki `latitude`/`longitude` kolonları hiç doldurulmuyor,
 * `distance_km` diye bir kolon da yok. Artık:
 *
 *  - ilan verirken (kullanıcı izin verirse) cihaz konumu ilana yazılıyor,
 *  - listelerken, izin verilmişse kullanıcı konumuyla gerçek mesafe
 *    hesaplanıyor,
 *  - konum yoksa mesafe hiç gösterilmiyor (uydurma sayı yerine sadece
 *    ilçe adı görünür).
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

const LOCATION_STORAGE_KEY = 'swaloop_device_location';
/** Önbellekteki konumun geçerlilik süresi. */
const LOCATION_TTL_MS = 30 * 60 * 1000;

/** İki koordinat arası kuş uçuşu mesafe (km). */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin));
}

/** Önbellekte saklanan son konum (senkron, ağ/izin beklemez). */
export function getCachedLocation(): Coordinates | null {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Coordinates & { savedAt: number };

    if (!parsed || Date.now() - parsed.savedAt > LOCATION_TTL_MS) return null;

    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

/**
 * Cihaz konumunu ister. İzin verilmezse veya tarayıcı desteklemezse
 * `null` döner — çağıran taraf bunu normal bir durum olarak ele almalı.
 */
export function requestDeviceLocation(timeoutMs = 8000): Promise<Coordinates | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        try {
          localStorage.setItem(
            LOCATION_STORAGE_KEY,
            JSON.stringify({ ...coords, savedAt: Date.now() })
          );
        } catch {
          // Depolama kapalıysa konum yalnızca bu tur için kullanılır.
        }

        resolve(coords);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: LOCATION_TTL_MS }
    );
  });
}

/** Mesafeyi kullanıcıya gösterilecek biçime çevirir. Bilinmiyorsa boş string. */
export function formatDistance(km?: number): string {
  if (km === undefined || km === null || Number.isNaN(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
