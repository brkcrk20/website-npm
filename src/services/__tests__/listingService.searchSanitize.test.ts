import { describe, it, expect } from 'vitest';
import { sanitizeSearchQuery } from '../listingService';

// searchListings, arama metnini PostgREST'in `or()` filtresine DOĞRUDAN
// gömüyor. `or()` parametreli bir sorgu değil, ham bir filtre ifadesi —
// bu yüzden ayraç karakterlerinin metinden çıkması bir güvenlik kısıtı,
// kozmetik bir temizlik değil.
describe('sanitizeSearchQuery', () => {
  it('yeni koşul ekleyebilecek virgülü atar', () => {
    // Bu metin ham gömülseydi sorguya `status.eq.sold` koşulu eklenir ve
    // yalnızca aktif ilanları döndürme kısıtı atlatılabilirdi.
    const result = sanitizeSearchQuery('bisiklet,status.eq.sold');

    expect(result).not.toContain(',');
    expect(result).toBe('bisiklet status.eq.sold');
  });

  it('and/or grubu açabilecek parantezleri atar', () => {
    const result = sanitizeSearchQuery('kamera)or(owner_id.eq.x');

    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
  });

  it('PostgREST tırnak ve kaçış karakterlerini atar', () => {
    const result = sanitizeSearchQuery('masa"lamba\\test');

    expect(result).not.toContain('"');
    expect(result).not.toContain('\\');
  });

  it('ilike jokerlerini atar — tek karakterlik arama tüm tabloyu döndürmesin', () => {
    const result = sanitizeSearchQuery('%_*');

    expect(result).toBe('');
  });

  it('noktayı korur: PostgREST koşulu yalnızca ilk iki noktadan ayırır', () => {
    expect(sanitizeSearchQuery('3.5mm kablo')).toBe('3.5mm kablo');
  });

  it('boşlukları sadeleştirir ve kırpar', () => {
    expect(sanitizeSearchQuery('  koltuk   takımı  ')).toBe('koltuk takımı');
  });

  it('normal aramaları bozmaz', () => {
    expect(sanitizeSearchQuery('Canon EOS 200D')).toBe('Canon EOS 200D');
  });
});
