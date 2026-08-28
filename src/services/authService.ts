import { UserProfile, CategoryId } from '../types';
import { GUEST_USER } from '../constants/guestUser';
import { DEFAULT_AVATAR } from '../utils/placeholders';
import { supabase } from '../lib/supabase';
import type { TablesUpdate } from '../types/supabase';
import { convertImageToWebp, AVATAR_MAX_PX } from '../utils/imageToWebp';
import { trustLevel } from '../utils/trustDisplay';
import { blockService } from './blockService';
import { reportServiceError } from '../lib/serviceError';

const AUTH_STORAGE_KEY = 'swaloop_auth_user';
const ONBOARDING_COMPLETED_KEY = 'swaloop_onboarding_done';
const AVATARS_BUCKET = 'avatars';

/**
 * `profiles` tablosundan çekilen kolonlar — `select('*')` YERİNE.
 *
 * GÜVENLİK: `phone` ve `email` artık istemci rollerinde (anon/authenticated)
 * SELECT hakkı olmayan kolonlar (bkz. migration 20260828000000). `*` bu iki
 * kolonu da kapsadığı için Postgres tüm sorguyu "permission denied for
 * column phone" ile reddeder. Bu yüzden buradaki açık liste kullanılıyor.
 *
 * Kullanıcının kendi telefonu/e-postası artık profilden değil, Supabase
 * oturumundan (auth.users) okunuyor — `withSessionContact()`.
 */
const PROFILE_COLUMNS =
  'id, full_name, first_name, last_name, avatar_url, bio, city, district, username, created_at, updated_at, is_admin, sms_verification_enabled, interests, wanted_categories' as const;

/**
 * BAŞKA bir kullanıcının profili için kolon listesi.
 *
 * `is_admin` ve `sms_verification_enabled` bilinçli olarak DIŞARIDA:
 * ilki kimlerin yönetici olduğunu, ikincisi hedefin iki adımlı doğrulama
 * kullanıp kullanmadığını söyler. İkisi de genel profil kartında
 * gösterilmiyor; istemeden istemciye taşınmasınlar.
 */
const PROFILE_PUBLIC_COLUMNS =
  'id, full_name, first_name, last_name, avatar_url, bio, city, district, username, created_at, interests, wanted_categories' as const;

/**
 * Oturumdaki kullanıcının kendi iletişim bilgisini profile ekler.
 *
 * `profiles.phone` / `profiles.email` istemciye hiç inmediği için (yukarıya
 * bakın) kendi numaranı gösterebilmenin tek doğru kaynağı auth oturumudur;
 * kayıt sırasında zaten oraya yazılıyor.
 */
async function withSessionContact(user: UserProfile): Promise<UserProfile> {
  const { data } = await supabase.auth.getUser();

  if (!data.user || data.user.id !== user.id) return user;

  return {
    ...user,
    phone: data.user.phone ? formatPhone(data.user.phone) : user.phone,
    email: data.user.email ?? user.email,
  };
}

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
    reportServiceError(
      'Avatar yüklenemedi: geçerli bir Supabase oturumu bulunamadı. ' +
        'Kullanıcının tekrar giriş (telefon+OTP) yapması gerekebilir.',
      authError
    );
    return null;
  }

  const ownerId = authData.user.id;
  // Avatar uzun kenarı 512 px (README "Kararlar").
  const webpFile = await convertImageToWebp(file, 0.82, AVATAR_MAX_PX);
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
    reportServiceError('Avatar yüklenemedi:', uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  return publicUrl;
}

/**
 * `createProfile` sonucu.
 *
 * Üç durum var ve üçü de çağıran tarafta ayrı ele alınmalı:
 *   * `user` dolu                  → kayıt tamam.
 *   * `user` dolu + `warning` dolu → kayıt tamam ama ikincil bir adım
 *                                    (auth tarafına e-posta yazımı) başarısız.
 *   * `error` dolu                 → kayıt olmadı; metin kullanıcıya gösterilir.
 */
export interface CreateProfileResult {
  user?: UserProfile;
  error?: string;
  warning?: string;
}

