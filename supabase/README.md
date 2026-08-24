# Supabase — migration uygulama rehberi

Bu ortamdan (Claude Code) canlı Supabase projesine **erişim yok**: ne
`SUPABASE_ACCESS_TOKEN` var ne de proje anahtarları. Bu yüzden migration'lar
yalnızca repoya yazılıyor; veritabanına **sizin uygulamanız** gerekiyor.

## Tek seferlik kurulum

```bash
npx supabase login                      # tarayıcıda token alır
npx supabase link --project-ref <REF>   # REF: Supabase Studio → Project Settings → General
```

## Değişiklikleri uygulama

```bash
npx supabase db push
```

Komut, `supabase/migrations/` altındaki dosyalardan canlıda **henüz
uygulanmamış** olanları sırayla çalıştırır.

## Bu dalda uygulanmayı bekleyen migration'lar

| Dosya | Ne yapıyor |
| --- | --- |
| `20260820000000_needs_system_and_trade_locking.sql` | `needs` tablosu (İhtiyaç sistemi), `listings.looking_for_categories`, `profiles.interests` / `wanted_categories`, teklif ömrü (`trade_offers.expires_at`), **ilan kilitleme düzeltmesi** |
| `20260820100000_notifications_and_trade_cancellation.sql` | `notifications` tablosu + bildirim trigger'ları ("Aradığın bulundu" dahil), takas iptal nedeni |
| `20260820200000_blocking_and_message_notification_fix.sql` | `blocked_users` (engelleme) + RLS, sohbet kartlarının bildirim üretmemesi |

Üçü de boş bir PostgreSQL 16 üzerinde uçtan uca çalıştırılıp davranışları
doğrulandı (ayrıntı: `swaloop-urun-sistem-tasarimi.md` §4.2, §4.5, §4.10).
Doğrulanamayan tek şey RLS'in gerçek `auth.uid()` oturumundaki davranışı —
onu canlıda deneyin.

## Uyguladıktan sonra: tek seferlik backfill

Eski (hatalı) kilitleme mantığı yüzünden takasla ilgisi olmadığı hâlde
`in_trade` kalmış ilanlar olabilir. Önce listeyi görün:

```sql
select l.id, l.title, l.owner_id
from public.listings l
where l.status = 'in_trade'
  and not exists (
    select 1
    from public.trade_offer_items i
    join public.trades t on t.offer_id = i.offer_id
    where i.listing_id = l.id
      and t.status not in ('completed', 'cancelled')
  );
```

Sonucu inceledikten sonra düzeltin:

```sql
update public.listings set status = 'active' where id in ( ... );
```

## İsteğe bağlı: süresi geçen teklifleri otomatik kapatma

`expire_stale_trade_offers()` fonksiyonu hazır ama zamanlanmış çalışmıyor.
Elle:

```sql
select public.expire_stale_trade_offers();
```

pg_cron etkinleştirilirse (Supabase Studio → Database → Extensions):

```sql
select cron.schedule(
  'expire-offers', '*/15 * * * *',
  $$select public.expire_stale_trade_offers()$$
);
```

## Frontend ortam değişkenleri

`.env` (repoda yok, gitignore'lu):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```
