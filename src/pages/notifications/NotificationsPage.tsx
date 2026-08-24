import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { NotificationItem } from '../../types';
import { ArrowLeft, Bell, CheckCheck, MessageSquare, Repeat, Sparkles } from 'lucide-react';

const ICONS: Record<NotificationItem['type'], React.ComponentType<{ className?: string }>> = {
  trade_offer: Repeat,
  trade_status: Sparkles,
  message: MessageSquare,
  loop: Repeat,
  badge: Sparkles,
  system: Bell,
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    refreshNotifications,
    unreadNotificationCount,
  } = useApp();

  // Ekran her açıldığında canlı veriden tazelenir.
  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const handleClick = (notification: NotificationItem) => {
    markNotificationAsRead(notification.id);
    if (notification.linkUrl) navigate(notification.linkUrl);
  };

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center cursor-pointer"
              aria-label="Geri"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold">Bildirimler</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} okunmamış`
                  : 'Tümü okundu'}
              </p>
            </div>
          </div>

          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsAsRead}
              className="px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tümünü okundu say
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Bell className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto" />
            <p className="text-sm font-bold">Bildirim yok</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 px-8">
              Sana takas teklifi geldiğinde, teklifin yanıtlandığında veya yeni mesaj aldığında
              burada göreceksin.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => {
              const Icon = ICONS[notification.type] ?? Bell;

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleClick(notification)}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-colors cursor-pointer flex items-start gap-3 ${
                    notification.isRead
                      ? 'bg-white dark:bg-stone-900 border-stone-200/80 dark:border-stone-800'
                      : 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                  }`}
                >
                  {notification.thumbnail ? (
                    <img
                      src={notification.thumbnail}
                      alt=""
                      className="w-9 h-9 rounded-xl object-cover bg-stone-100 shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <span className="w-9 h-9 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    </span>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-bold truncate">{notification.title}</h2>
                      <span className="text-[10px] text-stone-400 shrink-0">
                        {notification.createdAt}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                  </div>

                  {!notification.isRead && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 mt-2" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
