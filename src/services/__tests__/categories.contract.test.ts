import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../../constants';

// Koddaki kategori listesi ile veritabanındaki `categories` satırlarının
// AYRIŞMAMASI gerekiyor: `listings.category_id` bir yabancı anahtar ve
// `listingService.categoryUuidBySlug()` slug üzerinden çözüyor. Slug
// eşleşmezse ilan oluşturma sessizce başarısız oluyor.
//
// Tabloyu dolduran hiçbir şey yoktu; sıfırdan kurulan her ortamda ilan
// verme tamamen çalışmıyordu (bkz. 20260901000000_seed_categories.sql).
// Bu test, seed ile kod listesinin birlikte değişmesini zorunlu kılıyor.

function seedSql(): string {
  const dir = path.resolve(__dirname, '../../../supabase/migrations');
  const file = fs.readdirSync(dir).find((f) => f.includes('seed_categories'));

  expect(file, 'kategori seed migration dosyası bulunamadı').toBeTruthy();

  return fs.readFileSync(path.join(dir, file as string), 'utf-8');
}

function seededSlugs(sql: string): string[] {
  // ('electronics',  'Elektronik', 'Laptop'),
  return [...sql.matchAll(/^\s*\('([a-z-]+)',/gm)].map((m) => m[1]);
}

describe('kategoriler: kod <-> veritabanı sözleşmesi', () => {
  it('koddaki her kategori seed migration içinde var', () => {
    const seeded = new Set(seededSlugs(seedSql()));

    for (const category of CATEGORIES) {
      expect(seeded.has(category.id), `"${category.id}" seed'de yok`).toBe(true);
    }
  });

  it('seed içindeki her slug kodda tanımlı', () => {
    const known = new Set(CATEGORIES.map((c) => c.id));

    for (const slug of seededSlugs(seedSql())) {
      expect(known.has(slug as never), `"${slug}" kodda tanımlı değil`).toBe(true);
    }
  });

  it('slug listesi tekrar içermiyor', () => {
    const slugs = CATEGORIES.map((c) => c.id);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('seed tekrar çalıştırılabilir (on conflict do nothing)', () => {
    expect(seedSql()).toMatch(/on conflict \(slug\) do nothing/);
  });
});
