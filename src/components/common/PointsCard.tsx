import React from 'react';
import { UserPoints } from '../../types';
import { ChevronRight, Trophy } from 'lucide-react';

interface PointsCardProps {
  points: UserPoints;
  onDetail?: () => void;
  compact?: boolean;
}

/**
 * Takas puanı ve seviye göstergesi.
 *
 * Puan, `pointsService` tarafından kullanıcının gerçek aktivitesinden
 * hesaplanır — burada yalnızca gösterilir.
 */
export const PointsCard: React.FC<PointsCardProps> = ({ points, onDetail, compact = false }) => {
  const { level } = points;

  return (
    <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-4 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
              Takas Puanın
            </span>
            <span className="text-xl font-black leading-tight block">
              {points.total.toLocaleString('tr-TR')}
            </span>
          </div>
        </div>

        {onDetail && (
          <button
            type="button"
            onClick={onDetail}
            className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 shrink-0 cursor-pointer"
          >
            Nasıl kazanılır?
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
          <span className="text-emerald-800 dark:text-emerald-300">{level.title}</span>
          <span className="text-stone-400">
            {level.nextPoints === null
              ? 'En üst seviye'
              : `Sonraki seviyeye ${points.pointsToNextLevel.toLocaleString('tr-TR')} puan`}
          </span>
        </div>

        <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-[width] duration-500"
            style={{ width: `${points.progressPercent}%` }}
          />
        </div>

        {!compact && (
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-2">{level.perk}</p>
        )}
      </div>
    </section>
  );
};
