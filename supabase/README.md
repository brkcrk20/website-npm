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

**`20260827000000_backend_integrity_fixes.sql`,
`20260828000000_backend_hardening.sql`,
`20260829000000_listing_expiry.sql`,
`20260830000000_trade_column_immutability.sql` ve
`20260831000000_rpc_grants_and_row_guards.sql` ve
`20260901000000_seed_categories.sql` ve
`20260902000000_single_trade_per_listing.sql` ve
`20260903000000_align_need_match_notifications.sql` ve
`20260904000000_listing_column_integrity.sql` ve
`20260905000000_trade_event_and_trust_integrity.sql` ve
`20260906000000_missing_fk_indexes.sql` HENÜZ UYGULANMADI.**

`20260827000000` şemadaki bütünlük boşluklarını kapatıyor (durum kısıtları,
bir teklife tek takas, değerlendirme kuralları, `increment_listing_view()`,
`accept_trade_offer()`, `conversations.last_message_id`).

`20260828000000` kod tarafında hâlâ "varsayım" olan kuralları kısıta
çeviriyor: `profiles.phone`/`profiles.email` artık istemci rollerinde
okunamıyor, ilan kilidi sahibi tarafından çözülemiyor, ilan kaldırma
`delete_listing()` üzerinden arşivleniyor, teklifi yalnızca alıcı yanıtlıyor,
takas iki tarafın onayı olmadan tamamlanamıyor.

`20260829000000` ilanlara ömür veriyor (rapor md. 119): her ilan 30 gün
yayında kalıyor, bitmeden 3 gün önce sahibi uyarılıyor, süre dolunca ilan
`expired` oluyor (silinmiyor) ve `renew_listing()` ile geri alınıyor.

