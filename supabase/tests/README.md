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
| 3 | Takas başlayınca ilanlar `in_trade` durumuna kilitleniyor |
| 4 | Takas tamamlanınca iki tarafın sayacı artıyor, ilanlar `traded` oluyor |
| 5 | Değerlendirme eklenince güven puanı ortalamaya güncelleniyor |
| 6 | Değerlendirme silinince güven puanı yeniden hesaplanıyor |
| 7 | `increment_listing_view()` görüntülenme sayacını artırıyor |
| 8 | Takas iptal edilince ilanlar tekrar yayına dönüyor |

Ayrıca 3. adım (tüm migration'ların sırayla uygulanması) başlı başına bir
testtir: şemanın sıfırdan kurulabildiğini doğrular.
