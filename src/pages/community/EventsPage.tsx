import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { communityService } from '../../services/communityService';
import { CommunityEvent } from '../../types';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
} from 'lucide-react';

export const EventsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [events, setEvents] = useState<CommunityEvent[]>(() => communityService.getEvents());

  const handleToggleJoin = (eventId: string, title: string) => {
    const updated = communityService.toggleEventAttendance(eventId);
    if (!updated) return;
    setEvents((prev) => prev.map((e) => (e.id === eventId ? updated : e)));
    showToast(
      updated.isAttending ? 'Etkinliğe Katıldınız! 🎉' : 'Katılım İptal Edildi',
      updated.isAttending ? `${title} için kaydınız oluşturuldu.` : undefined,
      updated.isAttending ? 'success' : 'info'
    );
  };

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-4 space-y-5">
        {/* Top Header Matching Screen 19 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-extrabold text-ink font-display">Etkinlikler</h1>
          <div className="w-10" />
        </div>

        {/* Hero Banner Matching Screen 19 */}
        <div className="bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-950 text-white rounded-3xl p-6 shadow-md relative overflow-hidden space-y-2">
          <div className="flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-wider">
            <Users className="w-4 h-4" />
            <span>Topluluk Buluşmaları</span>
          </div>
          <h2 className="text-xl font-black text-white font-display">
            Takas buluşmaları ve etkinliklerle toplulukla bir araya gel.
          </h2>
          <p className="text-xs text-emerald-100/80 leading-relaxed">
            Şehrindeki açık hava takas pazarlarına, tamir kafelerine katıl; eşyalarını elden güvenle takaslarken yeni arkadaşlar edin.
          </p>
        </div>

        {/* Event Cards List */}
        <div className="space-y-4 pt-1">
          {events.map((event) => {
            const categoryLabel =
              event.category === 'swap_party'
                ? 'Takas Partisi'
                : event.category === 'repair_cafe'
                ? 'Tamir Kafesi'
                : 'Buluşma';

            return (
              <div
                key={event.id}
                className="bg-surface rounded-3xl border border-line overflow-hidden shadow-xs hover:border-brand transition-colors"
              >
                <div className="aspect-video relative bg-stone-900">
                  <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover opacity-90" />
                  <div className="absolute top-3 left-3 bg-brand/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {categoryLabel}
                  </div>
                </div>

                <div className="p-5 space-y-3.5">
                  <h3 className="text-sm font-bold text-ink leading-snug">{event.title}</h3>

                  <p className="text-xs text-ink-soft leading-relaxed">{event.description}</p>

                  <div className="space-y-1.5 text-xs text-ink-soft pt-1 border-t border-line">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-brand-dark shrink-0" />
                      <span>{event.date} • {event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-brand-dark shrink-0" />
                      <span className="truncate">{event.locationName} ({event.district}, {event.city})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-brand-dark shrink-0" />
                      <span className="font-semibold text-ink">
                        {event.attendeesCount} kişi katılıyor
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleToggleJoin(event.id, event.title)}
                      className={`flex-1 py-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        event.isAttending
                          ? 'bg-brand-soft text-brand-dark border border-brand-line'
                          : 'bg-brand hover:bg-brand-dark text-white shadow-xs'
                      }`}
                    >
                      {event.isAttending ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-brand-dark" />
                          <span>Katılıyorsun (Kayıtlı)</span>
                        </>
                      ) : (
                        <span>Etkinliğe Katıl</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