export interface PhoneCheckResult {
  exists: boolean;
  message: string;
  /** Kontrol yapılamadıysa (RPC hatası) sebebi; `exists` bu durumda anlamsızdır. */
  error?: string;
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

/**
 * Supabase'ten dönen ham hatayı, kullanıcıya gösterilebilir bir cümleye
 * çevirir.
 *
 * Giriş/kayıt akışındaki HER hata eskiden yalnızca `console.error`'a yazılıp
 * yerine sabit bir metin gösteriliyordu ("Profil oluşturulamadı. Lütfen
 * tekrar deneyin."). Ne kullanıcı ne de hatayı bildiren kişi gerçekte neyin
 * bozulduğunu görebiliyordu: SMS sağlayıcısı tanımsız mı, e-posta gönderim
 * kotası mı doldu, şifreyi politika mı reddetti — hepsi aynı cümleye
 * düşüyordu. Artık bilinen durumlar adıyla söyleniyor; bilinmeyende ham
 * mesaj parantez içinde olduğu gibi ekleniyor, böylece tek bir ekran
 * görüntüsü teşhis için yetiyor.
 */
export function describeAuthError(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const err = error as { code?: string; message?: string; status?: number };
  const message = (err.message ?? '').trim();
  const haystack = `${err.code ?? ''} ${message}`.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => haystack.includes(n));

  // ── Telefon / SMS ────────────────────────────────────────────────────────
  if (has('phone_provider_disabled', 'phone signups are disabled', 'signups not allowed')) {
    return (
      'Telefonla giriş bu Supabase projesinde kapalı. ' +
      'Authentication → Providers altından Phone sağlayıcısını açın.'
    );
  }

  if (
    has(
      'sms_send_failed',
      'error sending confirmation otp',
      'error sending sms',
      'unsupported phone provider'
    )
  ) {
    return (
      'SMS gönderilemedi: Supabase projesinde bir SMS sağlayıcısı ' +
      '(Twilio / Vonage / MessageBird) tanımlı değil ya da sağlayıcı isteği reddetti.'
    );
  }

  if (has('over_sms_send_rate_limit')) {
    return 'Çok fazla SMS istendi. Bir süre bekleyip tekrar deneyin.';
  }

  if (has('otp_expired', 'token has expired')) {
    return 'Doğrulama kodunun süresi doldu ya da kod hatalı. Yeni bir kod isteyin.';
  }

  if (has('invalid_credentials', 'invalid login credentials')) {
    return 'Telefon numarası veya şifre hatalı.';
  }

  // ── E-posta ──────────────────────────────────────────────────────────────
  if (has('email_exists', 'already been registered', 'already registered')) {
    return 'Bu e-posta adresi başka bir hesapta kayıtlı. Farklı bir e-posta girin.';
  }

  if (has('over_email_send_rate_limit')) {
    return (
      'E-posta gönderim sınırına takıldı (Supabase varsayılanı saatte 2 e-postadır). ' +
      'Bir süre bekleyin ya da projeye kendi SMTP sunucunuzu tanımlayın.'
    );
  }

  if (has('email_address_invalid', 'unable to validate email')) {
    return 'E-posta adresi geçersiz görünüyor.';
  }

  // ── Şifre ────────────────────────────────────────────────────────────────
  if (has('weak_password', 'password should be', 'password is too short')) {
    return `Şifre, Supabase projesinin şifre politikasını karşılamıyor. ${message}`.trim();
  }

  if (has('same_password')) {
    return 'Yeni şifre eskisiyle aynı olamaz.';
  }

  if (has('reauthentication_needed')) {
    return 'Şifre değişikliği için yeniden doğrulama gerekiyor.';
  }

  // ── Genel ────────────────────────────────────────────────────────────────
  if (has('over_request_rate_limit') || err.status === 429) {
    return 'Çok fazla deneme yapıldı. Kısa bir süre bekleyip tekrar deneyin.';
  }

  if (has('failed to fetch', 'networkerror', 'network request failed')) {
    return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  }

  return message ? `${fallback} (${message})` : fallback;
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
    reportServiceError('Trust profile alınamadı:', error);
    return null;
  }

  return data;
}

