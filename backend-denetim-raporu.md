# Backend denetim raporu — 27 Ağustos 2026

Kapsam: `supabase/migrations/` (19 dosya), `supabase/tests/`, `supabase/config.toml`
ve `src/services/` (13 dosya) + tüm RLS politikaları.

**Yöntem.** Bulguların tamamı tahmin değil, çalıştırılarak doğrulandı:
`supabase/tests/00_supabase_stub.sql` + 19 migration boş bir PostgreSQL 16'ya
sırayla uygulandı, ardından `set role authenticated` ve sahte `auth.uid()` ile
saldırgan/kurban senaryoları **gerçek RLS politikaları altında** çalıştırıldı.
Aşağıdaki çıktı blokları o oturumdan alınmıştır.

Bu raporda hiçbir kod değişikliği yapılmadı. `npm run lint`, `npm test` (32/32)
ve `npm run build` tarama öncesi ve sonrasında temiz.

Görsel sürüm: <https://claude.ai/code/artifact/db63d34d-f72e-4654-8f6e-7a7db025e553>

| Ağırlık | Adet |
| --- | --- |
| Kritik | 4 |
| Yüksek | 8 |
| Orta | 11 |
| Doğru kurulmuş | 5 |

---

## Kritik

### 01 — Şema sıfırdan kurulamıyor: migration zinciri 3. dosyada kırılıyor

`supabase/migrations/20260818130000_sync_remote_schema_structure.sql:206`

Bu dosya `trg_sync_listing_favorite_count` trigger'ını kuruyor, ama dayandığı
`public.sync_listing_favorite_count()` fonksiyonu bir sonraki dosyada
(`20260818135000`) tanımlanıyor. `20260818120000`'in boşaltılma gerekçesindeki
hatanın aynısı, bir satır aşağıda tekrar edilmiş.

```
$ for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done
✅ 20260818053823_create_profiles_table.sql
✅ 20260818120000_add_listing_fields.sql
❌ 20260818130000_sync_remote_schema_structure.sql
   ERROR: function public.sync_listing_favorite_count() does not exist
```

Fonksiyon tanımı öne alındığında kalan 17 migration sorunsuz uygulanıyor — tek
kırık halka bu.

**Sonuç:** `supabase db reset`, yeni bir geliştirici ortamı, CI ve
`supabase/tests/` altındaki SQL testleri çalıştırılamaz. Şemanın tek gerçek
kopyası şu an canlı veritabanı; depo onu yeniden üretemiyor.

### 02 — Kullanıcı kendi teklifini kendi kabul edip karşı tarafın ilanını kalıcı olarak piyasadan silebiliyor

`20260819060000_enable_rls_missing_tables.sql` — `trade_offers_update_parties`,
`trades_insert_parties`, `trades_update_parties`

UPDATE politikaları "gönderen VEYA alan" diyor; hangi tarafın hangi geçişi
yapabileceğini kimse kontrol etmiyor. Teklifi gönderen kişi, karşı taraf hiç
dokunmadan şu zinciri tek başına yürütebiliyor:

1. Kurbana teklif gönderir ve kurbanın ilanını `requested` kalem olarak ekler.
2. Kendi teklifini `status = 'accepted'` yapar.
3. `trades` satırını kendi açar → `lock_listings_on_trade_start` tetiklenir,
   **kurbanın ilanı `in_trade` olur** ve keşiften düşer.
4. `status = 'completed'` yapar → **ilan `traded` olur**, bir daha geri gelmez.
5. Kurbanın `completed_trades` sayacı artar; kurbana değerlendirme yazma hakkı
   da doğar (bkz. 05).

```
-- set role authenticated; auth.uid() = saldırgan
>>> 3) trades satırını kendisi açıyor
 aaaa...0001 (saldırganın ilanı)      | in_trade
 aaaa...0002 (KURBANIN ilanı)         | in_trade

>>> 4) Tek başına completed yapıyor
 aaaa...0002 (KURBANIN ilanı)         | traded
```

**Sonuç:** Publishable (anon) anahtarla, arayüze hiç girmeden, herhangi bir
kullanıcının herhangi bir ilanı kalıcı olarak takasa kapatılabilir.

### 03 — Teklife alakasız üçüncü kişilerin ilanları eklenebiliyor

`20260819060000` — `trade_offer_items_insert_own_offer`

Politika yalnızca "kalemi ekleyen, teklifin göndereni mi?" diye bakıyor. Eklenen
`listing_id`'nin teklifin taraflarından birine ait olduğu hiç doğrulanmıyor.

