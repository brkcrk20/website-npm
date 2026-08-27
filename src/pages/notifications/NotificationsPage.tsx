import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Repeat,
  ArrowLeftRight,
  Sparkles,
  Search,
  MessageSquare,
  Star,
  ShieldCheck,
  Check,
  Clock,
  CalendarX,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

// 13. BİLDİRİMLER
//
// İkonlar DB'deki notifications.type değerleriyle eşleşir
// (migration 20260820100000, süre bildirimleri 20260829000000).

const ICONS: Record<string, React.ElementType> = {
  trade_offer: Repeat,
  counter_offer: ArrowLeftRight,
  trade_status: Sparkles,
  need_matched: Search,
  message: MessageSquare,
  review_request: Star,
  listing_expiring: Clock,
  listing_expired: CalendarX,
  badge: ShieldCheck,
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    unreadNotificationCount,
  } = useApp();

  const handleClick = (id: string, linkUrl: string) => {
    markNotificationAsRead(id);
    if (linkUrl) navigate(linkUrl);
  };

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg text-ink">Bildirimler</h1>
            {unreadNotificationCount > 0 && (
              <p className="text-xs text-ink-soft">{unreadNotificationCount} okunmamış</p>
            )}
          </div>

          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsAsRead()}
              className="sw-btn sw-btn-ghost text-xs px-3"
            >
              <Check className="w-3.5 h-3.5" />
              Tümünü okundu yap
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="sw-card p-10 text-center">
            <span className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-dark flex items-center justify-center mx-auto">
              <Bell className="w-6 h-6" />
            </span>
            <h2 className="text-base text-ink mt-4">Henüz bildirimin yok</h2>
            <p className="text-xs text-ink-soft mt-1.5 max-w-xs mx-auto">
              Aradığın şeyleri listene eklersen, uyan bir ilan yayınlandığında ilk sen haberdar
              olursun.
            </p>
            <button
              type="button"
              onClick={() => navigate('/aradiklarim')}
              className="sw-btn sw-btn-primary mt-4"
            >
              Aradıklarımı ekle
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {notifications.map((item) => {
              const Icon = ICONS[item.type] ?? Bell;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(item.id, item.linkUrl)}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-colors cursor-pointer ${
                      item.isRead
                        ? 'bg-surface border-line hover:bg-canvas'
                        : 'bg-brand-soft border-brand-line'
                    }`}
                  >
                    <span className="w-9 h-9 rounded-xl bg-surface border border-line flex items-center justify-center shrink-0 text-brand-dark">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-ink-faint shrink-0">
                          {item.createdAt}
                        </span>
                      </span>
                      <span className="block text-xs text-ink-soft mt-0.5 leading-snug">
                        {item.message}
                      </span>
                    </span>
                    {/* Okunmamış durumu renkle birlikte nokta ile de
                        belirtiliyor (md. 98). */}
                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-2" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
