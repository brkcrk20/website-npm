import { describe, it, expect, vi } from 'vitest';
<<<<<<< HEAD
import fs from 'node:fs';
import path from 'node:path';
=======
>>>>>>> aa112bc (Son güncellemeler)

// Rapor 1.3 fix'in regresyon testi:
// MakeOfferPage'de seçilen deliveryMethod/deliveryDetails,
// createTradeOffer -> trade_offers'a yazılmalı, sonra acceptOffer ->
// bu değerleri trades'e taşımalı. Biri bu zinciri bozarsa (örn. birisi
// insert payload'ından delivery_* alanlarını silerse), bu test kırılır.

describe('teklif teslimat bilgisi: oluşturma -> kabul zinciri', () => {
  it('createTradeOffer, seçilen deliveryMethod/deliveryDetails\'i trade_offers\'a yazar', async () => {
    vi.resetModules();
    const capturedOfferInsert: any[] = [];

    vi.doMock('../../lib/supabase', () => {
      const supabase = {
        from(table: string) {
          if (table === 'trade_offers') {
            return {
              insert: (row: any) => {
                capturedOfferInsert.push(row);
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: 'offer-1', ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                      error: null,
                    }),
                  }),
                };
              },
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'trade_offer_items') {
            return { insert: async () => ({ error: null }) };
          }
          throw new Error(`Beklenmeyen tablo: ${table}`);
        },
      };
      return { supabase };
    });

    const { tradeService } = await import('../tradeService');

    await tradeService.createTradeOffer({
      initiator: { id: 'user-a' } as any,
      receiver: { id: 'user-b' } as any,
      offeredListings: [{ id: 'listing-1' } as any],
      requestedListings: [{ id: 'listing-2' } as any],
      deliveryMethod: 'cargo',
      deliveryDetails: {
        scheduledDate: '2026-09-01',
        locationName: 'Kadıköy PTT',
        notes: 'Kırılacak eşya, dikkatli paketleyin',
      },
    });

    expect(capturedOfferInsert).toHaveLength(1);
    const insertedRow = capturedOfferInsert[0];
    expect(insertedRow.delivery_method).toBe('cargo');
    expect(insertedRow.delivery_location_name).toBe('Kadıköy PTT');
    expect(insertedRow.delivery_notes).toBe('Kırılacak eşya, dikkatli paketleyin');
    expect(insertedRow.delivery_scheduled_at).toBeTruthy();

    vi.doUnmock('../../lib/supabase');
  });

<<<<<<< HEAD
  it('acceptOffer, kabul islemini accept_trade_offer() RPC\'sine devreder', async () => {
    vi.resetModules();
    const capturedRpcCalls: Array<{ fn: string; args: any }> = [];

    vi.doMock('../../lib/supabase', () => {
      const supabase = {
        rpc: async (fn: string, args: any) => {
          capturedRpcCalls.push({ fn, args });
          return { data: 'trade-1', error: null };
        },
        from(table: string) {
          // acceptOffer, RPC'den sonra getTradeById ile teklifi tekrar okur;
          // bu test yalnizca RPC cagrisini dogruladigi icin "bulunamadi"
          // donmek yeterli.
          if (table === 'trade_offers') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            };
          }
=======
  it('acceptOffer, trade_offers\'daki teslimat bilgisini trades satırına taşır (kaybolmaz)', async () => {
    vi.resetModules();
    const capturedTradeInsert: any[] = [];

    const fakeOfferRow = {
      id: 'offer-1',
      sender_id: 'user-a',
      receiver_id: 'user-b',
      status: 'offer_sent',
      message: null,
      parent_offer_id: null,
      delivery_method: 'cargo',
      delivery_scheduled_at: '2026-09-01T00:00:00.000Z',
      delivery_location_name: 'Kadıköy PTT',
      delivery_notes: 'Kırılacak eşya, dikkatli paketleyin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.doMock('../../lib/supabase', () => {
      const supabase = {
        from(table: string) {
          if (table === 'trade_offers') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: fakeOfferRow, error: null }),
                }),
              }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }
          if (table === 'trades') {
            return {
              insert: (row: any) => {
                capturedTradeInsert.push(row);
                return {
                  select: () => ({
                    single: async () => ({
                      data: { id: 'trade-1', ...row, started_at: new Date().toISOString(), completed_at: null },
                      error: null,
                    }),
                  }),
                };
              },
            };
          }
          if (table === 'trade_events') {
            return { insert: async () => ({ error: null }) };
          }
>>>>>>> aa112bc (Son güncellemeler)
          throw new Error(`Beklenmeyen tablo: ${table}`);
        },
      };
      return { supabase };
    });

    const { tradeService } = await import('../tradeService');

<<<<<<< HEAD
    await tradeService.acceptOffer('offer-1');

    expect(capturedRpcCalls).toEqual([
      { fn: 'accept_trade_offer', args: { p_offer_id: 'offer-1' } },
    ]);

    vi.doUnmock('../../lib/supabase');
  });

  it('accept_trade_offer() teslimat bilgisini trade_offers\'tan trades\'e kopyalar', () => {
    // Kabul akisi istemciden DB'ye tasindigi icin (tek islem + yetki
    // kontrolu, bkz. 20260827000000), teslimat bilgisinin tasindigini artik
    // SQL fonksiyonunun govdesi uzerinden dogruluyoruz. Biri fonksiyondan
    // delivery_* alanlarini dusururse bu test kirilir.
    const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
    const file = fs
      .readdirSync(migrationsDir)
      .find((f) => f.includes('backend_integrity_fixes'));

    expect(file, 'backend_integrity_fixes migration dosyasi bulunamadi').toBeTruthy();

    const sql = fs.readFileSync(path.join(migrationsDir, file as string), 'utf-8');
    const fnStart = sql.indexOf('function public.accept_trade_offer');
    expect(fnStart, 'accept_trade_offer fonksiyonu bulunamadi').toBeGreaterThan(-1);

    const body = sql.slice(fnStart);
    const insertBlock = body.slice(
      body.indexOf('insert into public.trades'),
      body.indexOf('returning id into v_trade_id')
    );

    for (const column of [
      'delivery_method',
      'delivery_scheduled_at',
      'delivery_location_name',
      'delivery_notes',
    ]) {
      // Hem hedef kolon listesinde hem de v_offer.<kolon> kaynaginda gecmeli.
      expect(insertBlock).toContain(column);
      expect(insertBlock).toContain(`v_offer.${column}`);
    }
  });
=======
    // acceptOffer, trades insert'inden sonra getTradeById ile tekrar
    // hydrate etmeye çalışır; bu test yalnızca trades insert payload'ını
    // doğruladığı için o kısmın hata vermesi (fetch edememesi) beklenen
    // ve zararsız bir durumdur.
    await tradeService.acceptOffer('offer-1').catch(() => undefined);

    expect(capturedTradeInsert).toHaveLength(1);
    const insertedTrade = capturedTradeInsert[0];
    expect(insertedTrade.delivery_method).toBe('cargo');
    expect(insertedTrade.delivery_location_name).toBe('Kadıköy PTT');
    expect(insertedTrade.delivery_notes).toBe('Kırılacak eşya, dikkatli paketleyin');
    expect(insertedTrade.delivery_scheduled_at).toBe('2026-09-01T00:00:00.000Z');

    vi.doUnmock('../../lib/supabase');
  });
>>>>>>> aa112bc (Son güncellemeler)
});
