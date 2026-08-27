import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Listing } from '../../types';
import {
  daysUntilExpiry,
  expiryLabel,
  isExpiringSoon,
  EXPIRY_WARNING_DAYS,
} from '../../utils/listingExpiry';

// ─────────────────────────────────────────────────────────────────────────
// İLAN SÜRESİ (rapor md. 119)
//
// Kuralın kendisi DB'de (20260829000000) ve gerçek bir PostgreSQL üzerinde
// supabase/tests/trade_flow_test.sql ile doğrulanıyor. Buradaki testler
// KOD TARAFININ o kuralla aynı dili konuştuğunu bağlıyor: durum kümesi,
// süreyi kimin yazdığı ve arayüzün süreyi uydurmadığı.
// ─────────────────────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

function expiryMigration(): string {
  const file = fs.readdirSync(MIGRATIONS_DIR).find((f) => f.includes('listing_expiry'));

  expect(file, 'ilan süresi migration dosyası bulunamadı').toBeTruthy();

  return fs.readFileSync(path.join(MIGRATIONS_DIR, file as string), 'utf-8');
}

const NOW = new Date('2026-09-01T12:00:00.000Z');

function listing(overrides: Partial<Listing>): Pick<Listing, 'expiresAt' | 'status'> {
  return { status: 'active', ...overrides } as Pick<Listing, 'expiresAt' | 'status'>;
}

