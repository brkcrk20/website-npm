import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, Bell, Repeat, Sparkles, ShieldCheck, Check, Search, MessageSquare, Star, ArrowLeftRight } from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead, unreadNotificationCount } =
    useApp();

  const handleNotificationClick = (n: (typeof notifications)[0]) => {
    markNotificationAsRead(n.id);
    if (n.linkUrl) {
      navigate(n.linkUrl);
    }
  };

  // İkonlar DB'deki `notifications.type` değerleriyle eşleşir
  // (bkz. migration 20260820100000).
  const getIcon = (type: string) => {
    switch (type) {
      case 'trade_offer':
        return <Repeat className="w-4 h-4 text-emerald-700" />;
      case 'counter_offer':
        return <ArrowLeftRight className="w-4 h-4 text-emerald-700" />;
      case 'trade_status':
        return <Sparkles className="w-4 h-4 text-amber-600" />;
      case 'need_matched':
        return <Search className="w-4 h-4 text-emerald-700" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-sky-600" />;
      case 'review_request':
        return <Star className="w-4 h-4 text-amber-500" />;
      case 'badge':
        return <ShieldCheck className="w-4 h-4 text-purple-600" />;
      default:
        return <Bell className="w-4 h-4 text-sky-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24 text-stone-900">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-stone-900 font-display">Bildirimler</h1>
              <p className="text-xs text-stone-500">
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} okunmamış bildirim`
                  : 'Takas teklifleri ve güncellemeler'}
              </p>
            </div>
          </div>

          {unreadNotificationCount > 0 && (
            <button
              type="button"
              onClick={() => markAllNotificationsAsRead()}
              className="px-3 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold hover:bg-stone-100 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Tümünü okundu işaretle
            </button>
          )}
        </div>

        {/* Boş durum kullanıcıya yol göstermeli (rapor md. 89-90) */}
        {notifications.length === 0 && (
          <div className="bg-white rounded-3xl p-10 border border-stone-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <Bell className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Henüz bildirimin yok</h3>
              <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1">
                Aradığın şeyleri listene eklersen, uyan bir ilan yayınlandığında ilk sen
                haberdar olursun.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/aradiklarim')}
              className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
            >
              Aradıklarımı Ekle
            </button>
          </div>
        )}

        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                n.isRead
                  ? 'bg-white border-stone-200/80 hover:bg-stone-50'
                  : 'bg-emerald-50/50 border-emerald-200 shadow-xs hover:bg-emerald-50'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                {getIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className={`text-xs font-bold ${n.isRead ? 'text-stone-800' : 'text-emerald-950'}`}>
                    {n.title}
                  </h4>
                  <span className="text-[10px] text-stone-400">{n.createdAt}</span>
                </div>
                <p className="text-xs text-stone-600 mt-0.5 leading-snug">{n.message}</p>
              </div>
              {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 mt-2" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
