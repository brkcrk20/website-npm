import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { BadgeGrid } from '../../components/common/BadgeGrid';
import { Badge } from '../../types';
import { ArrowLeft } from 'lucide-react';

const CATEGORY_LABELS: Record<Badge['category'], string> = {
  trade: 'Takas',
  journey: 'Döngü & Yolculuk',
  trust: 'Güven',
  eco: 'Çevre',
};

export const BadgesPage: React.FC = () => {
  const navigate = useNavigate();
  const { badges } = useApp();

  const earned = badges.filter((b) => b.isEarned).length;

  const grouped = (Object.keys(CATEGORY_LABELS) as Badge['category'][])
    .map((category) => ({
      category,
      items: badges.filter((badge) => badge.category === category),
    }))
    .filter((group) => group.items.length > 0);

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
            <h1 className="text-base font-bold">Rozetlerim</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {earned} / {badges.length} rozet kazanıldı
            </p>
          </div>
        </div>

        {grouped.map((group) => (
          <section key={group.category} className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              {CATEGORY_LABELS[group.category]}
            </h2>
            <BadgeGrid badges={group.items} />
          </section>
        ))}
      </div>
    </div>
  );
};
