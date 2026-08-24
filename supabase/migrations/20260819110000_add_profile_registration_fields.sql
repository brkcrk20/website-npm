-- Kayıt formuna eklenen yeni alanlar için profiles tablosunu genişletir:
--   * first_name / last_name: Ad ve soyad artık ayrı ayrı toplanıyor
--     (full_name geriye dönük uyumluluk için hâlâ tutuluyor ve
--     first_name + ' ' + last_name olarak set ediliyor).
--   * email: Kayıt formunda istenen e-posta adresi.
--   * sms_verification_enabled: Kullanıcı her girişte SMS/OTP doğrulaması
--     istiyor mu? Varsayılan false — yani normal girişte sadece
--     telefon + şifre yeterli, kullanıcı profil ayarlarından açabilir.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists sms_verification_enabled boolean not null default false;

comment on column public.profiles.sms_verification_enabled is
  'true ise kullanıcı şifre ile girişten sonra ek olarak SMS/OTP doğrulaması da ister. Varsayılan: false.';
