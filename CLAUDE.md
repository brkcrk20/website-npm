# Swaloop — depo kuralları

## Tek hat: `main`

**Tüm iş `main` üzerinden yürür.** Bir dalda çalışıldıysa, iş biter bitmez
`main`'e merge edilir ve dal `main` ile aynı noktaya getirilir.

Bunun sebebi somut bir olay: `claude/takas-app-development-56eqh1` dalı ile
`main`, `bc7fd93` commit'inde ayrıldı ve fark edilmeden 1,5 gün paralel
ilerledi. Sonunda aynı 62 dosya iki tarafta da değişmişti (61 çakışma).
Bu süre boyunca dalda çalışan kişi `main`'e yapılan hiçbir işi görmedi:
SVS kaldırma, güvenlik düzeltmeleri, ihtiyaç sistemi, arayüz yenilemesi.
Birleştirme `bcdf983` ile yapıldı; ayrıntılar
[PR #1](https://github.com/brkcrk20/website-npm/pull/1) açıklamasında.

### Bir oturuma başlarken

Kod yazmadan önce hangi dalda olunduğu doğrulanır:

```
git branch --show-current
git fetch origin main
git log --oneline origin/main -1
git status -sb            # "behind" yazıyorsa önce pull
```

`main` dışında bir daldaysanız ve o dal `main`'in gerisindeyse, önce
`main`'i alın. Yeni bir hat açmayın.

### Bir işi bitirirken

Değişiklik `main`'e ulaşmadıysa iş bitmemiştir. Kullanıcı kendi
editöründe yalnızca kendi checkout'undaki dalı görür; başka bir dala
push edilen commit onun ekranında **görünmez**.

## Deponun adı

Depo GitHub'da **`brkcrk20/Swaloop-App`**. Eski adı `website-npm`'di ve
GitHub eski URL'yi yenisine yönlendirdiği için iki isim de çalışır —
`git remote -v` çıktısında hangisinin göründüğü depo farkı anlamına
gelmez.

## Çalıştırma

```
npm install
npm run dev              # http://localhost:4000/
PORT=5000 npm run dev    # portu değiştirmek için
```

Port `vite.config.ts` içindeki `server.port` üzerinden okunur; `PORT`
ortam değişkeni varsa o kullanılır, yoksa 4000. `strictPort` kapalı
olduğu için port meşgulse Vite bir sonraki boş porta geçer.

`.env` gerekir (`.env.example`'a bakın). `VITE_SUPABASE_URL` veya
`VITE_SUPABASE_PUBLISHABLE_KEY` yoksa uygulama açılışta hata fırlatır
(`src/lib/supabase.ts`). `.env` `.gitignore`'da — commit'lenmez.

## Doğrulama

Push etmeden önce üçü de çalıştırılır:

```
npm run lint     # tsc --noEmit
npm test         # vitest
npm run build
```

## Kaldırılmış sistemler — geri getirmeyin

**SVS / CO2 çevresel etki sistemi** üründen tamamen kaldırıldı (`2adf7e5`,
`bdc8478`). `impact_records` tablosu ve `community_posts.trade_co2_saved`
sütunu canlı veritabanından da düşürüldü
(`supabase/migrations/20260824000000_drop_co2_impact_tracking.sql`).

Buna bağlı puan/yolculuk katmanı da elendi: `pointsService`,
`journeyService`, `PointsCard`, `PointsPage`, `BadgeGrid`, `JourneyPage`.
`profiles.journey_target` sütunu canlı veritabanında **yok**.

Kodda kalan tek SVS referansı, onu düşüren migration dosyasının kendisidir;
o silinmez.

## Tipler

Tek doğruluk kaynağı `src/types/index.ts`. Kök dizinde ikinci bir
`index.ts` vardı, temizlik öncesi eski bir kopyaydı ve `tsconfig.json`
`exclude` tanımlamadığı için `tsc` tarafından derleniyordu — silindi
(`bdc8478`). İkinci bir tip dosyası oluşturmayın.

`src/types/supabase.ts` canlı şemaya **elle** eşitlenmiş durumda; migration
geçmişi CLI ile senkron değil (bazı migration'lar Studio üzerinden manuel
uygulandı). Ayrıntı ve onarım komutu için `supabase/README.md`.
