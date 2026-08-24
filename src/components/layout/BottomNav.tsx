import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Compass, Repeat, Plus, MessageSquare, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Alt gezinme çubuğu — uygulamanın beş ana işi:
 * keşfet · takaslarım · ilan ver · mesajlar · profil.
 */

const AUTH_PATHS = ['/', '/onboarding', '/giris', '/kayit', '/dogrulama', '/profil-olustur'];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadNotificationCount } = useApp();

  if (AUTH_PATHS.includes(location.pathname)) return null;

  const navItems = [
    {
      id: 'kesfet',
      label: 'Keşfet',
      icon: Compass,
      path: '/kesfet',
      isActive: (p: string) =>
        p === '/kesfet' || p.startsWith('/arama') || p.startsWith('/yakinimdakiler') || p.startsWith('/ilan/'),
    },
    {
      id: 'takaslarim',
      label: 'Takaslarım',
      icon: Repeat,
      path: '/takaslarim',
      isActive: (p: string) =>
        p.startsWith('/takas') || p.startsWith('/teklif') || p.startsWith('/eslesme') || p.startsWith('/donguler'),
    },
    {
      id: 'ilan-ver',
      label: 'İlan Ver',
      icon: Plus,
      path: '/ilan-ver',
      isCenterAction: true,
      isActive: (p: string) => p === '/ilan-ver',
    },
    {
      id: 'mesajlar',
      label: 'Mesajlar',
      icon: MessageSquare,
      path: '/mesajlar',
      badgeCount: unreadNotificationCount,
      isActive: (p: string) => p.startsWith('/mesaj'),
    },
    {
      id: 'profil',
      label: 'Profil',
      icon: User,
      path: '/profil',
      isActive: (p: string) =>
        p === '/profil' ||
        p.startsWith('/profil/duzenle') ||
        p.startsWith('/puanlarim') ||
        p.startsWith('/rozetlerim') ||
        p.startsWith('/etkim'),
    },
  ];

  return (
    <nav className="sticky bottom-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200/90 dark:border-stone-800 py-1 px-2 shadow-[0_-2px_12px_rgba(0,0,0,0.04)] safe-area-bottom">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const active = item.isActive(location.pathname);
          const Icon = item.icon;

          if (item.isCenterAction) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className="w-12 h-12 -mt-4 rounded-full bg-gradient-to-tr from-emerald-800 via-emerald-700 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-900/30 hover:scale-105 active:scale-95 transition-transform cursor-pointer border-4 border-stone-50 dark:border-stone-950"
                title={item.label}
                aria-label={item.label}
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-colors cursor-pointer relative min-w-[56px] ${
                active
                  ? 'text-emerald-800 dark:text-emerald-400'
                  : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {!!item.badgeCount && item.badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-3.5 h-3.5 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-stone-900">
                    {item.badgeCount > 9 ? '9+' : item.badgeCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 ${active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
