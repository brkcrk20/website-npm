# Swaloop — depo kuralları

<<<<<<< HEAD
## Değişiklikler otomatik uygulanır

Kullanıcı bu konuda kalıcı yetki verdi: **bir iş bittiğinde onay
beklenmez, doğrudan uygulanır.** Değişiklik bir dalda ya da açık bir PR'da
bekletilmez — depoda durup hayata geçmemiş iş, yapılmamış iştir.

Her iş için sıra şudur:

1. `git fetch origin main` — iş **her zaman** `main`'in ucundan başlar.
2. Değişiklik yapılır.
3. `npm run lint`, `npm test`, `npm run build` üçü de çalıştırılır.
   **Otomatik uygulamak, doğrulamadan uygulamak demek değildir** — üçü de
   temiz değilse iş uygulanmaz.
4. Commit doğrudan `main`'e gönderilir: `git push origin HEAD:main`.
   **PR açılmaz, merge commit üretilmez** (sebebi aşağıda: "Neden PR yok").
   Push ileri sarma değilse durulur — `main` bu arada ilerlemiş demektir,
   1. adıma dönülür.
5. Kullanıcının checkout'undaki dal aynı commit'e ileri sarılır:
   `git push origin main:claude/takas-app-development-56eqh1`

5. adım isteğe bağlı değil. Kullanıcının checkout'u o dalda; iki ref aynı
commit'te tutulmazsa kullanıcı yapılan işi kendi editöründe göremez ve
hatların yeniden ayrışması başlar (aşağıdaki olaya bakın). İş, ancak `main`
ile o dal aynı commit'i gösterdiğinde bitmiş sayılır.

Sonuç bildirilirken hangi commit'e uygulandığı ve doğrulama çıktısı
(lint / test / build) birlikte söylenir.

## Neden PR yok

Önceki kural "PR açılır ve hemen merge edilir" diyordu. Her merge geçmişe
bir merge commit ve grafikte ikinci bir şerit ekledi; on dört PR sonunda
kullanıcının kaynak denetimi grafiği tek mavi hat olmaktan çıkıp iç içe
geçmiş renkli şeritlere döndü. Kayıt tutmanın bedeli okunamayan bir geçmiş
oldu.

Bunun yerine geçmiş **düz** tutulur: commit'ler doğrudan `main`'in ucuna
eklenir, `main` hiçbir zaman merge ile ilerlemez. Kayıt commit mesajının
kendisinde durur. Bir dalda çalışıldıysa `main`'e ileri sarılarak taşınır
(gerekirse `git rebase origin/main`), merge edilerek değil.

Zaten çatallanmış eski geçmiş olduğu gibi bırakılır; onu düzeltmek geçmişi
yeniden yazmak olurdu ve kullanıcının checkout'unu bozardı. Kural bundan
sonrası içindir.

## Dal biriktirilmez

İş `main`'e ulaştıktan sonra o iş için açılmış `claude/*` dalı uzaktan
silinir. Yaşayan tek kalıcı ref çifti `main` ile kullanıcının checkout'u
olan `claude/takas-app-development-56eqh1`'dir; ikisi her zaman aynı
commit'i gösterir.

## Tek hat: `main`

**Tüm iş `main` üzerinden yürür.** Bir dalda çalışıldıysa, iş biter bitmez
`main`'in ucuna ileri sarılır ve kullanıcının dalı da aynı noktaya
getirilir.
=======
## Tek hat: `main`

**Tüm iş `main` üzerinden yürür.** Bir dalda çalışıldıysa, iş biter bitmez
`main`'e merge edilir ve dal `main` ile aynı noktaya getirilir.
>>>>>>> aa112bc (Son güncellemeler)

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

<<<<<<< HEAD
### Kullanıcının kendi makinesinde

Depoyu ilk kurarken bir kez:

```
git config pull.rebase true
git config push.default current
```

`pull.rebase` olmadan, dal bir kez ayrıştığında VS Code'un "Değişiklikleri
Eşitle" düğmesi `fatal: Need to specify how to reconcile divergent
branches` ile düşer ve commit atılamaz hâle gelir. Bu ayar yerel commit'leri
uzaktakinin üstüne dizerek düğmeyi çalışır tutar.

=======
>>>>>>> aa112bc (Son güncellemeler)
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
