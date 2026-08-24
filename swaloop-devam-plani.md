# Swaloop — Devam Planı

Bu dosya proje.zip'in içinde tutulur; yeni bir oturumda bu dosya + güncel
proje.zip ile devam edilir.

## Bu turda yapılanlar

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

## Bu turda ek olarak yapılan

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
- Bu ortamdan gerçek Supabase'e/npm registry'ye ağ erişimi yok — kullanıcı
  kendi ortamında test ediyor (`npm install`, `tsc`, `vite build`,
  `supabase db push`) ve Supabase Studio'dan istenen verileri paylaşabiliyor.
- Günlük mesaj limitine takılmamak için turlar makul kapsamlı, tamamlanabilir
  parçalar halinde yürütülüyor.
