import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Rapor 1.2 fix'in regresyon testi:
// trade_offer_items.role için kodun ürettiği değerler ile DB'deki
// CHECK constraint'in izin verdiği değerler HER ZAMAN birebir aynı olmalı.
// Biri değişip diğeri unutulursa (örn. kod 'offered' yerine 'given'
// kullanmaya başlarsa ama migration güncellenmezse) createTradeOffer
// canlıda INSERT hatasıyla çöker. Bu test o senaryoyu derleme/CI
// aşamasında yakalar.

function extractCheckedRoles(): string[] {
  const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
  const files = fs.readdirSync(migrationsDir);
  const roleCheckFile = files.find((f) => f.includes('trade_offer_items_role_check'));
  expect(roleCheckFile, 'trade_offer_items_role_check migration dosyası bulunamadı').toBeTruthy();

  const sql = fs.readFileSync(path.join(migrationsDir, roleCheckFile as string), 'utf-8');
  const match = sql.match(/check\s*\(role in \(([^)]+)\)\)/i);
  expect(match, 'CHECK constraint tanımı migration içinde bulunamadı').toBeTruthy();

  return (match as RegExpMatchArray)[1]
    .split(',')
    .map((s) => s.trim().replace(/^'/, '').replace(/'$/, ''));
}

describe('trade_offer_items.role: kod <-> DB constraint sözleşmesi', () => {
  it('TRADE_ITEM_ROLE sabitindeki değerler DB CHECK constraint ile birebir eşleşir', async () => {
    const { TRADE_ITEM_ROLE } = await import('../tradeService');
    const dbAllowedRoles = extractCheckedRoles().sort();
    const codeRoles = Object.values(TRADE_ITEM_ROLE).sort();

    expect(codeRoles).toEqual(dbAllowedRoles);
  });

  it('createTradeOffer, trade_offer_items tablosuna sadece DB tarafından izin verilen role değerleriyle insert yapar', async () => {
    const dbAllowedRoles = new Set(extractCheckedRoles());
    const capturedItemRows: any[] = [];

    // Önceki testte '../tradeService' zaten gerçek supabase modülüyle
    // import edilip modül önbelleğine (module cache) girdi. Mock'un
    // etkili olması için önbelleği sıfırlıyoruz, yoksa doMock görmezden
    // gelinir ve gerçek ağ isteği atılmaya çalışılır.
    vi.resetModules();

    // supabase istemcisini mock'la: trade_offers insert -> sahte satır döndür,
    // trade_offer_items insert -> gönderilen satırları yakala.
    vi.doMock('../../lib/supabase', () => {
      const supabase = {
        from(table: string) {
          if (table === 'trade_offers') {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({
                    data: { id: 'offer-1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                    error: null,
                  }),
                }),
              }),
              // createTradeOffer başarıyla item insert ettikten sonra
              // getTradeById ile teklifi tekrar okumaya çalışıyor; bu test
              // sadece item insert payload'ını doğruladığı için burada
              // "bulunamadı" (null) dönmek yeterli, ayrıca hydrate etmeye
              // gerek yok.
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }
          if (table === 'trade_offer_items') {
            return {
              insert: async (rows: any[]) => {
                capturedItemRows.push(...rows);
                return { error: null };
              },
            };
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
      deliveryMethod: 'in_person',
    });

    expect(capturedItemRows.length).toBe(2);
    for (const row of capturedItemRows) {
      expect(dbAllowedRoles.has(row.role)).toBe(true);
    }

    vi.doUnmock('../../lib/supabase');
  });
});
