import { describe, it, expect } from 'vitest';
import { describeAuthError } from '../authService';

/**
 * Giriş/kayıt akışındaki hatalar eskiden `console.error`'a yazılıp kullanıcıya
 * sabit bir cümle gösteriliyordu. Bu testler, en sık karşılaşılan Supabase
 * hatalarının kullanıcıya GERÇEKTEN ne olduğunu söyleyen bir metne
 * dönüştüğünü ve bilinmeyen hataların ham mesajını kaybetmediğini doğrular.
 */
describe('describeAuthError', () => {
  it('hata yoksa yedek metni döndürür', () => {
    expect(describeAuthError(null, 'Yedek')).toBe('Yedek');
    expect(describeAuthError(undefined, 'Yedek')).toBe('Yedek');
  });

  it('SMS sağlayıcısı tanımsızken sebebi açıkça söyler', () => {
    const message = describeAuthError(
      { code: 'sms_send_failed', message: 'Error sending confirmation OTP to provider' },
      'SMS kodu gönderilemedi.'
    );

    expect(message).toContain('SMS sağlayıcısı');
  });

  it('telefon sağlayıcısı kapalıyken nereye bakılacağını söyler', () => {
    const message = describeAuthError(
      { code: 'phone_provider_disabled', message: 'Phone signups are disabled' },
      'Yedek'
    );

    expect(message).toContain('Providers');
  });

  // Kayıt akışının tökezlediği en sinsi nokta: Supabase'in varsayılan
  // e-posta gönderim kotası saatte 2'dir; ikiden fazla kayıt denemesi
  // yapıldığında e-posta adımı hata verir.
  it('e-posta gönderim kotası dolduğunda kotayı ve çözümü anlatır', () => {
    const message = describeAuthError(
      { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
      'Yedek'
    );

    expect(message).toContain('SMTP');
  });

  it('e-posta başka bir hesapta kayıtlıysa bunu söyler', () => {
    const message = describeAuthError(
      { code: 'email_exists', message: 'A user with this email address has already been registered' },
      'Yedek'
    );

    expect(message).toContain('başka bir hesapta kayıtlı');
  });

  it('hatalı şifre/telefon için tek ve net bir cümle verir', () => {
    expect(
      describeAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'Yedek')
    ).toBe('Telefon numarası veya şifre hatalı.');
  });

  it('kodun süresi dolduğunda yeni kod istenmesi gerektiğini söyler', () => {
    const message = describeAuthError(
      { code: 'otp_expired', message: 'Token has expired or is invalid' },
      'Yedek'
    );

    expect(message).toContain('Yeni bir kod');
  });

  it('429 durumunda kod olmasa bile hız sınırını tanır', () => {
    expect(describeAuthError({ status: 429, message: 'Too many requests' }, 'Yedek')).toContain(
      'Çok fazla deneme'
    );
  });

  // PostgREST hataları da (RLS reddi, eksik kolon) aynı yoldan geçiyor:
  // eşleşen kural yoksa ham mesaj KAYBOLMAMALI, yoksa teşhis imkânsız.
  it('bilinmeyen hatada ham mesajı yedek metnin yanında korur', () => {
    const message = describeAuthError(
      { code: '42501', message: 'new row violates row-level security policy for table "profiles"' },
      'Profil kaydedilemedi.'
    );

    expect(message).toContain('Profil kaydedilemedi.');
    expect(message).toContain('row-level security');
  });

  it('mesajı olmayan hatada yedek metni bozmadan döndürür', () => {
    expect(describeAuthError({ code: 'weird_thing' }, 'Yedek')).toBe('Yedek');
  });
});
