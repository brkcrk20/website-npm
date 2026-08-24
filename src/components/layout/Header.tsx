import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SwaloopLogo } from '../common/SwaloopLogo';
import { useApp } from '../../context/AppContext';
import { Bell, Heart, MapPin, Search } from 'lucide-react';

/**
 * Üst çubuk. Sadeleştirildi: eskiden burada admin paneline giden bir düğme,
 * bir "cihaz çerçevesi" anahtarı ve elle seçilen sahte bir şehir listesi
 * vardı. Artık yalnızca kimlik (logo + konum) ve iki gerçek kısayol var:
 * arama, favoriler ve bildirimler.
 */

const AUTH_PATHS = ['/', '/onboarding', '/giris', '/kayit', '/dogrulama', '/profil-olustur'];

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAuthenticated, unreadNotificationCount, favoritesCount } = useApp();

  const isAuthPage = AUTH_PATHS.includes(location.pathname);

  if (isAuthPage) return null;

  const locationLabel = [currentUser.district, currentUser.city].filter(Boolean).join(', ');

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800 px-3 py-2 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="flex items-center gap-2 min-w-0 cursor-pointer"
        >
          <SwaloopLogo size="sm" />
          {locationLabel && (
            <span className="hidden xs:flex items-center gap-1 text-[11px] font-semibold text-stone-500 dark:text-stone-400 min-w-0">
              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="truncate max-w-[110px]">{locationLabel}</span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/arama')}
            className="p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Ara"
            aria-label="Ara"
          >
            <Search className="w-5 h-5" />
          </button>

          {isAuthenticated && (
            <>
              <button
                type="button"
                onClick={() => navigate('/favoriler')}
                className="relative p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title="Favorilerim"
                aria-label="Favorilerim"
              >
                <Heart className="w-5 h-5" />
                {favoritesCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-bold flex items-center justify-center">
                    {favoritesCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/bildirimler')}
                className="relative p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title="Bildirimler"
                aria-label="Bildirimler"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9.5px] font-bold flex items-center justify-center">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>
            </>
          )}

          {!isAuthenticated && (
            <button
              type="button"
              onClick={() => navigate('/giris')}
              className="ml-1 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              Giriş Yap
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
