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
| Karşı teklif | 🟠 servis var, **UI yok** | `tradeService.createCounterOffer()` çağıran ekran yok |
| Kabul | ✅ | `acceptOffer()` |
| Kilitleme | ✅ bu turda düzeltildi | `lock_listings_on_trade_start()` |
| Teslimat / onay | ✅ | `advanceTradeStep()`, `TradeProcessPage.tsx` |
| Değerlendirme | ✅ | `submitReview()` |
| Güven profili | ✅ | `trust_profiles` + `20260819120000` migration |
| Yeni ihtiyaç | 🟡 döngü kapanıyor ama bildirimle desteklenmiyor | aşağıya bakın |

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

### 4.4 Test altyapısı

`vitest` çalıştırıldığında 4 test dosyası çöküyordu: `src/lib/supabase.ts`
ortam değişkeni yoksa import anında hata fırlatıyor, ve `proje/` klasörü
(kullanıcıya gönderilen zip'in açılmış kopyası) aynı testleri ikinci kez
çalıştırıyordu. `vite.config.ts` içindeki `test` bloğuna yer tutucu ortam
değişkenleri ve `proje/**` hariç tutması eklendi. Suite artık temiz:
**26 test, hepsi geçiyor.**

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
| **Karşı teklif** | 🟠 | servis hazır, **UI yok** — sıradaki en değerli iş |
| Mesajlaşma | ✅ | `MessagesPage`; takas bağlamı kartı 🔴 (md. 33) |
| Bildirim | 🔴 | tamamen mock; gerçek olaylardan tetiklenmiyor |
| Güven skoru | ✅ | gerçek formül, `20260819120000` |
| Değerlendirme | ✅ | 4 boyutlu (md. 41) |
| Takas süreci + kilitleme | ✅ | bu tur düzeltildi |
| Takas iptali + neden seçimi | 🟡 | iptal var, **neden listesi yok** (md. 31) |
| Şikayet / engelleme | 🟡 | `reports` tablosu var, engelleme yok (md. 106) |

### FAZ 2 — Akıllı Swaloop
İhtiyaç listeleri ✅ · akıllı eşleştirme 🟡 (kural tabanlı ilk sürüm var) ·
**"Aradığın bulundu" bildirimi** 🔴 · kullanıcı takip 🔴 · gelişmiş arama 🟡 ·
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

1. **Karşı teklif UI'ı** (md. 26). `createCounterOffer` servisi hazır ama
   hiçbir ekran çağırmıyor — gerçek takas deneyiminin eksik parçası.
2. **Gerçek bildirim sistemi** (md. 44-45). `notifications` tablosu + takas
   olaylarından tetikleme. Ardından **"Aradığın şey bulundu"**: yeni ilan
   `needs` ile eşleştiğinde bildirim. Uygulamayı tekrar açtıran en güçlü
   mekanizma bu; altyapısı (`needService.getSeekersForListing`) artık hazır.
3. **Takas iptal nedeni** (md. 31) — güven sisteminin girdisi olur.
4. **Mesajlaşmada takas bağlam kartı** (md. 33).
5. **Ana ekran sıralaması** (md. 14-15, 120): "en yeni" yerine "sana uygun".
   İhtiyaç verisi artık mevcut, sıralama bunu kullanabilir.
6. **`supabase/migrations/20260818120000_add_listing_fields.sql` silinmeli
   ya da guard'lanmalı.** Doğrulama sırasında çıktı: bu dosya
   `20260818135000_add_listing_fields.sql` ile **birebir aynı** ve
   `listings` tablosunu oluşturan `20260818130000`'dan ÖNCE çalıştığı için
   sıfırdan bir kurulumda (`supabase db reset`) "relation public.listings
   does not exist" hatası veriyor. Canlı DB'de sorun çıkarmıyor (tablolar
   zaten vardı), ama yeni bir ortam kurulamaz durumda.
7. `rapor.txt`'ten devam eden teknik borç: route guard, error boundary,
   code splitting (bundle hâlâ ~924 KB tek parça), pinch-to-zoom.

---

## 7. Tasarım dili (md. 62-72, 98-103)

Bu bölüm henüz **uygulanmadı**, karar olarak kayıtlıdır:

- **Renk:** Primary `#16A36A`, Dark `#17211D`, Background `#F7F8F6`,
  Card `#FFFFFF`, Secondary `#64706A`, Border `#E5E9E6`. Yeşil marka
  rengidir, "çevreci uygulama" işareti değil — her yeri yeşile boyamayın.
- **Font:** başlık Outfit, gövde Plus Jakarta Sans (mevcut seçim korunuyor).
  Ağırlıklar: başlık 700, alt başlık 600, gövde 400, buton 600.
- **Radius:** kart 12-16px, buton 12-14px, avatar tam yuvarlak.
- **Gölge:** az; border + hafif shadow yeterli.
- **İkon:** yalnızca `lucide-react`. Emoji ikon, gradient ikon, 3D ikon yok.
- **Fotoğraf:** ilan kartlarında 4:3, en az 1 fotoğraf, ideal 3-5.
- **Erişilebilirlik:** 44×44px dokunma alanı, renk tek başına durum
  belirtmez, reduced motion, kontrast.

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
