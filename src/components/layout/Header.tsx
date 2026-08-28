import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { SwaloopLogo } from '../common/SwaloopLogo';
import { useApp } from '../../context/AppContext';

// Sade üst bar: solda marka, sağda bildirimler ve profil.
//
// Önceki sürümde burada konum seçici, "Swaloop nedir?", dil değiştirici,
// admin kısayolu ve cihaz çerçevesi anahtarı vardı — beş ayrı iş. Yeni
// tasarımda her ekranın tek bir amacı var (md. 145); konum ve ayarlar
// kendi ekranlarına taşındı.
//
// Bu turda iki değişiklik daha:
//
// * **Profil buraya (avatara) geldi.** Alt menüde beş yer var ve biri
//   Profil'e gidiyordu; oysa Takaslarım — takasın tamamlandığı ekran, yani
//   ürünün ölçtüğü tek şey — alt menüde hiç yoktu. Profil gündelik
//   kullanımda en az dokunulan yer olduğu için üst bara taşındı.
//
// * **Favoriler üst bardan çıktı.** Favori bir "sonra bakarım" listesi;
//   takası ilerleten bir eylem değil. Profil menüsünde zaten duruyor.
//   Üst barın iki simgeyle kalması, bildirim ve profil ayrımını da
//   netleştiriyor.

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
  const { unreadNotificationCount, currentUser } = useApp();

  const hidden =
    location.pathname === '/' ||
    HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  if (hidden) return null;

  const onProfile = location.pathname.startsWith('/profil');

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
            onClick={() => navigate('/bildirimler')}
            aria-label={
              unreadNotificationCount > 0
                ? `Bildirimler (${unreadNotificationCount} okunmamış)`
                : 'Bildirimler'
            }
            className="relative w-11 h-11 rounded-xl flex items-center justify-center text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
          >
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold flex items-center justify-center">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('/profil')}
            aria-label="Profilim"
            aria-current={onProfile ? 'page' : undefined}
            className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer"
          >
            <img
              src={currentUser.avatarUrl}
              alt=""
              className={`w-8 h-8 rounded-full object-cover border transition-colors ${
                onProfile ? 'border-brand' : 'border-line'
              }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
};
