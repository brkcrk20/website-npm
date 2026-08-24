import { describe, it, expect } from 'vitest';
import { impactService } from '../impactService';

describe('impactService.calculateListingImpact', () => {
  it('bilinen bir kategori/durum için tutarlı bir etki hesaplar', () => {
    const impact = impactService.calculateListingImpact('electronics', 'very_good', 1.0);

    // electronics base co2Kg = 14.5, very_good multiplier = 0.95
    expect(impact.co2eKg).toBeCloseTo(13.8, 1);
    expect(impact.methodologyVersion).toBe('SVS-v2.1 (LCA Sürdürülebilirlik Metodolojisi)');
    expect(impact.reuseCount).toBe(1);
  });

  it('condition multiplier arttıkça etki değerleri artar (zero > like_new > ... > acceptable)', () => {
    const zero = impactService.calculateListingImpact('fashion', 'zero');
    const likeNew = impactService.calculateListingImpact('fashion', 'like_new');
    const acceptable = impactService.calculateListingImpact('fashion', 'acceptable');

    expect(zero.co2eKg).toBeGreaterThan(likeNew.co2eKg);
    expect(likeNew.co2eKg).toBeGreaterThan(acceptable.co2eKg);
  });

  it('bilinmeyen/geçersiz bir kategori geldiğinde "other" varsayılan değerlerine düşer', () => {
    // @ts-expect-error - kasıtlı olarak geçersiz kategori ile davranışı doğruluyoruz
    const unknown = impactService.calculateListingImpact('nonexistent-category', 'very_good');
    const other = impactService.calculateListingImpact('other', 'very_good');

    expect(unknown.co2eKg).toBe(other.co2eKg);
    expect(unknown.wasteReductionKg).toBe(other.wasteReductionKg);
  });

  it('weightModifier tüm alanları orantılı şekilde ölçekler', () => {
    const base = impactService.calculateListingImpact('books', 'very_good', 1.0);
    const doubled = impactService.calculateListingImpact('books', 'very_good', 2.0);

    // Math.round/toFixed yuvarlaması nedeniyle tam eşitlik yerine küçük bir tolerans kullanılıyor
    expect(doubled.co2eKg).toBeCloseTo(base.co2eKg * 2, 0);
    expect(Math.abs(doubled.waterLiters - base.waterLiters * 2)).toBeLessThanOrEqual(1);
  });
});

describe('impactService.calculateCombinedTradeImpact', () => {
  it('boş bir teklif listesi için sıfır etki döner (regresyon: NaN/undefined üretmemeli)', () => {
    const combined = impactService.calculateCombinedTradeImpact([]);

    expect(combined.co2eKg).toBe(0);
    expect(combined.waterLiters).toBe(0);
    expect(combined.reuseCount).toBe(0);
  });

  it('birden fazla ürünün etkisini doğru şekilde toplar (takas ekranındaki toplam CO2e için kritik)', () => {
    const itemA = impactService.calculateListingImpact('electronics', 'very_good');
    const itemB = impactService.calculateListingImpact('sports', 'good');

    const combined = impactService.calculateCombinedTradeImpact([itemA, itemB]);

    expect(combined.co2eKg).toBeCloseTo(
      parseFloat((itemA.co2eKg + itemB.co2eKg).toFixed(1)),
      1
    );
    expect(combined.reuseCount).toBe(2);
    expect(combined.waterLiters).toBe(itemA.waterLiters + itemB.waterLiters);
  });
});
