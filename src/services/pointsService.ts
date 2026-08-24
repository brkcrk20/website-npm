import { supabase } from '../lib/supabase';
import { Badge, EnvironmentalImpact, UserLevel, UserPoints, UserProfile } from '../types';

/**
 * Takas Puanı sistemi.
 *
 * Puanlar hiçbir yerde ayrıca saklanmaz — HER ZAMAN kullanıcının gerçek
 * veritabanı aktivitesinden (tamamlanan takaslar, yayındaki ilanlar, alınan
 * değerlendirmeler, tamamlanan döngüler, profil doluluğu) hesaplanır.
 * Böylece puan tablosu ile gerçek durum asla birbirinden ayrışamaz ve
 * "puan verildi ama takas iptal edildi" gibi tutarsızlıklar oluşmaz.
 *
 * Rozetler de aynı aktivite anlık görüntüsünden türetilir; artık sabit
 * "kazanıldı" bayrağı taşıyan sahte rozet listesi yok.
 */

export interface UserActivity {
  completedTrades: number;
  cancelledTrades: number;
  activeTrades: number;
  activeListings: number;
  totalListings: number;
  tradedListings: number;
  reviewCount: number;
  averageRating: number;
  completedLoops: number;
  joinedLoops: number;
  impact: EnvironmentalImpact;
  profileCompletionPercent: number;
  accountAgeDays: number;
}

export const EMPTY_IMPACT: EnvironmentalImpact = {
  co2eKg: 0,
  waterLiters: 0,
  energyKwh: 0,
  rawMaterialKg: 0,
  wasteReductionKg: 0,
  reuseCount: 0,
  methodologyVersion: 'SVS-v2.1',
};

export const EMPTY_ACTIVITY: UserActivity = {
  completedTrades: 0,
  cancelledTrades: 0,
  activeTrades: 0,
  activeListings: 0,
  totalListings: 0,
  tradedListings: 0,
  reviewCount: 0,
  averageRating: 0,
  completedLoops: 0,
  joinedLoops: 0,
  impact: EMPTY_IMPACT,
  profileCompletionPercent: 0,
  accountAgeDays: 0,
};

/** Puan kuralları — tek kaynak. UI'da da bu tablo gösterilir. */
export const POINT_RULES = {
  completedTrade: 100,
  activeListing: 10,
  /** İlan puanının üst sınırı (spam ilanla puan şişirmeyi engeller). */
  maxListingPoints: 150,
  reviewReceived: 20,
  /** 3 yıldız üstü her yıldız için ek puan (yorum başına). */
  ratingBonusPerStar: 10,
  completedLoop: 150,
  /** Profil %100 dolduğunda verilen puan (kısmi doluluk oransal). */
  fullProfile: 50,
  co2PerKg: 2,
} as const;

export const LEVELS: Omit<UserLevel, 'nextPoints'>[] = [
  { index: 0, title: 'Yeni Takasçı', minPoints: 0, perk: 'İlanını yayınla, ilk takasını yap' },
  { index: 1, title: 'Takasçı', minPoints: 250, perk: 'Profilinde seviye rozeti görünür' },
  { index: 2, title: 'Deneyimli Takasçı', minPoints: 750, perk: 'Keşfet sıralamasında öne çıkarsın' },
  { index: 3, title: 'Usta Takasçı', minPoints: 1500, perk: 'Döngü (3’lü takas) başlatabilirsin' },
  { index: 4, title: 'Takas Ustası', minPoints: 3000, perk: 'Teklifin karşı tarafta öncelikli görünür' },
  { index: 5, title: 'Döngü Elçisi', minPoints: 6000, perk: 'Topluluk elçisi rozeti' },
];

export function levelForPoints(total: number): UserLevel {
  let current = LEVELS[0];

  for (const level of LEVELS) {
    if (total >= level.minPoints) current = level;
  }

  const next = LEVELS[current.index + 1];

  return { ...current, nextPoints: next ? next.minPoints : null };
}

