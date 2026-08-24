import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { TradeCard } from '../../components/common/TradeCard';
import { TradeOffer } from '../../types';
import { Inbox, Loader2, Plus, Repeat, Send, Sparkles } from 'lucide-react';

type TradeTab = 'incoming' | 'outgoing' | 'active' | 'done';

const PENDING_STATUSES = ['offer_sent', 'offer_received', 'counter_offered'];
const CLOSED_STATUSES = ['completed', 'rejected', 'cancelled', 'expired'];

/**
 * Takaslarım.
 *
 * Önceden bu iş iki neredeyse aynı sayfaya bölünmüştü (TradeOffersPage ve
 * TradeRequestsPage) ve ikisi de `getAllTrades()` ile SİSTEMDEKİ TÜM
 * teklifleri istemciye çekip orada filtreliyordu. Artık tek sayfa var ve
 * yalnızca kullanıcının kendi teklifleri sorgulanıyor.
 */
export const TradeOffersPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast, refreshScorecard } = useApp();

  const [activeTab, setActiveTab] = useState<TradeTab>('incoming');
  const [incoming, setIncoming] = useState<TradeOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TradeOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const trades = await tradeService.getUserTrades(currentUser.id);
    setIncoming(trades.incoming);
    setOutgoing(trades.outgoing);
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  const all = [...incoming, ...outgoing];

  const lists: Record<TradeTab, TradeOffer[]> = {
    incoming: incoming.filter((offer) => PENDING_STATUSES.includes(offer.status)),
    outgoing: outgoing.filter((offer) => PENDING_STATUSES.includes(offer.status)),
    active: all.filter(
      (offer) => !PENDING_STATUSES.includes(offer.status) && !CLOSED_STATUSES.includes(offer.status)
    ),
    done: all.filter((offer) => CLOSED_STATUSES.includes(offer.status)),
  };

  const handleAccept = async (offer: TradeOffer) => {
    setBusyId(offer.id);
    const updated = await tradeService.acceptOffer(offer.id);
    setBusyId(null);

    if (!updated) {
      showToast('Kabul edilemedi', 'Teklif kabul edilirken bir sorun oluştu.', 'error');
      return;
    }

    showToast('Teklif kabul edildi 🎉', 'Teslimat adımına geçebilirsiniz.', 'success');
    refreshScorecard();
    await load();
    navigate(`/takas-sureci/${offer.id}`);
  };

  const handleReject = async (offer: TradeOffer) => {
    setBusyId(offer.id);
    const updated = await tradeService.rejectOffer(offer.id);
    setBusyId(null);

    if (!updated) {
      showToast('Reddedilemedi', 'Lütfen tekrar deneyin.', 'error');
      return;
    }

    showToast('Teklif reddedildi', 'Karşı taraf bilgilendirildi.', 'info');
    await load();
  };

  const tabs: { id: TradeTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'incoming', label: 'Gelen', icon: Inbox },
    { id: 'outgoing', label: 'Giden', icon: Send },
    { id: 'active', label: 'Süreçte', icon: Repeat },
    { id: 'done', label: 'Geçmiş', icon: Sparkles },
  ];

  const visible = lists[activeTab];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-extrabold">Takaslarım</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Teklifler, süren takaslar ve geçmişin
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/eslesme')}
            className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Eşleştir
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-stone-200/60 dark:bg-stone-800 rounded-2xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 rounded-xl text-[11px] font-bold transition-colors cursor-pointer flex flex-col items-center gap-0.5 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-stone-700 text-emerald-900 dark:text-emerald-300 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label} ({lists[tab.id].length})
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
          </div>
        )}

        {!isLoading && visible.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-xs text-stone-500 dark:text-stone-400 px-6">
              {activeTab === 'incoming'
                ? 'Henüz sana gelen teklif yok. İlanların yayında olsun ki teklifler gelsin.'
                : activeTab === 'outgoing'
                  ? 'Henüz teklif göndermedin. Keşfet’ten beğendiğin bir ürüne teklif ver.'
                  : activeTab === 'active'
                    ? 'Şu anda süren bir takasın yok.'
                    : 'Geçmiş takasın burada listelenecek.'}
            </p>

            <button
              type="button"
              onClick={() => navigate(activeTab === 'incoming' ? '/ilan-ver' : '/kesfet')}
              className="px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'incoming' ? 'İlan ver' : 'Keşfet’e git'}
            </button>
          </div>
        )}

        <div className="space-y-3">
          {visible.map((offer) => {
            const isIncoming = offer.receiverId === currentUser.id;
            const canRespond = isIncoming && PENDING_STATUSES.includes(offer.status);

            return (
              <div key={offer.id} className="space-y-2">
                <TradeCard
                  trade={offer}
                  currentUserId={currentUser.id}
                  onClick={() => navigate(`/teklif/${offer.id}`)}
                />

                {canRespond && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => handleAccept(offer)}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      Kabul et
                    </button>
                    <button
                      type="button"
                      disabled={busyId === offer.id}
                      onClick={() => handleReject(offer)}
                      className="px-4 py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60"
                    >
                      Reddet
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
