# Swaloop — Devam Planı

Bu dosya deponun kendisinde tutulur; yeni bir oturumda bu dosya + deponun
güncel `main` dalı ile devam edilir. (Eskiden bir `proje.zip` kopyası da
tutuluyordu; canlı kodla ayrışıp kafa karıştırdığı için kaldırıldı.)

## Bu turda yapılanlar (backend + frontend gözden geçirme turu)

Kod tabanının tamamı 14 boyutta incelendi (RLS güvenliği, tetikleyici
mantığı, tip sözleşmeleri, servis hata yolları, takas akışı, ihtiyaç
eşleştirme, mock veri, tasarım sistemi, gezinme, UX durumları,
erişilebilirlik, performans, dil/metin, ürün boşlukları). Bulgular
çelişkili iki hakemden geçirilerek doğrulandı.

Ana tema: **uydurulmuş veri.** Uygulama, elinde olmayan bilgiyi
kullanıcıya varmış gibi gösteriyordu — ve bir takas uygulamasında bu, en
pahalı hata türü.

### Uydurulmuş veri temizliği

- **Güven puanı.** `TrustCard` her alanı için uydurma varsayılan
  tutuyordu (4.8 puan, "Doğrulanmış Üye", 14 takas, %98 yanıt, 12
  değerlendirme ve hiç alınmamış üç övgü). Aynı `?? 4.8` kalıbı yedi ayrı
  yerde vardı. Üstelik gerçek veriyle bile bozuktu: `trust_score` DB
  varsayılanı 5 ve `trustLevelFromScore(5)` = "Topluluk Lideri" — yani
  sıfır takaslı yeni üye en üst seviyede görünüyordu.
  Yeni tek kaynak `src/utils/trustDisplay.ts`: **puan ya gerçektir ya da
  gösterilmez.**
- **`response_rate` hiç ölçülmüyordu** (kolon varsayılanı 1, onu yazan tek
  bir trigger/servis yok): herkes sonsuza kadar "%100 yanıt oranı"
  görüyordu. Arayüzden ve tiplerden kaldırıldı.
- **Dört boyutlu değerlendirme sahteydi**: alt puanlar ekranda sabit "5/5"
  yazıyordu ve gönderilen kayıt her zaman 5/5/5/5 idi. Artık gerçekten
  seçilebiliyor.
- **Kullanıcının yazmadığı yorumlar**: boş bırakılan yorum yerine "Harika
  bir takastı…" yazılıyordu; `TradeSuccessPage`'te bu metin ÖN DOLU
  geliyordu. İkisi de kaldırıldı.
- **Sahte misafir kullanıcı**: oturum yoksa `mockData.CURRENT_USER`
  dönülüyordu — "Berke Çelik", 4.88 puan, 7 takas. Yerine dürüst boş
  profil (`src/constants/guestUser.ts`). `mockData.ts` (877 satır) silindi.
- **Stok fotoğraflar**: ilan formundaki "Örnek Ürün Görselleri" beş sabit
  Unsplash fotoğrafını gerçek bir ilana ekleyebiliyordu; avatarı olmayan
  herkes aynı yabancının yüzüyle görünüyordu. İkisi de yerel nötr SVG
  yer tutucularla değişti (`src/utils/placeholders.ts`).

### Güvenlik (dört yeni migration, hepsi yerel PostgreSQL 16'da denendi)

- `20260830000000` — **takas onayı sahtelenebiliyordu.** Tek bir
  `PATCH /rest/v1/trades` isteği onay damgalarını uydurup takası tek
  taraflı "tamamlandı" yapabiliyordu: karşı tarafın ilanı kalıcı olarak
  `traded` oluyor, iki tarafın güven sayacı artıyor ve saldırgan hiç
  olmamış bir takas üzerinden değerlendirme yazabiliyordu. Ayrıca teklifin
  `receiver_id`'si sonradan değiştirilip teklif kendi kendine kabul
  edilebiliyordu.
