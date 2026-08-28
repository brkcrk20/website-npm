import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportServiceError, onServiceError } from '../../lib/serviceError';

// Servis katmanında 120 ayrı hata yolu vardı ve hepsi yalnızca konsola
// yazıyordu. Fonksiyonlar hatada `[]` döndüğü, sayfaların 35'inden
// 33'ünde `catch` olmadığı için kullanıcı ekranda "Henüz ilan yok"
// görüyordu — yani BOZUKLUK, BOŞLUK gibi görünüyordu.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reportServiceError', () => {
  it('konsola yazmayı sürdürür (mevcut teşhis kaybolmasın)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportServiceError('İlanlar alınamadı:', new Error('boom'));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('dinleyicilere bağlamı ve hatayı iletir', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: Array<[string, unknown]> = [];
    const stop = onServiceError((context, error) => seen.push([context, error]));

    const boom = new Error('boom');
    reportServiceError('İlanlar alınamadı:', boom);

    expect(seen).toEqual([['İlanlar alınamadı:', boom]]);
    stop();
  });

  it('abonelik sonlandırılınca artık haber vermez', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let count = 0;
    const stop = onServiceError(() => count++);

    reportServiceError('bir');
    stop();
    reportServiceError('iki');

    expect(count).toBe(1);
  });

  it('bir dinleyici patlarsa diğerleri yine de çalışır', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stopA = onServiceError(() => {
      throw new Error('dinleyici hatası');
    });
    let reached = false;
    const stopB = onServiceError(() => {
      reached = true;
    });

    expect(() => reportServiceError('test')).not.toThrow();
    expect(reached).toBe(true);

    stopA();
    stopB();
  });
});