// Seviye artık ham skordan türetilMİYOR. Sebep: `trust_profiles.trust_score`
// kolonunun DB varsayılanı 5 ve hiç değerlendirilmemiş kullanıcıda da 5
// kalıyor — eski `trustLevelFromScore(5)` bu yüzden sıfır takaslı yeni bir
// üyeyi "Topluluk Lideri" diye etiketliyordu. Türetme gerçek geçmişe
// (değerlendirme sayısı + tamamlanan takas) taşındı:
// bkz. src/utils/trustDisplay.ts → trustLevel().

/**
 * Ham `profiles` satırını UserProfile'a çevirir.
 *
 * NOT: `row.phone` / `row.email` artık HİÇBİR sorgudan gelmez — bu iki
 * kolonda istemci rollerinin SELECT hakkı yok (migration 20260828000000).
 * Kendi numaranı `withSessionContact()` auth oturumundan ekler; karşı
 * tarafın numarası hiçbir ekranda gösterilmediği için boş kalır.
 *
 * `row` bilerek NULL kabul ediyor: join'lerde karşı tarafın profili
 * gelmeyebilir (satır silinmiş, RLS elemiş ya da PostgREST embed'i boş
 * dönmüş olabilir). Önceden bu durumda `row.id` okunduğu için
 * "Cannot read properties of null" hatasıyla tüm sayfa çöküyordu —
 * mesaj listesi, teklif listesi ve döngü katılımcıları bu yoldan
 * geçtiği için tek bozuk satır ekranın tamamını boşaltıyordu.
 * Artık anonim bir yer tutucu profil üretiliyor.
 */
/**
 * Birden çok kullanıcının `trust_profiles` satırını TEK sorguda çeker.
 *
 * `mapProfile(row)` ikinci argüman olmadan çağrıldığında güven bilgisi boş
 * kalır ve kullanıcı arayüzde "Yeni üye" görünür. Takas ve sohbet
 * ekranlarında tam olarak bu oluyordu: karşı tarafın profili `profiles`
 * join'inden geliyor ama `trust_profiles` hiç okunmuyordu — yani takası
 * kabul edip etmeme kararını verirken karşındakinin sicili HİÇ
 * gösterilmiyordu.
 *
 * (Eskiden bu boşluk arayüzde `?? 4.8` ile kapatılıyordu; yani veri yoktu
 * ve yerine uydurma bir puan konuyordu. Doğru çözüm veriyi çekmek.)
 */
export async function fetchTrustProfiles(
  userIds: string[]
): Promise<Map<string, any>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const byUser = new Map<string, any>();

  if (!ids.length) return byUser;

  const { data, error } = await supabase
    .from('trust_profiles')
    .select('*')
    .in('user_id', ids);

  if (error) {
    reportServiceError('Güven profilleri alınamadı:', error);
    return byUser;
  }

  for (const row of data ?? []) {
    if (row.user_id) byUser.set(row.user_id, row);
  }

  return byUser;
}