- `20260831000000` — **`push_notification()` herkese açıktı.** `anon` dahi
  herhangi bir kullanıcıya istediği bağlantıyı taşıyan sahte bildirim
  yazabiliyordu; oysa tasarım dokümanı bunu güvence olarak sayıyor.
  Ayrıca: sohbetin karşı tarafı değiştirilip özel yazışma üçüncü kişiye
  açılabiliyor, kabul edilmiş teklifin kalemleri silinip karşı tarafın
  ilanı sonsuza kadar `in_trade` bırakılabiliyor, şikayet kaydına uydurma
  yönetici kararı yazılabiliyordu.
- `20260902000000` — **aynı ilan iki takasa birden kilitlenebiliyordu**
  (yerel olarak doğrulandı): kullanıcı aynı ürünü iki kişiye söz vermiş
  oluyor, biri mutlaka mağdur oluyordu.
- `20260903000000` — bildirim ile ekrandaki eşleşme farklı kurallar
  kullanıyordu; "Bir bisiklet arıyorum" ihtiyacındaki "bir" kelimesi
  "Birinci el kitap" ile eşleşiyordu.

Ayrıca `20260901000000`: `categories` tablosunu dolduran hiçbir şey yoktu,
sıfırdan kurulan her ortamda ilan verme tamamen çalışmıyordu.

**Sekiz migration da hâlâ uygulanmadı — `supabase/README.md`'ye bakın.**

### Tasarım dili ve koyu tema

Koyu tema **bozuktu**: tokenların koyu karşılığı hiç tanımlanmamıştı ve
uygulamada `dark:` yalnızca 6 dosyada vardı. "Koyu" seçen kullanıcıda dış
kabuk kararıyor, içerik bembeyaz kalıyordu. Tema artık tek yerden dönüyor;
1254 ham palet kullanımı tokenlara çevrildi. Kontrast iki temada da
ölçüldü ve 16 metin/zemin çiftinin tamamı WCAG AA'yı geçiyor.

### Gezinme

"Takaslarım" — takasın tamamlandığı, yani ürünün ölçtüğü tek şeyin
gerçekleştiği ekran — alt menüde YOKTU; Profil → "Takas Geçmişim" (yanlış
etiket) üzerinden iki dokunuşla ulaşılıyordu. "Aradıklarım" da yoktu.
Yeni sıra: **Ana Sayfa · Aradıklarım · + · Takaslarım · Mesajlar**.
Profil üst bardaki avatara taşındı.

Erişilemez ve uydurma bölümler kaldırıldı (Döngüler, Kırmızı Ataş,
Gizemli Kutu, Topluluk, Etkinlikler) — beşine de hiçbir menüden
ulaşılamıyordu, topluluk lider tablosu beş uydurma kişiden oluşuyordu.
Geçmişte duruyorlar; FAZ 3/4 gelince `git revert`.

### Eşleştirme motoru

- Tam eşitlik aranıyordu: "bisiklet" arayan "Bisikletim"i BULAMIYORDU —
  üstelik DB ön filtresi o ilanı zaten getiriyordu.
- Türkçe klavye kullanmayan herkes görünmezdi:
  `'BISIKLET'.toLocaleLowerCase('tr')` → `'bısıklet'`.
- Motor, ihtiyacını iyi anlatan kullanıcıyı cezalandırıyordu (uzun metin =
  düşük skor).
- Engellenen kullanıcıların ilanları eşleşmelerde çıkıyordu.

### Sessiz hatalar

Servis katmanında 120 hata yolu vardı, hepsi yalnızca konsola yazıyordu;
sayfaların 35'inden 33'ünde `catch` yok. Ağ koptuğunda ekranda "Henüz ilan
yok" yazıyor, kullanıcı bunu boşluk sanıyordu. Artık hem sunucu hataları
hem işlenmemiş söz reddi kullanıcıya bildiriliyor.

### Diğer