```
>>> Teklife TAMAMEN ALAKASIZ 3. kişinin ilanı eklendi: 1 satır
>>> ... takas başlayınca:
 aaaa...0004 | 4444... (3. kişi) | in_trade
```

**Sonuç:** 02 ile birleşince tek bir hesap, döngüde çalıştırılan birkaç istekle
platformdaki *bütün* ilanları `traded` durumuna çekebilir. Servisi tamamen
durduran bir açık.

### 04 — Giriş yapmamış herkes tüm kullanıcıların telefon ve e-postasını okuyabiliyor

`profiles_select_all → using (true)` · `20260825000000` bunu "bilinen kalan
boşluk" olarak zaten not etmiş.

`20260825000000`, telefon sızıntısını kapatmak için `phone_exists()` RPC'sini
ekledi ve tüm join'leri açık kolon listesine çevirdi. Ama tablonun kendisi
`anon` rolüne hâlâ tamamen açık:

```
set role anon;  -- hiç giriş yapılmamış
select id, phone, email from public.profiles;

 1111... | +905550000001 | saldirgan@x.com
 2222... | +905550000002 | kurban@x.com
```

**Sonuç:** Tüm kullanıcı tabanının telefon + e-posta listesi tek bir HTTP
isteğiyle dışarı çıkar; `phone_exists()` sertleştirmesi bu boşluk açıkken hiçbir
şey korumuyor. Çözüm o dosyanın kendi notunda yazıyor: güvenli kolonları gösteren
bir `profiles_public` view'ı + `profiles`'a "sadece kendi satırın" SELECT
politikası.

---

## Yüksek

### 05 — Güven puanı sınırsız manipüle edilebiliyor; 10'dan büyük puan trigger'ı çökertiyor

`reviews` tablosu — `20260818130000` (şema) + `20260819060000` (RLS) +
`20260819120000` (trigger)

Üç kontrol birden eksik: `rating` için aralık CHECK'i yok, `(trade_id,
reviewer_id)` için unique yok, `reviewed_user_id`'nin gerçekten o takasın karşı
tarafı olduğu doğrulanmıyor.

```
>>> Aynı takasa aynı kişiden 3 adet 0 puan
 2222... | trust_score 1.50 | average_rating 0.00 | review_count 3

>>> rating = 999
ERROR: numeric field overflow
  CONTEXT: PL/pgSQL function recalc_trust_score(uuid) line 26
```

`average_rating numeric(3,2)` 10 ve üstünü tutamıyor: tek bir büyük `rating`
değeri o kullanıcının bütün değerlendirme akışını kalıcı olarak hataya sokuyor.

### 06 — Döngüye katılan biri döngünün sahipliğini kendine alabiliyor

`20260819060000` — `loops_update_creator_or_participant`

Politikada `WITH CHECK` yok. Postgres bu durumda `USING` ifadesini yeni satır
için de kullanır — saldırgan katılımcı olduğu için ifade yine doğru kalır.

```
>>> update public.loops set creator_id = <saldırgan>, title = 'Ele geçirildi';
 1111... (saldırgan) | Ele geçirildi
```

Sahipliği aldıktan sonra `completeLoop()`'u da çağırabilir.

### 07 — Aynı kullanıcı aynı döngüye defalarca katılıp rozet sayacını şişirebiliyor

`loop_participants` — `(loop_id, user_id)` unique index yok ·
`src/services/loopService.ts:222`

`joinLoop()` ne mükerrer katılımı, ne ilanın katılana ait olduğunu, ne de
döngünün hâlâ `matching` olduğunu kontrol ediyor. Katılımcı kendi satırının
`status`'unu `completed` yapabildiği için `completed_loops` istenildiği kadar
artırılabiliyor (doğrulandı: 2 katılım → `completed_loops = 2`). Ayrıca
"say, sonra kilitle" adımı atomik değil; eşzamanlı katılımda `max_participants`
aşılabilir.

### 08 — İlan sahibi takas kilidini tek satırla delebiliyor

`listings_update_own` · `src/services/listingService.ts:596`

`updateListing()` istemciden gelen `status` değerini olduğu gibi geçiriyor.

```
>>> ilan in_trade iken sahibi active yapıyor
 kilit_sonrasi_durum: active
