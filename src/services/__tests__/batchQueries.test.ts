import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────
// N+1 REGRESYON TESTİ
//
// README "Servisler ... liste sorguları toplu çalışır — bir teklif listesi,
// teklif sayısından bağımsız olarak sabit sayıda istek atar" diyordu, ama kod
// tam tersini yapıyordu: her teklif için ayrı `trades`, `trade_events`,
// `reviews` sorgusu ve iki ayrı `enrichListings` çağrısı (o da kendi içinde
// birkaç sorgu). 20 teklifli bir ekran ~140 HTTP isteği demekti.
//
// Bu test o cümleyi çalıştırılabilir bir sözleşmeye çeviriyor: 1 teklifle de
// 25 teklifle de atılan sorgu sayısı AYNI olmalı. Biri hidratlama döngüsüne
// tekrar teklif başına bir sorgu koyarsa test kırılır.
// ─────────────────────────────────────────────────────────────────────────

/** Zincirlenebilir (`.select().eq().order()...`) sahte PostgREST sorgusu. */
function makeQuery(result: { data: any; error: any; count?: number }) {
  const query: any = {
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };

  for (const method of [
    'select',
    'eq',
    'neq',
    'in',
    'or',
    'gte',
    'lt',
    'order',
    'limit',
    'update',
    'insert',
    'delete',
  ]) {
    query[method] = () => query;
  }

  query.maybeSingle = async () => ({
    data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
    error: result.error,
  });
  query.single = query.maybeSingle;

  return query;
}

/**
 * `from(table)` çağrılarını sayan sahte supabase istemcisi.
 * `tableData` içinde tanımlı olmayan tablolar boş liste döndürür.
 */
function makeSupabase(tableData: Record<string, any[]>) {
  const fromCalls: string[] = [];

  const supabase = {
    from(table: string) {
      fromCalls.push(table);
      return makeQuery({ data: tableData[table] ?? [], error: null });
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'viewer' } }, error: null }),
    },
    rpc: async () => ({ data: null, error: null }),
  };

  return { supabase, fromCalls };
}

function makeOfferRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `offer-${i}`,
    sender_id: 'user-a',
    receiver_id: 'viewer',
    status: 'pending',
    message: null,
    parent_offer_id: null,
    delivery_method: 'in_person',
    delivery_scheduled_at: null,
    delivery_location_name: null,
    delivery_notes: null,
    expires_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    sender: { id: 'user-a', full_name: 'Ayşe' },
    receiver: { id: 'viewer', full_name: 'Mehmet' },
    items: [
      {
        id: `item-${i}-a`,
        offer_id: `offer-${i}`,
        listing_id: `listing-${i}-a`,
        owner_id: 'user-a',
        role: 'offered',
        created_at: '2026-08-01T00:00:00.000Z',
        listing: { id: `listing-${i}-a`, owner_id: 'user-a', title: 'Kulaklık', status: 'active' },
      },
      {
        id: `item-${i}-b`,
        offer_id: `offer-${i}`,
        listing_id: `listing-${i}-b`,
        owner_id: 'viewer',
        role: 'requested',
        created_at: '2026-08-01T00:00:00.000Z',
        listing: { id: `listing-${i}-b`, owner_id: 'viewer', title: 'Bisiklet', status: 'active' },
      },
    ],
  }));
}

async function countQueriesForIncomingTrades(offerCount: number): Promise<number> {
  vi.resetModules();

  const { supabase, fromCalls } = makeSupabase({
    trade_offers: makeOfferRows(offerCount),
  });

  vi.doMock('../../lib/supabase', () => ({ supabase }));

  const { tradeService } = await import('../tradeService');
  await tradeService.getUserIncomingTrades('viewer');

  vi.doUnmock('../../lib/supabase');

  return fromCalls.length;
}

