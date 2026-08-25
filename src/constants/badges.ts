import { Badge, UserProfile } from '../types';

// NOT: Rozetler artık sabit/mock veri değil — kullanıcının gerçek
// istatistiklerinden (stats, trustProfile) hesaplanıyor. Bu sayaçlar
// supabase/migrations/20260819120000_add_badge_trust_tracking.sql
// ile eklenen trigger'lar sayesinde trades/reviews/loop_participants
// tabloları üzerinden otomatik güncelleniyor.
//
// Yeni bir rozet eklemek için: bu listeye bir tanım ekle, DB'de yeni bir
// alan gerekmez — istersen mevcut stats/trustProfile alanlarını kullan.

type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  iconName: string; // emoji
  category: Badge['category'];
  // Kullanıcıdan (0..1 arası) ilerleme oranı ve o an kaç/kaç olduğunu üretir.
  evaluate: (user: UserProfile) => { current: number; target: number };
};

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'phone-verified',
    title: 'Doğrulanmış Üye',
    description: 'Telefon numaranı doğrulayarak hesabını güvene aldın.',
    iconName: '🛡️',
    category: 'trust',
    evaluate: (u) => ({ current: u.trustProfile.phoneVerified ? 1 : 0, target: 1 }),
  },
  {
    id: 'first-trade',
    title: 'İlk Takasım',
    description: 'İlk takasını başarıyla tamamladın.',
    iconName: '🏅',
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 1), target: 1 }),
  },
  {
    id: 'trade-fan',
    title: 'Takas Sever',
    description: '5 başarılı takası tamamladın.',
    iconName: '✨',
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 5), target: 5 }),
  },
  {
    id: 'trade-master',
    title: 'Takas Ustası',
    description: '10 başarılı takası tamamladın.',
    iconName: '⭐',
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 10), target: 10 }),
  },
  {
    id: 'trade-legend',
    title: 'Takas Efsanesi',
    description: '100 başarılı takası tamamladın.',
    iconName: '👑',
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 100), target: 100 }),
  },
  {
    id: 'loop-explorer',
    title: 'Döngü Kaşifi',
    description: 'İlk takas döngünü (3+ kişilik) tamamladın.',
    iconName: '🔁',
    category: 'loop',
    evaluate: (u) => ({ current: Math.min(u.stats.completedLoops, 1), target: 1 }),
  },
  {
    id: 'loop-master',
    title: 'Döngü Ustası',
    description: '5 takas döngüsü tamamladın.',
    iconName: '🌀',
    category: 'loop',
    evaluate: (u) => ({ current: Math.min(u.stats.completedLoops, 5), target: 5 }),
  },
  {
    id: 'trusted-member',
    title: 'Güvenilir Üye',
    description: 'En az 5 değerlendirme aldın ve güven puanın 4.5 üzeri.',
    iconName: '🤝',
    category: 'trust',
    // İki koşullu bir rozet olduğu için ilerleme yüzdesi, daha yavaş ilerleyen
    // koşula (değerlendirme sayısı) göre gösteriliyor.
    evaluate: (u) => {
      const ratingOk = u.trustProfile.score >= 4.5;
      const current = ratingOk ? Math.min(u.trustProfile.reviewCount, 5) : Math.min(u.trustProfile.reviewCount, 4);
      return { current, target: 5 };
    },
  },
  {
    id: 'trade-expert',
    title: 'Takas Uzmanı',
    description: '20+ takas tamamladın ve güven puanın 4.8 üzeri.',
    iconName: '🎖️',
    category: 'trust',
    evaluate: (u) => {
      const scoreOk = u.trustProfile.score >= 4.8;
      const current = scoreOk ? Math.min(u.stats.totalTrades, 20) : Math.min(u.stats.totalTrades, 19);
      return { current, target: 20 };
    },
  },
];

export function getUserBadges(user: UserProfile): Badge[] {
  return BADGE_DEFINITIONS.map((def) => {
    const { current, target } = def.evaluate(user);
    const isEarned = current >= target;
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      iconName: def.iconName,
      category: def.category,
      isEarned,
      progressPercent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
      maxProgress: target,
      currentProgress: current,
    };
  });
}
