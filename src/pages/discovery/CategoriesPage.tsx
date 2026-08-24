import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Laptop,
  Home,
  Bike,
  Shirt,
  Gamepad2,
  BookOpen,
  Music,
  Camera,
  Sparkles,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORIES } from '../../constants';

// 24. KATEGORİLER
//
// Kategori ikonları tek bir setten (Lucide) ve tek çizgi stilinde geliyor —
// emoji, gradient ya da 3D ikon yok (md. 63, 102).

const ICONS: Record<string, LucideIcon> = {
  Laptop,
  Home,
  Bike,
  Shirt,
  Gamepad2,
  BookOpen,
  Music,
  Camera,
  Sparkles,
  Package,
};

export const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4">
        <div className="flex items-center gap-2 mb-5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg text-ink">Kategoriler</h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {CATEGORIES.map((category) => {
            const Icon = ICONS[category.iconName] ?? Package;

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => navigate(`/arama?kategori=${category.id}`)}
                className="sw-card p-4 flex flex-col items-center gap-2.5 hover:border-brand-line transition-colors cursor-pointer"
              >
                <span className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-dark flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-xs font-semibold text-ink text-center leading-snug">
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
