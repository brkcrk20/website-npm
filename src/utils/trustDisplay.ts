import { TrustProfile } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// GÜVEN GÖSTERİMİ — TEK KAYNAK
//
// Neden bu dosya var:
//
// `trust_profiles.trust_score` kolonunun DB varsayılanı 5'tir ve
// `average_rating` yalnızca gerçek bir `reviews` satırı geldiğinde
// güncellenir. Yani hiç takas yapmamış, hiç değerlendirilmemiş bir
// kullanıcının ham skoru da 5.00 görünür — üstelik `trustLevelFromScore`
// bunu "Topluluk Lideri" diye etiketliyordu.
//
// Üstüne, arayüzün beş ayrı yerinde skor yokken `?? 4.8` yazılıyordu:
// TrustCard, TradeCard, CommunityPage, PublicProfilePage, TradeDetailPage.
// Yani karşısındakinin kim olduğunu bilmeyen kullanıcıya UYDURULMUŞ bir
// itibar gösteriliyordu.
//
// Bir takas uygulamasında güven, yabancı birine eşyanı teslim etme
// kararının tek dayanağıdır. Uydurulmuş güven, olmayan güvenden kötüdür:
// hem yanlış karar verdirir hem de gerçekten puan biriktirmiş kullanıcının
// puanını değersizleştirir (herkes 4.8 ise 4.8 hiçbir şey anlatmaz).
//
// Kural: **puan ya gerçektir ya da yoktur.** Geçmişi olmayan kullanıcı
// "Yeni üye" olarak gösterilir — bu bir kusur değil, dürüst bir bilgidir
// ve karşı tarafın temkinli olmasını sağlar.
//
// (Aynı ilke README'de mesafe için de geçerli: "Mesafe ya gerçektir ya da
// yoktur" — koordinat yoksa uydurma bir "0 km" gösterilmez.)
// ─────────────────────────────────────────────────────────────────────────

export interface TrustSummary {
  /** Gösterilecek gerçek bir geçmiş var mı? */
  isRated: boolean;
  /** Puan metni ("4.6") — `isRated` false ise boş string. */
  scoreText: string;
  /** Kısa etiket: "Yeni üye" ya da "4.6 · 12 değerlendirme". */
  label: string;
  /** Tek satırlık açıklama; kart altlarında kullanılır. */
  detail: string;
}

/**
 * Bir kullanıcının güven bilgisinin gösterilebilir hâli.
 *
 * `trustProfile` yoksa (join boş döndü, profil silinmiş) da güvenli
 * çalışır: uydurma bir sayı yerine "Yeni üye" döner.
 */
export function trustSummary(trustProfile?: TrustProfile | null): TrustSummary {
  const reviewCount = trustProfile?.reviewCount ?? 0;
  const trades = trustProfile?.successfulTradesCount ?? 0;

  // Değerlendirme yoksa ortalama puanın anlamı yoktur. Takas sayısı tek
  // başına bir puan üretmez ama "yeni değil" bilgisini verir.
  if (reviewCount === 0) {
    return {
      isRated: false,
      scoreText: '',
      label: 'Yeni üye',
      detail:
        trades > 0
          ? `${trades} takas tamamladı, henüz değerlendirilmedi`
          : 'Henüz takas geçmişi yok',
    };
  }

  const score = trustProfile?.averageRating ?? 0;
  const scoreText = score.toFixed(1);

  return {
    isRated: true,
    scoreText,
    label: `${scoreText} · ${reviewCount} değerlendirme`,
    detail: `${trades} tamamlanan takas · ${reviewCount} değerlendirme`,
  };
}

/**
 * Güven seviyesi etiketi. Skordan DEĞİL, gerçek geçmişten türetilir —
 * çünkü ham skorun varsayılanı 5'tir ve geçmişi olmayan kullanıcıyı en üst
 * seviyeye yerleştirir.
 */
export function trustLevel(
  reviewCount: number,
  completedTrades: number,
  averageRating: number
): TrustProfile['level'] {
  if (reviewCount === 0 && completedTrades === 0) return 'Yeni üye';
  if (reviewCount === 0) return 'Başlangıç';
  if (averageRating >= 4.5 && completedTrades >= 10) return 'Topluluk Lideri';
  if (averageRating >= 4.0 && completedTrades >= 3) return 'Çok Güvenilir';
  if (averageRating >= 3.0) return 'Güvenilir';
  return 'Başlangıç';
}
