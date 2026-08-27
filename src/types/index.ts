export type ListingCondition = 'zero' | 'like_new' | 'very_good' | 'good' | 'acceptable';
export type ProductCondition = ListingCondition;

// NOT: Bu id'ler artık doğrudan canlı Supabase `categories` tablosundaki
// `slug` sütunuyla birebir aynı (bkz. swaloop-devam-plani.md §7). Önceden
// burada Türkçe id'ler vardı (`elektronik`, `ev_yasam`, `arac_parca`,
// `kitap_muzik`, `bebek_cocuk`, `diger`) ama DB'deki gerçek slug'lar
// İngilizce ve farklı bir kategori kümesiydi (`arac_parca`/`kitap_muzik`/
// `bebek_cocuk` DB'de hiç yok; DB'de ayrıca `photography`/`collectibles`
// var ama frontend'de hiç yoktu). İlan oluşturma bu yüzden "Geçersiz
// kategori" hatası veriyordu — bkz. `listingService.ts` `getCategoryUuid`.
// Artık id = DB slug olduğu için ayrı bir çeviri katmanına gerek yok.
export type CategoryId =
  | 'electronics'
  | 'home-living'
  | 'sports'
  | 'fashion'
  | 'hobby'
  | 'books'
  | 'music'
  | 'photography'
  | 'collectibles'
  | 'other';

export interface Category {
  id: CategoryId;
  name: string;
  iconName: string;
  color: string;
  itemCount: number;
}

export interface UserProfile {
  id: string;
  phone: string; // Masked: +90 5XX XXX XX XX
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatarUrl: string;
  city: string;
  district: string;
  memberSince: string;
  bio?: string;
  isAdmin?: boolean;
  interests: CategoryId[];
  wantedCategories: CategoryId[];
  isVerified: boolean;
  // true ise her girişte şifreden sonra ayrıca SMS/OTP doğrulaması istenir.
  // Varsayılan false: normal girişte sadece telefon + şifre yeterlidir.
  smsVerificationEnabled: boolean;
  trustProfile: TrustProfile;
  stats: {
    totalTrades: number;
    activeListings: number;
    completedLoops: number;
    totalItemsReused: number;
    responseRatePercent: number;
    avgResponseTimeMinutes: number;
    cancellationRatePercent: number;
  };
}

export interface TrustProfile {
  score: number; // 0.00 to 5.00
  level: 'Başlangıç' | 'Güvenilir' | 'Çok Güvenilir' | 'Topluluk Lideri' | 'Güvenilir Üye' | 'Doğrulanmış Üye';
  phoneVerified: boolean;
  idVerified: boolean;
  successfulTradesCount: number;
  cancellationRate: number; // e.g. 0.02 = 2%
  responseRate: number; // e.g. 0.98 = 98%
  averageRating: number;
  reviewCount: number;
  reportCount: number;
  accountAgeDays: number;
  positiveHighlights: string[];
}

export interface Listing {
  id: string;
  // SEO-dostu URL için: /ilan/:id yerine /ilan/:slug kullanılır
  // (örn. "deneme-ilanlari-2"). DB tetikleyicisi ilan oluşturulurken
  // başlıktan otomatik üretir, bkz. supabase/migrations/20260818180000_add_listing_slugs.sql
  slug: string;
  userId: string;
  user: {
    id: string;
    fullName: string;
    avatarUrl: string;
    trustScore: number;
    city: string;
    district: string;
    isVerified: boolean;
  };
  title: string;
  description: string;
  categoryId: CategoryId;
  condition: ListingCondition;
  images: string[];
  location: {
    city: string;
    district: string;
    // İsteğe bağlı: yalnızca hem ilanın hem de kullanıcının koordinatı
    // biliniyorsa hesaplanır (bkz. listingService.enrichListings). Bilinmiyorsa
    // arayüzde mesafe HİÇ gösterilmez — 0 km diye bir varsayılan yoktur.
    distanceKm?: number;
    safeMeetingPoint?: string;
    lat?: number;
    lng?: number;
  };
  lookingFor: string; // Serbest metin: "karşılığında ne arıyorum" (insan okuması için)
  // Yapılandırılmış karşılığı: eşleştirme motorunun okuduğu kategori listesi.
  // lookingFor'un YERİNE geçmez, onu tamamlar (bkz. rapor md. 20).
  lookingForCategories: CategoryId[];
  deliveryOptions: ('in_person' | 'cargo' | 'safe_point')[];
  // DB karşılığı: `listings_status_check` (20260829000000). 'expired' yalnızca
  // süre işi tarafından yazılır, kullanıcı elle bu duruma geçemez.
  status: 'active' | 'in_trade' | 'traded' | 'paused' | 'expired' | 'removed';
  createdAt: string;
  updatedAt: string;
  // İlanın yayında kalacağı son an (md. 119). Her ilan 30 günle başlar,
  // sahibi renew_listing() ile uzatır. Süre dolunca ilan silinmez, `expired`
  // olur ve keşiften düşer.
  //
  // İSTEĞE BAĞLI olmasının sebebi: 20260829000000 canlıya uygulanana kadar
  // `listings.expires_at` kolonu yok, yani sorgular bu alanı boş döndürür.
  // Arayüz bu durumda süreyi HİÇ göstermez (uydurma bir tarih göstermez).
  expiresAt?: string;
  // Son yenileme anı; hiç yenilenmediyse null.
  renewedAt?: string;
  viewCount: number;
  favoriteCount: number;
  interestedUsersCount?: number;
  isFavorite?: boolean;
  tags: string[];
}

