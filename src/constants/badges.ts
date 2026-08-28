import { Award, Crown, Handshake, Medal, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { Badge, UserProfile } from '../types';

// NOT: Rozetler artık sabit/mock veri değil — kullanıcının gerçek
// istatistiklerinden (stats, trustProfile) hesaplanıyor. Bu sayaçlar
// supabase/migrations/20260819120000_add_badge_trust_tracking.sql
// ile eklenen trigger'lar sayesinde trades/reviews/loop_participants
// tabloları üzerinden otomatik güncelleniyor.
//
// İKİ KURAL:
//
// 1. Rozet, ürünün İÇİNDEN ulaşılabilir bir hedefi ödüllendirir. "Döngü
//    Kaşifi" ve "Döngü Ustası" rozetleri buradan kaldırıldı: 3+ kişilik
//    takas döngüsü ekranları üründen çıkarıldı (App.tsx'teki not), yani
//    o iki rozet "Hedefler" listesinde sonsuza kadar 0/1 ve 0/5 duruyor
//    ve kullanıcıya ulaşma yolu OLMAYAN bir hedef gösteriyordu. Döngüler
//    FAZ 3'te geri gelirse rozetler de geri gelir.
//
// 2. İkonlar lucide — emoji değil. Emoji her işletim sisteminde farklı
//    çiziliyor ve rozetler uygulamadaki tek emoji ikon kümesiydi.

type BadgeDefinition = {
  id: string;
  title: string;
  description: string;
  icon: Badge['icon'];
  category: Badge['category'];
  // Kullanıcıdan (0..1 arası) ilerleme oranı ve o an kaç/kaç olduğunu üretir.
  evaluate: (user: UserProfile) => { current: number; target: number };
  // Yalnızca takas sayısıyla kazanılan rozetlerde dolu: rozetin eşiği.
  // `badgeEarnedAtTradeCount` bunu kullanıyor.
  tradeTarget?: number;
};

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'phone-verified',
    title: 'Doğrulanmış Üye',
    description: 'Telefon numaranı doğrulayarak hesabını güvene aldın.',
    icon: ShieldCheck,
    category: 'trust',
    evaluate: (u) => ({ current: u.trustProfile.phoneVerified ? 1 : 0, target: 1 }),
  },
  {
    id: 'first-trade',
    title: 'İlk Takasım',
    description: 'İlk takasını başarıyla tamamladın.',
    icon: Award,
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 1), target: 1 }),
    tradeTarget: 1,
  },
  {
    id: 'trade-fan',
    title: 'Takas Sever',
    description: '5 başarılı takası tamamladın.',
    icon: Sparkles,
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 5), target: 5 }),
    tradeTarget: 5,
  },
  {
    id: 'trade-master',
    title: 'Takas Ustası',
    description: '10 başarılı takası tamamladın.',
    icon: Star,
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 10), target: 10 }),
    tradeTarget: 10,
  },
  {
    id: 'trade-legend',
    title: 'Takas Efsanesi',
    description: '100 başarılı takası tamamladın.',
    icon: Crown,
    category: 'trade',
    evaluate: (u) => ({ current: Math.min(u.stats.totalTrades, 100), target: 100 }),
    tradeTarget: 100,
  },
  {
    id: 'trusted-member',
    title: 'Güvenilir Üye',
    description: 'En az 5 değerlendirme aldın ve güven puanın 4.5 üzeri.',
    icon: Handshake,
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
    icon: Medal,
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
      icon: def.icon,
      category: def.category,
      isEarned,
      progressPercent: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
      maxProgress: target,
      currentProgress: current,
    };
  });
}

/**
 * Tamamlanan takas sayısı `totalTrades`'e ULAŞTIĞI anda kazanılan rozet.
 *
 * Takas bitiş ekranı eskiden her takasta koşulsuz olarak
 * "Yeni Rozet Kazanıldı! — 'İlk Takasım' rozeti profilinize eklendi."
 * diyordu; 50. takasını yapan kullanıcı da aynı cümleyi okuyordu.
 *
 * Kural: eşik TAM bu takasta aşıldıysa rozet yenidir. Aksi hâlde yeni
 * rozet YOKTUR ve hiçbir şey gösterilmez — "belki vardır" diye bir şey
 * göstermek, uydurmanın kibar hâli olurdu.
 */
export function badgeEarnedAtTradeCount(totalTrades: number): BadgeDefinition | null {
  return BADGE_DEFINITIONS.find((def) => def.tradeTarget === totalTrades) ?? null;
}
