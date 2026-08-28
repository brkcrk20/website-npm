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
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-extrabold text-ink font-display">Rozetlerim</h1>
          </div>

          <div className="relative">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="appearance-none bg-surface border border-line text-ink text-xs font-bold py-2 pl-3.5 pr-8 rounded-2xl focus:outline-hidden focus:border-brand shadow-xs cursor-pointer"
            >
              <option value="all">Tümü</option>
              <option value="unlocked">Kazanılanlar ({badgesList.filter((b) => b.isEarned).length})</option>
              <option value="locked">Hedefler ({badgesList.filter((b) => !b.isEarned).length})</option>
            </select>
            <ChevronDown className="w-4 h-4 text-ink-soft absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {filteredBadges.map((badge) => (
            <div
              key={badge.id}
              className={`p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                badge.isEarned
                  ? 'bg-surface border-line shadow-xs hover:border-brand'
                  : 'bg-canvas/70 border-line opacity-75'
              }`}
            >
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-xs border ${
                  badge.isEarned
                    ? 'bg-brand-soft/80 border-brand-line text-brand-dark ring-2 ring-brand'
                    : 'bg-line/80 border-line text-ink-faint grayscale'
                }`}
              >
                {badge.iconName}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`text-sm font-bold truncate ${
                      badge.isEarned ? 'text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {badge.title}
                  </h3>
                  {badge.isEarned ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-dark bg-brand-soft px-2 py-0.5 rounded-full border border-brand-line shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Kazanıldı
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink-soft bg-line/60 px-2 py-0.5 rounded-full shrink-0">
                      <Lock className="w-3 h-3" />
                      {badge.currentProgress}/{badge.maxProgress}
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-soft mt-0.5 leading-snug">{badge.description}</p>

                {!badge.isEarned && (
                  <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
                    <div
                      className="h-full bg-brand rounded-full transition-all"
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
