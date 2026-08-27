/**
 * İlan süresi arayüz yardımcıları (rapor md. 119).
 *
 * Kural DB'de: `listings.expires_at`, `expire_stale_listings()` ve
 * `renew_listing()` — bkz. supabase/migrations/20260829000000_listing_expiry.sql.
 * Buradaki fonksiyonlar yalnızca o veriyi insan diline çeviriyor; süre
 * hesabını arayüz UYDURMAZ (teklif ömründe daha önce yapılan hata buydu:
 * frontend "created_at + 2 gün" diye kendi kuralını işletiyordu).
 */

import { Listing } from '../types';

/** Süresi dolmadan kaç gün önce kullanıcı uyarılır (DB tarafıyla aynı). */
export const EXPIRY_WARNING_DAYS = 3;

/**
 * Bitişe kalan tam gün sayısı. Bilinmiyorsa (kolon henüz canlıda yoksa ya da
 * tarih okunamıyorsa) `null` — çağıran taraf o zaman süreyi hiç göstermez.
 * Süre geçmişse negatif değil `0` döner.
 */
export function daysUntilExpiry(
  listing: Pick<Listing, 'expiresAt'>,
  now: Date = new Date()
): number | null {
  if (!listing.expiresAt) return null;

  const end = new Date(listing.expiresAt).getTime();

  if (Number.isNaN(end)) return null;

  const diffMs = end - now.getTime();

  if (diffMs <= 0) return 0;

  // Yukarı yuvarlama: 1 saat kalan ilan "0 gün" değil "1 gün" görünsün.
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

/** Yalnızca yayındaki ilanlar için: süre uyarı penceresine girdi mi? */
export function isExpiringSoon(
  listing: Pick<Listing, 'expiresAt' | 'status'>,
  now: Date = new Date()
): boolean {
  if (listing.status !== 'active') return false;

  const days = daysUntilExpiry(listing, now);

  return days !== null && days <= EXPIRY_WARNING_DAYS;
}

/**
 * "İlanlarım" ekranındaki kısa süre etiketi. Süre bilinmiyorsa boş metin
 * döner — arayüz o zaman etiketi hiç basmaz.
 */
export function expiryLabel(
  listing: Pick<Listing, 'expiresAt' | 'status'>,
  now: Date = new Date()
): string {
  if (listing.status === 'expired') return 'Süresi doldu';

  if (listing.status !== 'active') return '';

  const days = daysUntilExpiry(listing, now);

  if (days === null) return '';
  if (days === 0) return 'Bugün doluyor';
  if (days === 1) return 'Yarın doluyor';

  return `${days} gün kaldı`;
}
