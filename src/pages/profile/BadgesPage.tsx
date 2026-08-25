import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { getUserBadges } from '../../constants/badges';
import { ArrowLeft, ChevronDown, Lock, CheckCircle2 } from 'lucide-react';

export const BadgesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [filterCategory, setFilterCategory] = useState<'all' | 'unlocked' | 'locked'>('all');

  const badgesList = useMemo(() => getUserBadges(currentUser), [currentUser]);

  const filteredBadges = badgesList.filter((b) => {
    if (filterCategory === 'unlocked') return b.isEarned;
    if (filterCategory === 'locked') return !b.isEarned;
    return true;
  });

  return (
    <div className="min-h-screen bg-stone-50 pb-24 text-stone-900">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-extrabold text-stone-900 font-display">Rozetlerim</h1>
          </div>

          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="appearance-none bg-white border border-stone-200/90 text-stone-800 text-xs font-bold py-2 pl-3.5 pr-8 rounded-2xl focus:outline-hidden focus:border-emerald-600 shadow-xs cursor-pointer"
            >
              <option value="all">Tümü</option>
              <option value="unlocked">Kazanılanlar ({badgesList.filter((b) => b.isEarned).length})</option>
              <option value="locked">Hedefler ({badgesList.filter((b) => !b.isEarned).length})</option>
            </select>
            <ChevronDown className="w-4 h-4 text-stone-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {filteredBadges.map((badge) => (
            <div
              key={badge.id}
              className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                badge.isEarned
                  ? 'bg-white border-stone-200/90 shadow-xs hover:border-emerald-300'
                  : 'bg-stone-100/70 border-stone-200/60 opacity-75'
              }`}
            >
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-xs border ${
                  badge.isEarned
                    ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-800 ring-2 ring-emerald-600/10'
                    : 'bg-stone-200/80 border-stone-300 text-stone-400 grayscale'
                }`}
              >
                {badge.iconName}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`text-sm font-bold truncate ${
                      badge.isEarned ? 'text-stone-900' : 'text-stone-600'
                    }`}
                  >
                    {badge.title}
                  </h3>
                  {badge.isEarned ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Kazanıldı
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-500 bg-stone-200/60 px-2 py-0.5 rounded-full shrink-0">
                      <Lock className="w-3 h-3" />
                      {badge.currentProgress}/{badge.maxProgress}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-0.5 leading-snug">{badge.description}</p>

                {!badge.isEarned && (
                  <div className="mt-2 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${badge.progressPercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