describe('listings.status: kod <-> DB sözleşmesi', () => {
  it("Listing['status'] union'ı ile listings_status_check birebir aynıdır", () => {
    const sql = expiryMigration();
    const block = sql.slice(sql.indexOf('add constraint listings_status_check'));
    const values = block
      .slice(0, block.indexOf('));'))
      .match(/'([a-z_]+)'/g)
      ?.map((v) => v.replace(/'/g, ''))
      .sort();

    // Union derleme zamanında silindiği için elle yazılıyor; atama, tipe
    // uymayan bir değer eklenirse derlemede patlar.
    const codeValues: Listing['status'][] = [
      'active',
      'expired',
      'in_trade',
      'paused',
      'removed',
      'traded',
    ];

    expect(values).toEqual([...codeValues].sort());
  });

  it('expired durumunu ve süreyi yalnızca sistem yazabiliyor', () => {
    const sql = expiryMigration();

    // Kullanıcı `listings_update_own` ile tüm kolonlara yazabildiği için,
    // kural yalnızca tetikleyicilerle gerçek oluyor.
    expect(sql).toContain('trg_enforce_listing_expiry_update');
    expect(sql).toContain('trg_enforce_listing_expiry_insert');
    expect(sql).toContain('İlan süresi doğrudan değiştirilemez');
    expect(sql).toContain('Süresi dolan ilan yalnızca "Yenile" ile tekrar yayına alınır.');
  });

  it('süre işi hem uyarıyor hem düşürüyor (uyarısız düşme olmasın)', () => {
    const sql = expiryMigration();
    const fn = sql.slice(sql.indexOf('create or replace function public.expire_stale_listings'));

    expect(fn).toContain("'listing_expiring'");
    expect(fn).toContain("'listing_expired'");
    // Uyarı, düşürmeden ÖNCE gelmeli.
    expect(fn.indexOf("'listing_expiring'")).toBeLessThan(fn.indexOf("'listing_expired'"));
  });
});

describe('süre etiketleri: arayüz süreyi uydurmaz', () => {
  it('expiresAt bilinmiyorsa gün sayısı da etiket de yok', () => {
    // 20260829000000 canlıya uygulanana kadar bu alan boş gelir. Eskiden
    // teklif ömründe yapılan hata (frontend'in "created_at + 2 gün" diye
    // kendi kuralını işletmesi) burada tekrarlanmamalı.
    expect(daysUntilExpiry(listing({ expiresAt: undefined }), NOW)).toBeNull();
    expect(expiryLabel(listing({ expiresAt: undefined }), NOW)).toBe('');
    expect(isExpiringSoon(listing({ expiresAt: undefined }), NOW)).toBe(false);
  });

  it('okunamayan tarih de "bilinmiyor" sayılır', () => {
    expect(daysUntilExpiry(listing({ expiresAt: 'bugün' }), NOW)).toBeNull();
  });

  it('kalan süre yukarı yuvarlanıyor (1 saat kalan ilan "0 gün" değil)', () => {
    expect(daysUntilExpiry(listing({ expiresAt: '2026-09-01T13:00:00.000Z' }), NOW)).toBe(1);
    expect(daysUntilExpiry(listing({ expiresAt: '2026-09-04T12:00:00.000Z' }), NOW)).toBe(3);
  });

  it('geçmiş tarih negatif değil 0 döner', () => {
    expect(daysUntilExpiry(listing({ expiresAt: '2026-08-01T12:00:00.000Z' }), NOW)).toBe(0);
  });

  it('uyarı penceresi DB ile aynı (3 gün) ve yalnızca yayındaki ilana bakar', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(3);

    const soon = listing({ expiresAt: '2026-09-03T12:00:00.000Z' });
    const later = listing({ expiresAt: '2026-09-20T12:00:00.000Z' });

    expect(isExpiringSoon(soon, NOW)).toBe(true);
    expect(isExpiringSoon(later, NOW)).toBe(false);

    // Takasta kilitli ilanın süresi işlemiyor; uyarı da gösterilmemeli.
    expect(isExpiringSoon({ ...soon, status: 'in_trade' }, NOW)).toBe(false);
  });

  it('etiket insan diliyle konuşuyor', () => {
    expect(expiryLabel(listing({ expiresAt: '2026-09-01T20:00:00.000Z' }), NOW)).toBe(
      'Yarın doluyor'
    );
    expect(expiryLabel(listing({ expiresAt: '2026-09-11T12:00:00.000Z' }), NOW)).toBe(
      '10 gün kaldı'
    );
    expect(expiryLabel(listing({ status: 'expired', expiresAt: undefined }), NOW)).toBe(
      'Süresi doldu'
    );
  });
});

describe('listingService: süre servis katmanında', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keşif sonucundan süresi geçmiş satırlar düşüyor', async () => {
    const { withoutExpired } = await import('../listingService');

    const now = Date.parse('2026-09-01T12:00:00.000Z');

    const rows = [
      { id: 'a', expires_at: '2026-09-10T00:00:00.000Z' },
      { id: 'b', expires_at: '2026-08-01T00:00:00.000Z' },
      // Kolon henüz canlıda yoksa satırda hiç gelmez; bu satırlar elenmemeli.
      { id: 'c' },
      { id: 'd', expires_at: null },
    ];

    expect(withoutExpired(rows, now).map((r) => r.id)).toEqual(['a', 'c', 'd']);
  });

  it('yenileme, doğrudan UPDATE değil renew_listing RPC çağırıyor', async () => {
    const rpc = vi.fn(async () => ({ data: '2026-10-01T00:00:00.000Z', error: null }));
    const from = vi.fn();

    vi.doMock('../../lib/supabase', () => ({
      supabase: { rpc, from, auth: { getUser: async () => ({ data: { user: null } }) } },
    }));

    const { listingService } = await import('../listingService');
    const result = await listingService.renewListing('listing-1');

    expect(rpc).toHaveBeenCalledWith('renew_listing', { p_listing_id: 'listing-1' });
    // `expires_at`'i istemci yazamıyor: tabloya doğrudan dokunulmamalı.
    expect(from).not.toHaveBeenCalled();
    expect(result.expiresAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('reddin nedeni yutulmuyor, çağırana taşınıyor', async () => {
    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        rpc: async () => ({
          data: null,
          error: { message: 'Bu ilanı yalnızca sahibi yenileyebilir.' },
        }),
        from: vi.fn(),
        auth: { getUser: async () => ({ data: { user: null } }) },
      },
    }));

    const { listingService } = await import('../listingService');
    const result = await listingService.renewListing('listing-1');

    expect(result.expiresAt).toBeNull();
    expect(result.message).toBe('Bu ilanı yalnızca sahibi yenileyebilir.');
  });
});
