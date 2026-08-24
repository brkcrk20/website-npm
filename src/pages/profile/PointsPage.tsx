import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { PointsCard } from '../../components/common/PointsCard';
import { LEVELS, POINT_RULES } from '../../services/pointsService';
import { ArrowLeft, Check, Lock } from 'lucide-react';

/**
 * Puanın nereden geldiğini kalem kalem gösteren ekran.
 * Amaç: puanın nasıl arttığı kullanıcı için tahmin edilebilir olsun.
 */
export const PointsPage: React.FC = () => {
  const navigate = useNavigate();
  const { points } = useApp();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Takas Puanım</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Puan; gerçek takas hareketlerinden hesaplanır, satın alınamaz.
            </p>
          </div>
        </div>

        <PointsCard points={points} />

        <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
          <h2 className="p-3.5 text-xs font-bold uppercase tracking-wider text-stone-500">
            Puanın dağılımı
          </h2>

          {points.breakdown.map((item) => (
            <div key={item.key} className="p-3.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold block">{item.label}</span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400 block leading-snug">
                  {item.description}
                </span>
                <span className="text-[11px] text-stone-400 block mt-0.5">
                  {item.key === 'profile'
                    ? `Doluluk: %${item.count}`
                    : `Adet: ${item.count}`}
                </span>
              </div>

              <span
                className={`text-sm font-black shrink-0 ${
                  item.points > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-300'
                }`}
              >
                {item.points > 0 ? `+${item.points}` : '0'}
              </span>
            </div>
          ))}

          <div className="p-3.5 flex items-center justify-between bg-stone-50 dark:bg-stone-800/50">
            <span className="text-xs font-bold">Toplam</span>
            <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
              {points.total.toLocaleString('tr-TR')}
            </span>
          </div>
        </section>

        <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-3.5 space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Seviyeler</h2>

          {LEVELS.map((level) => {
            const reached = points.total >= level.minPoints;

            return (
              <div
                key={level.index}
                className={`p-3 rounded-2xl border flex items-center gap-3 ${
                  reached
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-stone-800'
                }`}
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    reached
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-200 dark:bg-stone-800 text-stone-400'
                  }`}
                >
                  {reached ? <Check className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />}
                </span>

                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold block">{level.title}</span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">{level.perk}</span>
                </div>

                <span className="text-[11px] font-bold text-stone-400 shrink-0">
                  {level.minPoints.toLocaleString('tr-TR')}+
                </span>
              </div>
            );
          })}
        </section>

        <p className="text-[11px] text-stone-400 leading-relaxed px-1">
          Not: Takas puanı bir para birimi veya ürün değeri değildir. Swaloop'ta hiçbir takas parasal
          bir değere göre kısıtlanmaz; puan yalnızca toplulukta ne kadar aktif ve güvenilir olduğunu
          gösterir. Tamamlanan bir takas +{POINT_RULES.completedTrade}, tamamlanan bir döngü +
          {POINT_RULES.completedLoop} puan kazandırır.
        </p>
      </div>
    </div>
  );
};
