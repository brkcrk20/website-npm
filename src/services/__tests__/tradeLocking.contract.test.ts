import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Ürün/sistem tasarım raporu md. 30'un regresyon testi.
//
// Hatalı davranış: `lock_listings_on_trade_start()` bir trade oluştuğunda
// kullanıcının TÜM aktif ilanlarını `in_trade` yapıyordu; yani takasla
// ilgisi olmayan ilanlar da sessizce keşiften düşüyordu.
//
// Doğru davranış: sadece o takasın teklifine dahil olan ilanlar
// (`trade_offer_items.offer_id = new.offer_id`) kilitlenir.
//
// Bu test SQL'i çalıştırmaz (bu ortamda Postgres yok); migration metnini
// okuyup fonksiyonun kapsamının daralmış olduğunu doğrular. Biri fonksiyonu
// tekrar "kullanıcının bütün ilanları" üzerinde çalışır hale getirirse
// burada yakalanır.

function functionBody(name: string): string {
  const dir = path.resolve(__dirname, '../../../supabase/migrations');
  const file = fs
    .readdirSync(dir)
    .find((f) => f.includes('needs_system_and_trade_locking'));

  expect(file, 'kilitleme migration dosyası bulunamadı').toBeTruthy();

  const sql = fs.readFileSync(path.join(dir, file as string), 'utf-8');
  const start = sql.indexOf(`create or replace function public.${name}()`);

  expect(start, `${name} fonksiyonu migration içinde bulunamadı`).toBeGreaterThan(-1);

  const end = sql.indexOf('\n$$;', start);

  expect(end, `${name} fonksiyonunun sonu bulunamadı`).toBeGreaterThan(start);

  return sql.slice(start, end);
}

describe('ilan kilitleme kapsamı (rapor md. 30)', () => {
  it('kilitleme sadece ilgili teklifin kalemleriyle sınırlıdır', () => {
    const body = functionBody('lock_listings_on_trade_start');

    expect(body).toContain('public.trade_offer_items');
    expect(body).toContain('i.offer_id = new.offer_id');
    expect(body).toContain('l.id = i.listing_id');
  });

  it('kilitleme kullanıcının diğer ilanlarını (owner_id) hedeflemez', () => {
    const body = functionBody('lock_listings_on_trade_start');

    // Fonksiyon owner_id/sender_id/receiver_id üzerinden toplu bir update
    // yapmamalı — bu, eski global kilitleme davranışının imzasıydı.
    expect(body).not.toMatch(/owner_id\s*=\s*new\./);
    expect(body).not.toMatch(/owner_id\s+in\s*\(/i);
  });

  it('takas bitince kilit çözülür: tamamlanınca traded, iptal edilince active', () => {
    const body = functionBody('release_listings_on_trade_end');

    expect(body).toContain("new.status = 'completed'");
    expect(body).toContain("status = 'traded'");
    expect(body).toContain("new.status = 'cancelled'");
    expect(body).toContain("status = 'active'");
    // Kilidin çözülmesi de aynı şekilde sadece bu takasın kalemlerini
    // hedeflemeli.
    expect(body).toContain('i.offer_id = new.offer_id');
  });
});
