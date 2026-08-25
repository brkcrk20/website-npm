import { UserProfile, CategoryId, TrustProfile } from '../types';
import { CURRENT_USER } from '../data/mockData';
import { supabase } from '../lib/supabase';
import type { TablesUpdate } from '../types/supabase';
import { convertImageToWebp } from '../utils/imageToWebp';

const AUTH_STORAGE_KEY = 'swaloop_auth_user';
const ONBOARDING_COMPLETED_KEY = 'swaloop_onboarding_done';
const AVATARS_BUCKET = 'avatars';

/**
 * Kullanıcının seçtiği gerçek profil fotoğrafını Supabase Storage'a
 * ({auth.uid()}/avatar-{random}.webp yoluna) yükler ve public URL'ini
 * döndürür. `uploadListingImages` ile aynı desen — bkz.
 * supabase/migrations/20260819100000_create_avatars_storage_bucket.sql
 *
 * Önceki durum: EditProfilePage'deki kamera butonu hiçbir şey yüklemiyor,
 * sadece sabit bir stok görsele set ediyordu (gerçek dosya seçimi yoktu).
 */
async function uploadAvatar(file: File): Promise<string | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    console.error(
      'Avatar yüklenemedi: geçerli bir Supabase oturumu bulunamadı. ' +
        'Kullanıcının tekrar giriş (telefon+OTP) yapması gerekebilir.',
      authError
    );
    return null;
  }

  const ownerId = authData.user.id;
  const webpFile = await convertImageToWebp(file);
  const fileExt = webpFile.name.split('.').pop() || 'jpg';
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Her yükleme yeni bir dosya adı alır (upsert değil) — böylece eski
  // avatar'ın CDN/tarayıcı önbelleğinde takılı kalma riski olmaz.
  const path = `${ownerId}/avatar-${randomId}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, webpFile, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Avatar yüklenemedi:', uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  return publicUrl;
}

export interface PhoneCheckResult {
  exists: boolean;
  message: string;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('90')) {
    return `+${cleaned}`;
  }

  if (cleaned.startsWith('0')) {
    return `+90${cleaned.slice(1)}`;
  }

  if (cleaned.startsWith('5')) {
    return `+90${cleaned}`;
  }

  return `+${cleaned}`;
}

function formatPhone(phone: string): string {
  const digits = normalizePhone(phone).replace(/\D/g, '');

  if (digits.startsWith('90') && digits.length === 12) {
    const tr = digits.slice(2);

    return `+90 ${tr.slice(0, 3)} ${tr.slice(3, 6)} ${tr.slice(6, 8)} ${tr.slice(8, 10)}`;
  }

  return phone;
}

// public.trust_profiles satırı, her profile INSERT'inde DB tetikleyicisi
// (create_trust_profile) tarafından otomatik oluşturuluyor. Önceden bu veri
// hiç okunmuyor, her kullanıcı için sabit "score: 5" gösteriliyordu.
async function getTrustProfileRow(userId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('trust_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Trust profile alınamadı:', error);
    return null;
  }

  return data;
}

function trustLevelFromScore(
  score: number
): TrustProfile['level'] {
  if (score >= 4.5) return 'Topluluk Lideri';
  if (score >= 3.5) return 'Çok Güvenilir';
  if (score >= 2.5) return 'Güvenilir';
  return 'Başlangıç';
}

export function mapProfile(row: any, trust?: any | null): UserProfile {
  const completedTrades = trust?.completed_trades ?? 0;
  const cancelledTrades = trust?.cancelled_trades ?? 0;
  const totalTrades = completedTrades + cancelledTrades;
  const score = trust?.trust_score ?? 5;

  return {
    id: row.id,
    phone: formatPhone(row.phone ?? ''),
    fullName: row.full_name ?? '',
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    avatarUrl:
      row.avatar_url ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    city: row.city ?? '',
    district: row.district ?? '',
    bio: row.bio ?? undefined,
    isAdmin: row.is_admin ?? false,
    memberSince: row.created_at
      ? new Date(row.created_at).toLocaleDateString('tr-TR')
      : 'Bugün',

    // Rapor md. 13: "ilgi alanı" (profil kişiselleştirmesi) ile "aradığım
    // kategoriler" (eşleştirme motoru girdisi) AYRI iki alandır. İkisi de
    // artık profiles tablosunda kalıcı — önceden burada sabit [] dönülüyor,
    // yani kayıt formunda seçilen değerler sessizce kayboluyordu.
    interests: Array.isArray(row.interests) ? (row.interests as CategoryId[]) : [],
    wantedCategories: Array.isArray(row.wanted_categories)
      ? (row.wanted_categories as CategoryId[])
      : [],

    isVerified: true,
    smsVerificationEnabled: row.sms_verification_enabled ?? false,

    trustProfile: {
      score,
      level: trustLevelFromScore(score),
      phoneVerified: true,
      idVerified: trust?.verification_level === 'id_verified',
      successfulTradesCount: completedTrades,
      cancellationRate:
        totalTrades > 0 ? cancelledTrades / totalTrades : 0,
      responseRate: trust?.response_rate ?? 1,
      // trust_profiles.average_rating / review_count artık reviews
      // tablosundan trigger ile gerçek zamanlı besleniyor (bkz.
      // supabase/migrations/20260819120000_add_badge_trust_tracking.sql).
      averageRating: trust?.average_rating ?? 5,
      reviewCount: trust?.review_count ?? 0,
      reportCount: 0,
      accountAgeDays: row.created_at
        ? Math.max(
            1,
            Math.floor(
              (Date.now() - new Date(row.created_at).getTime()) /
                86400000
            )
          )
        : 1,
      positiveHighlights: ['Telefon doğrulandı'],
    },

    stats: {
      totalTrades: completedTrades,
      activeListings: 0,
      // trust_profiles.completed_loops, loop_participants tamamlanınca
      // trigger ile artırılıyor (bkz. yukarıdaki migration notu).
      completedLoops: trust?.completed_loops ?? 0,
      totalItemsReused: 0,
      responseRatePercent: Math.round((trust?.response_rate ?? 1) * 100),
      avgResponseTimeMinutes: 0,
      cancellationRatePercent:
        totalTrades > 0
          ? Math.round((cancelledTrades / totalTrades) * 100)
          : 0,
    },
  };
}

export const authService = {
  uploadAvatar,

  async getSupabaseSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Supabase session error:', error);
      return null;
    }

    return data.session;
  },

  formatPhoneNumber(raw: string): string {
    const cleaned = raw.replace(/\D/g, '');

    let digits = cleaned;

    if (digits.startsWith('90')) {
      digits = digits.slice(2);
    }

    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    digits = digits.slice(0, 10);

    if (!digits) return '';

    if (digits.length <= 3) {
      return `+90 ${digits}`;
    }

    if (digits.length <= 6) {
      return `+90 ${digits.slice(0, 3)} ${digits.slice(3)}`;
    }

    if (digits.length <= 8) {
      return `+90 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }

    return `+90 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
  },

  isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');

    const normalized = digits.startsWith('90')
      ? digits.slice(2)
      : digits.startsWith('0')
        ? digits.slice(1)
        : digits;

    return normalized.length === 10 && normalized.startsWith('5');
  },

  // En az 8 karakter, en az 1 harf ve en az 1 rakam.
  isValidPassword(password: string): boolean {
    if (password.length < 8) return false;
    return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) && /\d/.test(password);
  },

  isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },

  async checkPhoneRegistered(
    formattedPhone: string
  ): Promise<PhoneCheckResult> {
    const phone = normalizePhone(formattedPhone);

    // GÜVENLİK: bu kontrol önceden `profiles` tablosuna doğrudan bir SELECT
    // atıyordu. `profiles_select_all` politikası `using (true)` olduğu için,
    // anon anahtara sahip herkes bu uç noktayı numara numara deneyerek hangi
    // telefonların kayıtlı olduğunu çıkarabiliyordu. Yalnızca boolean
    // döndüren phone_exists() RPC'sine taşındı (bkz. migration
    // 20260825000000_phone_privacy_and_message_integrity.sql).
    const { data, error } = await supabase.rpc('phone_exists', {
      check_phone: phone,
    });

    if (error) {
      console.error('Telefon kontrolü başarısız:', error);

      return {
        exists: false,
        message: 'Telefon kontrolü yapılamadı.',
      };
    }

    return {
      exists: data === true,
      message: data === true
        ? 'Bu telefon numarasına ait aktif bir Swaloop hesabı zaten bulunmaktadır. Lütfen giriş yapınız.'
        : 'Telefon numarası kullanılabilir.',
    };
  },

  async sendOtp(
    phone: string
  ): Promise<{ success: boolean; demoCode?: string; error?: string }> {
    const normalizedPhone = normalizePhone(phone);

    const { error } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    });

    if (error) {
      console.error('OTP gönderilemedi:', error);

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
    };
  },

  async verifyOtp(
    phone: string,
    otpCode: string
  ): Promise<{
    success: boolean;
    isNewUser: boolean;
    user?: UserProfile;
    error?: string;
  }> {
    const normalizedPhone = normalizePhone(phone);

    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otpCode,
      type: 'sms',
    });

    if (error || !data.user) {
      console.error('OTP doğrulama başarısız:', error);

      return {
        success: false,
        isNewUser: false,
        error: error?.message || 'Kod doğrulanamadı.',
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!profile) {
      return {
        success: true,
        isNewUser: true,
      };
    }

    const trust = await getTrustProfileRow(profile.id);
    const user = mapProfile(profile, trust);

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(user)
    );

    return {
      success: true,
      isNewUser: false,
      user,
    };
  },

  /**
   * Telefon + şifre ile giriş. Kullanıcının profilinde
   * `sms_verification_enabled` açıksa şifre doğru olsa bile oturum hemen
   * açılmaz: oturum kapatılır, yeni bir SMS kodu gönderilir ve çağıran
   * taraf (`PhoneAuthPage`) kullanıcıyı `/dogrulama` sayfasına yönlendirip
   * `authService.verifyOtp` ile ikinci faktörü tamamlatmalıdır.
   */
  async loginWithPassword(
    phone: string,
    password: string
  ): Promise<{
    success: boolean;
    requiresOtp: boolean;
    user?: UserProfile;
    error?: string;
  }> {
    const normalizedPhone = normalizePhone(phone);

    const { data, error } = await supabase.auth.signInWithPassword({
      phone: normalizedPhone,
      password,
    });

    if (error || !data.user) {
      console.error('Şifre ile giriş başarısız:', error);

      return {
        success: false,
        requiresOtp: false,
        error: error?.message || 'Telefon numarası veya şifre hatalı.',
      };
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profileRow) {
      console.error('Profil bulunamadı:', profileError);
      await supabase.auth.signOut();

      return {
        success: false,
        requiresOtp: false,
        error: 'Kullanıcı profili bulunamadı.',
      };
    }

    if (profileRow.sms_verification_enabled) {
      // Kullanıcı ekstra SMS doğrulaması istiyor: şifre oturumunu kapat,
      // yeni bir OTP kodu gönder; asıl oturum OTP doğrulandığında açılacak.
      await supabase.auth.signOut();

      const otpResult = await this.sendOtp(phone);

      if (!otpResult.success) {
        return {
          success: false,
          requiresOtp: true,
          error: otpResult.error || 'SMS kodu gönderilemedi.',
        };
      }

      return {
        success: true,
        requiresOtp: true,
      };
    }

    const trust = await getTrustProfileRow(profileRow.id);
    const user = mapProfile(profileRow, trust);

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

    return {
      success: true,
      requiresOtp: false,
      user,
    };
  },

  /**
   * Profil ayarlarından "her girişte SMS doğrulaması iste" tercihini
   * günceller.
   */
  async setSmsVerificationEnabled(
    enabled: boolean
  ): Promise<UserProfile | undefined> {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return undefined;
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        sms_verification_enabled: enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('SMS doğrulama tercihi güncellenemedi:', error);
      return undefined;
    }

    const trust = await getTrustProfileRow(data.id);
    const user = mapProfile(data, trust);

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

    return user;
  },

  async createProfile(data: {
    phone: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    city: string;
    district: string;
    avatarUrl?: string;
    username?: string;
    bio?: string;
    interests?: CategoryId[];
    wantedCategories?: CategoryId[];
  }): Promise<UserProfile | undefined> {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      console.error('Profil oluşturmak için giriş gerekli:', authError);

      return undefined;
    }

    const userId = authData.user.id;
    const phone = normalizePhone(data.phone);
    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();

    // Telefon+OTP ile açılan oturuma artık bir şifre ve e-posta tanımlıyoruz;
    // böylece kullanıcı sonraki girişlerde telefon + şifre ile
    // (her seferinde SMS beklemeden) oturum açabilir.
    const { error: updateAuthError } = await supabase.auth.updateUser({
      password: data.password,
      email: data.email,
    });

    if (updateAuthError) {
      console.error('Şifre/e-posta ayarlanamadı:', updateAuthError);

      return undefined;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          phone,
          full_name: fullName,
          first_name: data.firstName.trim(),
          last_name: data.lastName.trim(),
          email: data.email.trim(),
          city: data.city,
          district: data.district,
          avatar_url: data.avatarUrl ?? null,
          username: data.username?.trim() || null,
          bio: data.bio?.trim() || null,
          interests: data.interests ?? [],
          wanted_categories: data.wantedCategories ?? [],
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'id',
        }
      )
      .select('*')
      .single();

    if (error || !profile) {
      console.error('Profil oluşturulamadı:', error);

      return undefined;
    }

    const trust = await getTrustProfileRow(profile.id);
    const newUser = mapProfile(profile, trust);

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(newUser)
    );

    return newUser;
  },

  async getCurrentUserFromSupabase(): Promise<UserProfile | null> {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return null;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (error || !profile) {
      return null;
    }

    const trust = await getTrustProfileRow(profile.id);
    const user = mapProfile(profile, trust);

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(user)
    );

    return user;
  },

  /**
   * Başka bir kullanıcının (kendisi olmayan) genel profilini id ile çeker.
   * PublicProfilePage burayı kullanır — önceden tamamen OTHER_USERS mock
   * verisiyle çalışıyordu, gerçek Supabase profiline hiç bağlı değildi.
   */
  async getPublicProfile(userId: string): Promise<UserProfile | null> {
    // GÜVENLİK: burada `select('*')` KULLANILMAMALI. `profiles` üzerindeki
    // RLS politikası satır bazlıdır (`profiles_select_all ... using (true)`)
    // ve Postgres'te kolon bazlı RLS yoktur — `*` ile sorgulandığında
    // başka bir kullanıcının telefon numarası ve e-postası istemciye
    // iniyordu. Genel profil kartında bunların hiçbiri gösterilmiyor.
    // mapProfile eksik alanlar için zaten boş değere düşüyor.
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url, bio, city, district, username, created_at, interests, wanted_categories')
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      console.error('Kullanıcı profili bulunamadı:', error);
      return null;
    }

    const trust = await getTrustProfileRow(profile.id);
    return mapProfile(profile, trust);
  },

  getCurrentUser(): UserProfile {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);

    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // devam
      }
    }

    return CURRENT_USER;
  },

  /**
   * GERÇEK Supabase oturumu var mı? (localStorage'daki önbellek DEĞİL.)
   * Route koruması bunu kullanır — bkz. components/auth/RequireAuth.tsx.
   */
  async hasActiveSession(): Promise<boolean> {
    const { data, error } = await supabase.auth.getUser();

    return !error && !!data.user;
  },

  isOnboardingDone(): boolean {
    return (
      localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true'
    );
  },

  setOnboardingDone(done = true) {
    localStorage.setItem(
      ONBOARDING_COMPLETED_KEY,
      done ? 'true' : 'false'
    );
  },

  async logout() {
    await supabase.auth.signOut();

    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  },

  async updateUserProfile(
    updates: Partial<UserProfile>
  ): Promise<UserProfile | undefined> {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return undefined;
    }

    const dbUpdates: TablesUpdate<'profiles'> = {};

    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const firstName = updates.firstName?.trim() ?? '';
      const lastName = updates.lastName?.trim() ?? '';
      dbUpdates.first_name = firstName || null;
      dbUpdates.last_name = lastName || null;
      // Kayıt akışıyla (createProfile) tutarlı: `full_name` her zaman
      // first_name + last_name birleşiminden türetilir, bu yüzden
      // Ad/Soyad ayrı ayrı düzenlense bile görünen ad senkron kalır.
      dbUpdates.full_name = `${firstName} ${lastName}`.trim();
    } else if (updates.fullName !== undefined) {
      dbUpdates.full_name = updates.fullName;
    }

    if (updates.avatarUrl !== undefined) {
      dbUpdates.avatar_url = updates.avatarUrl;
    }

    if (updates.city !== undefined) {
      dbUpdates.city = updates.city;
    }

    if (updates.district !== undefined) {
      dbUpdates.district = updates.district;
    }

    if (updates.bio !== undefined) {
      dbUpdates.bio = updates.bio;
    }

    if (updates.interests !== undefined) {
      dbUpdates.interests = updates.interests;
    }

    if (updates.wantedCategories !== undefined) {
      dbUpdates.wanted_categories = updates.wantedCategories;
    }

    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', authData.user.id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Profil güncellenemedi:', error);
      return undefined;
    }

    const trust = await getTrustProfileRow(data.id);
    const user = mapProfile(data, trust);

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(user)
    );

    return user;
  },
};