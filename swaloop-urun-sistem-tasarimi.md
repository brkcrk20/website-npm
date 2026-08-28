# Swaloop — Ürün ve Sistem Tasarımı

Bu dosya, 152 maddelik ürün/sistem tasarım raporunun **mevcut kod tabanına
uygulanmış** hâlidir. Rapor "ne olmalı"yı anlatıyor; bu doküman her maddenin
bugün kodda nerede karşılandığını, nerede karşılanmadığını ve hangi fazda
yapılacağını söyler. Madde numaraları rapordaki numaralarla aynıdır
(ör. "md. 30" = raporun 30. maddesi).

İlgili diğer dosyalar: `swaloop-devam-plani.md` (tur tur yapılan işler),
`rapor.txt` (teknik bulgular), `1.4-canli-dogrulama-checklist.md` (elle test).

---

## 1. Ürünün özü

Swaloop'un temel birimi **ürün değil, ihtiyaçtır**.

```
Elimde var  ×  İhtiyacım var  ×  Başkasında var  =  Takas
```

Bu, kod tabanı için somut bir sonuç doğurur: sistemin merkezinde tek bir
nesne (`listings`) olamaz. İki birinci sınıf nesne olmalı:

| Nesne | Anlamı | DB karşılığı |
| --- | --- | --- |
| **İlan** | "Elimde bu var" | `public.listings` |
| **İhtiyaç** | "Buna ihtiyacım var" | `public.needs` *(bu turda eklendi)* |

Eşleştirme motoru bu ikisini birbirine bağlar. Raporun 151. maddesindeki
teşhis — "asıl eksik, İHTİYAÇ kavramının sistemin merkezine yerleştirilmesi" —
bu turun ana işiydi.

### Marka cümlesi
> **İhtiyacın olanı, elindekini takas ederek bul.**

---

## 2. Değişmez kurallar (md. 3, 4, 47, 116, 125)

Sistemde **maddi değer kavramı geçmez**. Bu bir üslup tercihi değil, ürün
kararıdır: bir kez fiyat/değer dili girerse Swaloop "parası olmayan Letgo"
olarak algılanır.

Yasak: fiyat, ₺/TL, "değeri", "piyasa değeri", "üstüne şu kadar ver", "fark",
"satın al", "teklifin değeri", eşdeğerlik hesabı, AI fiyat tahmini.

Kullanılan dil: *veriyorum, arıyorum, teklif ediyorum, ihtiyacım var, takas
etmek istiyorum, takas kabul edildi, takas tamamlandı.*

Kodda uygulanışı:
- `needService.scoreNeedAgainstListing()` bir **uyum** skoru üretir, denklik
  değil; gerekçeleri (`reasons`) kullanıcıya olduğu gibi gösterilebilir
  (md. 39: algoritma açıklanabilir olmalı). Testi:
  `src/services/__tests__/needService.test.ts` → "hiçbir gerekçe parasal bir
  ifade içermez".
- `PaperclipPage`'teki `₺350 Değer` gibi etiketler kaldırıldı, yerine parasal
  olmayan basamak adları kondu (`Başlangıç eşyası`, `Sonraki hedef`…).
- İlan oluşturma ekranındaki "benzer **değerde** tablet" ipucu metni
  temizlendi.

---

## 3. Sistem omurgası (md. 126)

```
KULLANICI → İHTİYAÇ → İLAN → EŞLEŞME → TAKAS TEKLİFİ → KARŞI TEKLİF →
KABUL → KİLİTLEME → TESLİMAT → ONAY → TAMAMLANDI → DEĞERLENDİRME →
GÜVEN PROFİLİ → YENİ İHTİYAÇ
```

Bugünkü durum:

| Halka | Durum | Nerede |
| --- | --- | --- |
| İhtiyaç | ✅ bu turda eklendi | `needs` tablosu, `needService.ts`, `/aradiklarim` |
| İlan | ✅ | `listingService.ts`, `CreateListingPage.tsx` |
| Eşleşme | 🟡 kural tabanlı ilk sürüm | `needService.getMatchesForUser()` |
| Takas teklifi | ✅ | `tradeService.createTradeOffer()`, `MakeOfferPage.tsx` |
| Karşı teklif | ✅ | `/karsi-teklif/:id` (`CounterOfferPage.tsx`) |
| Kabul | ✅ | `acceptOffer()` |
| Kilitleme | ✅ bu turda düzeltildi | `lock_listings_on_trade_start()` |
| Teslimat / onay | ✅ | `advanceTradeStep()`, `TradeProcessPage.tsx` |
| Değerlendirme | ✅ | `submitReview()` |
| Güven profili | ✅ | `trust_profiles` + `20260819120000` migration |
| Yeni ihtiyaç | ✅ | "Aradığın bulundu" bildirimi döngüyü kapatıyor |

