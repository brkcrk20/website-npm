import React from 'react';
import { Badge } from '../../types';
import {
  Award,
  Leaf,
  Package,
  Repeat,
  Share2,
  ShieldCheck,
  TrendingUp,
  UserCheck,
} from 'lucide-react';

/**
 * Rozet ızgarası.
 *
 * Rozetler `pointsService.calculateBadges()` tarafından gerçek aktiviteden
 * üretilir — "kazanıldı" bilgisi artık sabit bir listeden gelmiyor, bu
 * yüzden ilerleme çubukları da gerçek sayıları gösterir.
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Award,
  Leaf,
  Package,
  Repeat,
  Share2,
  ShieldCheck,
  TrendingUp,
  UserCheck,
};

export const BadgeGrid: React.FC<{ badges: Badge[] }> = ({ badges }) => {
  if (!badges.length) {
    return (
      <p className="text-center text-xs text-stone-500 dark:text-stone-400 py-8">
        Rozetler ilk takasınla birlikte açılmaya başlar.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {badges.map((badge) => {
        const Icon = ICONS[badge.iconName] ?? Award;

        return (
          <div
            key={badge.id}
            className={`p-3.5 rounded-2xl border text-center transition-colors ${
              badge.isEarned
                ? 'bg-white dark:bg-stone-900 border-emerald-300 dark:border-emerald-800 shadow-xs'
                : 'bg-stone-100/70 dark:bg-stone-900/40 border-stone-200 dark:border-stone-800'
            }`}
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 ${
                badge.isEarned
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  : 'bg-stone-200 dark:bg-stone-800 text-stone-400'
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>

            <h4 className="text-xs font-bold line-clamp-1">{badge.title}</h4>
            <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-1 line-clamp-2 min-h-[26px]">
              {badge.description}
            </p>

            {badge.isEarned ? (
              <span className="inline-block mt-2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                Kazanıldı
              </span>
            ) : (
              <div className="mt-2 space-y-1">
                <div className="w-full bg-stone-200 dark:bg-stone-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full"
                    style={{ width: `${badge.progressPercent}%` }}
                  />
                </div>
                <span className="text-[9px] text-stone-400 font-semibold">
                  {badge.currentProgress} / {badge.maxProgress}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