```

**Sonuç:** `20260820000000`'in tüm kilitleme mantığı istemci tarafından iptal
edilebilir. `status` geçişleri bir trigger'la (izinli geçiş matrisi) korunmalı.

### 09 — Admin ilan kaldırma sessizce çalışmıyor, üstelik "kaldırıldı" diye denetim kaydı yazıyor

`src/services/adminService.ts:394` · `listings` tablosunda admin UPDATE
politikası yok

Tek UPDATE politikası `auth.uid() = owner_id`. Postgres hata vermez, sadece 0
satır günceller; Supabase istemcisi `error: null` döner.

```
-- auth.uid() = admin (profiles.is_admin = true)
update public.listings set status='removed' where id='aaaa...0001';
 admin_moderasyon_sonrasi: active   ← değişmedi, hata da yok
```

Fonksiyon `true` döner, arayüz "İlan kaldırıldı" der ve `admin_audit_logs`'a
gerçekleşmemiş bir işlem için kayıt düşer.

### 10 — Admin panelindeki tüm takas sayıları sıfır görünüyor

`src/services/adminService.ts:153` (getKPIs), `:252` (getRecentActivity)

`trades`, `trade_offers`, `trade_events` SELECT politikaları yalnızca "takasın
tarafı" diyor; admin için bypass yok.

```
-- auth.uid() = admin
 admin_gordugu_trades: 0 | admin_gordugu_offers: 0
```

Panel "veri yok" demiyor, gerçek gibi görünen **yanlış** sıfırlar gösteriyor.

### 11 — `profiles.phone` benzersiz değil ve istemciden yazılabiliyor

`20260818053823` (unique yok) · `src/services/authService.ts:505`

`createProfile` telefonu `auth.users.phone`'dan değil formdan alıyor; kolonda
unique kısıt yok.

```
>>> saldırgan kendi satırına kurbanın numarasını yazıyor
 1111... | +905550000002
 2222... | +905550000002   ← ikisi de aynı
```

Kayıt akışının kapısı olan `phone_exists()` bu tabloya baktığı için, saldırgan
henüz kayıtlı olmayan bir numarayı "kayıtlı" gösterip o numaranın sahibinin
kaydolmasını engelleyebilir.

### 12 — SMS ikinci faktörü yalnızca istemci tarafında bir engel

`src/services/authService.ts:390` (loginWithPassword)

`signInWithPassword` *başarıyla* çalışıp geçerli bir oturum jetonu üretiyor,
sonra istemci `signOut()` çağırıp OTP istiyor. Şifreyi bilen biri Supabase Auth
uç noktasına doğrudan giderse ikinci adım hiç devreye girmez. Gerçek MFA
Supabase'in `auth.mfa` desteğiyle kurulmalı (`config.toml`'da
`auth.mfa.phone.verify_enabled = false`).

---

## Orta

### 13 — Karşı teklif bildirimi hep "Yeni takas teklifi" diyor

`src/services/tradeService.ts:706` · `notify_on_new_offer` (`20260820100000`)

Trigger, karşı teklif olup olmadığını `new.parent_offer_id`'ye bakarak INSERT
anında belirliyor. `createCounterOffer()` ise `parent_offer_id`'yi *sonraki* bir
UPDATE ile yazıyor; trigger çalıştığında alan hep NULL.

```
    type     |       title
 trade_offer | Yeni takas teklifi   ← counter_offer olmalıydı
```

Düzeltme tek satır: `parent_offer_id`'yi `createTradeOffer`'ın insert payload'ına
geçirmek.

### 14 — `disputes` tablosuna hiçbir kod yazmıyor

`supabase/migrations/20260819090000` · `src/pages/trades/DisputePage.tsx:75`

`DisputePage` aslında `reportService.createReport()` çağırıyor, yani `reports`
tablosuna yazıyor. Depoda `disputes`'a INSERT eden tek satır yok. Zincirleme:
admin panelindeki "Anlaşmazlıklar" sekmesi kalıcı olarak boş;
`trades.status = 'disputed'` hiç oluşmuyor; `release_listings_on_trade_end()`
içindeki "disputed'ta kilidi koru" dalı hiç çalışmıyor; `resolveDispute()` hiç
çağrılamıyor.

### 15 — Deponun kendi SQL test paketi çalışmıyor

`supabase/tests/trade_flow_test.sql` · `supabase/tests/README.md`

```
--- 5) trust_score_is_average: f     ← test 4.50 bekliyor, gerçek 4.65
--- 6) ERROR: update or delete on table "reviews" violates foreign key
       constraint "trust_events_review_id_fkey" on table "trust_events"
