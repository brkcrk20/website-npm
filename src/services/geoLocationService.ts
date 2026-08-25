// Konum tespiti (GPS) ve serbest metinden adres otomatik tamamlama (autocomplete).
//
// OpenStreetMap Nominatim kullanılıyor: ücretsiz, API anahtarı gerektirmiyor.
// Kullanım politikası (https://operations.osmfoundation.org/policies/nominatim/)
// gereği: saniyede en fazla 1 istek, sonuçlarda "© OpenStreetMap katkıda
// bulunanları" atfı gösterilmeli (bkz. LocationPicker.tsx altındaki not).
// Üretimde yoğun kullanım bekleniyorsa Google Places / Mapbox gibi ücretli
// bir sağlayıcıya geçilmesi önerilir — arayüz (bu dosyadaki iki fonksiyon)
// aynı kalacağı için değişiklik LocationPicker'ı etkilemez.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface ResolvedLocation {
  // Uygulamanın geri kalanının kullandığı il/ilçe alanları.
  city: string;
  district: string;
  // Mahalle/köy gibi daha ince taneli bilgi — varsa gösterimde kullanılır.
  neighbourhood?: string;
  // "Karahasanlı, Merkezefendi, Denizli" gibi kullanıcıya gösterilecek tam etiket.
  label: string;
  lat: number;
  lon: number;
}

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  village?: string;
  town?: string;
  city_district?: string;
  district?: string;
  county?: string;
  city?: string;
  province?: string;
  state?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

function mapAddress(result: NominatimResult): ResolvedLocation {
  const a = result.address ?? {};

  // OSM'de Türkiye adresleri için alan isimleri kaynağa göre değişebiliyor;
  // en iyi eşleşen ilk değeri kullanıyoruz.
  const neighbourhood = a.neighbourhood || a.suburb || a.quarter || a.village;
  const district = a.town || a.district || a.city_district || a.county || '';
  const city = a.province || a.state || a.city || '';

  const labelParts = [neighbourhood, district, city].filter(Boolean);

  return {
    city,
    district,
    neighbourhood,
    label: labelParts.length > 0 ? labelParts.join(', ') : result.display_name,
    lat: parseFloat(result.lat),
    lon: parseFloat(result.lon),
  };
}

/**
 * Kullanıcının serbest metinle yazdığı adres parçasına göre öneri listesi
 * döndürür (autocomplete). Sadece Türkiye içi sonuçlar getirilir.
 */
export async function searchTurkeyAddress(
  query: string,
  signal?: AbortSignal
): Promise<ResolvedLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'tr');
  url.searchParams.set('accept-language', 'tr');
  url.searchParams.set('limit', '6');
  url.searchParams.set('q', trimmed);

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    throw new Error(`Adres araması başarısız: ${response.status}`);
  }

  const results: NominatimResult[] = await response.json();
  return results.map(mapAddress);
}

/**
 * Verilen enlem/boylam için en yakın adresi (mahalle/ilçe/il) bulur.
 * "Nokta atışı konum tespiti" akışında, tarayıcının GPS/konum servisinden
 * gelen koordinatı adrese çevirmek için kullanılır.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<ResolvedLocation> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'tr');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Konum çözümlenemedi: ${response.status}`);
  }

  const result: NominatimResult = await response.json();
  return mapAddress(result);
}

export type GeolocationFailureReason = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

/**
 * Tarayıcının Geolocation API'sini Promise'e sarar. Kullanıcı konum iznini
 * reddederse veya cihaz desteklemiyorsa anlamlı bir hata sebebiyle reddeder.
 */
export function getCurrentCoords(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject({ reason: 'unsupported' as GeolocationFailureReason });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        let reason: GeolocationFailureReason = 'unavailable';
        if (error.code === error.PERMISSION_DENIED) reason = 'denied';
        else if (error.code === error.TIMEOUT) reason = 'timeout';
        reject({ reason });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