export function mapProfile(row: any, trust?: any | null): UserProfile {
  if (!row) {
    row = { id: '', full_name: 'Swaloop Kullanıcısı' };
  }

  const completedTrades = trust?.completed_trades ?? 0;
  const cancelledTrades = trust?.cancelled_trades ?? 0;
  const totalTrades = completedTrades + cancelledTrades;
  const score = trust?.trust_score ?? 5;
  const reviewCount = trust?.review_count ?? 0;
  const averageRating = trust?.average_rating ?? 0;

  return {
    id: row.id,
    phone: formatPhone(row.phone ?? ''),
    fullName: row.full_name ?? '',
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    email: row.email ?? undefined,
    avatarUrl: row.avatar_url || DEFAULT_AVATAR,
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
      level: trustLevel(reviewCount, completedTrades, averageRating),
      phoneVerified: true,
      idVerified: trust?.verification_level === 'id_verified',
      successfulTradesCount: completedTrades,
      cancellationRate:
        totalTrades > 0 ? cancelledTrades / totalTrades : 0,
      // trust_profiles.average_rating / review_count artık reviews
      // tablosundan trigger ile gerçek zamanlı besleniyor (bkz.
      // supabase/migrations/20260819120000_add_badge_trust_tracking.sql).
      //
      // Değerlendirme yokken varsayılan 5 DEĞİL 0: "hiç puan almamış"
      // ile "tam puan almış" aynı şey değil. Arayüz ikisini
      // `reviewCount === 0` ile ayırt eder (src/utils/trustDisplay.ts).
      averageRating,
      reviewCount,
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
      // "Öne çıkan geri bildirimler" gerçek değerlendirme boyutlarından
      // türetilmeli. Böyle bir hesap henüz yok; sabit bir liste
      // ("Zamanında Teslim", "Hızlı İletişim"…) döndürmek karşı tarafa
      // hiç alınmamış övgüleri göstermek demekti. Hesap gelene kadar boş.
      positiveHighlights: [],
    },

    stats: {
      totalTrades: completedTrades,
      activeListings: 0,
      // trust_profiles.completed_loops, loop_participants tamamlanınca
      // trigger ile artırılıyor (bkz. yukarıdaki migration notu).
      completedLoops: trust?.completed_loops ?? 0,
      totalItemsReused: 0,
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
      reportServiceError('Supabase session error:', error);
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
      reportServiceError('Telefon kontrolü başarısız:', error);

      return {
        exists: false,
        message: 'Telefon kontrolü yapılamadı.',
        error: describeAuthError(error, 'Telefon kontrolü yapılamadı.'),
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
      reportServiceError('OTP gönderilemedi:', error);

      return {
        success: false,
        error: describeAuthError(error, 'SMS kodu gönderilemedi.'),
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
      reportServiceError('OTP doğrulama başarısız:', error);

      return {
        success: false,
        isNewUser: false,
        error: describeAuthError(error, 'Kod doğrulanamadı.'),
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', data.user.id)
      .maybeSingle();

    // Sorgu HATASI ile "profil yok" AYNI ŞEY DEĞİL. Hata `data`'yı da null
    // bıraktığı için eskiden ikisi de `isNewUser: true` dönüyordu: geçici
    // bir ağ/RLS hatasında mevcut kullanıcı "yeni kullanıcı" sayılıp profil
    // oluşturma ekranına gönderiliyor ve kendi profilinin (bio, konum,
    // fotoğraf, ilgi alanları) üzerine yazıyordu.
    if (profileError) {
      reportServiceError('Profil okunamadı:', profileError);

      return {
        success: false,
        isNewUser: false,
        error: describeAuthError(
          profileError,
          'Girişin doğrulandı ama profilin okunamadı. Lütfen tekrar dene.'
        ),
      };
    }

    if (!profile) {
      return {
        success: true,
        isNewUser: true,
      };
    }

    const trust = await getTrustProfileRow(profile.id);
    const user = await withSessionContact(mapProfile(profile, trust));

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
    /**
     * Şifre doğru, oturum açıldı ama `profiles` satırı yok: kullanıcı
     * kaydını yarıda bırakmış. Oturum bilerek AÇIK bırakılır; çağıran
     * taraf kullanıcıyı `/profil-olustur` adımına göndermelidir.
     */
    needsProfile?: boolean;
    user?: UserProfile;
    error?: string;
  }> {
    const normalizedPhone = normalizePhone(phone);

    const { data, error } = await supabase.auth.signInWithPassword({
      phone: normalizedPhone,
      password,
    });

    if (error || !data.user) {
      reportServiceError('Şifre ile giriş başarısız:', error);

      return {
        success: false,
        requiresOtp: false,
        error: describeAuthError(error, 'Telefon numarası veya şifre hatalı.'),
      };
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      reportServiceError('Profil okunamadı:', profileError);
      await supabase.auth.signOut();

      return {
        success: false,
        requiresOtp: false,
        error: describeAuthError(profileError, 'Kullanıcı profili okunamadı.'),
      };
    }

    // Şifre doğru ama profil satırı yok. Bu bir hata değil, YARIM KALMIŞ BİR
    // KAYIT: telefon+OTP ile auth kullanıcısı açılmış, ardından
    // CreateProfilePage tamamlanmadan çıkılmış (ya da profil kaydı bir hata
    // aldığı için hiç yazılamamış).
    //
    // Önceden burada oturum kapatılıp "Kullanıcı profili bulunamadı." deniyor
    // ve kullanıcı KALICI olarak dışarıda kalıyordu: giriş bu duvara
    // çarpıyor, kayıt ise numara zaten auth'ta var diye ilerlemiyordu.
    // Artık oturum korunuyor ve kullanıcı kaldığı adımdan devam ediyor.
    if (!profileRow) {
      return {
        success: true,
        requiresOtp: false,
        needsProfile: true,
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
          error: otpResult.error ?? 'SMS kodu gönderilemedi.',
        };
      }

      return {
        success: true,
        requiresOtp: true,
      };
    }

    const trust = await getTrustProfileRow(profileRow.id);
    const user = await withSessionContact(mapProfile(profileRow, trust));

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
      .select(PROFILE_COLUMNS)
      .single();

    if (error || !data) {
      reportServiceError('SMS doğrulama tercihi güncellenemedi:', error);
      return undefined;
    }

    const trust = await getTrustProfileRow(data.id);
    const user = await withSessionContact(mapProfile(data, trust));

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
  }): Promise<CreateProfileResult> {
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      reportServiceError('Profil oluşturmak için giriş gerekli:', authError);

      return {
        error: describeAuthError(
          authError,
          'Oturum bulunamadı. Lütfen telefon numaranı yeniden doğrula.'
        ),
      };
    }

    const userId = authData.user.id;

    // Numaranın doğruluk kaynağı OTURUM, form değil. `data.phone` router
    // state'inden geliyor ve o state sayfa yenilenince kayboluyor; çağıran
    // ekran bu durumda kendi demo numarasına düşüyordu, yani profile YANLIŞ
    // bir numara yazılabiliyordu. Oturumdaki numara zaten OTP ile doğrulanmış
    // olan numaradır.
    const phone = normalizePhone(authData.user.phone || data.phone);
    const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();

    // Şifre ve e-posta AYRI AYRI yazılıyor; sırası da bilinçli.
    //
    // Önceden ikisi tek bir `updateUser({ password, email })` çağrısındaydı ve
    // çağrı hata verdiğinde kayıt tümden iptal ediliyordu — kullanıcı yalnızca
    // "Profil oluşturulamadı. Lütfen tekrar deneyin." görüyordu. Oysa e-posta
    // tarafı, şifreyle hiç ilgisi olmayan sebeplerle çok kolay hata verir:
    // doğrulama postası Supabase'in varsayılan gönderim kotasına (saatte 2)
    // takılır ya da adres başka bir hesapta kayıtlıdır. Sonuç: kullanıcı
    // kaydını hiç tamamlayamıyor, profili olmadığı için sonraki girişte de
    // duvara çarpıyordu.
    //
    // Şifre kritiktir (sonraki girişin tek yolu) — başarısızsa kayıt durur.
    // E-posta ise `profiles.email` içinde zaten saklanıyor; auth tarafına
    // yazılamazsa kayıt tamamlanır, kullanıcıya yalnızca uyarı gösterilir.
    const { error: passwordError } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (passwordError) {
      reportServiceError('Şifre ayarlanamadı:', passwordError);

      return {
        error: describeAuthError(passwordError, 'Şifre ayarlanamadı.'),
      };
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
      .select(PROFILE_COLUMNS)
      .single();

    if (error || !profile) {
      reportServiceError('Profil oluşturulamadı:', error);

      return {
        error: describeAuthError(error, 'Profil kaydedilemedi.'),
      };
    }

    // Profil satırı yazıldı; buradan sonrası artık kaydı geri almaz.
    const { error: emailError } = await supabase.auth.updateUser({
      email: data.email.trim(),
    });

    if (emailError) {
      reportServiceError('E-posta hesaba eklenemedi:', emailError);
    }

    const trust = await getTrustProfileRow(profile.id);

    // Telefon/e-posta `profiles`'tan geri OKUNAMADIĞI için (kolon yetkisi
    // yok, bkz. PROFILE_COLUMNS) az önce yazılan değerler doğrudan
    // kullanılıyor. `auth.users.email` yeni bir e-postada doğrulama
    // beklediği için oturumdan hemen gelmeyebilir.
    const newUser: UserProfile = {
      ...(await withSessionContact(mapProfile(profile, trust))),
      phone: formatPhone(phone),
      email: data.email.trim(),
    };

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(newUser)
    );

    return {
      user: newUser,
      warning: emailError
        ? `${describeAuthError(emailError, 'E-posta adresi hesabına eklenemedi.')} ` +
          'Profilin oluşturuldu; e-postanı sonra Profil → Düzenle üzerinden ekleyebilirsin.'
        : undefined,
    };
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
      .select(PROFILE_COLUMNS)
      .eq('id', authData.user.id)
      .maybeSingle();

    if (error || !profile) {
      return null;
    }

    const trust = await getTrustProfileRow(profile.id);
    const user = await withSessionContact(mapProfile(profile, trust));

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
    // GÜVENLİK: burada `select('*')` KULLANILMAMALI — bkz. PROFILE_COLUMNS.
    // `phone`/`email` kolonlarında istemci rollerinin SELECT hakkı yok
    // (20260828000000); `*` sorguyu tümden reddettirir. Genel profil
    // kartında bu alanların hiçbiri zaten gösterilmiyor; mapProfile eksik
    // alanlar için boş değere düşüyor.
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(PROFILE_PUBLIC_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error || !profile) {
      reportServiceError('Kullanıcı profili bulunamadı:', error);
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

    return GUEST_USER;
  },

  /**
   * GERÇEK Supabase oturumu var mı? (localStorage'daki önbellek DEĞİL.)
   * Route koruması bunu kullanır — bkz. components/auth/RequireAuth.tsx.
   *
   * `getUser()` DEĞİL `getSession()`: `getUser()` her çağrıda Supabase'e AĞ
   * İSTEĞİ atıyor. Rota koruması bunu her gezinmede çalıştırdığı için
   * metroda bir saniyelik kopma, oturumu GEÇERLİ olan kullanıcıyı /giris'e
   * fırlatıyordu. `getSession()` yereli okur ve supabase-js süresi dolmuş
   * token'ı kendi yeniler.
   */
  async hasActiveSession(): Promise<boolean> {
    const { data, error } = await supabase.auth.getSession();

    return !error && !!data.session;
  },

  /**
   * Önbellekteki kullanıcıyı düşürür.
   *
   * Supabase oturumu kendiliğinden düştüğünde (token yenilenemedi, oturum
   * sunucuda iptal edildi) `swaloop_auth_user` silinmiyordu ve
   * `getCurrentUser()` tam da o eski kaydı okuyordu: kullanıcı çıkmış
   * olmasına rağmen adı, avatarı ve `isAdmin` bayrağı ekranda kalmaya
   * devam ediyordu.
   */
  clearCachedUser() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  /**
   * Oturum sahibinin profil SATIRI var mı?
   *
   *   'yes'      → var
   *   'no'       → oturum var ama satır YOK (kayıt yarıda kalmış)
   *   'unknown'  → sorulamadı (ağ hatası, RLS, sunucu)
   *
   * Bu ayrım şart. `getCurrentUserFromSupabase()` hem "profil yok" hem
   * "sorgu patladı" için `null` dönüyor; ikisini aynı saymak, ağı bir
   * saniye kopan MEVCUT bir kullanıcıyı kayıt formuna göndermek demekti.
   * Bilmiyorsak kullanıcıyı hiçbir yere sürüklemiyoruz.
   */
  async profileRowState(): Promise<'yes' | 'no' | 'unknown'> {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return 'unknown';
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (error) {
      return 'unknown';
    }

    return data ? 'yes' : 'no';
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

    // Engel listesi oturum içi önbellekte tutuluyor. Çıkış yapılınca
    // düşürülmezse, aynı cihazda başka bir hesapla girildiğinde önceki
    // kullanıcının engel listesi ilk sorguya kadar geçerli kalıyordu.
    blockService.invalidateCache();
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
      .select(PROFILE_COLUMNS)
      .single();

    if (error || !data) {
      reportServiceError('Profil güncellenemedi:', error);
      return undefined;
    }

    const trust = await getTrustProfileRow(data.id);
    const user = await withSessionContact(mapProfile(data, trust));

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify(user)
    );

    return user;
  },
};