# Swaloop

Takas uygulaması. Satma, takas et, yeniden kullan.

Kullanmadığın bir eşyanın fotoğrafını çek, karşılığında ne aradığını yaz,
teklifleri değerlendir. Uygulamada para transferi yoktur; her şey takas
üzerine kuruludur.

---

## Hızlı başlangıç

```bash
npm install
cp .env.example .env     # Supabase bilgilerini gir
npm run dev              # http://localhost:4000
```

`.env` doldurulmadan uygulama açıldığında beyaz ekran yerine ne yapılması
gerektiğini anlatan bir kurulum ekranı gösterilir.

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş çıktıyı yerelde sunar |
| `npm run lint` | `tsc --noEmit` tip kontrolü |

### Veritabanı

Şema `supabase/migrations/` altında; tetikleyicileri doğrulayan SQL
testleri için `supabase/tests/README.md` dosyasına bak. Yeni bir ortamda ya da güncelleme
sonrası uygulanması gerekir:

```bash
supabase db push
```

Uygulanmadığında ne olur:

| Migration | Uygulanmazsa |
| --- | --- |
| `..._create_messaging_tables.sql` | Mesajlaşma çalışmaz ("relation does not exist") |
| `..._create_avatars_storage_bucket.sql` | Profil fotoğrafı `listing-images` bucket'ına düşer (çalışır) |
| `..._add_badge_trust_tracking.sql` | Takas tamamlanınca güven sayaçları güncellenmez |
| `..._notifications_and_trade_cancellation.sql` | Bildirim üretilmez, takas iptal edilemez |
| `..._backend_integrity_fixes.sql` | Teklif kabul edilemez, konuşma listesi boş döner, görüntülenme sayacı artmaz |

---

## Uygulama akışı

```
İlan ver  →  Keşfet / Eşleştir  →  Teklif  →  Kabul  →  Teslimat  →  Onay  →  Tamamlandı
                                                                                  │
                                                              güven puanı · yorum
```

Ekranlar:

- **Keşfet** — yayındaki ilanlar, arama, kategori filtresi
- **Eşleştir** — kaydırmalı akış; sağa kaydırma ilanı favorilere ekler
- **Yakınımdakiler** — konum izni verilirse gerçek mesafeye göre sıralama
- **İlan ver** — 3 adım: fotoğraf → takas tercihleri → önizleme
- **Takaslarım** — gelen / giden / süreçte / geçmiş
- **Teklif detayı** — 6 adımlı takas akışı, teslimat onayı, değerlendirme
- **Döngüler** — 3+ kişilik dairesel takas (A→B→C→A)
- **Profil** — güven puanı, ilan yönetimi, yorumlar, ayarlar

---

## Kararlar

### Görseller her zaman WebP

Kullanıcının seçtiği her fotoğraf, yükleme isteği gönderilmeden **önce**
tarayıcıda WebP'e çevrilir ve küçültülür (ilan görselleri 1600 px,
avatarlar 512 px). Kod: `src/utils/imageToWebp.ts`; kullanımı
`listingService.uploadListingImages` ve `authService.uploadAvatar`.

Telefon kamerasından gelen 8–12 MB'lık bir JPEG birkaç yüz KB'a iner:
yükleme hızlanır, listeler mobilde akıcı çalışır ve bucket'ın 5 MB dosya
limiti pratikte hiç zorlanmaz. Tarayıcı WebP kodlayamıyorsa (çok eski
sürümler) dönüşüm sessizce atlanır, orijinal dosya yüklenir — akış hiçbir
zaman bu yüzden kırılmaz.

### Güven puanı sunucuda hesaplanır

Bir takas tamamlandığında iki tarafın `trust_profiles` sayaçları artmalı
ve takasa konu ilanlar `traded` durumuna geçmeli. Bunu uygulama katmanı
yapamaz: RLS altında kullanıcı karşı tarafın satırını güncelleyemez. Bu
yüzden `security definer` tetikleyicilerle yapılır
(`20260819120000_add_badge_trust_tracking.sql`).

Güven puanı formülü (`recalc_trust_score`):

```
trust_score = ortalama_puan * 0.7  +  güvenilirlik * 5 * 0.3
güvenilirlik = 1 - (iptal edilen takas / toplam takas)
```

Hiç değerlendirmesi olmayan bir kullanıcı 5.00'ten başlar. Puan her yeni,
güncellenen **veya silinen** değerlendirmede yeniden hesaplanır.

### Takas kuralları veritabanında

