import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 20260828000000_backend_hardening.sql ile kapatılan boşlukların regresyon
// testleri. SQL'in kendisi supabase/tests/trade_flow_test.sql ile gerçek bir
// PostgreSQL üzerinde doğrulanıyor; burada SERVİS KATMANININ o kurallara
// uygun konuştuğu kontrol ediliyor.

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');
const SERVICES_DIR = path.resolve(__dirname, '..');

function readMigration(fragment: string): string {
  const file = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.includes(fragment));
  expect(file, `${fragment} migration dosyası bulunamadı`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file as string), 'utf-8');
}

describe('profiles.phone / profiles.email istemciye inmiyor', () => {
  it('migration, tablo seviyesindeki SELECT hakkını geri alıp kolon listesi veriyor', () => {
    const sql = readMigration('backend_hardening');

    expect(sql).toContain("revoke select on public.profiles from anon, authenticated");
    expect(sql).toContain("grant select (%s) on public.profiles to anon, authenticated");
    // Kolon listesi katalogdan türetiliyor ve iki gizli kolon dışarıda kalıyor.
    expect(sql).toContain("column_name not in ('phone', 'email')");
  });

  it('hiçbir servis `profiles` sorgusunda phone/email istemiyor', () => {
    const files = fs
      .readdirSync(SERVICES_DIR)
      .filter((f) => f.endsWith('.ts'));

    expect(files.length).toBeGreaterThan(0);

    let inspectedColumnLists = 0;

    for (const file of files) {
      const source = fs.readFileSync(path.join(SERVICES_DIR, file), 'utf-8');

      // `.from('profiles')` + `.select('*')` kombinasyonu artık Postgres
      // tarafından tümden reddedilir ("permission denied for column phone"),
      // çünkü `*` gizli kolonları da kapsar.
      const selectsEverything = /\.from\('profiles'\)\s*[\s\S]{0,120}?\.select\(\s*'\*'\s*\)/.test(source);
      expect(selectsEverything, `${file}: profiles üzerinde select('*') kullanılmış`).toBe(false);

      // Açık kolon listelerinde de phone/email geçmemeli.
      const columnLists = source.match(/profiles\(([^)]*)\)|select\(\s*'([^']*full_name[^']*)'/g) ?? [];
      inspectedColumnLists += columnLists.length;

      for (const list of columnLists) {
        expect(list, `${file}: profil kolon listesinde phone var`).not.toMatch(/\bphone\b/);
        expect(list, `${file}: profil kolon listesinde email var`).not.toMatch(/\bemail\b/);
      }
    }

    // Test boşa dönmesin: kolon listeleri gerçekten taranmış olmalı.
    expect(inspectedColumnLists, 'hiçbir profil kolon listesi bulunamadı').toBeGreaterThan(5);
  });
});

describe('ilan kaldırma: silme değil arşivleme', () => {
  it('deleteListing, delete_listing() RPC\'sini çağırır ve sonucu taşır', async () => {
    vi.resetModules();
    const calls: Array<{ fn: string; args: any }> = [];

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        rpc: async (fn: string, args: any) => {
          calls.push({ fn, args });
          return { data: 'archived', error: null };
        },
      },
    }));

    const { listingService } = await import('../listingService');
    const result = await listingService.deleteListing('listing-1');

    expect(calls).toEqual([{ fn: 'delete_listing', args: { p_listing_id: 'listing-1' } }]);
    expect(result.outcome).toBe('archived');

    vi.doUnmock('../../lib/supabase');
  });

  it('reddedilirse nedeni çağırana taşır (konsola yazıp yutmaz)', async () => {
    vi.resetModules();

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        rpc: async () => ({
          data: null,
          error: { message: 'Devam eden bir takasta olan ilan kaldırılamaz.' },
        }),
      },
    }));

    const { listingService } = await import('../listingService');
    const result = await listingService.deleteListing('listing-1');

    expect(result.outcome).toBe('failed');
    expect(result.message).toContain('Devam eden bir takasta');

    vi.doUnmock('../../lib/supabase');
  });
});

