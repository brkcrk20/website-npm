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
npm run dev              # http://localhost:3000
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
| `..._swap_core_improvements.sql` | Takas tamamlanınca puan/güven sayaçları güncellenmez; yolculuk hedefi yalnızca cihazda saklanır; şikayet gönderilemez |

---

## Uygulama akışı

```
İlan ver  →  Keşfet / Eşleştir  →  Teklif  →  Kabul  →  Teslimat  →  Onay  →  Tamamlandı
                                                                                  │
                                                        puan · rozet · çevresel etki · yorum
```

Ekranlar:

- **Keşfet** — yayındaki ilanlar, arama, kategori filtresi
- **Eşleştir** — kaydırmalı akış; sağa kaydırma ilanı favorilere ekler
- **Yakınımdakiler** — konum izni verilirse gerçek mesafeye göre sıralama
- **İlan ver** — 3 adım: fotoğraf → takas tercihleri → önizleme
- **Takaslarım** — gelen / giden / süreçte / geçmiş
- **Teklif detayı** — 6 adımlı takas akışı, teslimat onayı, değerlendirme
- **Döngüler** — 3+ kişilik dairesel takas (A→B→C→A)
- **Takas yolculuğum** — tamamlanan takaslardan oluşan basamak zinciri
- **Profil** — puan/seviye, ilan yönetimi, yorumlar, rozetler, ayarlar

---

## Kararlar

### Görseller her zaman WebP

Kullanıcının seçtiği her fotoğraf, yükleme isteği gönderilmeden **önce**
tarayıcıda WebP'e çevrilir ve küçültülür (ilan görselleri 1600 px,
avatarlar 512 px). Kod: `src/utils/image.ts`, kullanımı:
`src/services/storageService.ts`.

Telefon kamerasından gelen 8–12 MB'lık bir JPEG birkaç yüz KB'a iner:
yükleme hızlanır, listeler mobilde akıcı çalışır ve bucket'ın 5 MB dosya
limiti pratikte hiç zorlanmaz. Tarayıcı WebP kodlayamıyorsa (çok eski
sürümler) dönüşüm sessizce atlanır, orijinal dosya yüklenir — akış hiçbir
zaman bu yüzden kırılmaz.

### Puanlar saklanmaz, hesaplanır

Takas puanı ve rozetler ayrı bir tabloda tutulmaz; her görüntülemede
kullanıcının gerçek aktivitesinden hesaplanır (`src/services/pointsService.ts`):
tamamlanan takaslar, yayındaki ilanlar, alınan değerlendirmeler,
tamamlanan döngüler, önlenen karbon ve profil doluluğu.

Böylece puan tablosu ile gerçek durum birbirinden ayrışamaz — "puan
verildi ama takas iptal edildi" gibi bir tutarsızlık oluşamaz. Puanın
kalem kalem dağılımı `/puanlarim` ekranında görünür.

Puan bir para birimi ya da ürün değeri değildir; hiçbir takas parasal bir
değere göre kısıtlanmaz.

### Sayaçlar sunucuda güncellenir

Bir takas tamamlandığında iki tarafın `trust_profiles` sayaçları artmalı
ve takasa konu ilanlar `traded` durumuna geçmeli. Bunu uygulama katmanı
yapamaz: RLS altında kullanıcı karşı tarafın satırını güncelleyemez. Bu
yüzden `security definer` tetikleyicilerle yapılır (bkz.
`20260824091000_swap_core_improvements.sql`). Güven puanı da aynı şekilde,
her yeni değerlendirmede alınan puanların ortalaması olarak yeniden
hesaplanır.

### Yolculuk türetilir

"Takas Yolculuğum" için ayrı bir tablo yok. Basamaklar tamamlanmış
takaslardan çıkarılır: ilk takasta verdiğin ürün başlangıç, her takasta
aldığın ürün bir sonraki basamak, elindeki aktif ilan "şu an", profildeki
`journey_target` ise hedef. Takas yaptıkça yolculuk kendiliğinden uzar
(`src/services/journeyService.ts`).

### Mesafe ya gerçektir ya da yoktur

`Listing.location.distanceKm` isteğe bağlıdır. Yalnızca hem ilanın hem de
kullanıcının koordinatı biliniyorsa hesaplanır; bilinmiyorsa arayüzde
mesafe hiç gösterilmez, yalnızca ilçe adı görünür. Konum izni verilmemişse
mesafe filtresi, konumu bilinmeyen ilanları elemez.

---

## Kod haritası

```
src/
  services/        Veri katmanı — her tablo/konu için bir dosya
    listingService     ilanlar, favoriler, arama, görüntülenme
    tradeService       teklifler, takas adımları, değerlendirmeler
    loopService        çoklu dairesel takas
    journeyService     takas yolculuğu (türetilmiş)
    pointsService      puan · seviye · rozet · aktivite özeti
    notificationService bildirimler (canlı veriden türetilir)
    storageService     WebP'e çevirip Supabase Storage'a yükler
    messageService     sohbetler ve mesajlar
    reportService      şikayetler
    authService        telefon + OTP, profil
    impactService      çevresel etki hesabı (LCA katsayıları)
  context/AppContext   oturum, puan özeti, bildirim, tema, toast
  utils/image.ts       WebP dönüştürücü
  utils/geo.ts         konum ve mesafe
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
- **Bildirimlerin "okundu" bilgisi** cihazda (localStorage) tutulur;
  bildirim satırları türetilmiş veridir, ayrı bir tabloda saklanmaz.
- **Şikayet incelemesi** uygulama içinde değil, Supabase panelinden
  yapılır (`public.reports` tablosu).
- **Döngülerde zincir sırası** katılım sırasına göre istemcide hesaplanır;
  katılımcı eklendikçe sıra sabit kalır.