Takas akışının kuralları istemcide değil şemada duruyor
(`20260827000000_backend_integrity_fixes.sql`), çünkü istemci kodu tek
giriş noktası değil: anon anahtarla doğrudan REST çağrısı da yapılabilir.

- Bir teklifin **en fazla bir** takası olur; takasın tarafları teklifin
  taraflarıyla aynı olmak zorundadır (bileşik foreign key).
- Sonuçlanmış (kabul/ret/iptal/süre dolmuş) bir teklifin durumu değişmez;
  süresi dolmuş teklif kabul edilemez.
- Takas adımları geriye alınamaz, sonuçlanmış takas değişmez.
- Değerlendirme yalnızca tamamlanmış bir takasa, yalnızca o takasın
  tarafınca, karşı taraf için ve **bir kez** yazılabilir.
- Teklifin kabulü `accept_trade_offer()` ile tek işlemde yapılır: teklifin
  durumu, takas satırı ve olay kaydı ya birlikte oluşur ya hiç oluşmaz.
  Fonksiyon idempotenttir (çift tıklama güvenli).

### Mesafe ya gerçektir ya da yoktur

`Listing.location.distanceKm` isteğe bağlıdır. Yalnızca hem ilanın hem de
kullanıcının koordinatı biliniyorsa hesaplanır (haversine,
`listingService.haversineKm`); bilinmiyorsa `undefined` kalır ve arayüzde
mesafe hiç gösterilmez, yalnızca ilçe adı görünür. Konum izni verilmemişse
mesafe filtresi, konumu bilinmeyen ilanları elemez.

Kullanıcının koordinatı `AppContext.currentLocation` üzerinden gelir ve
`setViewerCoords()` ile servis katmanına aktarılır. Koordinat yoksa mesafe
tamamen kapalıdır — "0 km" diye bir varsayılan yoktur.

---

## Kod haritası

```
src/
  services/        Veri katmanı — her tablo/konu için bir dosya
    listingService     ilanlar, favoriler, arama, görüntülenme, mesafe
    tradeService       teklifler, takas adımları, değerlendirmeler
    needService        ihtiyaçlar ("buna ihtiyacım var") ve eşleştirme
    loopService        çoklu dairesel takas
    notificationService bildirimler (notifications tablosu)
    messageService     sohbetler ve mesajlar
    communityService   topluluk gönderileri
    blockService       kullanıcı engelleme
    reportService      şikayetler
    adminService       KPI, rapor/anlaşmazlık, denetim kaydı
    authService        telefon + OTP, profil, avatar yükleme
    geoLocationService GPS + adres çözümleme (Nominatim)
  context/AppContext   oturum, konum, bildirim, tema, toast
  utils/imageToWebp.ts WebP dönüştürücü
  pages/               ekranlar (hepsi lazy yüklenir)
  components/          paylaşılan arayüz parçaları
```

Servisler yalnızca veriyle ilgilenir; ekranlar servis çağırır. Sorgular
tek noktada toplanmıştır (`LISTING_SELECT`, `OFFER_SELECT`) ve liste
sorguları toplu çalışır — bir teklif listesi, teklif sayısından bağımsız
olarak sabit sayıda istek atar.

---

## Bilinen sınırlar

- **SMS/OTP** Supabase Auth üzerinden gider; bir SMS sağlayıcısının
  Supabase panelinde tanımlı olması gerekir.
- **Bildirimler** `public.notifications` tablosunda tutulur ve satırları
  yalnızca `security definer` tetikleyiciler üretir (kullanıcı kendine ya da
  başkasına sahte bildirim yazamaz); "okundu" bilgisi de aynı tabloda.
- **Şikayet incelemesi** uygulama içinde değil, Supabase panelinden
  yapılır (`public.reports` tablosu).
- **Döngülerde zincir sırası** katılım sırasına göre istemcide hesaplanır;
  katılımcı eklendikçe sıra sabit kalır.
- **Süresi geçen teklifler** `expire_stale_trade_offers()` ile kapatılır ama
  bu fonksiyon zamanlanmış çalışmıyor (proje pg_cron kullanmıyor). Kabul
  akışı yine de güvenli: süresi dolmuş bir teklif, fonksiyon hiç
  çalışmamış olsa bile kabul edilemez.
- **Anlaşmazlık (dispute) kaydı** yalnızca admin panelinde okunur; kullanıcı
  tarafındaki "sorun bildir" akışı `public.reports` tablosuna yazar.
