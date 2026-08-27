# Supabase — migration uygulama rehberi

Bu ortamdan (Claude Code) canlı Supabase projesine **erişim yok**: ne
`SUPABASE_ACCESS_TOKEN` var ne de proje anahtarları. Bu yüzden migration'lar
yalnızca repoya yazılıyor; veritabanına **sizin uygulamanız** gerekiyor.

## Tek seferlik kurulum

```bash
npx supabase login                      # tarayıcıda token alır
npx supabase link --project-ref <REF>   # REF: Supabase Studio → Project Settings → General
```

## Durum

`20260825000000`'e kadar olan migration'ların tamamı canlı projeye uygulandı.
`20260824000000_drop_co2_impact_tracking.sql` ve
`20260825000000_phone_privacy_and_message_integrity.sql` CLI çalışmadığı için
**Supabase Studio'nun SQL editöründen elle** çalıştırıldı.

**`20260827000000_backend_integrity_fixes.sql` HENÜZ UYGULANMADI.** Bu dosya
şemadaki bütünlük boşluklarını kapatıyor (durum kısıtları, bir teklife tek
takas, değerlendirme kuralları, `increment_listing_view()`,
`accept_trade_offer()`, `conversations.last_message_id`). Uygulanmadan önce
uygulamanın şu kısımları çalışmaz:

| Kod | Uygulanmazsa |
| --- | --- |
| `listingService.incrementViewCount` | `increment_listing_view() does not exist` — görüntülenme sayacı artmaz (sessizce loglanır) |
| `tradeService.acceptOffer` | `accept_trade_offer() does not exist` — teklif kabul edilemez |
| `messageService.getConversations` | `last_message` embed'i çözülemez — konuşma listesi boş döner |

Uygulamadan önce dosyayı okuyun: içinde geriye dönük **veri düzeltmesi** yapan
ifadeler var (aynı teklife bağlı fazla `trades` satırlarının, tekrar eden
değerlendirmelerin ve kendine yazılmış değerlendirmelerin silinmesi; kümenin
dışına düşmüş `status` değerlerinin normalize edilmesi). Bunlar kısıtları
eklemeden önce zorunlu, ama ne sildiğini görmek isterseniz karşılık gelen
`select` sorgularını önce elle çalıştırın.

> **ÖNEMLİ — migration geçmişi senkron değil.** Studio'dan elle çalıştırılan
> SQL, `supabase_migrations.schema_migrations` tablosuna kayıt DÜŞMEZ. Yani
> CLI hâlâ bu dosyaları "uygulanmamış" sanıyor ve bir sonraki `db push`
> hepsini yeniden çalıştırmayı dener. Çoğu ifade idempotent
> (`if not exists`, `create or replace`, `drop policy if exists`) ama
> `alter table ... drop column` gibi olanlar değil. CLI tekrar çalışır hale
> gelince önce geçmişi düzeltin:
>
> ```bash
> # 1. Yerel dosyalar ile canlı geçmiş arasındaki farkı gör
> npx supabase migration list --linked
>
> # 2. "Remote" sütunu boş görünen HER dosyayı uygulanmış olarak işaretle.
> #    Versiyon = dosya adının başındaki zaman damgası. Hepsi tek çağrıda:
> npx supabase migration repair --linked --status applied \
>   $(ls supabase/migrations/*.sql | xargs -n1 basename | cut -d_ -f1)
> ```
>
> `repair` yalnızca geçmiş tablosunu düzeltir, hiçbir SQL çalıştırmaz — şemaya
> dokunmaz. Bunu yaptıktan sonra `db push` yalnızca gerçekten yeni olan
> dosyaları çalıştırır.

## Değişiklikleri uygulama

```bash
npx supabase db push
```

Komut, `supabase/migrations/` altındaki dosyalardan canlıda **henüz
uygulanmamış** olanları sırayla çalıştırır.

## Şema değişince: tipleri yeniden üretme

```bash
npx supabase gen types typescript --linked > /tmp/supabase.ts \
  && mv /tmp/supabase.ts src/types/supabase.ts
```

Çıktıyı doğrudan `> src/types/supabase.ts` şeklinde yönlendirmeyin: shell
dosyayı komut çalışmadan ÖNCE sıfırlar, komut hata verirse geriye boş bir
dosya kalır ve proje derlenmez. Önce geçici dosyaya yazıp sonra taşıyın.

`src/types/supabase.ts` şu an elle canlı şemaya göre düzeltilmiş durumda
(bkz. dosyadaki Functions bloğunun üstündeki not). CLI tekrar çalışınca
yeniden üretilmeli.

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
