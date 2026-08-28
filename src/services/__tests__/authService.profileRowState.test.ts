import { describe, it, expect, vi, afterEach } from 'vitest';

// "PROFİL YOK" İLE "SORAMADIK" AYNI ŞEY DEĞİL.
//
// `RequireAuth`, oturumu olup profili olmayan kullanıcıyı /profil-olustur'a
// gönderiyor — kayıt yarıda kaldığında doğru davranış. Ama karar
// `getCurrentUserFromSupabase()`'in `null` dönüşüne dayansaydı yanlış
// olurdu: o fonksiyon hem "satır yok" hem "sorgu patladı" için `null`
// dönüyor. İkisini aynı saymak, ağı bir saniye kopan MEVCUT bir
// kullanıcıyı kayıt formuna sürüklemek demekti.
//
// Bu test o ayrımı kilitliyor.

afterEach(() => {
  vi.doUnmock('../../lib/supabase');
  vi.restoreAllMocks();
});

async function loadServiceWith(profileResult: { data: unknown; error: unknown }) {
  vi.resetModules();
  vi.doMock('../../lib/supabase', () => ({
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => profileResult }),
        }),
      }),
    },
  }));
  const { authService } = await import('../authService');
  return authService;
}

describe('profileRowState', () => {
  it('satır varsa "yes"', async () => {
    const authService = await loadServiceWith({ data: { id: 'u1' }, error: null });
    expect(await authService.profileRowState()).toBe('yes');
  });

  it('satır gerçekten yoksa "no" (kayıt yarıda kalmış)', async () => {
    const authService = await loadServiceWith({ data: null, error: null });
    expect(await authService.profileRowState()).toBe('no');
  });

  it('sorgu patlarsa "no" DEĞİL "unknown"', async () => {
    const authService = await loadServiceWith({
      data: null,
      error: { message: 'network error' },
    });

    const state = await authService.profileRowState();

    expect(state).toBe('unknown');
    // Asıl mesele bu: hata "profil yok" sayılmamalı, yoksa mevcut kullanıcı
    // kayıt formuna gönderilir.
    expect(state).not.toBe('no');
  });

  it('oturum okunamazsa "unknown"', async () => {
    vi.resetModules();
    vi.doMock('../../lib/supabase', () => ({
      supabase: {
        auth: {
          getUser: async () => ({ data: { user: null }, error: { message: 'no session' } }),
        },
      },
    }));
    const { authService } = await import('../authService');

    expect(await authService.profileRowState()).toBe('unknown');
  });
});
