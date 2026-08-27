# Veritabanı testleri

`supabase/migrations/` altındaki tetikleyicilerin ve fonksiyonların gerçekten
çalıştığını doğrulayan SQL testleri. Supabase'e bağlanmadan, yerel bir
PostgreSQL üzerinde çalışır.

## Çalıştırma

```bash
# 1. Boş bir yerel veritabanı başlat (örnek: PostgreSQL 16)
initdb -D /tmp/pgtest/data -A trust -U postgres
pg_ctl -D /tmp/pgtest/data -o "-k /tmp/pgtest -p 5433" start

# 2. Supabase'in bu testler için gereken parçalarını taklit et
#    (auth.users, auth.uid(), storage.buckets, storage.objects, roller)
psql -h /tmp/pgtest -p 5433 -U postgres -f supabase/tests/00_supabase_stub.sql

# 3. Migration'ları sırayla uygula
for f in supabase/migrations/*.sql; do
  psql -h /tmp/pgtest -p 5433 -U postgres -v ON_ERROR_STOP=1 -f "$f" || break
done

# 4. Testi çalıştır (her adım `t` dönmeli)
psql -h /tmp/pgtest -p 5433 -U postgres -f supabase/tests/trade_flow_test.sql
```

Test kendi verisini oluşturur ve sonunda `rollback` yapar; veritabanında iz
bırakmaz.

## Kapsam

| # | Ne doğrulanıyor |
| --- | --- |
| 1 | Profil eklenince `trust_profiles` satırı otomatik açılıyor |
| 2 | Favori eklenip silinince `listings.favorite_count` senkron kalıyor |
| 3 | Teklif kalemi, ilanın gerçek sahibine bağlanıyor; başkasının ilanı "verilen" olarak eklenemiyor |
| 4 | `trade_offers.status` kümesi kapalı; sonuçlanmış teklif bir daha değişmiyor; `updated_at` ilerliyor |
| 5 | Takas başlayınca ilanlar `in_trade` oluyor; bir teklife ikinci takas açılamıyor; takas tarafları teklifle uyuşmak zorunda |
| 6 | Takas tamamlanınca iki tarafın sayacı artıyor, ilanlar `traded` oluyor |
| 7 | Değerlendirme kuralları (kendini değerlendirme, aralık, tekrar) ve güven puanı hesabı; **silince yeniden hesaplanıyor** |
| 8 | `increment_listing_view()` sayacı artırıyor, ilan sahibinin kendi görüntülemesini saymıyor |
| 9 | Takas iptal edilince ilanlar tekrar yayına dönüyor, iptal sayaçları artıyor |
| 10 | Süresi dolmuş teklif kabul edilemiyor; `expire_stale_trade_offers()` kapatıyor |
| 11 | Döngü durum değerleri (`matching` varsayılanı) ve aynı kullanıcının iki kez katılamaması |
| 12 | Gönderilmiş mesaj değiştirilemiyor, `is_read` güncellenebiliyor, mesaj bildirimi üretiliyor |
| 13 | Takas adımı geriye alınamıyor, sonuçlanmış takas değişmiyor |
| 14 | `accept_trade_offer()`: yalnızca alıcı kabul edebiliyor, tek işlemde takas+olay açılıyor, tekrar çağrı güvenli, teslimat bilgisi taşınıyor |
| 14b | `conversations.last_message_id` yeni mesajda güncelleniyor, silinince bir öncekine dönüyor |
| 15 | `public` şemasındaki tüm fonksiyonlarda `search_path` sabitlenmiş |

Ayrıca 3. adım (tüm migration'ların sırayla uygulanması) başlı başına bir
testtir: şemanın sıfırdan kurulabildiğini doğrular. Bu gerçekten bir arıza
yakaladı — `20260818130000`, kendisinden SONRA tanımlanan bir fonksiyona
trigger bağladığı için sıfırdan kurulum 3. migration'da çöküyordu.

## Testler nasıl başarısız olur

Her kontrol `pg_temp.ok(...)` / `pg_temp.rejects(...)` üzerinden geçiyor ve
başarısızlıkta exception fırlatıyor; `ON_ERROR_STOP` sayesinde koşum orada
durur ve `psql` sıfırdan farklı bir çıkış kodu döndürür. (Eski sürüm sonucu
yalnızca `t`/`f` olarak yazdırıyordu — bir kontrol `f` dönse bile test
"geçmiş" sayılıyordu.)
