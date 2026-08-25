import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Bell,
  Lock,
  Globe,
  Moon,
  Sun,
  LogOut,
  Info,
  HelpCircle,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

// 26. AYARLAR
//
// Önceden tema/dil/çıkış profil ekranının içine gömülüydü ve profil beş
// işi birden yapıyordu. Her ekranın tek amacı olsun diye (md. 145) ayarlar
// kendi ekranına taşındı.

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, theme, setTheme, language, setLanguage, logoutUser, showToast } = useApp();

  const handleLogout = async () => {
    await logoutUser();
    showToast('Çıkış yapıldı', 'Tekrar bekleriz.', 'info');
    navigate('/giris');
  };

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg text-ink">Ayarlar</h1>
        </div>

        <section>
          <h2 className="sw-label">Hesap</h2>
          <div className="sw-card divide-y divide-line">
            <button
              type="button"
              onClick={() => navigate('/profil/duzenle')}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="text-sm text-ink flex-1">Hesap bilgileri</span>
              <ChevronRight className="w-4 h-4 text-ink-faint" />
            </button>

            <div className="px-4 py-3.5 flex items-center gap-3">
              <Bell className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="text-sm text-ink flex-1">Telefon</span>
              <span className="text-xs text-ink-soft">{currentUser.phone}</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="sw-label">Görünüm</h2>
          <div className="sw-card divide-y divide-line">
            <div className="px-4 py-3 flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-ink-soft shrink-0" />
              ) : (
                <Sun className="w-4 h-4 text-ink-soft shrink-0" />
              )}
              <span className="text-sm text-ink flex-1">Tema</span>
              <div className="inline-flex p-0.5 rounded-xl bg-canvas border border-line">
                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  aria-pressed={theme === 'light'}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    theme === 'light' ? 'bg-surface text-ink' : 'text-ink-soft'
                  }`}
                >
                  Açık
                </button>
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  aria-pressed={theme === 'dark'}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    theme === 'dark' ? 'bg-surface text-ink' : 'text-ink-soft'
                  }`}
                >
                  Koyu
                </button>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center gap-3">
              <Globe className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="text-sm text-ink flex-1">Dil</span>
              <div className="inline-flex p-0.5 rounded-xl bg-canvas border border-line">
                <button
                  type="button"
                  onClick={() => setLanguage('tr')}
                  aria-pressed={language === 'tr'}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    language === 'tr' ? 'bg-surface text-ink' : 'text-ink-soft'
                  }`}
                >
                  Türkçe
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  aria-pressed={language === 'en'}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    language === 'en' ? 'bg-surface text-ink' : 'text-ink-soft'
                  }`}
                >
                  English
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="sw-label">Destek</h2>
          <div className="sw-card divide-y divide-line">
            <button
              type="button"
              onClick={() => navigate('/yardim')}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="text-sm text-ink flex-1">Yardım & Destek</span>
              <ChevronRight className="w-4 h-4 text-ink-faint" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/hakkimizda')}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="text-sm text-ink flex-1">Hakkımızda</span>
              <ChevronRight className="w-4 h-4 text-ink-faint" />
            </button>
          </div>
        </section>

        <div className="sw-card divide-y divide-line">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-ink-soft shrink-0" />
            <span className="text-sm text-ink flex-1">Çıkış yap</span>
          </button>
          <button
            type="button"
            onClick={() =>
              showToast(
                'Hesap silme',
                'Hesap silme akışı hazırlanıyor. Şimdilik destek üzerinden talep edebilirsin.',
                'info'
              )
            }
            className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-danger shrink-0" />
            <span className="text-sm text-danger flex-1">Hesabımı sil</span>
          </button>
        </div>

        <p className="text-center text-[11px] text-ink-faint pb-4">Swaloop · Sürüm 1.0</p>
      </div>
    </div>
  );
};
