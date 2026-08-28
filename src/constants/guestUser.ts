import { UserProfile } from '../types';
import { DEFAULT_AVATAR } from '../utils/placeholders';

// ─────────────────────────────────────────────────────────────────────────
// OTURUMSUZ KULLANICI
//
// `authService.getCurrentUser()`, önbellekte oturum yoksa
// `src/data/mockData.ts` içindeki `CURRENT_USER`'ı döndürüyordu. O sabit
// UYDURMA BİR KİŞİYDİ:
//
//     "Berke Çelik", +90 532 890 12 34, Kadıköy/İstanbul,
//     güven puanı 4.88 · "Topluluk Lideri", 7 tamamlanmış takas,
//     14 değerlendirme, dört uydurma övgü, bir stok fotoğraf ve bir biyografi.
//
// Yani giriş yapmamış bir ziyaretçi, uygulamanın gözünde 4.88 puanlı
// deneyimli bir takasçıydı. `RequireAuth` gezinmeyi kesiyor ama
// `AppContext` başlangıç durumunu buradan kuruyor: oturum çözülene kadar
// ve tüm herkese açık ekranlarda (keşfet, ilan detayı) bu kimlik
// kullanılıyordu. rapor.txt §3'teki "uygulama sessizce sahte bir misafir
// kullanıcıyla devam ediyor" bulgusunun kaynağı buydu.
//
// Yerine dürüst bir boş profil: kimlik yok, geçmiş yok, uydurma puan yok.
// `id: ''` olması bilinçli — bu kimlikle yapılan hiçbir sorgu yanlışlıkla
// gerçek bir kullanıcının verisine denk gelmez.
// ─────────────────────────────────────────────────────────────────────────

export const GUEST_USER: UserProfile = {
  id: '',
  phone: '',
  fullName: '',
  avatarUrl: DEFAULT_AVATAR,
  city: '',
  district: '',
  memberSince: '',
  interests: [],
  wantedCategories: [],
  isVerified: false,
  smsVerificationEnabled: false,
  trustProfile: {
    score: 0,
    level: 'Yeni üye',
    phoneVerified: false,
    idVerified: false,
    successfulTradesCount: 0,
    cancellationRate: 0,
    averageRating: 0,
    reviewCount: 0,
    reportCount: 0,
    accountAgeDays: 0,
    positiveHighlights: [],
  },
  stats: {
    totalTrades: 0,
    activeListings: 0,
    completedLoops: 0,
    totalItemsReused: 0,
    cancellationRatePercent: 0,
  },
};
