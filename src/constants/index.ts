import { Category, UserProfile } from '../types';

// NOT: Bu liste artık canlı Supabase `categories` tablosuyla birebir
// eşleşiyor (id = DB slug, name = Türkçe görünen isim). Detaylar için
// src/types/index.ts'teki CategoryId açıklamasına bakın.
export const CATEGORIES: Category[] = [
  {
    id: 'electronics',
    name: 'Elektronik',
    iconName: 'Laptop',
    color: '#059669', // emerald
    avgCo2Savings: 14.5,
    avgWaterSavings: 380,
  },
  {
    id: 'sports',
    name: 'Spor & Outdoor',
    iconName: 'Bike',
    color: '#d97706', // amber
    avgCo2Savings: 9.8,
    avgWaterSavings: 240,
  },
  {
    id: 'home-living',
    name: 'Ev & Yaşam',
    iconName: 'Home',
    color: '#047857',
    avgCo2Savings: 7.2,
    avgWaterSavings: 190,
  },
  {
    id: 'fashion',
    name: 'Giyim & Moda',
    iconName: 'Shirt',
    color: '#b45309',
    avgCo2Savings: 6.4,
    avgWaterSavings: 850,
  },
  {
    id: 'hobby',
    name: 'Hobi & Oyun',
    iconName: 'Gamepad2',
    color: '#10b981',
    avgCo2Savings: 4.8,
    avgWaterSavings: 120,
  },
  {
    id: 'books',
    name: 'Kitap',
    iconName: 'BookOpen',
    color: '#059669',
    avgCo2Savings: 3.1,
    avgWaterSavings: 95,
  },
  {
    id: 'music',
    name: 'Müzik',
    iconName: 'Music',
    color: '#0d9488',
    avgCo2Savings: 3.6,
    avgWaterSavings: 80,
  },
  {
    id: 'photography',
    name: 'Fotoğraf',
    iconName: 'Camera',
    color: '#7c3aed',
    avgCo2Savings: 12.1,
    avgWaterSavings: 260,
  },
  {
    id: 'collectibles',
    name: 'Koleksiyon',
    iconName: 'Sparkles',
    color: '#db2777',
    avgCo2Savings: 4.2,
    avgWaterSavings: 110,
  },
  {
    id: 'other',
    name: 'Diğer',
    iconName: 'Package',
    color: '#78716c',
    avgCo2Savings: 5.0,
    avgWaterSavings: 150,
  },
];

export const SAFE_MEETING_POINTS = [
  {
    id: 'smp-1',
    city: 'İstanbul',
    district: 'Kadıköy',
    name: 'Kadıköy İskelesi Güvenli Takas Alanı',
    address: 'Kadıköy Rıhtım Meydanı Zabıta Yanı, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 22:00',
    lat: 40.9904,
    lng: 29.0254,
  },
  {
    id: 'smp-2',
    city: 'İstanbul',
    district: 'Beşiktaş',
    name: 'Beşiktaş Meydan Takas Noktası',
    address: 'Beşiktaş İskelesi Önü Güvenli Toplanma Noktası, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 23:00',
    lat: 41.0422,
    lng: 29.0067,
  },
  {
    id: 'smp-3',
    city: 'İstanbul',
    district: 'Şişli',
    name: 'Cevahir AVM Girişi Danışma Yanı',
    address: 'Büyükdere Cad. No:22 Şişli, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '10:00 - 22:00',
    lat: 41.0632,
    lng: 28.9930,
  },
  {
    id: 'smp-4',
    city: 'Ankara',
    district: 'Çankaya',
    name: 'Kızılay Metro Çıkışı Güvenli Nokta',
    address: 'Kızılay Meydanı Güven Park Yanı, Ankara',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 21:00',
    lat: 39.9208,
    lng: 32.8541,
  },
  {
    id: 'smp-5',
    city: 'İzmir',
    district: 'Konak',
    name: 'Alsancak İskelesi Takas İstasyonu',
    address: 'Alsancak Vapur İskelesi Girişi, İzmir',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 22:00',
    lat: 38.4382,
    lng: 27.1413,
  },
];

const DEFAULT_AVATAR_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#e7e5e4"/><circle cx="48" cy="38" r="16" fill="#a8a29e"/><path d="M16 88c4-18 17-27 32-27s28 9 32 27z" fill="#a8a29e"/></svg>`
  );

/** Ürün görseli yüklenemediğinde kullanılan yerel yer tutucu. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f5f5f4"/><path d="M150 190l35-45 28 34 22-26 30 37z" fill="#d6d3d1"/><circle cx="160" cy="120" r="14" fill="#d6d3d1"/></svg>`
  );

export const DEFAULT_AVATAR = DEFAULT_AVATAR_URL;

/**
 * Oturum açılmamışken kullanılan boş kullanıcı.
 *
 * Önceden bu rolü `mockData.CURRENT_USER` üstleniyordu: giriş yapılmamış
 * olsa bile uygulama uydurma bir kullanıcıyı (14 takas, 4.9 puan...) gerçek
 * kullanıcı gibi gösteriyordu. Artık misafir kullanıcı bariz şekilde boş ve
 * `AppContext.isAuthenticated` false olduğunda korumalı sayfalar giriş
 * ekranına yönlendiriyor.
 */
export const GUEST_USER: UserProfile = {
  id: '',
  phone: '',
  fullName: 'Misafir',
  avatarUrl: DEFAULT_AVATAR_URL,
  city: '',
  district: '',
  memberSince: '',
  interests: [],
  wantedCategories: [],
  isVerified: false,
  trustProfile: {
    score: 0,
    level: 'Başlangıç',
    phoneVerified: false,
    idVerified: false,
    successfulTradesCount: 0,
    cancellationRate: 0,
    responseRate: 0,
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
    totalCo2Prevented: 0,
    totalWaterSaved: 0,
    totalEnergySaved: 0,
    totalRawMaterialsSaved: 0,
    totalItemsReused: 0,
    responseRatePercent: 0,
    avgResponseTimeMinutes: 0,
    cancellationRatePercent: 0,
  },
};

export const CONDITION_LABELS: Record<string, string> = {
  zero: 'Sıfır',
  like_new: 'Sıfır Gibi',
  very_good: 'Çok İyi',
  good: 'İyi',
  acceptable: 'Makul',
};

export const DELIVERY_LABELS: Record<string, string> = {
  in_person: 'Elden Teslim',
  safe_point: 'Güvenli Nokta',
  cargo: 'Kargo',
};

export const LISTING_STATUS_LABELS: Record<string, string> = {
  active: 'Yayında',
  in_trade: 'Takasta',
  traded: 'Takaslandı',
  paused: 'Duraklatıldı',
  removed: 'Kaldırıldı',
};

/** İl seçimi için en çok kullanılan iller (serbest metin girişi de var). */
export const TR_CITIES = [
  'Adana', 'Ankara', 'Antalya', 'Aydın', 'Balıkesir', 'Bursa', 'Denizli',
  'Diyarbakır', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Hatay', 'İstanbul',
  'İzmir', 'Kayseri', 'Kocaeli', 'Konya', 'Malatya', 'Manisa', 'Mersin',
  'Muğla', 'Ordu', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Tekirdağ', 'Trabzon',
  'Van',
];