// ─── İHTİYAÇ ("Need") ────────────────────────────────────────────────────
// Swaloop'un temel birimi sadece "elimde ne var" (Listing) değil, "neye
// ihtiyacım var" (Need) da olmalı — ilanı olmayan bir kullanıcı da bir şey
// arayabilmeli (bkz. rapor md. 78-82). Bu yüzden Need, Listing'ten AYRI bir
// nesnedir; DB karşılığı `public.needs` tablosudur.
export type NeedStatus = 'active' | 'paused' | 'fulfilled';

export interface Need {
  id: string;
  userId: string;
  title: string;
  categoryId?: CategoryId;
  note?: string;
  status: NeedStatus;
  createdAt: string;
  updatedAt: string;
  fulfilledAt?: string;
}

// Bir ihtiyacın, açık bir ilanla ne kadar örtüştüğü. DİKKAT: bu bir DEĞER
// karşılaştırması değildir (rapor md. 47) — "bu ürün şu kadar eder" demez,
// sadece "bu iki tarafın aradığı şeyler birbirini karşılıyor mu" der.
export interface NeedMatch {
  need: Need;
  listing: Listing;
  // 0-100 arası uyum yüzdesi ve nedenleri (kullanıcıya açıklanabilir olmalı).
  score: number;
  reasons: string[];
}

export type TradeStatus =
  | 'offer_sent'
  | 'offer_received'
  | 'counter_offered'
  | 'accepted'
  | 'locked'
  | 'delivery_planned'
  | 'shipped'
  | 'received'
  | 'verified'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'disputed';

export interface TradeOffer {
  id: string;
  initiatorId: string;
  initiator: UserProfile;
  receiverId: string;
  receiver: UserProfile;
  offeredListingIds: string[];
  offeredListings: Listing[];
  requestedListingIds: string[];
  requestedListings: Listing[];
  note?: string;
  deliveryMethod: 'in_person' | 'cargo' | 'safe_point';
  deliveryDetails?: {
    scheduledDate?: string;
    locationName?: string;
    trackingCode?: string;
    notes?: string;
  };
  status: TradeStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  counterOfferFromId?: string;
  timeline: TradeEvent[];
  /**
   * "Karşılıklı Onay" adımı (5). Takas ancak İKİ taraf da teslimatı
   * onayladıktan sonra ilerler — kural veritabanında
   * (`confirm_trade_receipt`, migration 20260828000000).
   */
  isConfirmedByInitiator?: boolean;
  isConfirmedByReceiver?: boolean;
  isReviewedByInitiator?: boolean;
  isReviewedByReceiver?: boolean;
}

export interface TradeEvent {
  id: string;
  step: 1 | 2 | 3 | 4 | 5 | 6; // 1: Teklif, 2: Kabul, 3: Kilitlendi, 4: Teslimat, 5: Onay, 6: Tamamlandı
  title: string;
  description: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: string;
  type: 'text' | 'trade_card' | 'counter_card' | 'delivery_card' | 'system_card';
  tradeOfferId?: string;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  participant: UserProfile;
  lastMessage: Message;
  unreadCount: number;
  updatedAt: string;
  relatedListing?: Listing;
  activeTradeId?: string;
}

export interface Review {
  id: string;
  tradeId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  targetUserId: string;
  overallRating: number; // 1-5
  categories: {
    trustworthiness: number;
    communication: number;
    itemAccuracy: number;
    delivery: number;
  };
  comment: string;
  createdAt: string;
}

