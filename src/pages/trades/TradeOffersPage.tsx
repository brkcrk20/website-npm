import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { TradeCard } from '../../components/common/TradeCard';
import { TradeOffer } from '../../types';
import { ArrowLeftRight, Inbox, Send, CheckCircle2, Clock, Filter, Plus, Sparkles, ShieldCheck } from 'lucide-react';

export const TradeOffersPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'incoming' | 'outgoing' | 'completed'>('incoming');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [isLoading, setIsLoading] = useState(true);
  const [incomingTrades, setIncomingTrades] = useState<TradeOffer[]>([]);
  const [outgoingTrades, setOutgoingTrades] = useState<TradeOffer[]>([]);
  const [completedTrades, setCompletedTrades] = useState<TradeOffer[]>([]);

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    const [allTrades, incoming, outgoing] = await Promise.all([
      tradeService.getAllTrades(),
      tradeService.getUserIncomingTrades(currentUser.id),
      tradeService.getUserOutgoingTrades(currentUser.id),
    ]);

    setIncomingTrades(incoming);
    setOutgoingTrades(outgoing);
    setCompletedTrades(
      allTrades.filter(
        (t) =>
          (t.initiatorId === currentUser.id || t.receiverId === currentUser.id) &&
          (t.status === 'completed' || t.status === 'rejected' || t.status === 'cancelled')
      )
    );
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

  const activeIncoming = incomingTrades.filter(
    (t) => t.status !== 'completed' && t.status !== 'rejected' && t.status !== 'cancelled'
  );
  const activeOutgoing = outgoingTrades.filter(
    (t) => t.status !== 'completed' && t.status !== 'rejected' && t.status !== 'cancelled'
  );

  const getFilteredList = () => {
    let list: TradeOffer[] = [];
    if (activeTab === 'incoming') list = activeIncoming;
    else if (activeTab === 'outgoing') list = activeOutgoing;
    else list = completedTrades;

    if (filterStatus !== 'all') {
      list = list.filter((t) => t.status === filterStatus);
    }
    return list;
  };

  const handleAccept = async (tradeId: string) => {
    const updated = await tradeService.acceptOffer(tradeId);
    if (updated) {
      showToast('Teklif Kabul Edildi!', 'Ürünler takas için kilitlendi. Teslimat planına geçebilirsiniz.', 'success');
      navigate(`/teklif/${tradeId}`);
    }
  };

  const handleReject = async (tradeId: string) => {
    const updated = await tradeService.rejectOffer(tradeId);
    if (updated) {
      showToast('Teklif Reddedildi', 'Takas teklifi geri çevrildi.', 'info');
      loadTrades();
    }
  };

  const currentList = getFilteredList();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas pb-24 text-ink flex items-center justify-center">
        <p className="text-sm text-ink-soft">Takaslar yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-ink tracking-tight font-display">Takaslarım</h1>
            <p className="text-xs text-ink-soft">Devam eden ve tamamlanan takas süreçleriniz</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/eslesme')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-ink text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <span>🔥 Kaydır & Eşleş</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/kesfet')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-dark text-on-brand text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni İlan</span>
            </button>
          </div>
        </div>

        {/* Status Highlights Banner */}
        <div role="tablist" aria-label="Takas listeleri" className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'incoming'}
            onClick={() => setActiveTab('incoming')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
              activeTab === 'incoming'
                ? 'bg-brand text-on-brand border-brand shadow-sm'
                : 'bg-surface text-ink-soft border-line hover:bg-canvas'
            }`}
          >
            <span className="flex items-center justify-between mb-1">
              <span className={`text-[11px] font-bold ${activeTab === 'incoming' ? 'text-brand-soft' : 'text-ink-faint'}`}>
                GELEN
              </span>
              <Inbox className={`w-4 h-4 ${activeTab === 'incoming' ? 'text-brand' : 'text-brand-dark'}`} />
            </span>
            <span className="block text-xl font-extrabold">{activeIncoming.length}</span>
            <span className={`block text-[10px] ${activeTab === 'incoming' ? 'text-brand-soft' : 'text-ink-soft'}`}>
              Onay bekleyen
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'outgoing'}
            onClick={() => setActiveTab('outgoing')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
              activeTab === 'outgoing'
                ? 'bg-brand text-on-brand border-brand shadow-sm'
                : 'bg-surface text-ink-soft border-line hover:bg-canvas'
            }`}
          >
            <span className="flex items-center justify-between mb-1">
              <span className={`text-[11px] font-bold ${activeTab === 'outgoing' ? 'text-brand-soft' : 'text-ink-faint'}`}>
                GİDEN
              </span>
              <Send className={`w-4 h-4 ${activeTab === 'outgoing' ? 'text-brand' : 'text-ink-soft'}`} />
            </span>
            <span className="block text-xl font-extrabold">{activeOutgoing.length}</span>
            <span className={`block text-[10px] ${activeTab === 'outgoing' ? 'text-brand-soft' : 'text-ink-soft'}`}>
              Yanıt bekleyen
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'completed'}
            onClick={() => setActiveTab('completed')}
            className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
              activeTab === 'completed'
                ? 'bg-brand text-on-brand border-brand shadow-sm'
                : 'bg-surface text-ink-soft border-line hover:bg-canvas'
            }`}
          >
            <span className="flex items-center justify-between mb-1">
              <span className={`text-[11px] font-bold ${activeTab === 'completed' ? 'text-brand-soft' : 'text-ink-faint'}`}>
                GEÇMİŞ
              </span>
              <CheckCircle2 className={`w-4 h-4 ${activeTab === 'completed' ? 'text-brand' : 'text-brand-dark'}`} />
            </span>
            <span className="block text-xl font-extrabold">{completedTrades.length}</span>
            <span className={`block text-[10px] ${activeTab === 'completed' ? 'text-brand-soft' : 'text-ink-soft'}`}>
              Sonuçlanan
            </span>
          </button>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-line/60 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('incoming');
              setFilterStatus('all');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'incoming' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Gelen Teklifler ({activeIncoming.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('outgoing');
              setFilterStatus('all');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'outgoing' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Giden Teklifler ({activeOutgoing.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('completed');
              setFilterStatus('all');
            }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'completed' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Geçmiş Takaslar ({completedTrades.length})
          </button>
        </div>

        {/* List of Trades */}
        <div className="space-y-3">
          {currentList.length > 0 ? (
            currentList.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                isIncoming={trade.receiverId === currentUser.id}
                onAccept={handleAccept}
                onReject={handleReject}
                onCounter={(tradeId) => navigate(`/karsi-teklif/${tradeId}`)}
              />
            ))
          ) : (
            <div className="text-center py-12 px-4 bg-surface rounded-2xl border border-line">
              <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center mx-auto mb-3">
                <ArrowLeftRight className="w-6 h-6 text-ink-faint" />
              </div>
              <h3 className="text-sm font-bold text-ink mb-1">
                {activeTab === 'incoming'
                  ? 'Henüz gelen bir takas teklifi yok'
                  : activeTab === 'outgoing'
                  ? 'Henüz bir takas teklifi göndermediniz'
                  : 'Henüz tamamlanmış bir takasınız bulunmuyor'}
              </h3>
              <p className="text-xs text-ink-soft max-w-xs mx-auto mb-4">
                {activeTab === 'incoming'
                  ? 'İlanlarınızı öne çıkararak diğer kullanıcıların teklif vermesini sağlayabilirsiniz.'
                  : 'Keşfet sayfasındaki binlerce sürdürülebilir ilandan birine teklif gönderin.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/kesfet')}
                className="px-4 py-2 bg-brand hover:bg-brand-dark text-on-brand text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                İlanları Keşfet
              </button>
            </div>
          )}
        </div>

        {/* 6-Step Safety Protocol Info Box */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-900 to-teal-900 text-white">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <h4 className="text-xs font-bold">Swaloop 6 Adımlı Güvenli Takas</h4>
          </div>
          <p className="text-[11px] text-emerald-100/90 leading-relaxed">
            Teklif kabul edildiğinde ürünler diğer kullanıcılara otomatik kilitlenir. Teslimat tamamlanıp her iki taraf onaylayana kadar takas güvence altındadır.
          </p>
        </div>
      </div>
    </div>
  );
};
