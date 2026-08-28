import { describe, it, expect, vi, afterEach } from 'vitest';

// SUNUCUNUN SÖYLEDİĞİ ÇAĞIRANA ULAŞMALI.
//
// `accept_trade_offer()` reddetme sebebini Türkçe söylüyor:
//
//   * "Bu tekliften 'X' artık takasa açık değil; teklif kabul edilemez."
//   * "Bu teklifi yalnızca teklifin gönderildiği kişi kabul edebilir."
//   * "Teklif bulunamadı."
//
// Bu cümleler `acceptOffer()` içinde `undefined`'a çevrilip yok oluyordu.
// Sayfalar da `if (updated)` yazdığı için hata dalı yoktu: kullanıcı
// "Kabul Et"e basıyor, ekranda HİÇBİR ŞEY olmuyordu. Yani sunucuda
// kazanılan doğruluk kullanıcıya hiç ulaşmıyordu.

afterEach(() => {
  vi.doUnmock('../../lib/supabase');
  vi.restoreAllMocks();
});

async function loadServiceWith(supabase: unknown) {
  vi.resetModules();
  vi.doMock('../../lib/supabase', () => ({ supabase }));
  const { tradeService } = await import('../tradeService');
  return tradeService;
}

describe('acceptOffer / rejectOffer hata yolu', () => {
  it('RPC hatasının mesajını çağırana taşır', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const tradeService = await loadServiceWith({
      rpc: async () => ({
        data: null,
        error: { message: "Bu tekliften \"Bisiklet\" artık takasa açık değil; teklif kabul edilemez." },
      }),
    });

    const result = await tradeService.acceptOffer('offer-1');

    expect(result.trade).toBeUndefined();
    expect(result.error).toBe(
      "Bu tekliften \"Bisiklet\" artık takasa açık değil; teklif kabul edilemez."
    );
  });

  it('başarıda hata alanı boş kalır', async () => {
    const tradeService = await loadServiceWith({
      rpc: async () => ({ data: 'trade-1', error: null }),
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    });

    const result = await tradeService.acceptOffer('offer-1');

    expect(result.error).toBeUndefined();
  });

  it('ret hatasının mesajını da taşır', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const tradeService = await loadServiceWith({
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { message: 'Bu geçiş yapılamaz.' } }),
        }),
      }),
    });

    const result = await tradeService.rejectOffer('offer-1');

    expect(result.trade).toBeUndefined();
    expect(result.error).toBe('Bu geçiş yapılamaz.');
  });
});