`/yardim` rotası hiç yoktu (Ayarlar'daki bağlantı sessizce ana sayfaya
atıyordu) — gerçek bir Yardım & Güvenlik sayfası yazıldı. Dil değiştirici
kaldırıldı (252 çeviri anahtarı var ama `t()` yalnızca 17 kez, 2 dosyada
çağrılıyordu). İlan kartları artık gerçek `<a>` (klavye + arama motoru).
Görseller gerçekten küçültülüyor (README bunu iddia ediyordu ama kodda
yoktu). `og:image` üretildi. Kapak fotoğrafı artık her yenilemede
değişmiyor. Konumsuz ilanların (0,0)'a çakılması durduruldu.

**Doğrulama:** her commit'te `npm run lint` + `npm test` + `npm run build`;
migration'lar sıfırdan kurulan yerel PostgreSQL 16'da uygulanıp iki SQL
test paketiyle (93 + 31 kontrol) denendi; arayüz Chromium ile iki temada
ekran görüntüleriyle doğrulandı.

---

## Önceki turda yapılanlar (ürün/sistem tasarım raporu turu)

152 maddelik ürün/sistem tasarım raporu koda uygulanmaya başlandı. Raporun
madde madde kod karşılığı, faz planı ve açık maddeler artık ayrı bir dosyada:
**`swaloop-urun-sistem-tasarimi.md`** — yeni bir oturumda önce o dosyayı
okuyun.

Özet:

1. **İHTİYAÇ sistemi eklendi (raporun ana teşhisi, md. 78-82/151).** Yeni
   `public.needs` tablosu + RLS + spam kısıtları, `src/services/needService.ts`,
   `/aradiklarim` ekranı, profilde "Aradıklarım (n)" girişi, arama ekranında
   "Verenler / Arayanlar" sekmeleri (md. 76), ilan detayında "Bu ürünü arayan
   N kişi var" (md. 77). İlanlara `looking_for_categories`, profillere
   `interests` / `wanted_categories` kolonları geldi — bu son ikisi frontend
   tipinde vardı ama hiçbir yere yazılmıyordu, kayıt formundaki seçimler
   sessizce kayboluyordu.

2. **Güvenlik düzeltmesi: ilan kilitleme kapsamı (md. 30).**
   `lock_listings_on_trade_start()` takas başlayınca kullanıcının TÜM aktif
   ilanlarını kilitliyordu; artık sadece o teklifin ilanlarını kilitliyor.
   Ayrıca kilidi çözen trigger hiç yoktu (iptal edilen takasın ilanları
   sonsuza kadar `in_trade` kalıyordu) — `release_listings_on_trade_end()`
   eklendi. Regresyon testi:
   `src/services/__tests__/tradeLocking.contract.test.ts`.

3. **Teklif ömrü gerçek alana bağlandı (md. 32).** `trade_offers.expires_at`
   (varsayılan +48 saat) + `expire_stale_trade_offers()`. Önceden frontend'de
   "created_at + 2 gün" olarak uyduruluyordu.

4. **Parasal dil temizliği (md. 3/125).** `PaperclipPage`'teki "₺350 Değer"
   gibi etiketler ve ilan formundaki "benzer değerde" ipucu kaldırıldı.

5. **Karşı teklif ekranı geldi (md. 26).** `createCounterOffer` servisi
   vardı ama hiçbir ekran çağırmıyordu. Yeni `/karsi-teklif/:id`
   (`CounterOfferPage.tsx`): "vereceklerin" = kendi ilanların,
   "istediklerin" = karşı tarafın ilanları, varsayılan olarak ilk teklifin
   iki tarafı seçili. Yan bulgu: `TradeCard`'daki hızlı Kabul/Reddet
   butonları yanlış statü koşuluna bağlıydı ve pratikte hiç görünmüyordu —
   düzeltildi.