`20260830000000` iki kritik güvenlik açığını kapatıyor. `trades` ve
`trade_offers` üzerindeki UPDATE politikaları kolon ayrımı yapmıyor
(Postgres'te kolon bazlı RLS yoktur) ve durum tetikleyicileri
`before update OF STATUS` bağlı olduğu için diğer kolonlara yazan bir
UPDATE'i hiç görmüyorlar. Sonuç:

* tek bir `PATCH /rest/v1/trades` isteği ile onay damgaları uydurulup takas
  tek taraflı "tamamlandı" yapılabiliyordu — karşı tarafın ilanı kalıcı
  olarak `traded` oluyor, iki tarafın güven sayacı artıyor ve saldırgan hiç
  gerçekleşmemiş takas üzerinden değerlendirme yazabiliyordu;
* bir teklifin `receiver_id`'si sonradan saldırganın kendisiyle
  değiştirilip teklif kendi kendine kabul edilebiliyordu.

Kapatma yöntemi kolon değişmezliği tetikleyicileri + `sender_id <>
receiver_id` kısıtları. Regresyon testi:
`supabase/tests/trade_immutability_test.sql`.

`20260831000000` dört boşluğu daha kapatıyor:

* **`push_notification()` herkese açıktı.** `security definer` bir fonksiyon
  Postgres'te varsayılan olarak PUBLIC'e açıktır; `notifications` tablosunda
  kullanıcıya INSERT politikası olmaması bu yüzden yeterli değildi. `anon`
  dahi bu RPC ile herhangi bir kullanıcıya, istediği bağlantıyı taşıyan
  sahte bir bildirim yazabiliyordu. `recalc_trust_score()` ve
  `expire_stale_trade_offers()` de aynı sebeple kapatıldı.
  (`is_admin()` / `is_blocked_between()` bilerek açık: RLS politikaları
  onları sorguyu atan rolün yetkisiyle çağırıyor.)
* **Sohbetin karşı tarafı değiştirilebiliyordu** — bir katılımcı
  `participant_two_id`'yi üçüncü bir kişiye çevirip tüm özel yazışmayı ona
  açabiliyordu.
* **Kabul edilmiş teklifin kalemleri hâlâ silinebiliyordu**; silinen kalem
  yüzünden karşı tarafın ilanı sonsuza kadar `in_trade` kalıyordu.
* **Şikayet/anlaşmazlık kaydına uydurma yönetici kararı yazılabiliyordu**
  (`status='resolved'`, `resolution_note`, `admin_decision`); yönetici
  olmayanın INSERT'inde bu alanlar artık varsayılana çekiliyor.

`20260901000000` `categories` tablosunu tohumluyor. Tabloyu dolduran hiçbir
migration ya da seed yoktu: canlıda satırlar elle eklenmiş ama sıfırdan
kurulan her ortamda (`supabase db reset`, yeni staging, yerel test) tablo
boş kalıyor ve **ilan verme tamamen çalışmıyor** —
`listings.category_id` bir yabancı anahtar ve `categoryUuidBySlug()` slug
bulamayınca null dönüyor. `on conflict (slug) do nothing` olduğu için
canlıdaki mevcut satırlara dokunmaz, yalnızca eksikleri ekler.

`20260902000000` aynı ilanın iki takasa birden kilitlenmesini engelliyor.
`accept_trade_offer()` teklifi kilitliyordu ama teklifin ÜRÜNLERİNİN başka
bir takasa girip girmediğine bakmıyordu: B, aynı ilanını isteyen iki
teklifi de kabul edebiliyor ve ürünü iki kişiye birden söz vermiş oluyordu
(yerel PostgreSQL üzerinde doğrulandı). Hangi takas önce tamamlanırsa ilan
`traded` oluyor, diğer takasın karşı tarafı artık var olmayan bir ürünü
bekliyordu.

`20260903000000` "Aradığın bulundu" bildirimini ekrandaki eşleşmeyle aynı
kurala bağlıyor. DB tetikleyicisi 3+ harfli HERHANGİ bir kelimenin ilan
başlığında geçmesine bakıyor ve dolgu kelimeleri elemiyordu: "Bir bisiklet
arıyorum" ihtiyacındaki "bir", içinde "bir" geçen HER ilanla eşleşiyordu
("Birinci el kitap", "Bira bardağı"). Üstelik istemcinin 40 puanlık eşiği
bu ilanları elediği için kullanıcı bildirime dokunup "Aradıklarım"
ekranında o ilanı bulamıyordu. İki taraf artık aynı sadeleştirmeyi
(`fold_tr` ↔ `foldTurkish`), aynı dolgu kelime listesini ve aynı eşiği
kullanıyor.

`20260904000000` ilan kolonlarını kilitliyor. `listings_update_own`
politikası sahibe TÜM kolonları açıyor (Postgres'te kolon bazlı RLS yok):
`view_count`/`favorite_count` tek bir `PATCH /rest/v1/listings` ile
şişirilebiliyor — `20260827000000`'in `increment_listing_view()` RPC'si
politika kapatılmadığı için hiçbir şeyi kapatmamış; `created_at` ileri bir
zamana yazılarak keşif sıralaması (`order created_at desc`) kalıcı olarak
ele geçirilebiliyor; UNIQUE olan `slug` değiştirilerek daha önce
paylaşılmış `/ilan/<slug>` bağlantıları kırılabiliyordu. Ayrıca durum
tetikleyicisi yalnızca UPDATE'e bağlı olduğu için ilan doğrudan
`status='in_trade'` ile OLUŞTURULABİLİYOR ve bir daha ne düzeltilebiliyor
ne kaldırılabiliyordu. `condition` de kapalı kümeye alındı.

`20260905000000` takasın geçmişini ve güven sayaçlarını kaynağına
bağlıyor. `trade_events_insert_parties` yalnızca "ekleyen taraflardan biri
mi?" diye soruyor; `event_type`/`note` serbest ve `actor_id is null`
açıkça izinliydi. Yani takasın herhangi bir tarafı `('verified', 'İki
taraf da teslimatı onayladı.')` satırını SİSTEM olayı gibi yazabiliyordu —
tabloda DELETE politikası olmadığı için de silinemiyordu. Yönetici
panelinin "son aktivite" akışı ve anlaşmazlık incelemesi doğrudan bu
tablodan besleniyor. Aynı dosyada `recalc_trust_score()` artık
`trust_profiles`'ın kendi sayaçlarını değil `trades` tablosunu okuyor:
kör `+1` ile bozulan bir sayaç artık kendiliğinden onarılıyor.

`20260906000000` eksik yabancı anahtar indekslerini ekliyor. Postgres FK
kolonları için indeks AÇMAZ; en sıcak yol olan `listing_images.listing_id`
indekssizdi ve bu tablo neredeyse her ekranda embed ediliyor, yani her
keşif sayfası yüklemesi bir seq scan demekti. `trades.sender_id` /
`receiver_id` de öyle — takas listelerinin ve `recalc_trust_score()`'un
tamamı bu iki kolondan geçiyor. Yalnızca gerçek bir sorguya ya da bir
cascade'e karşılık gelen indeksler eklendi; ekranları kaldırılmış
`loops`/`community` tabloları kapsam dışı bırakıldı.

**ON BİRİ SIRAYLA uygulanmalı** — `20260828000000`, `20260827000000` ile gelen
`trade_status_rank()` ve `enforce_trade_transition()` üzerine;
`20260829000000` da `20260828000000`'deki `enforce_listing_status_transition()`
ve `release_listings_on_trade_end()` gövdeleri üzerine kuruluyor.

Uygulanmadan önce uygulamanın şu kısımları çalışmaz:

| Kod | Uygulanmazsa |
| --- | --- |
| `listingService.incrementViewCount` | `increment_listing_view() does not exist` — görüntülenme sayacı artmaz (sessizce loglanır) |
| `tradeService.acceptOffer` | `accept_trade_offer() does not exist` — teklif kabul edilemez |
| `messageService.getConversations` | `last_message` embed'i çözülemez — konuşma listesi boş döner |
| `listingService.deleteListing` | `delete_listing() does not exist` — ilan kaldırılamaz |
| `tradeService.confirmReceipt` | `confirm_trade_receipt() does not exist` — teslimat onaylanamaz, takas 5. adımda kalır |
| `authService` profil sorguları | Çalışır ama `phone`/`email` hâlâ herkese açık kalır (kapatılan boşluk açık kalır) |
| `listingService.renewListing` | `renew_listing() does not exist` — "Yenile" düğmesi hata verir |
| İlan süresi (md. 119) | `listings.expires_at` kolonu yok; arayüz süreyi HİÇ göstermez, ilanlar sonsuza kadar yayında kalır |

> **`profiles` kolon yetkisi hakkında.** `20260828000000`, `profiles`
> üzerindeki tablo seviyesi SELECT hakkını `anon`/`authenticated`
> rollerinden alıp yerine `phone` ve `email` DIŞINDAKİ kolonlar için
> kolon bazlı bir grant koyuyor. Sonucu: `select=*` bu tabloda artık
> "permission denied for column phone" veriyor. Servis katmanı bu yüzden
> açık kolon listesi kullanıyor (`authService.PROFILE_COLUMNS`).
> **`profiles`'a ileride kolon eklerseniz** aynı migration'da
> `grant select (yeni_kolon) on public.profiles to anon, authenticated;`
> satırını da yazın, yoksa o kolon istemcide görünmez.

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

## Süresi geçen teklifleri otomatik kapatma

`20260828000000` bunu kendisi kurmayı deniyor: pg_cron mevcutsa
`swaloop-expire-offers` adıyla 15 dakikada bir çalışan bir iş açıyor. Migration
çıktısında hangisinin olduğu yazıyor:

```
NOTICE:  pg_cron: swaloop-expire-offers 15 dakikada bir çalışacak.
NOTICE:  pg_cron yok; expire_stale_trade_offers() elle ... çağrılmalı.
```

İkinci mesajı gördüyseniz pg_cron'u etkinleştirip (Supabase Studio → Database
→ Extensions) migration'ın o bloğunu tekrar çalıştırın, ya da işi elle kurun:

```sql
select cron.schedule(
  'swaloop-expire-offers', '*/15 * * * *',
  $$select public.expire_stale_trade_offers()$$
);
```

Tek seferlik elle çalıştırma:

```sql
select public.expire_stale_trade_offers();
```

`20260829000000` aynı deseni ilanlar için kuruyor: `swaloop-expire-listings`
saatte bir (`7 * * * *`) `public.expire_stale_listings()` çağırıyor.

```sql
select cron.schedule(
  'swaloop-expire-listings', '7 * * * *',
  $$select public.expire_stale_listings()$$
);
```

> **Bu işi kurmak teklif işinden daha kritik.** Süresi dolmuş bir teklif
> kabul edilmeye çalışıldığında `enforce_trade_offer_transition` yine de
> reddediyor — yani iş kurulmasa da kural bir yerde işliyor. İlan tarafında
> böyle bir ikinci kapı YOK: `expire_stale_listings()` hiç çağrılmazsa ilanlar
> sonsuza kadar `active` kalır ve md. 119 kâğıt üzerinde kalır.

İş kurulmazsa kural tamamen kaybolmaz — süresi dolmuş bir teklif kabul
edilemez (`enforce_trade_offer_transition`) — ama teklif listede sonsuza kadar
"bekliyor" görünür.

## Frontend ortam değişkenleri

`.env` (repoda yok, gitignore'lu):

```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
```
