import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, MessageSquare, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Alt navigasyon (md. 87): Ana Sayfa | Keşfet | + | Mesajlar | Profil
// Ortadaki "+" belirgin: ilan vermek uygulamanın en değerli eylemi.

const HIDDEN_PREFIXES = [
  '/onboarding',
  '/kayit',
  '/dogrulama',
  '/giris',
  '/profil-olustur',
  '/admin',
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Mesaj rozeti okunmamış MESAJ sayısını gösterir. Eskiden
  // `unreadNotificationCount` bağlıydı: yeni bir teklif ya da ilan süresi
  // uyarısı geldiğinde mesaj sekmesinde sayı beliriyor, kullanıcı sohbete
  // girdiğinde hiçbir yeni mesaj bulamıyordu.
  const { unreadMessageCount } = useApp();

  const hidden =
    location.pathname === '/' ||
    HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  if (hidden) return null;

  const items = [
    {
      id: 'home',
      label: 'Ana Sayfa',
      icon: Home,
      path: '/kesfet',
      isActive: (p: string) => p === '/kesfet' || p.startsWith('/ilan/'),
    },
    {
      id: 'search',
      label: 'Keşfet',
      icon: Search,
      path: '/arama',
      isActive: (p: string) =>
        p.startsWith('/arama') || p.startsWith('/kategoriler') || p.startsWith('/harita'),
    },
    {
      id: 'create',
      label: 'İlan Ver',
      icon: Plus,
      path: '/ilan-ver',
      isCenter: true,
      isActive: (p: string) => p === '/ilan-ver',
    },
    {
      id: 'messages',
      label: 'Mesajlar',
      icon: MessageSquare,
      path: '/mesajlar',
      badge: unreadMessageCount,
      isActive: (p: string) => p.startsWith('/mesaj'),
    },
    {
      id: 'profile',
      label: 'Profil',
      icon: User,
      path: '/profil',
      isActive: (p: string) =>
        p.startsWith('/profil') ||
        p.startsWith('/takaslarim') ||
        p.startsWith('/aradiklarim') ||
        p.startsWith('/favoriler'),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line">
      <div
        className="sw-container flex items-stretch justify-between"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(location.pathname);

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                className="flex-1 flex items-center justify-center py-2 cursor-pointer"
              >
                <span className="w-12 h-12 rounded-2xl bg-brand text-white flex items-center justify-center shadow-sm">
                  <Icon className="w-6 h-6" />
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] cursor-pointer transition-colors ${
                active ? 'text-brand' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </span>
              {/* Aktif sekme rengin yanında kalın metinle de belirtiliyor:
                  renk tek başına durum taşımamalı (md. 98). */}
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
