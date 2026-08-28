import { describe, it, expect } from 'vitest';
import { trustSummary, trustLevel } from '../../utils/trustDisplay';
import { TrustProfile } from '../../types';

// Bu testler tek bir ürün kuralını koruyor:
// **Güven puanı ya gerçektir ya da gösterilmez.**
//
// Regresyonun kendisi şuydu: arayüzün beş ayrı yerinde puan yokken
// `?? 4.8` yazılıyordu ve `trust_profiles.trust_score` kolonunun DB
// varsayılanı 5 olduğu için hiç takas yapmamış kullanıcı "Topluluk Lideri"
// diye etiketleniyordu.

function profile(overrides: Partial<TrustProfile> = {}): TrustProfile {
  return {
    score: 5,
    level: 'Yeni üye',
    phoneVerified: true,
    idVerified: false,
    successfulTradesCount: 0,
    cancellationRate: 0,
    averageRating: 0,
    reviewCount: 0,
    reportCount: 0,
    accountAgeDays: 1,
    positiveHighlights: [],
    ...overrides,
  };
}

describe('trustSummary — puan ya gerçektir ya da yoktur', () => {
  it('hiç değerlendirilmemiş kullanıcı için sayı üretmez', () => {
    const summary = trustSummary(profile());

    expect(summary.isRated).toBe(false);
    expect(summary.scoreText).toBe('');
    expect(summary.label).toBe('Yeni üye');
  });

  it('ham skor 5 olsa bile değerlendirme yoksa puan göstermez', () => {
    // DB varsayılanı: trust_score = 5. Eski davranış bunu "5.0 / Topluluk
    // Lideri" diye gösteriyordu.
    const summary = trustSummary(profile({ score: 5, averageRating: 5, reviewCount: 0 }));

    expect(summary.isRated).toBe(false);
    expect(summary.scoreText).toBe('');
  });

  it('takası olan ama değerlendirilmemiş kullanıcıyı ayırt eder', () => {
    const summary = trustSummary(profile({ successfulTradesCount: 3 }));

    expect(summary.isRated).toBe(false);
    expect(summary.detail).toContain('3 takas');
  });

  it('gerçek değerlendirme varsa ortalamayı gösterir', () => {
    const summary = trustSummary(
      profile({ reviewCount: 12, averageRating: 4.63, successfulTradesCount: 9 })
    );

    expect(summary.isRated).toBe(true);
    expect(summary.scoreText).toBe('4.6');
    expect(summary.label).toContain('12 değerlendirme');
  });

  it('profil hiç yoksa çökmez, "Yeni üye" döner', () => {
    expect(trustSummary(undefined).label).toBe('Yeni üye');
    expect(trustSummary(null).isRated).toBe(false);
  });

  it('hiçbir metin parasal bir ifade içermez', () => {
    const texts = [
      trustSummary(profile()),
      trustSummary(profile({ reviewCount: 4, averageRating: 4.2, successfulTradesCount: 2 })),
    ].flatMap((s) => [s.label, s.detail]);

    for (const text of texts) {
      expect(text).not.toMatch(/₺|\bTL\b|fiyat|ücret|bedel/i);
    }
  });
});

describe('trustLevel — seviye ham skordan değil geçmişten türetilir', () => {
  it('geçmişi olmayan kullanıcı en üst seviyeye yerleşemez', () => {
    // Eski trustLevelFromScore(5) burada 'Topluluk Lideri' dönüyordu.
    expect(trustLevel(0, 0, 5)).toBe('Yeni üye');
  });

  it('takası olup değerlendirilmemiş kullanıcı başlangıç seviyesindedir', () => {
    expect(trustLevel(0, 4, 5)).toBe('Başlangıç');
  });

  it('en üst seviye hem yüksek ortalama hem yeterli takas ister', () => {
    expect(trustLevel(12, 10, 4.7)).toBe('Topluluk Lideri');
    expect(trustLevel(12, 2, 4.9)).not.toBe('Topluluk Lideri');
  });

  it('düşük ortalama yüksek seviyeye çıkmaz', () => {
    expect(trustLevel(20, 30, 2.4)).toBe('Başlangıç');
  });
});