export interface LoopParticipant {
  userId: string;
  user: UserProfile;
  offeringListing: Listing;
  receivingListing: Listing;
  givesToUserId: string;
  receivesFromUserId: string;
  hasConfirmed: boolean;
  status: 'pending' | 'confirmed' | 'delivered' | 'completed';
}

export interface Loop {
  id: string;
  title: string;
  category: CategoryId;
  totalParticipants: number;
  participants: LoopParticipant[];
  status: 'matching' | 'locked' | 'in_delivery' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  // Şimdilik lucide ikon adı değil, doğrudan gösterilecek emoji karakteri
  // (bkz. src/constants/badges.ts) — küçük rozet setinde bağımlılık eklemeden
  // renkli/tanınabilir simgeler için tercih edildi.
  iconName: string;
  category: 'trade' | 'community' | 'trust' | 'loop';
  isEarned: boolean;
  earnedDate?: string;
  progressPercent: number;
  maxProgress: number;
  currentProgress: number;
}

export interface PaperclipStage {
  stageNumber: number;
  itemTitle: string;
  category: string;
  image: string;
  dateCompleted?: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface MysterySwapItem {
  id: string;
  title: string;
  category: CategoryId;
  hint: string;
  image: string;
  ownerName: string;
  ownerTrustScore: number;
  location: string;
}

export interface CommunityPost {
  id: string;
  author: UserProfile;
  title: string;
  content: string;
  images?: string[];
  tradeStory?: {
    itemGiven: string;
    itemReceived: string;
  };
  likesCount: number;
  commentsCount: number;
  isLiked?: boolean;
  createdAt: string;
  tags: string[];
}

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  city: string;
  district: string;
  locationName: string;
  addressDetails: string;
  date: string;
  time: string;
  attendeesCount: number;
  isAttending?: boolean;
  organizer: string;
  imageUrl: string;
  category: 'swap_party' | 'repair_cafe' | 'meetup';
}

// DB karşılığı: `public.notifications.type` CHECK constraint'i
// (bkz. migration 20260820100000). İkisi birebir aynı kalmalı —
// notificationService testinde doğrulanıyor.
export type NotificationType =
  | 'trade_offer'
  | 'counter_offer'
  | 'trade_status'
  | 'need_matched'
  | 'message'
  | 'review_request'
  | 'listing_expiring'
  | 'listing_expired'
  | 'loop'
  | 'badge'
  | 'system';

export interface NotificationItem {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
  thumbnail?: string;
}

// Takas iptal/ret nedenleri (rapor md. 31). Serbest metin değil sabit küme:
// bu veri ileride güven sisteminin girdisi olacak. DB karşılığı
// `public.trade_cancellation_reason` enum'ı.
export type TradeCancellationReason =
  | 'item_unavailable'
  | 'no_agreement'
  | 'delivery_problem'
  | 'no_response'
  | 'other';

export const TRADE_CANCELLATION_REASONS: Array<{
  id: TradeCancellationReason;
  label: string;
}> = [
  { id: 'item_unavailable', label: 'Ürün artık uygun değil' },
  { id: 'no_agreement', label: 'Karşı tarafla anlaşamadım' },
  { id: 'delivery_problem', label: 'Teslimat konusunda sorun oldu' },
  { id: 'no_response', label: 'Karşı taraf yanıt vermedi' },
  { id: 'other', label: 'Başka bir sorun' },
];

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'user' | 'listing' | 'trade' | 'message';
  targetId: string;
  targetTitle: string;
  reason: 'fraud' | 'inappropriate' | 'no_response' | 'broken_item' | 'fake_account' | 'other';
  description: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  evidenceImages?: string[];
  createdAt: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface Dispute {
  id: string;
  tradeId: string;
  initiator: UserProfile;
  respondent: UserProfile;
  reason: string;
  status: 'open' | 'under_review' | 'resolved_return' | 'resolved_cancel' | 'dismissed';
  evidencePhotos: string[];
  adminDecision?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminKPI {
  totalUsers: number;
  activeUsers: number;
  totalListings: number;
  activeTrades: number;
  completedTrades: number;
  activeLoops: number;
  pendingReports: number;
  userGrowthPercent: number;
  tradeGrowthPercent: number;
}

export interface AdminAuditLog {
  id: string;
  adminName: string;
  action: string;
  target: string;
  timestamp: string;
  details: string;
}