6. **Bildirimler gerçek oldu (md. 44-45).** `notifications` tablosu + DB
   trigger'ları: yeni teklif, karşı teklif, kabul/ret/süre doldu, teslimat,
   takas tamamlandı (değerlendirme daveti), yeni mesaj ve en önemlisi
   **"Aradığın bir ürün eklendi"** (md. 45). Bildirim üretimi bilinçli
   olarak DB'de: tabloda kullanıcıya INSERT politikası yok, kimse sahte
   bildirim yazamıyor. `INITIAL_NOTIFICATIONS` mock'u kaldırıldı.

7. **Takas iptali + neden (md. 31).** Devam eden takası iptal edecek hiçbir
   akış yoktu — dolayısıyla "iptal edilince kilidi çöz" trigger'ı da hiç
   tetiklenmiyordu. `cancelTrade()` + neden seçim modalı eklendi. Ayrıca
   `rejectOffer()` ret nedenini `message` kolonuna yazıp teklif notunun
   üzerine geçiyordu; neden artık kendi kolonunda.

8. **`supabase db reset` artık çalışıyor.**
   `20260818120000_add_listing_fields.sql`, `20260818135000_...` ile birebir
   aynıydı ve `listings` tablosu oluşmadan önce çalıştığı için sıfırdan
   kurulumu kırıyordu. Dosya silinmedi (canlının migration geçmişinde
   kayıtlı), içeriği no-op yapıldı. Tüm zincir boş bir DB'ye baştan sona
   hatasız uygulanıyor.

9. **Test suite'i onarıldı ve büyüdü.** `vite.config.ts` → `test.env` yer
   tutucuları ve `proje/**` hariç tutması. Önce 4 dosya çöküyordu; şimdi
   **31 test geçiyor** (yeni: ihtiyaç eşleştirme, kilitleme kapsamı,
   bildirim tipi ve iptal nedeni sözleşmeleri).

Her iki migration da bu ortamda kurulan geçici bir PostgreSQL 16 üzerinde
gerçekten çalıştırıldı ve davranışları uçtan uca denendi (ayrıntı: tasarım
dokümanı §4.2 ve §4.5) — kilitleme kapsamı, kilit çözme, teklif ömrü,
ihtiyaç kısıtları, bildirim trigger'ları ve tekrar engelleme dahil.
RLS'in gerçek `auth.uid()` oturumundaki davranışı hâlâ canlıda denenmeli.

**İki yeni migration'ı kendi ortamınızda `supabase db push` ile uygulayın:**
`20260820000000_needs_system_and_trade_locking.sql` ve
`20260820100000_notifications_and_trade_cancellation.sql`. İlkinin sonunda,
eski hatalı kilitleme yüzünden `in_trade` kalmış ilanları bulan bir backfill
sorgusu var — otomatik çalışmaz, önce sonucunu inceleyin.

## Bu turda ek olarak yapılanlar (2. tur)

10. **Takas bağlamlı mesajlaşma (md. 33).** Teklif/karşı teklif
    gönderildiğinde sohbete otomatik "PS5 ↔ Kamera" kartı düşüyor, sohbetin
    üstünde hangi takasın konuşulduğunu gösteren kalıcı bir bağlam kartı
    var. `messages.type` (`trade_card`/`counter_card`) ilk kez gerçekten
    kullanılıyor. Kart mesajları bildirim üretmiyor (çift bildirim
    olmasın). Takas durum etiketleri tek kaynağa alındı
    (`src/utils/tradeStatus.ts`) ve insan diline çevrildi (md. 28).

11. **Ana ekran artık gerçekten kişiye uygun (md. 14-15).** "Sana uygun
    takaslar" bölümü en yeni 4 ilanı gösteriyordu; artık kullanıcının açık
    ihtiyaçlarıyla eşleşen ilanları ve eşleşme nedenini gösteriyor.

12. **Engelleme + gerçek şikayet (md. 106).** `blocked_users` tablosu:
    engellenen kişi DB seviyesinde mesaj/teklif gönderemiyor, bildirim
    üretilmiyor, ilanları keşifte görünmüyor. Kimin kimi engellediğini
    yalnızca engelleyen görüyor. Şikayet formları (ilan detayı ve
    DisputePage) artık gerçekten `reports` tablosuna yazıyor — önceden
    sadece toast gösteriyorlardı; kanıt fotoğrafı da gerçekten yükleniyor.