export function calculateProfileCompletion(user: Pick<UserProfile, 'avatarUrl' | 'bio' | 'city' | 'district' | 'fullName' | 'phone'>): number {
  const checks = [
    !!user.fullName?.trim(),
    !!user.phone?.trim(),
    !!user.city?.trim() && !!user.district?.trim(),
    !!user.bio?.trim(),
    !!user.avatarUrl && !user.avatarUrl.startsWith('data:image/svg+xml'),
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/**
 * Kullanıcının puanını ve seviyesini aktivite anlık görüntüsünden hesaplar.
 */
export function calculatePoints(activity: UserActivity): UserPoints {
  const listingPoints = Math.min(
    activity.activeListings * POINT_RULES.activeListing,
    POINT_RULES.maxListingPoints
  );

  const ratingBonus =
    activity.reviewCount > 0
      ? Math.round(
          Math.max(0, activity.averageRating - 3) *
            POINT_RULES.ratingBonusPerStar *
            activity.reviewCount
        )
      : 0;

  const breakdown = [
    {
      key: 'trades',
      label: 'Tamamlanan takaslar',
      description: `Her tamamlanan takas +${POINT_RULES.completedTrade} puan`,
      count: activity.completedTrades,
      points: activity.completedTrades * POINT_RULES.completedTrade,
    },
    {
      key: 'loops',
      label: 'Tamamlanan döngüler',
      description: `3’lü/çoklu döngü başına +${POINT_RULES.completedLoop} puan`,
      count: activity.completedLoops,
      points: activity.completedLoops * POINT_RULES.completedLoop,
    },
    {
      key: 'listings',
      label: 'Yayındaki ilanlar',
      description: `İlan başına +${POINT_RULES.activeListing} puan (en fazla ${POINT_RULES.maxListingPoints})`,
      count: activity.activeListings,
      points: listingPoints,
    },
    {
      key: 'reviews',
      label: 'Alınan değerlendirmeler',
      description: `Yorum başına +${POINT_RULES.reviewReceived} puan, 3 yıldız üstü her yıldız +${POINT_RULES.ratingBonusPerStar}`,
      count: activity.reviewCount,
      points: activity.reviewCount * POINT_RULES.reviewReceived + ratingBonus,
    },
    {
      key: 'impact',
      label: 'Önlenen karbon',
      description: `Her kg CO₂e için +${POINT_RULES.co2PerKg} puan`,
      count: Math.round(activity.impact.co2eKg),
      points: Math.round(activity.impact.co2eKg * POINT_RULES.co2PerKg),
    },
    {
      key: 'profile',
      label: 'Profil doluluğu',
      description: `Profilin %100 dolduğunda +${POINT_RULES.fullProfile} puan`,
      count: activity.profileCompletionPercent,
      points: Math.round((activity.profileCompletionPercent / 100) * POINT_RULES.fullProfile),
    },
  ];

  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  const level = levelForPoints(total);

  const spanStart = level.minPoints;
  const spanEnd = level.nextPoints;

  const progressPercent =
    spanEnd === null
      ? 100
      : Math.min(100, Math.round(((total - spanStart) / (spanEnd - spanStart)) * 100));

  return {
    total,
    level,
    progressPercent,
    pointsToNextLevel: spanEnd === null ? 0 : Math.max(0, spanEnd - total),
    breakdown,
  };
}

interface BadgeRule {
  id: string;
  title: string;
  description: string;
  iconName: string;
  category: Badge['category'];
  target: number;
  progress: (activity: UserActivity, points: UserPoints) => number;
}

const BADGE_RULES: BadgeRule[] = [
  {
    id: 'first-listing',
    title: 'İlk İlanım',
    description: 'İlk takas ilanını yayınla.',
    iconName: 'Package',
    category: 'trade',
    target: 1,
    progress: (a) => a.totalListings,
  },
  {
    id: 'first-trade',
    title: 'İlk Takasım',
    description: 'İlk takasını başarıyla tamamla.',
    iconName: 'Repeat',
    category: 'trade',
    target: 1,
    progress: (a) => a.completedTrades,
  },
  {
    id: 'trade-5',
    title: 'Takas Alışkanlığı',
    description: '5 takas tamamla.',
    iconName: 'Repeat',
    category: 'trade',
    target: 5,
    progress: (a) => a.completedTrades,
  },
  {
    id: 'trade-25',
    title: 'Takas Ustası',
    description: '25 takas tamamlayarak ustalığa eriş.',
    iconName: 'Award',
    category: 'trade',
    target: 25,
    progress: (a) => a.completedTrades,
  },
  {
    id: 'loop-pioneer',
    title: 'Döngü Öncüsü',
    description: 'Çoklu dairesel bir takası (döngü) tamamla.',
    iconName: 'Share2',
    category: 'journey',
    target: 1,
    progress: (a) => a.completedLoops,
  },
  {
    id: 'journey-3',
    title: 'Yolculuk Başladı',
    description: 'Takas yolculuğunda 3 basamak yükselt.',
    iconName: 'TrendingUp',
    category: 'journey',
    target: 3,
    progress: (a) => a.completedTrades,
  },
  {
    id: 'trusted',
    title: 'Güvenilir Üye',
    description: '5 değerlendirme al ve ortalaman 4.5’in üzerinde olsun.',
    iconName: 'ShieldCheck',
    category: 'trust',
    target: 5,
    progress: (a) => (a.averageRating >= 4.5 ? a.reviewCount : 0),
  },
  {
    id: 'complete-profile',
    title: 'Eksiksiz Profil',
    description: 'Fotoğraf, biyografi ve konum dahil profilini tamamla.',
    iconName: 'UserCheck',
    category: 'trust',
    target: 100,
    progress: (a) => a.profileCompletionPercent,
  },
  {
    id: 'eco-50',
    title: 'Çevre Dostu',
    description: '50 kg CO₂e emisyonunun önlenmesine katkı sağla.',
    iconName: 'Leaf',
    category: 'eco',
    target: 50,
    progress: (a) => Math.round(a.impact.co2eKg),
  },
  {
    id: 'eco-250',
    title: 'Karbon Kahramanı',
    description: '250 kg CO₂e tasarrufuna ulaş.',
    iconName: 'Leaf',
    category: 'eco',
    target: 250,
    progress: (a) => Math.round(a.impact.co2eKg),
  },
];

export function calculateBadges(activity: UserActivity, points: UserPoints): Badge[] {
  return BADGE_RULES.map((rule) => {
    const current = Math.max(0, rule.progress(activity, points));
    const isEarned = current >= rule.target;

    return {
      id: rule.id,
      title: rule.title,
      description: rule.description,
      iconName: rule.iconName,
      category: rule.category,
      isEarned,
      progressPercent: Math.min(100, Math.round((current / rule.target) * 100)),
      maxProgress: rule.target,
      currentProgress: Math.min(current, rule.target),
    };
  });
}

function normalizeImpactRow(rows: any[]): EnvironmentalImpact {
  return rows.reduce<EnvironmentalImpact>(
    (acc, row) => ({
      co2eKg: acc.co2eKg + Number(row.co2e_kg ?? 0),
      waterLiters: acc.waterLiters + Number(row.water_liters ?? 0),
      energyKwh: acc.energyKwh + Number(row.energy_kwh ?? 0),
      rawMaterialKg: acc.rawMaterialKg + Number(row.material_kg ?? 0),
      wasteReductionKg: acc.wasteReductionKg + Number(row.waste_kg ?? 0),
      reuseCount: acc.reuseCount + Number(row.reuse_count ?? 0),
      methodologyVersion: 'SVS-v2.1',
    }),
    { ...EMPTY_IMPACT }
  );
}

export const pointsService = {
  /**
   * Kullanıcının puan/rozet/istatistiklerini besleyen tek sorgu paketi.
   * Beş sorgu paralel çalışır; profil ekranı tek turda dolar.
   */
  async getUserActivity(user: UserProfile): Promise<UserActivity> {
    if (!user.id) return EMPTY_ACTIVITY;

    const [tradesResult, listingsResult, reviewsResult, loopsResult] = await Promise.all([
      supabase
        .from('trades')
        .select('id, status')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`),
      supabase.from('listings').select('id, status').eq('owner_id', user.id),
      supabase.from('reviews').select('rating').eq('reviewed_user_id', user.id),
      supabase
        .from('loop_participants')
        .select('status, loop:loops(status)')
        .eq('user_id', user.id),
    ]);

    if (tradesResult.error) console.error('Takas istatistikleri alınamadı:', tradesResult.error);
    if (listingsResult.error) console.error('İlan istatistikleri alınamadı:', listingsResult.error);
    if (reviewsResult.error) console.error('Değerlendirmeler alınamadı:', reviewsResult.error);
    if (loopsResult.error) console.error('Döngü istatistikleri alınamadı:', loopsResult.error);

    const trades = tradesResult.data ?? [];
    const listings = listingsResult.data ?? [];
    const reviews = reviewsResult.data ?? [];
    const loops = loopsResult.data ?? [];

    const completedTradeIds = trades.filter((t) => t.status === 'completed').map((t) => t.id);

    let impact = { ...EMPTY_IMPACT };

    if (completedTradeIds.length) {
      const { data: impactRows, error: impactError } = await supabase
        .from('impact_records')
        .select('co2e_kg, water_liters, energy_kwh, material_kg, waste_kg, reuse_count')
        .in('trade_id', completedTradeIds);

      if (impactError) {
        console.error('Etki kayıtları alınamadı:', impactError);
      } else {
        impact = normalizeImpactRow(impactRows ?? []);
      }
    }

    const ratings = reviews.map((r) => Number(r.rating ?? 0)).filter((r) => r > 0);

    return {
      completedTrades: completedTradeIds.length,
      cancelledTrades: trades.filter((t) => t.status === 'cancelled').length,
      activeTrades: trades.filter(
        (t) => !['completed', 'cancelled', 'rejected'].includes(t.status)
      ).length,
      activeListings: listings.filter((l) => l.status === 'active').length,
      totalListings: listings.length,
      tradedListings: listings.filter((l) => l.status === 'traded').length,
      reviewCount: ratings.length,
      averageRating: ratings.length
        ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
        : 0,
      completedLoops: loops.filter((p: any) => p.loop?.status === 'completed').length,
      joinedLoops: loops.length,
      impact: {
        ...impact,
        co2eKg: Number(impact.co2eKg.toFixed(1)),
        rawMaterialKg: Number(impact.rawMaterialKg.toFixed(1)),
        wasteReductionKg: Number(impact.wasteReductionKg.toFixed(1)),
        waterLiters: Math.round(impact.waterLiters),
        energyKwh: Math.round(impact.energyKwh),
      },
      profileCompletionPercent: calculateProfileCompletion(user),
      accountAgeDays: user.trustProfile.accountAgeDays,
    };
  },

  /** Aktivite + puan + rozetleri tek çağrıda döndüren kolaylık metodu. */
  async getUserScorecard(user: UserProfile): Promise<{
    activity: UserActivity;
    points: UserPoints;
    badges: Badge[];
  }> {
    const activity = await this.getUserActivity(user);
    const points = calculatePoints(activity);
    const badges = calculateBadges(activity, points);

    return { activity, points, badges };
  },
};
