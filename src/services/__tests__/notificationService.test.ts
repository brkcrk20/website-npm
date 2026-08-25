import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { NotificationType, TradeCancellationReason } from '../../types';

// Bildirim tipleri ve iptal nedenleri iki yerde tanımlı: TypeScript union'ı
// ve DB constraint'i. Biri değişip diğeri unutulursa uygulama canlıda
// "violates check constraint" ile çöker. Bu testler o sözleşmeyi bağlar
// (tradeService.roleContract testiyle aynı desen).

function migrationSql(): string {
  const dir = path.resolve(__dirname, '../../../supabase/migrations');
  const file = fs
    .readdirSync(dir)
    .find((f) => f.includes('notifications_and_trade_cancellation'));

  expect(file, 'bildirim migration dosyası bulunamadı').toBeTruthy();

  return fs.readFileSync(path.join(dir, file as string), 'utf-8');
}

describe('notifications.type: kod <-> DB sözleşmesi', () => {
  it('NotificationType union ile DB CHECK constraint birebir aynıdır', () => {
    const sql = migrationSql();
    const block = sql.slice(sql.indexOf('type text not null check (type in ('));
    const values = block
      .slice(0, block.indexOf('))'))
      .match(/'([a-z_]+)'/g)
      ?.map((v) => v.replace(/'/g, ''))
      .sort();

    // TypeScript union'ı derleme zamanında silindiği için burada elle
    // yazılıyor; yeni bir tip eklenirse bu satır da güncellenmeli ve
    // aşağıdaki atama tip hatası vermemeli.
    const codeValues: NotificationType[] = [
      'badge',
      'counter_offer',
      'loop',
      'message',
      'need_matched',
      'review_request',
      'system',
      'trade_offer',
      'trade_status',
    ];

    expect(values).toEqual([...codeValues].sort());
  });

  it('iptal nedenleri kod ve DB enum tanımında aynıdır', () => {
    const sql = migrationSql();
    const block = sql.slice(sql.indexOf('create type public.trade_cancellation_reason as enum ('));
    const values = block
      .slice(0, block.indexOf(');'))
      .match(/'([a-z_]+)'/g)
      ?.map((v) => v.replace(/'/g, ''))
      .sort();

    const codeValues: TradeCancellationReason[] = [
      'delivery_problem',
      'item_unavailable',
      'no_agreement',
      'no_response',
      'other',
    ];

    expect(values).toEqual([...codeValues].sort());
  });

  it('TRADE_CANCELLATION_REASONS her nedene bir etiket verir', async () => {
    const { TRADE_CANCELLATION_REASONS } = await import('../../types');
    const ids = TRADE_CANCELLATION_REASONS.map((r) => r.id).sort();

    expect(ids).toEqual([
      'delivery_problem',
      'item_unavailable',
      'no_agreement',
      'no_response',
      'other',
    ]);

    for (const reason of TRADE_CANCELLATION_REASONS) {
      expect(reason.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('bildirim üretimi yalnızca DB tarafındadır', () => {
  it('notifications tablosunda kullanıcıya INSERT politikası yoktur', () => {
    const sql = migrationSql();

    // Sahte bildirim yazılabilmesini engelleyen tasarım kararı: satırları
    // sadece security definer trigger'lar üretir.
    expect(sql).toContain('"notifications_select_own"');
    expect(sql).not.toContain('notifications_insert');
  });
});

describe('notificationService', () => {
  it('okundu işaretleme doğru satırı günceller', async () => {
    vi.resetModules();

    const calls: any[] = [];

    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        from: (table: string) => ({
          update: (patch: any) => ({
            eq: (column: string, value: string) => {
              calls.push({ table, patch, column, value });
              return {
                eq: () => ({ error: null }),
                error: null,
                then: (resolve: any) => resolve({ error: null }),
              };
            },
          }),
        }),
      },
    }));

    const { notificationService } = await import('../notificationService');
    await notificationService.markAsRead('notif-1');

    expect(calls[0]).toMatchObject({
      table: 'notifications',
      patch: { is_read: true },
      column: 'id',
      value: 'notif-1',
    });

    vi.doUnmock('../../lib/supabase');
    vi.resetModules();
  });
});