13. **rapor.txt §3 teknik borcu kapatıldı:** error boundary eklendi
    (beyaz ekran yerine anlaşılır hata sayfası), route koruması eklendi
    (`RequireAuth` — gerçek Supabase oturumuna bakıyor, `/admin` ayrıca
    `isAdmin` istiyor), kod bölme yapıldı (**giriş paketi 924 KB → 4.8 KB**,
    sayfalar ayrı parçalar; 500 KB uyarısı kalktı), pinch-to-zoom açıldı.
    Ayrıca favicon + robots.txt eklendi, başlık/açıklama marka cümlesiyle
    güncellendi. `og:image` hâlâ yok (index.html'de TODO).

**Üçüncü migration:** `20260820200000_blocking_and_message_notification_fix.sql`
— o da `supabase db push` ile uygulanmalı.

## Önceki turda yapılanlar

1. **Header'daki demo konum isimleri kaldırıldı.** `LocationPicker.tsx`'teki
   sabit "Kadıköy/Beşiktaş/Çankaya/Konak" hızlı-seçim listesi kaldırıldı,
   yerine sade bir yönlendirme metni (`header_location_hint`) kondu.
   `AppContext.tsx`'teki varsayılan konum da `district: 'Kadıköy'` yerine
   ilçesiz (`district: ''`) yapıldı. Konum servisleri zaten ücretsiz
   OpenStreetMap Nominatim üzerinden çalışıyor (`geoLocationService.ts`),
   API anahtarı gerekmiyor — dokunulmadı.

2. **Kayıt/profil düzenleme sayfalarındaki il-ilçe alanı** — kullanıcıya
   soruldu (sabit dropdown mı kalsın, aranabilir dropdown mı, yoksa
   Nominatim'e mi bağlansın). **Cevap henüz gelmedi**, bir sonraki turda
   `CreateProfilePage.tsx` ve `EditProfilePage.tsx`'teki `<select>`
   alanlarına uygulanacak.

3. **Rozet sistemi kuruldu (Badges).** Önceden tamamen sabit/mock veriydi,
   DB'de hiç tablo yoktu. Yapılanlar:
   - **Kritik düzeltme:** `trust_profiles.completed_trades` /
     `cancelled_trades` hiçbir yerde güncellenmiyordu (hep 0). Yeni migration
     `supabase/migrations/20260819120000_add_badge_trust_tracking.sql` ile:
     - `trades.status` `completed`/`cancelled` olunca iki tarafın sayaçları
       otomatik artıyor (trigger).
     - `reviews` tablosuna yeni satır eklenince `trust_profiles.average_rating`
       / `review_count` yeniden hesaplanıyor.
     - `trust_score` artık gerçek formülle hesaplanıyor: %70 review ortalaması
       + %30 güvenilirlik (iptal oranının tersi). Kullanıcının puanı artık
       gerçekten aldığı olumlu/olumsuz yorumlara göre değişiyor.
     - `loop_participants.status = 'completed'` olunca `completed_loops`
       artıyor.
     - Tüm değişiklikler `trust_events`'e loglanıyor.
     - **Migration'ı kendi ortamınızda `supabase db push` ile uygulamanız
       gerekiyor** — henüz test edilmedi (bu ortamdan Supabase'e erişim yok).
       Geçmiş (migration'dan önceki) kayıtlar için sayaçlar otomatik
       işlemez; migration dosyasının sonundaki backfill SQL notuna bakın.
   - `authService.ts` → `mapProfile()` artık bu gerçek sayaçları okuyor.
   - `src/constants/badges.ts` (yeni): genişletilebilir rozet kataloğu —
     Doğrulanmış Üye, İlk Takasım, Takas Sever (5), Takas Ustası (10),
     Takas Efsanesi (100), Döngü Kaşifi, Döngü Ustası, Güvenilir Üye,
     Takas Uzmanı, + mevcut 3 eko rozet (Çevre Dostu, Su Koruyucusu, Sıfır
     Atık Şampiyonu). Yeni rozet eklemek için sadece bu dosyaya bir tanım
     eklemek yeterli, DB değişikliği gerekmez.
   - `BadgesPage.tsx`, `ProfilePage.tsx`: mock liste yerine
     `getUserBadges(currentUser)` kullanıyor.
   - `PublicProfilePage.tsx`: kullanıcı kartına küçük rozet önizlemesi
     eklendi (kazanılan rozetler, emoji + tooltip).

## Önceki turda ek olarak yapılan

- **`PublicProfilePage.tsx` artık gerçek Supabase profiline bağlı.**
  `authService.ts`'e yeni `getPublicProfile(userId)` fonksiyonu eklendi
  (profiles + trust_profiles'ı çekip `mapProfile()`'dan geçiriyor — mevcut
  `getCurrentUserFromSupabase()` ile aynı desen). `OTHER_USERS` mock
  importu kaldırıldı. Sayfa artık `id` parametresiyle yükleniyor: yükleme
  sırasında spinner, kullanıcı bulunamazsa "Bu kullanıcı bulunamadı" ekranı
  gösteriyor. `profiles_select_all` RLS politikası zaten `using (true)`
  olduğu için ek bir politika değişikliği gerekmedi.
  - Şu an bu sayfaya sadece `SwipeMatchPage.tsx`'ten (`currentListing.user.id`
    ile) gerçek bir id gönderiliyor. Diğer akışlarda (ör. ilan detayında
    satıcı adına tıklama) bu sayfaya link yoksa, eklemek ayrı bir iş.
  - Test edilmedi (bu ortamdan Supabase'e erişim yok) — kendi ortamınızda
    `/profil/<gerçek-bir-kullanıcı-id>` adresini deneyerek doğrulayın.

## Açık / bilinen sorunlar (bir sonraki adaylar)

- Ürün tarafındaki öncelik sırası artık `swaloop-urun-sistem-tasarimi.md`
  §6'da: (1) mesajlaşmada takas bağlam kartı, (2) ana ekranda "sana uygun"
  sıralaması, (3) engelleme, (4) ilan süresi, (5) teklif kapatmanın
  zamanlanması (pg_cron).

- **Eko rozetler (Çevre Dostu / Su Koruyucusu / Sıfır Atık Şampiyonu) her
  zaman kilitli kalacak** çünkü `stats.totalCo2Prevented` /
  `totalWaterSaved` / `totalRawMaterialsSaved` hâlâ `authService.ts`'de sabit
  `0` — `impact_records` tablosundaki gerçek verilerle hiç toplanmıyor.
  Rozet mantığı hazır, sadece bu toplamanın (muhtemelen `trust_profiles`'a
  benzer bir `impact_totals` alanı + trigger, ya da profil yüklenirken bir
  aggregate sorgu) yapılması lazım.
- rapor.txt'deki diğer maddeler (admin panel mock, avatar sabit görsel
  döngüsü — bu artık yanlış olabilir kontrol edilmeli, pinch-to-zoom kapalı,
  error boundary yok, route guard yok) henüz ele alınmadı.

## Ortam notları (değişmedi)
- React + Vite + TypeScript frontend, Supabase (Postgres/Auth/Storage) backend.
- Bu ortamda `npm install`, `tsc --noEmit`, `vite build` ve `vitest`
  çalıştırılabiliyor (bu turda hepsi çalıştırıldı ve temiz). Gerçek
  Supabase'e erişim YOK — migration'lar ve RLS davranışı hâlâ kullanıcının
  kendi ortamında (`supabase db push` + Supabase Studio) doğrulanmalı.
- Günlük mesaj limitine takılmamak için turlar makul kapsamlı, tamamlanabilir
  parçalar halinde yürütülüyor.
