import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, Heart } from 'lucide-react';
import { SwaloopLogo } from '../common/SwaloopLogo';
import { useApp } from '../../context/AppContext';

// Sade üst bar: solda marka, sağda favoriler ve bildirimler.
//
// Önceki sürümde burada konum seçici, "Swaloop nedir?", dil değiştirici,
// admin kısayolu ve cihaz çerçevesi anahtarı vardı — beş ayrı iş. Yeni
// tasarımda her ekranın tek bir amacı var (md. 145); konum ve ayarlar
// kendi ekranlarına taşındı.

const HIDDEN_PREFIXES = [
  '/onboarding',
  '/kayit',
  '/dogrulama',
  '/giris',
  '/profil-olustur',
  '/admin',
];

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadNotificationCount, favoritesCount } = useApp();

  const hidden =
    location.pathname === '/' ||
    HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  if (hidden) return null;

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-line">
      <div className="sw-container flex items-center justify-between h-14">
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="cursor-pointer"
          aria-label="Ana sayfa"
        >
          <SwaloopLogo size="sm" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/favoriler')}
            aria-label="Favorilerim"
            className="relative w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
          >
            <Heart className="w-5 h-5" />
            {favoritesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('/bildirimler')}
            aria-label="Bildirimler"
            className="relative w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                {unreadNotificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