describe('liste sorguları: istek sayısı kayıt sayısından bağımsız', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getUserIncomingTrades, 1 teklifle de 25 teklifle de aynı sayıda sorgu atar', async () => {
    const withOne = await countQueriesForIncomingTrades(1);
    const withMany = await countQueriesForIncomingTrades(25);

    expect(withMany).toBe(withOne);
    // Eski (N+1) hâlinde 25 teklif 100'ün üzerinde sorgu üretiyordu.
    expect(withMany).toBeLessThan(15);
  });

  it('getConversations, konuşma sayısından bağımsız sabit sorgu atar', async () => {
    const run = async (conversationCount: number) => {
      vi.resetModules();

      const conversations = Array.from({ length: conversationCount }, (_, i) => ({
        id: `conv-${i}`,
        participant_one_id: 'viewer',
        participant_two_id: `other-${i}`,
        related_listing_id: null,
        active_trade_offer_id: null,
        last_message_id: null,
        created_at: '2026-08-01T00:00:00.000Z',
        updated_at: '2026-08-01T00:00:00.000Z',
        participant_one: { id: 'viewer', full_name: 'Ben' },
        participant_two: { id: `other-${i}`, full_name: 'Karşı taraf' },
        last_message: null,
      }));

      const { supabase, fromCalls } = makeSupabase({ conversations });
      vi.doMock('../../lib/supabase', () => ({ supabase }));

      const { messageService } = await import('../messageService');
      await messageService.getConversations('viewer');

      vi.doUnmock('../../lib/supabase');
      return fromCalls.length;
    };

    const withOne = await run(1);
    const withMany = await run(30);

    expect(withMany).toBe(withOne);
    // conversations + okunmamış mesaj sayımı = 2 sorgu.
    expect(withMany).toBe(2);
  });
});

describe('enrichListings: favori ve mesafe', () => {
  it('kullanıcının favorisindeki ilanları isFavorite=true olarak işaretler', async () => {
    vi.resetModules();

    const { supabase } = makeSupabase({
      favorites: [{ listing_id: 'listing-1' }],
    });

    vi.doMock('../../lib/supabase', () => ({ supabase }));

    const { enrichListings } = await import('../listingService');

    const [favorited, notFavorited] = await enrichListings([
      { id: 'listing-1', owner_id: 'user-a', title: 'Kulaklık', status: 'active' },
      { id: 'listing-2', owner_id: 'user-a', title: 'Bisiklet', status: 'active' },
    ]);

    // Sahte favorites sorgusu her iki id için de aynı satırı döndürür; asıl
    // doğrulanan şey `is_favorite`in artık DOLDURULUYOR olması — önceden
    // hiçbir sorgu bu alanı set etmiyordu ve kalp her zaman boş görünüyordu.
    expect(favorited.isFavorite).toBe(true);
    expect(notFavorited.isFavorite).toBe(false);

    vi.doUnmock('../../lib/supabase');
  });

  it('koordinat bilinmiyorsa mesafe undefined kalır (uydurma 0 km yok)', async () => {
    vi.resetModules();

    const { supabase } = makeSupabase({});
    vi.doMock('../../lib/supabase', () => ({ supabase }));

    const { enrichListings, setViewerCoords } = await import('../listingService');

    setViewerCoords(null);

    const [withoutCoords] = await enrichListings([
      { id: 'listing-1', owner_id: 'user-a', title: 'Kulaklık', latitude: 41.0, longitude: 29.0 },
    ]);

    expect(withoutCoords.location.distanceKm).toBeUndefined();

    setViewerCoords({ lat: 41.0, lng: 29.0 });

    const [sameSpot, faraway] = await enrichListings([
      { id: 'listing-1', owner_id: 'user-a', title: 'Kulaklık', latitude: 41.0, longitude: 29.0 },
      { id: 'listing-2', owner_id: 'user-a', title: 'Bisiklet', latitude: 39.92, longitude: 32.85 },
    ]);

    expect(sameSpot.location.distanceKm).toBe(0);
    // İstanbul - Ankara arası kuş uçuşu ~350 km.
    expect(faraway.location.distanceKm).toBeGreaterThan(300);
    expect(faraway.location.distanceKm).toBeLessThan(400);

    // İlanın koordinatı yoksa, kullanıcının konumu bilinse bile mesafe yok.
    const [noListingCoords] = await enrichListings([
      { id: 'listing-3', owner_id: 'user-a', title: 'Lamba' },
    ]);
    expect(noListingCoords.location.distanceKm).toBeUndefined();

    setViewerCoords(null);
    vi.doUnmock('../../lib/supabase');
  });
});