--- 7) ERROR: function public.increment_listing_view(...) does not exist
```

(a) `trust_score` ortalama değil, `%70 puan + %30 güvenilirlik` formülü — testin
beklentisi yanlış. (b) `reviews` üzerinde DELETE trigger'ı hiç yok, üstelik
`trust_events` FK'sı silmeyi zaten engelliyor. (c) `increment_listing_view()`
depoda hiçbir yerde tanımlı değil.

### 16 — Kodun dayandığı CHECK constraint'ler depoda yok (repo şeması ≠ canlı şema)

`src/services/tradeService.ts:180`, `:460`, `:727`

`tradeService` üç yerde `trade_offers_status_check` / `trades_status_check`
constraint'lerine dayanarak davranış kuruyor. Hiçbiri migration'larda yok:

```
select count(*) from pg_constraint where conname in
 ('trade_offers_status_check','trades_status_check','listings_status_check');
 0

trade_offers.status varsayılanı: 'offer_sent'::text   ← kod hep 'pending' yazıyor
```

`supabase/README.md`'nin "migration geçmişi senkron değil" uyarısı burada somut
bir şema farkına dönüşüyor.

### 17 — Mesafe filtresi ve görüntülenme sayacı hiç çalışmıyor

`src/services/listingService.ts:245`, `:266`

Hiçbir sorgu `distance_km` hesaplamıyor (ilanlarda `latitude`/`longitude`
dururken kullanılmıyor) ve `view_count`'u artıran kod yolu yok. Her ilan "0 km"
görünüyor, bu yüzden `searchListings`'in `maxDistance` filtresi ile
`SwipeMatchPage`'in mesafe eşiği hiçbir şeyi elemiyor.

### 18 — Silinen ilanların ve eski avatarların dosyaları Storage'da kalıyor

`src/services/listingService.ts:640` · `authService.ts:20`

`deleteListing` yalnızca satırı siliyor; bucket'taki nesneler kalıyor.
`uploadAvatar` her yüklemede yeni dosya adı üretip eskisini bırakıyor.
Adlandırma tuzağı: `listing_images.storage_path` aslında yol değil, tam public
URL tutuyor.

### 19 — Liste ekranlarında N+1 sorgu ve sayfalama yok

`tradeService.ts:368` (fullyHydrate) · `messageService.ts:87`
(mapConversationRow)

`fullyHydrate` her teklif için 3 sorgu, `mapConversationRow` her konuşma için 2
sorgu atıyor. `getAllListings`, `getAllTrades`, `communityService.getPosts` ve
`getConversations` hiç `limit`/sayfalama kullanmıyor; `getPosts` her gönderinin
*tüm* beğeni satırlarını indiriyor. PostgREST'in 1000 satır tavanı bunu bir süre
gizler, sonra sessizce eksik veri döndürür.

### 20 — Süresi geçen teklifleri kapatan iş hiç çalışmıyor

`expire_stale_trade_offers()` — `20260820000000`

Fonksiyon doğru ve doğrulandı, ama pg_cron kurulu değil ve onu çağıran
zamanlanmış iş yok. Kullanıcı ekranda "48 saat" görüyor, teklif kendiliğinden
kapanmıyor.

### 21 — Bir arama filtresi sertleştirilmiş, diğeri değil

`listingService.ts:51` (sanitizeSearchQuery) · `needService.ts:162`
(sanitizeForFilter)

İlki `, ( ) " \ % _ *` karakterlerinin hepsini atıyor ve testleri var; ikincisi
`_` ve `"` karakterlerini bırakıyor — ikisi de `ilike`/PostgREST açısından
anlamlı.

### 22 — Doğrulama rozeti hiç yanmıyor

`trust_profiles.verification_level` · `authService.ts:165` ·
`listingService.ts:204`

Rozet `verification_level === 'id_verified'` koşuluna bağlı. Kolon
`'başlangıç'` varsayılanıyla açılıyor; onu değiştiren kod yolu, trigger veya
kimlik doğrulama akışı yok.

### 23 — Etkinlikler, rozetler, ataş ve gizemli kutu hâlâ bellekte

`src/services/communityService.ts:38-41`

`eventsStore`, `badgesStore`, `paperclipStore`, `mysteryItemsStore` modül
seviyesinde `let` değişkenleri; F5'te kayboluyor. Dosyanın kendi yorumunda
kapsam dışı olduğu yazıyor — burada hata olarak değil, kapatılmamış backend
boşluğu olarak listeleniyor.

