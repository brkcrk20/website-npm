import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Kayıt ve giriş akışının iki çıkmazının regresyon testi:
 *
 *  1. `createProfile`, şifre ile e-postayı TEK bir `updateUser` çağrısında
 *     yazıyordu. E-posta adımı (Supabase'in saatte 2'lik varsayılan e-posta
 *     gönderim kotası, adresin başka hesapta kayıtlı olması…) hata verince
 *     kayıt tümden iptal oluyor, kullanıcı yalnızca "Profil oluşturulamadı"
 *     görüyordu.
 *
 *  2. Şifre doğru ama `profiles` satırı yoksa (kayıt yarıda kalmışsa)
 *     `loginWithPassword` oturumu kapatıp "Kullanıcı profili bulunamadı."
 *     diyordu. Kullanıcı kalıcı olarak dışarıda kalıyordu: giriş bu duvara
 *     çarpıyor, kayıt ise numara auth'ta zaten var diye ilerlemiyordu.
 */

const PROFILE_ROW = {
  id: 'user-1',
  full_name: 'Test Kullanıcı',
  first_name: 'Test',
  last_name: 'Kullanıcı',
  city: 'İstanbul',
  district: 'Kadıköy',
  is_admin: false,
  sms_verification_enabled: false,
  interests: [],
  wanted_categories: [],
  created_at: '2026-01-01T00:00:00.000Z',
};

const NEW_PROFILE_INPUT = {
  phone: '+90 555 111 22 33',
  firstName: 'Test',
  lastName: 'Kullanıcı',
  email: 'test@example.com',
  password: 'gizli1234',
  city: 'İstanbul',
  district: 'Kadıköy',
};

interface MockOptions {
  /** `updateUser({ password })` çağrısının döndüreceği hata. */
  passwordError?: unknown;
  /** `updateUser({ email })` çağrısının döndüreceği hata. */
  emailError?: unknown;
  /** `profiles` sorgusunun döndüreceği satır (null = satır yok). */
  profileRow?: typeof PROFILE_ROW | null;
  /** `signInWithPassword` çağrısının döndüreceği hata. */
  signInError?: unknown;
}

function installSupabaseMock(options: MockOptions = {}) {
  const calls = {
    updateUser: [] as any[],
    signOut: 0,
    upserted: [] as any[],
  };

  vi.doMock('../../lib/supabase', () => {
    const supabase = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-1', phone: '905551112233', email: null } },
          error: null,
        }),
        updateUser: async (payload: any) => {
          calls.updateUser.push(payload);

          if ('password' in payload && options.passwordError) {
            return { data: { user: null }, error: options.passwordError };
          }

          if ('email' in payload && options.emailError) {
            return { data: { user: null }, error: options.emailError };
          }

          return { data: { user: { id: 'user-1' } }, error: null };
        },
        signInWithPassword: async () => {
          if (options.signInError) {
            return { data: { user: null }, error: options.signInError };
          }
          return { data: { user: { id: 'user-1' } }, error: null };
        },
        signOut: async () => {
          calls.signOut += 1;
          return { error: null };
        },
      },
      from(table: string) {
        if (table === 'profiles') {
          return {
            upsert: (row: any) => {
              calls.upserted.push(row);
              return {
                select: () => ({
                  single: async () => ({ data: PROFILE_ROW, error: null }),
                }),
              };
            },
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: options.profileRow === undefined ? PROFILE_ROW : options.profileRow,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'trust_profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }

        throw new Error(`Beklenmeyen tablo: ${table}`);
      },
    };

    return { supabase, isSupabaseConfigured: true };
  });

  return calls;
}

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('../../lib/supabase');

  // authService kullanıcıyı localStorage'a önbelleğe alıyor; node ortamında
  // böyle bir global yok.
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
});

describe('createProfile', () => {
  it('e-posta auth tarafına yazılamasa bile kaydı tamamlar ve uyarı döndürür', async () => {
    const calls = installSupabaseMock({
      emailError: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
    });

    const { authService } = await import('../authService');
    const result = await authService.createProfile(NEW_PROFILE_INPUT);

    expect(result.user, 'e-posta hatası kaydı iptal etmemeli').toBeTruthy();
    expect(result.error).toBeUndefined();
    expect(result.warning).toContain('SMTP');
    // Profil satırı e-postayı yine de saklıyor; auth tarafı sonradan
    // tamamlanabilir.
    expect(calls.upserted[0].email).toBe('test@example.com');
  });

  it('şifre yazılamazsa kaydı durdurur ve gerçek sebebi döndürür', async () => {
    installSupabaseMock({
      passwordError: { code: 'weak_password', message: 'Password should be at least 10 characters' },
    });

    const { authService } = await import('../authService');
    const result = await authService.createProfile(NEW_PROFILE_INPUT);

    expect(result.user).toBeUndefined();
    expect(result.error).toContain('şifre politikasını karşılamıyor');
  });

  it('şifreyi ve e-postayı ayrı çağrılarda yazar (şifre önce)', async () => {
    const calls = installSupabaseMock();

    const { authService } = await import('../authService');
    const result = await authService.createProfile(NEW_PROFILE_INPUT);

    expect(result.user).toBeTruthy();
    expect(result.warning).toBeUndefined();
    expect(calls.updateUser).toEqual([
      { password: 'gizli1234' },
      { email: 'test@example.com' },
    ]);
  });

  it('profile yazılan numarayı formdan değil oturumdan alır', async () => {
    const calls = installSupabaseMock();

    const { authService } = await import('../authService');
    // Çağıran ekran router state'ini kaybedip yanlış (demo) bir numara
    // gönderse bile oturumdaki doğrulanmış numara kazanmalı.
    await authService.createProfile({ ...NEW_PROFILE_INPUT, phone: '+90 532 890 12 34' });

    expect(calls.upserted[0].phone).toBe('+905551112233');
  });
});

describe('loginWithPassword', () => {
  it('profil satırı yoksa oturumu kapatmaz, profil tamamlama işareti döndürür', async () => {
    const calls = installSupabaseMock({ profileRow: null });

    const { authService } = await import('../authService');
    const result = await authService.loginWithPassword('+90 555 111 22 33', 'gizli1234');

    expect(result.success).toBe(true);
    expect(result.needsProfile).toBe(true);
    expect(result.error).toBeUndefined();
    expect(calls.signOut, 'oturum açık kalmalı, yoksa profil oluşturulamaz').toBe(0);
  });

  it('şifre hatalıysa Supabase hatasını okunur bir cümleye çevirir', async () => {
    installSupabaseMock({
      signInError: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const { authService } = await import('../authService');
    const result = await authService.loginWithPassword('+90 555 111 22 33', 'yanlis1234');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Telefon numarası veya şifre hatalı.');
  });

  it('profil varsa normal şekilde oturum açar', async () => {
    const { authService } = await (async () => {
      installSupabaseMock();
      return import('../authService');
    })();

    const result = await authService.loginWithPassword('+90 555 111 22 33', 'gizli1234');

    expect(result.success).toBe(true);
    expect(result.needsProfile).toBeUndefined();
    expect(result.user?.id).toBe('user-1');
  });
});