describe('takas tamamlama iki tarafın onayına bağlı', () => {
  function tradeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trade-1',
      offer_id: 'offer-1',
      sender_id: 'user-a',
      receiver_id: 'user-b',
      status: 'delivery_planned',
      started_at: new Date().toISOString(),
      completed_at: null,
      sender_confirmed_at: null,
      receiver_confirmed_at: null,
      ...overrides,
    };
  }

  it('confirmReceipt, confirm_trade_receipt() RPC\'sine devreder', async () => {
    vi.resetModules();
    const calls: Array<{ fn: string; args: any }> = [];

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        rpc: async (fn: string, args: any) => {
          calls.push({ fn, args });
          return { data: 'both_confirmed', error: null };
        },
        from(table: string) {
          if (table === 'trades') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tradeRow(), error: null }) }) }),
            };
          }
          // getTradeById -> trade_offers; bu test için boş dönmesi yeterli.
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        },
      },
    }));

    const { tradeService } = await import('../tradeService');
    const result = await tradeService.confirmReceipt('offer-1');

    expect(calls).toEqual([{ fn: 'confirm_trade_receipt', args: { p_trade_id: 'trade-1' } }]);
    expect(result?.bothConfirmed).toBe(true);

    vi.doUnmock('../../lib/supabase');
  });

  it('advanceTradeStep(5) doğrudan UPDATE atmaz, onay RPC\'sini kullanır', async () => {
    vi.resetModules();
    const rpcNames: string[] = [];
    let updateCount = 0;

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        rpc: async (fn: string) => {
          rpcNames.push(fn);
          return { data: 'waiting', error: null };
        },
        from(table: string) {
          if (table === 'trades') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tradeRow(), error: null }) }) }),
              update: () => {
                updateCount += 1;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        },
      },
    }));

    const { tradeService } = await import('../tradeService');
    await tradeService.advanceTradeStep('offer-1', 5);

    expect(rpcNames).toEqual(['confirm_trade_receipt']);
    expect(updateCount, 'adım 5 için trades tablosuna doğrudan UPDATE atılmamalı').toBe(0);

    vi.doUnmock('../../lib/supabase');
  });

  it('advanceTradeStep(6), iki taraf onaylamadan takası tamamlamaya çalışmaz', async () => {
    vi.resetModules();
    let updateCount = 0;

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
        from(table: string) {
          if (table === 'trades') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: tradeRow({ status: 'received', sender_confirmed_at: new Date().toISOString() }),
                    error: null,
                  }),
                }),
              }),
              update: () => {
                updateCount += 1;
                return { eq: async () => ({ error: null }) };
              },
            };
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          };
        },
      },
    }));

    const { tradeService } = await import('../tradeService');
    await tradeService.advanceTradeStep('offer-1', 6);

    expect(updateCount, 'tek taraflı onayla takas tamamlanmaya çalışılmamalı').toBe(0);

    vi.doUnmock('../../lib/supabase');
  });
});

describe('admin ilan moderasyonu sessizce başarısız olmuyor', () => {
  it('0 satır güncellenirse false döner ve denetim kaydı yazılmaz', async () => {
    vi.resetModules();
    const inserted: any[] = [];

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
        from(table: string) {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Yönetici', is_admin: true } }) }),
              }),
            };
          }
          if (table === 'listings') {
            return {
              update: () => ({
                eq: () => ({
                  // RLS satırı eledi: hata YOK ama hiçbir satır güncellenmedi.
                  select: async () => ({ data: [], error: null }),
                }),
              }),
            };
          }
          if (table === 'admin_audit_logs') {
            return {
              insert: async (row: any) => {
                inserted.push(row);
                return { error: null };
              },
            };
          }
          throw new Error(`Beklenmeyen tablo: ${table}`);
        },
      },
    }));

    const { adminService } = await import('../adminService');
    const ok = await adminService.moderateListing('listing-1', 'remove', 'spam');

    expect(ok).toBe(false);
    expect(inserted, 'başarısız moderasyon denetim kaydı üretmemeli').toHaveLength(0);

    vi.doUnmock('../../lib/supabase');
  });
});
