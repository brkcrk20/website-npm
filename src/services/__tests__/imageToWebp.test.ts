import { describe, it, expect } from 'vitest';
import { fitWithin, LISTING_IMAGE_MAX_PX, AVATAR_MAX_PX } from '../../utils/imageToWebp';

// README "Kararlar → Görseller her zaman WebP" bölümü küçültmeyi
// belgeliyordu ("ilan görselleri 1600 px, avatarlar 512 px") ama kodda
// küçültme YOKTU: canvas doğrudan `bitmap.width`/`bitmap.height` ile
// kuruluyordu, yani 4000x3000 bir fotoğraf yalnızca yeniden kodlanıyordu.

describe('fitWithin — uzun kenar sınırı', () => {
  it('telefon kamerası fotoğrafını ilan sınırına indirir', () => {
    expect(fitWithin(4000, 3000, LISTING_IMAGE_MAX_PX)).toEqual({ width: 1600, height: 1200 });
  });

  it('dikey fotoğrafta da UZUN kenarı sınırlar', () => {
    expect(fitWithin(3000, 4000, LISTING_IMAGE_MAX_PX)).toEqual({ width: 1200, height: 1600 });
  });

  it('avatarı 512 pikselle sınırlar', () => {
    expect(fitWithin(2048, 2048, AVATAR_MAX_PX)).toEqual({ width: 512, height: 512 });
  });

  it('zaten küçük görseli BÜYÜTMEZ', () => {
    // Yukarı ölçekleme kaliteyi artırmaz, yalnızca dosyayı şişirir.
    expect(fitWithin(800, 600, LISTING_IMAGE_MAX_PX)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(200, 200, AVATAR_MAX_PX)).toEqual({ width: 200, height: 200 });
  });

  it('en-boy oranını korur', () => {
    const { width, height } = fitWithin(3840, 2160, LISTING_IMAGE_MAX_PX);

    expect(width).toBe(1600);
    expect(Math.abs(width / height - 3840 / 2160)).toBeLessThan(0.01);
  });

  it('sınır 0/undefined ise dokunmaz', () => {
    expect(fitWithin(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
  });

  it('en az 1 piksel döner (aşırı küçültmede 0 olmaz)', () => {
    const { width, height } = fitWithin(10000, 3, 100);

    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
