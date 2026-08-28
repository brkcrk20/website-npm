import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { scoreNeedAgainstListing, tokenize, wordsMatch, MATCH_THRESHOLD } from '../needService';
import type { Listing, Need } from '../../types';

const listing = {
  title: 'Canon EOS 200D Fotoğraf Makinesi',
  description: 'Kit lens ve çanta ile birlikte.',
  categoryId: 'photography',
  tags: ['dslr', 'kamera', 'canon'],
  location: { city: 'İstanbul', district: 'Kadıköy', distanceKm: 2 },
} as unknown as Listing;

function need(title: string, categoryId?: string): Pick<Need, 'title' | 'categoryId'> {
  return { title, categoryId: categoryId as Need['categoryId'] };
}

describe('tokenize', () => {
  it('Türkçe büyük harfleri doğru küçültür (İ → i)', () => {
    expect(tokenize('İPHONE Kılıf')).toEqual(['iphone', 'kılıf']);
  });

  it('dolgu kelimeleri ve 3 harften kısa parçaları atar', () => {
    expect(tokenize('Bisiklet ile takas arıyorum')).toEqual(['bisiklet']);
  });
});

describe('wordsMatch — Türkçe ekler eşleşmeyi bozmamalı', () => {
  // Regresyon: skorlayıcı tam eşitlik (Set.has) arıyordu. "bisiklet"
  // arayan kullanıcı "Bisikletim" başlıklı ilanda HİÇ kelime eşleşmesi
  // alamıyordu — üstelik DB ön filtresi (title.ilike.%bisiklet%) o ilanı
  // zaten getirmiş oluyordu.
  it('iyelik ve hâl eklerini tolere eder', () => {
    expect(wordsMatch('bisiklet', 'bisikletim')).toBe(true);
    expect(wordsMatch('bisiklet', 'bisikleti')).toBe(true);
    expect(wordsMatch('bisikletim', 'bisiklet')).toBe(true);
    expect(wordsMatch('kamera', 'kamerası')).toBe(true);
  });

  it('son ünsüz yumuşamasını yakalar (kitap→kitabı, renk→rengi)', () => {
    expect(wordsMatch('kitap', 'kitabı')).toBe(true);
    expect(wordsMatch('renk', 'rengi')).toBe(true);
    expect(wordsMatch('ağaç', 'ağacı')).toBe(true);
    expect(wordsMatch('kanat', 'kanadı')).toBe(true);
  });

  it('sadece baş harfleri tutan alakasız kelimeleri eşleştirmez', () => {
    expect(wordsMatch('araba', 'arabesk')).toBe(false);
    expect(wordsMatch('kol', 'koltuk')).toBe(false);
    expect(wordsMatch('masa', 'maske')).toBe(false);
  });
});

describe('scoreNeedAgainstListing', () => {
  it('ekli bir başlıkta da kelime eşleşmesi bulur', () => {
    const suffixed = {
      title: 'Bisikletim takasa açık',
      description: '',
      categoryId: 'sports',
      tags: [],
      location: { city: 'İstanbul', district: 'Kadıköy', distanceKm: 1 },
    } as unknown as Listing;

    const { score, reasons } = scoreNeedAgainstListing(need('bisiklet'), suffixed);

    expect(score).toBeGreaterThan(0);
    expect(reasons.join(' ')).toContain('bisiklet');
  });

  it('kategori eşleşmesi tek başına eşik değerin üstünde bir skor üretir', () => {
    const { score, reasons } = scoreNeedAgainstListing(need('Aynasız gövde', 'photography'), listing);

    expect(score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(reasons).toContain('Aradığın kategoride');
  });

  it('kelime örtüşmesi ilan etiketlerinden de yakalanır', () => {
    const { score, reasons } = scoreNeedAgainstListing(need('kamera'), listing);

    expect(score).toBeGreaterThan(0);
    expect(reasons.join(' ')).toContain('kamera');
  });

  it('alakasız bir ihtiyaç eşik değerin altında kalır', () => {
    const { score } = scoreNeedAgainstListing(need('Bisiklet', 'sports'), listing);

    expect(score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('aynı şehir küçük bir katkı verir, tek başına eşleşme yaratmaz', () => {
    const withCity = scoreNeedAgainstListing(need('Bisiklet', 'sports'), listing, 'İstanbul');
    const withoutCity = scoreNeedAgainstListing(need('Bisiklet', 'sports'), listing);

    expect(withCity.score - withoutCity.score).toBe(10);
    expect(withCity.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('skor 100 ile sınırlıdır', () => {
    const { score } = scoreNeedAgainstListing(
      need('Canon EOS 200D Fotoğraf Makinesi', 'photography'),
      listing,
      'İstanbul'
    );

    expect(score).toBeLessThanOrEqual(100);
  });

  it('hiçbir gerekçe parasal bir ifade içermez (rapor md. 3/47)', () => {
    const { reasons } = scoreNeedAgainstListing(
      need('Canon kamera', 'photography'),
      listing,
      'İstanbul'
    );

    for (const reason of reasons) {
      expect(reason).not.toMatch(/₺|\bTL\b|fiyat|değer|denk/i);
    }
  });
});

describe('needs tablosu: kod <-> DB sözleşmesi', () => {
  function migrationSql(): string {
    const dir = path.resolve(__dirname, '../../../supabase/migrations');
    const file = fs
      .readdirSync(dir)
      .find((f) => f.includes('needs_system_and_trade_locking'));

    expect(file, 'needs migration dosyası bulunamadı').toBeTruthy();

    return fs.readFileSync(path.join(dir, file as string), 'utf-8');
  }

  it('NeedStatus değerleri DB CHECK constraint ile birebir aynıdır', () => {
    const match = migrationSql().match(/check \(status in \(([^)]+)\)\)/i);

    expect(match, 'needs.status CHECK constraint bulunamadı').toBeTruthy();

    const dbValues = (match as RegExpMatchArray)[1]
      .split(',')
      .map((v) => v.trim().replace(/^'|'$/g, ''))
      .sort();

    // src/types/index.ts'teki NeedStatus ile aynı küme olmalı.
    expect(dbValues).toEqual(['active', 'fulfilled', 'paused']);
  });

  it('createNeed sadece DB tarafından kabul edilen status ile insert yapar', async () => {
    vi.resetModules();

    const captured: any[] = [];

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        from(table: string) {
          if (table === 'categories') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { id: 'cat-1' }, error: null }) }),
              }),
            };
          }

          return {
            insert: (payload: any) => {
              captured.push(payload);
              return {
                select: () => ({
                  single: async () => ({
                    data: {
                      ...payload,
                      id: 'need-1',
                      created_at: '2026-01-01T00:00:00Z',
                      updated_at: '2026-01-01T00:00:00Z',
                      fulfilled_at: null,
                      category: { slug: 'photography' },
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        },
      },
    }));

    const { needService } = await import('../needService');

    const created = await needService.createNeed({
      userId: 'user-1',
      title: '  Aynasız kamera  ',
      categoryId: 'photography',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].status).toBe('active');
    // Başlık kırpılmalı, kategori slug'ı UUID'ye çevrilmeli.
    expect(captured[0].title).toBe('Aynasız kamera');
    expect(captured[0].category_id).toBe('cat-1');
    expect(created?.categoryId).toBe('photography');

    vi.doUnmock('../../lib/supabase');
    vi.resetModules();
  });
});