---

## 4. Bu turda uygulananlar

### 4.1 İhtiyaç sistemi (md. 77-82, 13, 20-21)

- **Yeni tablo `public.needs`** — `supabase/migrations/20260820000000_needs_system_and_trade_locking.sql`
  - `status`: `active | paused | fulfilled` (DB CHECK + `NeedStatus` tipi,
    ikisinin eşleştiği test edilir).
  - RLS: herkes okuyabilir (md. 77 "bu ürünü arayanlar" listesi buna dayanır),
    sadece sahibi yazabilir.
  - Spam kontrolü (md. 117-118): aynı başlık iki kez açılamaz
    (`needs_user_title_unique_idx`), aynı anda en fazla 20 açık ihtiyaç
    (`enforce_active_need_limit`).
- **`listings.looking_for_categories`** — serbest metin `looking_for`
  KALDI (insan okuması için), yanına makine tarafından okunabilir kategori
  listesi eklendi (md. 20). İlan oluşturmada çoklu seçilebilir çipler.
- **`profiles.interests` / `profiles.wanted_categories`** — bu iki alan
  frontend tipinde vardı ama **hiçbir yere yazılmıyordu**; kayıt formunda
  seçilen değerler sessizce kayboluyordu. Artık kalıcı (md. 13: ilgi alanı ≠
  ihtiyaç; ilki kişiselleştirme, ikincisi eşleştirme motoru girdisi).
- **`src/services/needService.ts`** — CRUD + iki yönlü eşleştirme:
  - `getMatchesForUser()` → "aradıklarına uyan ilanlar" (md. 45/79)
  - `getSeekersForListing()` → "bu ürünü arayan N kişi" (md. 77)
  - `searchNeeds()` → arama ekranındaki "Arayanlar" sekmesi (md. 76)
  - `getPopularNeeds()` → "en çok aranan şeyler" (md. 77)
- **`/aradiklarim` ekranı** (`src/pages/needs/NeedsPage.tsx`) — ihtiyaç ekle /
  duraklat / sil + uyan ilanlar. Boş durumu yol gösterici (md. 89-90),
  yükleme sırasında skeleton (md. 92), durum rengi tek başına anlam taşımıyor
  (md. 98), dokunma alanları 44px (md. 99).
- **Profil → "Aradıklarım (n)"** girişi (md. 82).
- **Arama ekranı: "Verenler" / "Arayanlar" sekmeleri** (md. 76). Aynı kelime
  iki soruyu yanıtlar: kim veriyor, kim arıyor. Swaloop'u klasik ilan
  sitesinden ayıran ayrım bu.
- **İlan detayında "Bu ürünü arayan N kişi var"** + aranan kategori çipleri.

Eşleştirme skoru bilinçli olarak basit ve açıklanabilir (md. 39):

```
+50  ihtiyacın kategorisi = ilanın kategorisi
+40  ihtiyaç metnindeki kelimelerin ilan başlığı/etiketleri ile örtüşmesi
+10  aynı şehir
eşik: 40  (altındakiler gösterilmez — "ilan çöplüğü" üretmemek için, md. 15)
```

### 4.2 Güvenlik düzeltmesi: ilan kilitleme kapsamı (md. 30)