---

## Küçük notlar

- **Ölü kolon:** `community_posts.comments_count` — yorum tablosu ve UI'ı yok.
- **Tip kayması:** `src/types/supabase.ts` `Functions` bloğunda yalnızca
  `phone_exists` var; `is_admin`, `is_blocked_between`,
  `expire_stale_trade_offers`, `push_notification`, `slugify_tr`,
  `recalc_trust_score` eksik. `Enums` boş görünüyor ama
  `trade_cancellation_reason` enum'ı canlıda var.
- **RLS:** `trades_update_parties` ve `trade_offers_update_parties`
  politikalarında da `WITH CHECK` yok (06'nın aynısı) — taraf `receiver_id`'yi
  değiştirebilir.
- **RLS:** `trust_events_select_own` yüzünden admin kimsenin güven geçmişini
  göremiyor.
- **Yorum kayması:** `20260818140000`, konuşmalarda
  `participant_one_id < participant_two_id` kısıtı olduğunu söylüyor; gerçekte
  yalnızca `least/greatest` üzerine unique index var.
- **Yorum kayması:** Kök `CLAUDE.md`, `.env` eksikse uygulamanın açılışta hata
  fırlattığını söylüyor; `src/lib/supabase.ts` artık fırlatmıyor.
- **Yerel kurulum:** `config.toml`'da `auth.sms.enable_signup = false` ve Twilio
  kapalı, ama tüm kayıt akışı telefon+OTP üzerine kurulu.
- **Sayaç:** `getKPIs` aktif döngüleri `loops.status = 'active'` ile sayıyor;
  `loopService` `matching`/`locked`/`in_delivery` yazıyor → hep 0.
- **Geriye dönük:** `20260819120000` ve `20260820000000` sonundaki backfill
  sorguları hiç çalıştırılmamış olabilir; canlıda bir kez kontrol edilmeli.
- **Sözleşme:** `reviews`'ta `trustworthiness_rating` kolonu yok;
  `submitReview` bu alanı genel `rating` ile dolduruyor.

---

## Doğru kurulmuş — bozmayın

- **Bildirim yazma kapalı.** `notifications` için INSERT politikası bilinçli
  olarak yok; sahte bildirim denemesi RLS'e takıldı (doğrulandı).
- **Mesaj değişmezliği.** `enforce_message_immutability` trigger'ı `is_read`
  dışındaki her alanı kilitliyor.
- **Storage klasör izolasyonu.** Her iki bucket da
  `(storage.foldername(name))[1] = auth.uid()` deseniyle korunuyor.
- **`is_admin` yükseltmesi engelli.** `prevent_self_admin_escalation` trigger'ı
  kullanıcının kendi bayrağını değiştirmesini geri alıyor.
- **Profil join'leri dar.** Tüm servislerde `profiles(*)` yerine açık kolon
  listesi (tablonun kendisi hâlâ açık, bkz. 04).

---

## Önerilen sıra

| # | İş | Bulgu | Boyut |
| --- | --- | --- | --- |
| 1 | `profiles` SELECT'i daraltıp `profiles_public` view'ı açmak | 04 | Küçük |
| 2 | Takas durum geçişlerini `SECURITY DEFINER` fonksiyonlara taşımak; `trades`/`trade_offers` doğrudan UPDATE'ini kapatmak | 02, 08 | Orta |
| 3 | `trade_offer_items`'a "ilan taraflardan birine ait" kısıtı | 03 | Küçük |
| 4 | `sync_listing_favorite_count()` tanımını trigger'dan önceye almak | 01 | Tek satır |
| 5 | `reviews`: rating CHECK + `(trade_id, reviewer_id)` unique + karşı taraf doğrulaması | 05 | Küçük |
| 6 | Eksik `WITH CHECK`'ler (`loops`, `trades`, `trade_offers`) + `loop_participants` unique index | 06, 07 | Küçük |
| 7 | Admin için okuma/moderasyon politikaları (`is_admin()` ile) | 09, 10 | Küçük |
| 8 | `profiles.phone` unique + kaynağı `auth.users.phone`'a bağlamak | 11 | Orta |
| 9 | Eksik CHECK constraint'leri migration'a yazıp `supabase db pull` ile şemayı depoya sabitlemek | 16 | Orta |
| 10 | SQL test paketini gerçek davranışa göre düzeltip CI'a bağlamak | 15 | Orta |