Raporun en kritik teknik bulgusu. Canlıdaki `lock_listings_on_trade_start()`
fonksiyonu, bir takas başladığında kullanıcının **tüm aktif ilanlarını**
`in_trade` yapıyordu; takasla ilgisi olmayan ilanlar da sessizce keşiften
düşüyordu. Bu fonksiyon migration geçmişinde hiç yoktu (bkz.
`20260818130000_sync_remote_schema_structure.sql` başlığındaki "trigger'ların
bir kısmı kapsam dışı" notu), bu yüzden düzeltme iki adımlı:

1. `trades` tablosunda bu fonksiyona bağlı **adı ne olursa olsun** tüm
   trigger'lar `pg_trigger` üzerinden bulunup kaldırılıyor.
2. Fonksiyon yeniden tanımlanıyor: sadece `trade_offer_items.offer_id =
   new.offer_id` olan ilanlar kilitleniyor.

Ayrıca **kilit çözme hiç yoktu** (md. 31): takas iptal edilirse ilanlar
sonsuza kadar `in_trade` kalıyordu. Yeni `release_listings_on_trade_end()`
trigger'ı: `completed` → `traded`, `cancelled` → `active`. `disputed`
bilinçli olarak dışarıda (anlaşmazlık sürerken kilit korunur).

Regresyon testi: `src/services/__tests__/tradeLocking.contract.test.ts`.

**Doğrulama:** migration bu ortamda kurulan geçici bir PostgreSQL 16
üzerinde gerçekten çalıştırıldı (Supabase'e özgü `auth` / `storage` şemaları
taklit edilerek) ve davranış uçtan uca denendi:

- Takas başlayınca **sadece** teklifin iki ilanı `in_trade` oldu; aynı
  kullanıcının takasla ilgisi olmayan ilanı `active` kaldı. (Eski hatanın
  regresyonu buydu.)
- Takas `cancelled` → ilanlar `active`; `completed` → ilanlar `traded`.
- `expires_at` = oluşturulma + 48 saat; `expire_stale_trade_offers()` sadece
  süresi geçmiş **bekleyen** teklifleri kapattı (kabul edilmişe dokunmadı).
- İhtiyaç kısıtları: aynı başlık ikinci kez eklenemedi, 21. açık ihtiyaç
  anlaşılır bir hata ile reddedildi, `fulfilled_at` durumla senkron kaldı.
- Engelleme (§4.10): engelliyken "aradığın bulundu" bildirimi üretilmedi,
  engel kalkınca tekrar üretildi; `authenticated` rolüyle yapılan gerçek RLS
  denemesinde engellenen kullanıcı ne mesaj ne teklif yazabildi ve karşı
  taraf engel kaydını göremedi. Sohbete düşen takas kartı "yeni mesaj"
  bildirimi üretmedi, gerçek mesaj üretti.
- Bildirim trigger'ları (§4.5): kamera ilanı eklenince "Aynasız kamera"
  arayan kullanıcıya `need_matched` bildirimi düştü (doğru başlık, doğru
  `/ilan/<slug>` bağlantısı); teklif → kabul → iptal zinciri iki tarafa
  doğru bildirimleri üretti; aynı ilan+ihtiyaç için ikinci bildirim
  yazılamadı; yeni mesaj ve karşı teklif bildirimleri de doğru kişiye
  gitti.

Bu, RLS politikalarının gerçek `auth.uid()` oturumuyla davranışını
kapsamaz — o hâlâ canlı ortamda denenmeli.

> **Migration'ı uygulamayı unutmayın:** `supabase db push`. Migration
> dosyasının sonunda, eski hatalı kilitleme yüzünden `in_trade` kalmış
> ilanları bulan bir backfill sorgusu var — otomatik çalışmaz, önce sonucu
> inceleyin.

### 4.3 Teklif ömrü (md. 32)

`expiresAt` frontend'de "oluşturulma + 2 gün" olarak **uyduruluyordu**. Artık
`trade_offers.expires_at` gerçek bir kolon (varsayılan +48 saat) ve süresi
geçen bekleyen teklifleri kapatan `expire_stale_trade_offers()` fonksiyonu
var. Zamanlanmış çalıştırma (pg_cron) kurulmadı; şimdilik elle ya da
pg_cron etkinleştirilerek çağrılır — ayrıntı migration yorumlarında.

### 4.4 Karşı teklif (md. 26)

`tradeService.createCounterOffer()` baştan beri vardı ama **hiçbir ekran
çağırmıyordu**; kullanıcının elinde yalnızca "Kabul et" ve "Reddet" vardı.
Yeni `/karsi-teklif/:id` ekranı (`CounterOfferPage.tsx`) üçüncü yolu açıyor:

- Karşı teklifi veren, orijinal teklifin **alıcısıdır**; ekran bu rolü
  doğru kuruyor: "Vereceklerin" = benim ilanlarım, "İstediklerin" = karşı
  tarafın ilanları. Varsayılan seçim ilk teklifin iki tarafı, yani kullanıcı
  yalnızca değiştirmek istediği tarafa dokunuyor (md. 144).
- MVP sınırı: her taraftan en fazla 2 ilan (md. 25).
- Orijinal teklifteki tarih/buluşma yeri karşı teklife taşınıyor
  (`createCounterOffer` artık `deliveryDetails`'i koruyor).
- Giriş noktaları: teklif detayındaki "Karşı Teklif Ver" butonu ve takas
  listelerindeki kartlar.

Yan bulgu: `TradeCard`'daki hızlı Kabul/Reddet butonları `status ===
'offer_received'` koşuluna bağlıydı; oysa DB'den gelen bekleyen teklifler
`hydrateOffer()` içinde `'offer_sent'`e eşleniyor — yani bu butonlar
**pratikte hiç görünmüyordu**. Koşul düzeltildi.

### 4.5 Bildirimler + "Aradığın bulundu" (md. 44-45)

Bildirimler sabit bir mock listeydi (`INITIAL_NOTIFICATIONS`) ve hiçbir
olaydan tetiklenmiyordu. Artık `public.notifications` tablosu var ve
satırları **DB trigger'ları** üretiyor:

| Olay | Kime | Tip |
| --- | --- | --- |
| Yeni teklif | alıcı | `trade_offer` |
| Karşı teklif | alıcı | `counter_offer` |
| Kabul / ret / süre doldu / geri çekildi | gönderen | `trade_status` |
| Teslimat planlandı / takas iptal | iki taraf | `trade_status` |
| Takas tamamlandı | iki taraf | `review_request` |
| Yeni mesaj | karşı taraf | `message` |
| **İhtiyacına uyan yeni ilan** | ihtiyaç sahibi | `need_matched` |

Bildirim üretiminin istemcide değil DB'de olması bilinçli: teklif hangi
ekrandan gönderilirse gönderilsin bildirim garanti oluşur ve
`notifications` tablosunda kullanıcıya **INSERT politikası yok** — yani
kimse başkasına sahte bildirim yazamaz. "Aradığın bulundu" için
(kullanıcı, ilan, ihtiyaç) üçlüsünde tekrar engelleyen bir unique index var.

`INITIAL_NOTIFICATIONS` mock'u kaldırıldı.

### 4.6 Takas iptali + neden (md. 31)

- Devam eden bir takası iptal edecek **hiçbir akış yoktu**; dolayısıyla
  §4.2'de eklenen "iptal edilince kilidi çöz" trigger'ını tetikleyen de
  yoktu. `tradeService.cancelTrade()` bu boşluğu dolduruyor: teklif henüz
  kabul edilmediyse teklifi geri çeker, takas başladıysa `trades.status`'ü
  `cancelled` yapar (ve ilanlar otomatik olarak yeniden `active` olur).
- Neden seçimi zorunlu ve sabit kümeden: *ürün artık uygun değil / karşı
  tarafla anlaşamadım / teslimat sorunu / karşı taraf yanıt vermedi / başka
  bir sorun*. DB'de `trade_cancellation_reason` enum'ı, kodda aynı isimli
  union; contract testi ikisini bağlıyor. Bu veri ileride güven sisteminin
  girdisi olacak.
- **Düzeltilen bug:** `rejectOffer()` ret nedenini `message` kolonuna
  yazıyordu — yani teklifi gönderenin yazdığı notun üzerine geçiyor ve not
  kalıcı olarak kayboluyordu. Neden artık kendi kolonunda.

### 4.7 `supabase db reset` artık çalışıyor

`20260818120000_add_listing_fields.sql`, `20260818135000_...` ile birebir
aynıydı ve `listings` tablosunu oluşturan migration'dan ÖNCE çalıştığı için
sıfırdan kurulumu ilk adımda kırıyordu. Dosya **silinmedi** (canlının
migration geçmişinde kayıtlı; silmek `supabase db push`'u kırar), içeriği
no-op'a çevrildi. Tüm migration zinciri artık boş bir veritabanına baştan
sona hatasız uygulanıyor — geçici bir PostgreSQL 16 üzerinde doğrulandı.

### 4.8 Takas bağlamlı mesajlaşma (md. 33)

Swaloop'ta mesajlaşma sosyal sohbet değil, takas kanalıdır. Artık:

- Teklif (ve karşı teklif) gönderildiğinde iki kullanıcının sohbetine
  otomatik bir **"PS5 ↔ Kamera"** kartı düşüyor ve konuşmanın aktif takası
  (`conversations.active_trade_offer_id`) işaretleniyor.
- Sohbet ekranının üstünde, hangi takasın konuşulduğunu ve durumunu gösteren
  **kalıcı bir bağlam kartı** var; tıklayınca teklife gidiyor.
- `messages.type` alanı (`trade_card` / `counter_card` / `delivery_card`)
  ilk kez gerçekten kullanılıyor; sohbet bu kartları ayrı biçimde çiziyor.
- Kart mesajları bildirim üretmiyor (yoksa aynı olay için hem "Yeni takas
  teklifi" hem "Yeni mesaj" bildirimi gidiyordu).
- Güvenlik şeridi md. 34'e göre yeniden yazıldı: korkutmadan, net —
  *"Swaloop takaslarında para gönderilmez."*

Takas durum etiketleri artık tek kaynaktan (`src/utils/tradeStatus.ts`)
geliyor ve insan dilinde (md. 28): `delivery_planned` değil "Teslimat
planlandı", `locked` değil "Ürünler takas için ayrıldı".

### 4.9 "Sana uygun" ana ekran (md. 14-15)

Ana ekrandaki "Sana uygun takaslar" bölümü aslında **en yeni 4 ilanı**
gösteriyordu. Artık kullanıcının açık ihtiyaçlarıyla eşleşen ilanları
gösteriyor, her kartın altında hangi ihtiyaçla ve kaç uyumla eşleştiği
yazıyor. Hiç ihtiyacı olmayan kullanıcıya bölüm boş görünmüyor: "Ne
arıyorsun?" yönlendirmesi + eski liste (md. 89-90).

### 4.10 Engelleme ve gerçek şikayet (md. 106)

- **`blocked_users` tablosu.** Engelleme yalnızca arayüz filtresi değil:
  DB seviyesinde de engellenen kişi mesaj gönderemiyor ve teklif veremiyor
  (RLS politikaları `is_blocked_between()` ile genişletildi), karşılıklı
  bildirim üretilmiyor. Keşif ve aramada engellenen kullanıcıların ilanları
  gizleniyor — ama devam eden takasların içindeki ilanlar gizlenmiyor
  (aksi hâlde takas ekranı boş görünürdü).
- **Gizlilik kararı:** kimin kimi engellediğini yalnızca engelleyen görür;
  karşı taraf engellendiğini hiçbir ekranda görmez.
- **Şikayet artık gerçekten kaydediliyor.** İlan detayındaki "Şikayet Et"
  formu ve `DisputePage` yalnızca bir toast gösteriyordu — kayıt hiçbir
  yere ulaşmıyordu (rapor.txt §2). Yeni `reportService` `reports` tablosuna
  yazıyor; neden kümesi DB CHECK constraint'iyle aynı (eski formdaki
  `not_as_described`, `missing_parts` gibi değerler DB'de zaten geçersizdi).
  Kanıt fotoğrafları da gerçekten yükleniyor (önceden "Ekle" butonu sabit
  bir stok görseli ekliyordu).
- Profil ekranına şikayet ve engelleme butonları eklendi.

### 4.11 Teknik borç: hata ekranı, route koruması, kod bölme

`rapor.txt` §3'teki dört madde kapatıldı:

- **Error boundary yoktu:** herhangi bir bileşendeki hata bomboş beyaz ekran
  demekti. `ErrorBoundary` eklendi — insan dilinde mesaj + "Tekrar dene" /
  "Keşfete dön" (md. 91).
- **Route koruması yoktu:** `/ilan-ver`, `/profil`, `/admin` gibi sayfalara
  oturumsuz girilebiliyor, uygulama sahte bir "misafir kullanıcı" ile devam
  ediyordu. `RequireAuth` eklendi; kontrol localStorage'a değil **gerçek
  Supabase oturumuna** bakıyor. `/admin` ayrıca `isAdmin` istiyor.
- **Kod bölme yoktu:** JS paketi tek parça 924 KB (gzip 242 KB) idi. Tüm
  sayfalar `React.lazy` ile bölündü, satıcı kütüphaneleri ayrı parçalara
  ayrıldı. Giriş paketi **533 KB → 4.8 KB**, en büyük paylaşılan parça
  252 KB; sayfalar ihtiyaç anında iniyor ve 500 KB uyarısı kalktı.
  Yükleme sırasında beyaz ekran değil iskelet gösteriliyor (md. 92).
- **Pinch-to-zoom kapalıydı** (`user-scalable=no`): erişilebilirlik sorunu,
  mağaza incelemelerinde de risk (md. 98). Açıldı.

Ek olarak: favicon ve `robots.txt` eklendi (public/ klasörü hiç yoktu),
sayfa başlığı/açıklaması marka cümlesiyle (md. 5) güncellendi. `og:image`
hâlâ yok — görsel hazırlanması gereken bir iş, index.html'de TODO olarak
duruyor.

### 4.12 Test altyapısı

`vitest` çalıştırıldığında 4 test dosyası çöküyordu: `src/lib/supabase.ts`
ortam değişkeni yoksa import anında hata fırlatıyor, ve `proje/` klasörü
(kullanıcıya gönderilen zip'in açılmış kopyası) aynı testleri ikinci kez
çalıştırıyordu. `vite.config.ts` içindeki `test` bloğuna yer tutucu ortam
değişkenleri ve `proje/**` hariç tutması eklendi. Suite artık temiz:
**31 test, hepsi geçiyor.**

---

## 5. Faz planı

Rapordaki 130-136. maddelerin kod tabanına uyarlanmış hâli. ✅ = bugün var,
🟡 = kısmen, 🔴 = yok.

### FAZ 1 — Temel Swaloop (çekirdek)

| Özellik | Durum | Not |
| --- | --- | --- |
| Telefon + OTP kayıt | ✅ | `PhoneAuthPage`, `OtpVerificationPage` |
| Profil | ✅ | `CreateProfilePage`, `ProfilePage` |
| Keşfet / arama / kategori | ✅ | `DiscoverPage`, `SearchPage` |
| İlan oluşturma | ✅ | 3 adım, hedef < 60 sn (md. 143) |
| **İhtiyaç** | ✅ | bu tur |
| Favoriler | ✅ | `FavoritesPage` |
| Yakınımdakiler | ✅ | `NearbyMapPage`, Nominatim |
| Takas teklifi | ✅ | `MakeOfferPage` |
| **Karşı teklif** | ✅ | `/karsi-teklif/:id` |
| Mesajlaşma | ✅ | `MessagesPage` + takas bağlam kartı (md. 33) |
| Bildirim | ✅ | `notifications` tablosu + DB trigger'ları |
| Güven skoru | ✅ | gerçek formül, `20260819120000` |
| Değerlendirme | ✅ | 4 boyutlu (md. 41) |
| Takas süreci + kilitleme | ✅ | bu tur düzeltildi |
| **İlan süresi** | ✅ | 30 gün + yenileme, `20260829000000` (md. 119) |
| Takas iptali + neden seçimi | ✅ | `cancelTrade()` + neden modalı |
| Şikayet / engelleme | ✅ | `reports` gerçekten yazılıyor + `blocked_users` (md. 106) |

### FAZ 2 — Akıllı Swaloop
İhtiyaç listeleri ✅ · akıllı eşleştirme 🟡 (kural tabanlı ilk sürüm var) ·
**"Aradığın bulundu" bildirimi** ✅ · kullanıcı takip 🔴 · gelişmiş arama 🟡 ·
kategoriye özel alanlar 🔴 · swipe keşif ✅ (`SwipeMatchPage`, ana ürün değil —
md. 51-52) · takas uyum skoru ✅ (yüzde olarak gösteriliyor).

Çevresel etki (md. 53-56) ve puan/rozet (md. 57-58) bu fazda ve **ikincil**:
profil içinde kalır, ana ekrana ve ilan kartına çıkmaz.

### FAZ 3 — Fark yaratan Swaloop
3 kişilik döngüler (mevcut `loops` altyapısı buranın temeli, md. 48-50) ·
AI eşleştirme (md. 115; **asla fiyat tahmini değil**, md. 116) · görsel ürün
tanıma · bölgesel ihtiyaç haritası.

### FAZ 4 — Topluluk
`community_posts` / `post_likes` tabloları duruyor ama **ilk sürümde
kullanılmaz** (md. 60-61). Moderasyon altyapısı olmadan topluluk açmak ikinci
bir ürün yaratmak olur.

---

## 6. Sıradaki adımlar (öncelik sırasıyla)

> Bu liste her turda güncellenir. Aşağıdaki 1, 5, 6 ve 7 numaralı maddeler
> **backend/frontend gözden geçirme turunda** kapatıldı; kalanlar açık.
> 11-15 arası maddeler aynı turun gözden geçirme çıktısından geldi:
> bulundular, doğrulandılar, ama bu turun konusu (uydurulmuş veri,
> güvenlik, gezinme) dışında kaldıkları için bilerek ertelendiler.

1. ~~**İlan süresi / "hâlâ takasa açık mı?"** (md. 119)~~ — **yapıldı**
   (`20260829000000_listing_expiry.sql`). Her ilan 30 gün yayında kalıyor,
   bitmeden 3 gün önce sahibine bildirim gidiyor, süre dolunca ilan siliniyor
   değil `expired` oluyor ve "İlanlarım → Süresi dolan" sekmesinden tek
   dokunuşla yenileniyor (`renew_listing()`). Süre istemciden yazılamıyor.
2. **Zamanlama (pg_cron) — HÂLÂ AÇIK VE ZORUNLU.**
   `expire_stale_trade_offers()` ve `expire_stale_listings()` hazır;
   ikisinin cron işini de migration kurmayı deniyor ama pg_cron kapalıysa
   kurulamıyor. İlan tarafında bu işin kurulması ZORUNLU: teklifteki gibi
   "kabul anında yine kontrol edilir" güvencesi yok, iş çalışmazsa hiçbir
   ilan düşmez (bkz. `supabase/README.md`).
3. **Kullanıcı takip** (md. 43/86): "bu kişinin yeni ilanlarından haberdar
   ol". Bildirim altyapısı hazır, sadece `follows` tablosu + trigger gerekir.
4. **Kategoriye özel alanlar** (md. 111): telefon → marka/model/depolama,
   bisiklet → kadro ölçüsü. Eşleştirmeyi güçlendirir ama ilan formunu
   uzatmamak şart (md. 112). NOT: ucuz yarısı yapıldı — ilan formuna tek
   satırlık serbest **etiket** alanı eklendi, böylece `listings.tags` (ve
   onu okuyan eşleştirme motoru) canlıda ilk kez dolu. Kategoriye özel
   alanlar, hangi iki kategorinin en çok teklif çektiği canlı veriden
   görülünce yapılmalı.
5. ~~**Tasarım dili uygulaması** (§7)~~ — **yapıldı.** Tokenlar koda
   uygulandı (1254 ham palet kullanımı çevrildi), koyu tema gerçekten
   çalışır hâle geldi ve kontrast iki temada da ölçülerek WCAG AA'ya
   çıkarıldı. Ayrıntı §7'de.
6. ~~**Admin paneli hâlâ kısmen mock**~~ — **artık değil.** `adminService`
   KPI, şikayet, anlaşmazlık ve denetim kaydının tamamını Supabase'ten
   okuyor/yazıyor; `rapor.txt` §2'deki bu madde eskimişti. Kalan tek iş
   panelin görsel olarak tasarım sisteminin dışında olması (kasıtlı koyu
   slate teması) — düşük öncelikli.
7. ~~**`og:image`**~~ — **yapıldı** (`public/og-image.png`, kaynağı
   `public/og-image.source.html`). twitter:card etiketleri de eklendi.
8. **FAZ 3'e hazırlık:** 3 kişilik döngüler (md. 48-50) — ihtiyaç verisi
   artık var, döngü araması bu veri üzerinde kurulabilir. NOT: döngü/
   topluluk EKRANLARI bu turda kaldırıldı (erişilemez ve uydurma
   verilerdi); `loopService.ts` ve `loops` tabloları duruyor, FAZ 3
   geldiğinde arayüz yeniden yazılır.
9. **Sayfa bazlı hata durumları.** Servis hataları artık kullanıcıya
   görünüyor (`src/lib/serviceError.ts` + AppContext) ama bu bir ara
   çözüm: doğrusu her listenin kendi "yüklenemedi / tekrar dene"
   durumunu göstermesi.
10. **Gerçek sayfalama.** `getAllListings()` artık açık bir sınırla
    çalışıyor (120); sonsuz kaydırma ayrı bir iş.
11. **Uygulama dışı bildirim (Web Push).** Bildirimler yalnızca uygulama
    açıkken görülüyor; `notifications` tablosunun dışına çıkan hiçbir kanal
    yok. Teklifin ömrü 48 saat, yani uygulamayı iki gün açmayan kullanıcı
    teklifi kaçırıyor. Gerekenler: `manifest.webmanifest`, bir service
    worker'ın `push`/`notificationclick` işleyicisi, `push_subscriptions`
    tablosu (kendi satırına RLS) ve `notifications` üzerinde bir trigger.
    İzin ilk açılışta DEĞİL, kullanıcının ilk teklifinden sonra istenmeli.
    SMS ve bildirim tercihleri bu işin parçası değil.
12. **Şehirde arama.** `DiscoverPage` ilanları Türkiye genelinden çekiyor
    ve şehir süzgeci hiçbir ekranda yok; kategori eşleşmesi tek başına
    eşiği geçtiği için "sana uygun" listesinde başka şehirden ilan
    çıkabiliyor. `getAllListings()`'e `city` seçeneği + keşif ve arama
    ekranlarına "Şehrimde / Türkiye geneli" ikilisi. Şehirde sonuç yoksa
    Türkiye geneline düşülmeli ve bu SÖYLENMELİ. Puanlama ağırlıkları
    değişmemeli (mesafe belirleyici değil, md. 35).
13. **Buluşma planı girdileri.** `tradeService.createTradeOffer`
    `deliveryDetails`i kabul ediyor ve yazıyor (testi de var) ama hiçbir
    ekran göndermiyor; bu yüzden takas detayında buluşma yeri ve tarihi hep
    boş. Teklif ekranına iki opsiyonel alan (ne zaman / nerede) yeter;
    `safe_point` seçiliyse `SAFE_MEETING_POINTS`ten şehre göre bir liste.
    Çift taraflı öneri/onay akışı sonraki iş.
14. **Doğru başarı metrikleri.** `AdminKPI` toplam kullanıcı ve aktif ilan
    sayıyor; §8'in ölçmemizi istediği iki şey (tamamlanan takas sayısı ve
    **ilk takasa ulaşma süresi**) ile dört huni oranı panelde yok. Günlük
    huni görünümü + ilk takas gecikmesi için iki okuma görünümü, sonra
    panelde üst şeride bu üçü.
15. **Sitemap.** `public/robots.txt` `/ilan/<slug>`'ı "organik trafiğin ana
    kapısı" diye işaretliyor ama ne `sitemap.xml` var ne de robots'ta
    `Sitemap:` satırı. Build sonrası üretilen basit bir sitemap ucuz;
    bot'lara özel ön-render ayrı ve pahalı bir karar, organik trafik
    oluşmadan yapılmamalı.

## 7. Tasarım dili (md. 62-72, 98-103)

Bu bölüm **uygulandı** (backend/frontend gözden geçirme turu). Tek kaynak
`src/index.css`; ekranlar ham Tailwind paleti yerine tokenları kullanıyor.

- **Renk (açık tema):** brand `#278651`, brand-dark `#1d6640`,
  brand-soft `#e8f5ee`, canvas `#f6f7f5`, surface `#ffffff`,
  line `#e6e9e6`, ink `#16231d`, ink-soft `#4d5652`, ink-faint `#6a746f`.
  Yeşil marka rengidir, "çevreci uygulama" işareti değil — her yeri
  yeşile boyamayın.

  > Değerler gözle değil **ölçülerek** seçildi. Önceki palet WCAG AA'yı
  > altı yerde kaçırıyordu; en önemlisi uygulamanın en yaygın metin çifti
  > olan ikincil metin/kart (4.42, gereken 4.5) ve birincil butondaki
  > beyaz metin (3.40). Artık 16 metin/zemin çiftinin tamamı iki temada da
  > ≥ 4.5:1.

- **Koyu tema:** `html.dark` bloğunda aynı tokenların koyu karşılıkları.
  Bileşenlerde `dark:` yazmak GEREKMEZ — `bg-surface` / `text-ink` /
  `border-line` kullanan her ekran otomatik döner. Marka zemini üstündeki
  metin `--color-on-brand` ile gelir (açıkta beyaz, koyuda koyu mürekkep;
  beyaz metin açık yeşilin üstünde 2.76'da kalıyordu).
- **Font:** başlık Outfit, gövde Plus Jakarta Sans.
  Ağırlıklar: başlık 700, alt başlık 600, gövde 400, buton 600.
- **Radius:** kart 16px (`sw-card`), buton 12px (`sw-btn`), çip tam
  yuvarlak, avatar tam yuvarlak.
- **Gölge:** az; border + hafif shadow yeterli.
- **İkon:** yalnızca `lucide-react`. Emoji ikon, gradient ikon, 3D ikon yok.
- **Fotoğraf:** ilan kartlarında 4:3, en az 1 fotoğraf, ideal 3-5.
  Yükleme sırasında uzun kenar 1600 px'e (avatarlarda 512 px) indirilir.
- **Durum renkleri:** takas durumu rozetleri **dört anlamsal ton**
  kullanır — nötr (sıra karşı tarafta), marka (ilerliyor), sönük
  (kapandı), tehlike (sorun). Önceki sürüm 14 durum için sekiz ayrı renk
  ailesi kullanıyordu; mor bir rozetin kullanıcıya söylediği bir şey yok.
  Her duruma ayrıca ikon eşlik eder: renk tek başına durum belirtmez
  (md. 98).
- **Erişilebilirlik:** 44×44px dokunma alanı, renk tek başına durum
  belirtmez, kontrast ölçülü (yukarıda), kartlar gerçek `<a>`/`<button>`.

**Kapsam dışı bırakılanlar:** `AdminDashboardPage` (kasıtlı koyu slate
teması) ve `SwipeMatchPage` (kasıtlı koyu ekran) tokenlara taşınmadı.

İlan kartında bulunmayacaklar (md. 17): CO₂, su, enerji, puan, rozet,
seviye, uzun açıklama, maddi değer. Kartın tek işi şu soruyu yanıtlamak:
*"Buna bakmak istiyor muyum?"*

---

## 8. Başarı metrikleri (md. 137-140)

Ölçülecek: **tamamlanan takas sayısı** ve **ilk takasa ulaşma süresi**.
Ardından: ilan → teklif, teklif → kabul, kabul → tamamlanma, ihtiyaç →
eşleşme oranları; kullanıcı başına aktif ihtiyaç.

Ölçülmeyecek (yanıltıcı): toplam ilan sayısı, toplam kullanıcı, toplam puan.
10.000 ilan ve 100 takas, ürünün çalışmadığı anlamına gelir.
