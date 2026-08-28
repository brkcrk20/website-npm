import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { messageService } from '../../services/messageService';
import {
  TradeOffer,
  TradeCancellationReason,
  TRADE_CANCELLATION_REASONS,
} from '../../types';
import { Timeline } from '../../components/common/Timeline';
import { TrustCard } from '../../components/common/TrustCard';
import {
  ArrowLeft,
  MessageSquare,
  ShieldCheck,
  MapPin,
  Calendar,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Star,
  Sparkles,
  ArrowLeftRight,
  Share2,
  Lock,
  Flag,
} from 'lucide-react';

// Değerlendirmenin dört boyutu (md. 41). Anahtarlar `Review['categories']`
// ile birebir aynı olmalı.
const REVIEW_DIMENSIONS = [
  { key: 'itemAccuracy', label: 'Ürün açıklamaya uygun' },
  { key: 'communication', label: 'İletişim' },
  { key: 'delivery', label: 'Zamanında teslimat' },
  { key: 'trustworthiness', label: 'Genel güvenilirlik' },
] as const;

export const TradeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [trade, setTrade] = useState<TradeOffer | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  // Takastan vazgeçme (rapor md. 31): neden seçilmeden iptal edilemez.
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState<TradeCancellationReason | ''>('');
  const [cancelNote, setCancelNote] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  // Takası ilerleten HİÇBİR eylemin çift tıklamaya karşı koruması yoktu:
  // "Teklifi Kabul Et"e iki kez basmak acceptOffer()'ı iki kez çağırıyor,
  // "Takası Başarıyla Tamamla" iki kez ilerletme deniyor, değerlendirme
  // formu iki kez gönderilebiliyordu (ve değerlendirme doğrudan güven
  // puanını besliyor). Tek bir kilit hepsini kapsıyor.
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const isBusy = busyAction !== null;

  /** Aynı anda tek yazma işlemi çalışsın. */
  const runOnce = async (name: string, action: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(name);
    try {
      await action();
    } finally {
      setBusyAction(null);
    }
  };
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewCategories, setReviewCategories] = useState({
    trustworthiness: 5,
    communication: 5,
    itemAccuracy: 5,
    delivery: 5,
  });

  const loadTrade = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const t = await tradeService.getTradeById(id);
    setTrade(t);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    loadTrade();
  }, [loadTrade]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas p-6 flex items-center justify-center">
        <p className="text-sm text-ink-soft">Takas yükleniyor...</p>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-screen bg-canvas p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-bold text-ink mb-2">Takas bulunamadı</h2>
        <button
          type="button"
          onClick={() => navigate('/takaslarim')}
          className="px-4 py-2 bg-brand text-on-brand rounded-xl text-xs font-bold"
        >
          Takaslarıma Dön
        </button>
      </div>
    );
  }

  const isInitiator = trade.initiatorId === currentUser.id;
  const isReceiver = trade.receiverId === currentUser.id;
  const otherUser = isInitiator ? trade.receiver : trade.initiator;

  const myItem = isInitiator ? trade.offeredListings[0] : trade.requestedListings[0];
  const otherItem = isInitiator ? trade.requestedListings[0] : trade.offeredListings[0];

  const CANCELLABLE_STATUSES = ['offer_sent', 'accepted', 'locked', 'delivery_planned', 'shipped'];
  const canCancel =
    CANCELLABLE_STATUSES.includes(trade.status) &&
    (trade.status !== 'offer_sent' || isInitiator);

  const handleAccept = () =>
    runOnce('accept', async () => {
      const updated = await tradeService.acceptOffer(trade.id);
      if (!updated) {
        showToast('Teklif kabul edilemedi', 'Lütfen tekrar dene.', 'error');
        return;
      }
      setTrade(updated);
      showToast('Takas Teklifi Kabul Edildi!', 'Ürünler takas için kilitlendi.', 'success');
      navigate(`/takas-sureci/${trade.id}`);
    });

  const handleReject = () =>
    runOnce('reject', async () => {
      const updated = await tradeService.rejectOffer(trade.id);
      if (!updated) {
        showToast('Teklif reddedilemedi', 'Lütfen tekrar dene.', 'error');
        return;
      }
      setTrade(updated);
      showToast('Teklif Reddedildi', undefined, 'info');
    });

  const handleCancelTrade = async () => {
    if (!cancelReason) return;

    setIsCancelling(true);
    const updated = await tradeService.cancelTrade(trade.id, cancelReason, cancelNote);
    setIsCancelling(false);

    if (!updated) {
      showToast('Takas iptal edilemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    setTrade(updated);
    setShowCancelModal(false);
    setCancelReason('');
    setCancelNote('');
    showToast('Takastan vazgeçildi', 'İlanlar yeniden takasa açıldı.', 'info');
  };

  const handleAdvanceStep = (step: 4 | 5 | 6) =>
    runOnce(`step-${step}`, async () => {
    // Adım 5 tek taraflı bir ilerletme değil, bir onay: takas ancak iki
    // taraf da onayladığında "doğrulandı" adımına geçiyor.
    if (step === 5) {
      const result = await tradeService.confirmReceipt(trade.id);

      if (!result?.trade) {
        showToast('Onay kaydedilemedi', 'Lütfen tekrar dene.', 'error');
        return;
      }

      setTrade(result.trade);
      showToast(
        result.bothConfirmed ? 'Teslimat Doğrulandı!' : 'Onayın Kaydedildi',
        result.bothConfirmed
          ? 'İki taraf da onayladı, takası tamamlayabilirsin.'
          : 'Karşı taraf onayladığında takas tamamlanabilecek.',
        result.bothConfirmed ? 'success' : 'info'
      );
      return;
    }

    const updated = await tradeService.advanceTradeStep(trade.id, step);
    if (updated) {
      setTrade(updated);
      if (step === 4) {
        showToast('Teslimat Aşamasına Geçildi', 'Kargo veya buluşma planı aktif.', 'info');
      } else if (step === 6) {
        showToast('Tebrikler! Takas Tamamlandı 🎉', 'Takas başarıyla tamamlandı.', 'success');
        setShowReviewModal(true);
      }
    } else {
      showToast('Adım ilerletilemedi', 'Lütfen tekrar dene.', 'error');
    }
    });

  const handleChatOpen = async () => {
    const conv = await messageService.getOrCreateConversationWithUser(currentUser.id, otherUser.id);
    if (conv) {
      navigate(`/mesajlar/${conv.id}`);
    } else {
      showToast('Sohbet açılamadı', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();

    return runOnce('review', async () => {
    await tradeService.submitReview({
      tradeId: trade.id,
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      authorAvatar: currentUser.avatarUrl,
      targetUserId: otherUser.id,
      overallRating: rating,
      categories: reviewCategories,
      // Boş bırakılan yorum EKSİK bırakılır. Eskiden yerine
      // "Harika ve güvenilir bir takas deneyimi oldu!" yazılıyordu —
      // kullanıcının hiç yazmadığı bir övgü onun adına kaydediliyordu.
      comment: reviewComment.trim(),
    });

    showToast('Değerlendirmeniz Kaydedildi!', 'Topluluk güven skoruna katkınız için teşekkürler.', 'success');
    setShowReviewModal(false);
    loadTrade();
    });
  };

  const isReviewedByMe = isInitiator ? trade.isReviewedByInitiator : trade.isReviewedByReceiver;

  return (
    <div className="min-h-screen bg-canvas pb-28 text-ink">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-3 space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/takaslarim')}
              className="p-2 rounded-xl bg-surface border border-line text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-ink">Takas Süreci</h1>
                {trade.status === 'locked' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-brand-soft text-brand-dark px-2 py-0.5 rounded-full">
                    <Lock className="w-3 h-3" />
                    Kilitlendi
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-soft">ID: #{trade.id.slice(-6)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/dispute?tradeId=${trade.id}`)}
            className="text-ink-faint hover:text-danger p-2 rounded-xl hover:bg-danger-soft transition-colors"
            title="Sorun Bildir"
          >
            <Flag className="w-4 h-4" />
          </button>
        </div>

        {/* Counterpart Profile Card */}
        <div className="bg-surface rounded-2xl border border-line p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={otherUser.avatarUrl}
              alt={otherUser.fullName}
              className="w-12 h-12 rounded-full object-cover border border-line"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-ink">{otherUser.fullName}</span>
                {/* Puan yoksa "4.8" uydurulmuyor: karşı tarafın gerçekten
                    değerlendirilip değerlendirilmediği söyleniyor. */}
                <TrustCard trustProfile={otherUser.trustProfile} variant="compact" />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-ink-soft mt-0.5">
                <MapPin className="w-3 h-3 text-ink-faint" />
                <span>{otherUser.district}, {otherUser.city}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleChatOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-soft text-brand-dark hover:bg-brand-soft text-xs font-bold border border-brand-line transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Mesajlaş</span>
          </button>
        </div>

        {/* 6-Step Visual Timeline Component */}
        <div className="bg-surface rounded-2xl border border-line p-4">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider mb-3">
            6 Adımlı Takas Akışı
          </h2>
          <Timeline timeline={trade.timeline} currentStatus={trade.status} />
        </div>

        {/* Side-by-side Product Comparison */}
        <div className="bg-surface rounded-2xl border border-line p-4 space-y-3">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider">Takaslanan Ürünler</h2>

          <div className="grid grid-cols-2 gap-3 relative items-stretch">
            {/* Left: My Item */}
            <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider block mb-1">
                  {isInitiator ? 'Senin Verdiğin' : 'Senin Alacağın'}
                </span>
                <div className="aspect-square rounded-lg overflow-hidden bg-line mb-2">
                  <img
                    src={myItem?.images[0]}
                    alt={myItem?.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-xs font-bold text-ink line-clamp-1">{myItem?.title}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-line text-[10px] text-ink-soft">
                Durum: <span className="font-semibold text-ink-soft">{myItem?.condition}</span>
              </div>
            </div>

            {/* Center Swap Arrow */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-surface border border-line shadow-sm flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4 text-brand-dark" />
            </div>

            {/* Right: Other Item */}
            <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider block mb-1">
                  {isInitiator ? 'Senin Alacağın' : 'Senin Verdiğin'}
                </span>
                <div className="aspect-square rounded-lg overflow-hidden bg-line mb-2">
                  <img
                    src={otherItem?.images[0]}
                    alt={otherItem?.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-xs font-bold text-ink line-clamp-1">{otherItem?.title}</h3>
              </div>
              <div className="mt-2 pt-2 border-t border-line text-[10px] text-ink-soft">
                Durum: <span className="font-semibold text-ink-soft">{otherItem?.condition}</span>
              </div>
            </div>
          </div>

          {/* Trade Note if any */}
          {trade.note && (
            <div className="p-3 rounded-xl bg-canvas border border-line text-xs text-ink-soft">
              <span className="font-bold text-ink-soft block text-[10px] uppercase mb-0.5">Teklif Notu:</span>
              "{trade.note}"
            </div>
          )}
        </div>

        {/* Meeting & Delivery Protocol Details */}
        <div className="bg-surface rounded-2xl border border-line p-4 space-y-2.5">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider">Teslimat & Güvenlik Bilgisi</h2>
          <div className="flex items-start gap-2.5 text-xs text-ink-soft">
            <MapPin className="w-4 h-4 text-brand-dark shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Buluşma / Teslim Yeri:</span>
              <span>{trade.deliveryDetails?.locationName || 'Kadıköy Güvenli Takas Noktası (Metro Çıkışı)'}</span>
            </div>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-ink-soft">
            <Calendar className="w-4 h-4 text-brand-dark shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Planlanan Tarih:</span>
              <span>{trade.deliveryDetails?.scheduledDate || 'Belirlenmedi (Sohbet üzerinden kararlaştırılabilir)'}</span>
            </div>
          </div>
        </div>

        {/* Action Panel for Current Trade Status */}
        <div className="bg-surface rounded-2xl border border-line p-4 space-y-3">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider">Sıradaki Eylem</h2>

          {/* If waiting for receiver response */}
          {trade.status === 'offer_sent' && isReceiver && (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">Bu takas teklifini kabul etmek istiyor musunuz?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isBusy}
                  className="py-2.5 px-4 rounded-xl border border-line text-ink-soft hover:bg-canvas text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busyAction === 'reject' ? 'Reddediliyor…' : 'Reddet'}
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isBusy}
                  className="py-2.5 px-4 rounded-xl bg-brand hover:bg-brand-dark text-on-brand text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busyAction === 'accept' ? 'Kabul ediliyor…' : 'Teklifi Kabul Et'}
                </button>
              </div>
              {/* Reddet ile Kabul arasındaki üçüncü yol (rapor md. 26) */}
              <button
                type="button"
                onClick={() => navigate(`/karsi-teklif/${trade.id}`)}
                className="w-full py-2.5 px-4 rounded-xl border border-brand-line bg-brand-soft/60 text-brand-dark hover:bg-brand-soft text-xs font-bold transition-colors cursor-pointer"
              >
                Karşı Teklif Ver
              </button>
            </div>
          )}

          {trade.status === 'offer_sent' && isInitiator && (
            <div className="p-3 bg-warn-soft rounded-xl border border-warn-line text-xs text-warn">
              Teklifiniz karşı tarafa iletildi. Karşı taraf onayladığında bildirim alacaksınız.
            </div>
          )}

          {/* Locked state: Need delivery planning */}
          {trade.status === 'locked' && (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">
                Ürünler kilitlendi! Karşı tarafla sohbet üzerinden buluşma saati ayarlayın veya teslimatı başlatın.
              </p>
              <button
                type="button"
                onClick={() => handleAdvanceStep(4)}
                disabled={isBusy}
                className="w-full py-2.5 bg-brand hover:bg-brand-dark text-on-brand rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busyAction === 'step-4' ? 'Başlatılıyor…' : 'Teslimat Planını Onayla & Başlat'}
              </button>
            </div>
          )}

          {/* Delivery Planned state: In transit */}
          {trade.status === 'delivery_planned' && (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">
                Buluşma veya kargo teslimatı gerçekleştiğinde aşağıdaki butona basarak ürünü teslim aldığınızı onaylayın.
              </p>
              <button
                type="button"
                onClick={() => handleAdvanceStep(5)}
                disabled={isBusy}
                className="w-full py-2.5 bg-brand hover:bg-brand-dark text-on-brand rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busyAction === 'step-5' ? 'Onaylanıyor…' : 'Ürünü Teslim Aldım & Doğruladım'}</span>
              </button>
            </div>
          )}

          {/* Verified state: Complete trade */}
          {trade.status === 'verified' && (
            <div className="space-y-2">
              <p className="text-xs text-ink-soft">
                Teslimat doğrulaması yapıldı. Takas sürecini tamamlayıp profilinize yansıtın.
              </p>
              <button
                type="button"
                onClick={() => handleAdvanceStep(6)}
                disabled={isBusy}
                className="w-full py-2.5 bg-brand hover:bg-brand-dark text-on-brand rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4" />
                <span>{busyAction === 'step-6' ? 'Tamamlanıyor…' : 'Takası Başarıyla Tamamla'}</span>
              </button>
            </div>
          )}

          {/* Completed state: Review counterpart */}
          {trade.status === 'completed' && (
            <div className="space-y-2">
              <div className="p-3 bg-brand-soft rounded-xl border border-brand-line text-xs text-brand-dark font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-dark shrink-0" />
                <span>Takas başarıyla tamamlandı! Güven puanınız profilinize yansıtıldı.</span>
              </div>
              {!isReviewedByMe ? (
                <button
                  type="button"
                  onClick={() => setShowReviewModal(true)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-on-brand rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Star className="w-4 h-4 fill-white" />
                  <span>Kullanıcıyı Değerlendir ({otherUser.fullName})</span>
                </button>
              ) : (
                <p className="text-[11px] text-ink-soft text-center font-medium">
                  Bu takas için değerlendirmeniz kaydedilmiştir.
                </p>
              )}
            </div>
          )}

          {/* Takastan vazgeçme (rapor md. 31). Teklif aşamasında yalnızca
              teklifi GÖNDEREN görür — alan taraf zaten "Reddet"i kullanır. */}
          {canCancel && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="w-full py-2.5 rounded-xl border border-line text-ink-soft hover:bg-canvas text-xs font-bold transition-colors cursor-pointer"
            >
              {trade.status === 'offer_sent' ? 'Teklifi Geri Çek' : 'Takastan Vazgeç'}
            </button>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-sm font-bold text-ink">Takastan vazgeç</h3>
              <p className="text-xs text-ink-soft mt-0.5">
                Neden vazgeçtiğini seçersen karşı taraf için de, bizim için de daha anlaşılır olur.
              </p>
            </div>

            <div className="space-y-1.5">
              {TRADE_CANCELLATION_REASONS.map((reason) => {
                const selected = cancelReason === reason.id;

                return (
                  <button
                    key={reason.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCancelReason(reason.id)}
                    className={`w-full p-3 rounded-2xl border-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'border-brand bg-brand-soft/60 text-brand-dark'
                        : 'border-line text-ink-soft hover:bg-canvas'
                    }`}
                  >
                    {reason.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Eklemek istediğin bir şey var mı? (opsiyonel)"
              className="w-full px-4 py-3 rounded-2xl bg-canvas border border-line text-sm outline-hidden focus:border-brand resize-none"
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="py-2.5 rounded-xl border border-line text-ink-soft hover:bg-canvas text-xs font-bold transition-colors cursor-pointer"
              >
                Vazgeçme
              </button>
              <button
                type="button"
                disabled={!cancelReason || isCancelling}
                onClick={handleCancelTrade}
                className="py-2.5 rounded-xl bg-stone-900 hover:bg-black disabled:bg-line text-white text-xs font-bold transition-colors cursor-pointer"
              >
                {isCancelling ? 'İptal ediliyor…' : 'Takası İptal Et'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-warn-soft text-warn flex items-center justify-center mx-auto mb-2">
                <Star className="w-6 h-6 fill-star text-star" />
              </div>
              <h3 className="text-sm font-bold text-ink">Takas Değerlendirmesi</h3>
              <p className="text-xs text-ink-soft">{otherUser.fullName} ile olan deneyiminizi puanlayın</p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 cursor-pointer hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-7 h-7 ${
                      star <= rating ? 'fill-star text-star' : 'text-line'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Alt puanlar (md. 41: değerlendirme dört boyutlu).
                Bunlar EKRANDA SABİT "5/5" yazıyordu ve kullanıcı
                değiştiremiyordu — yani her değerlendirme, karşı tarafın
                her boyutta kusursuz olduğunu bildiriyordu. Güven sistemini
                besleyen veri buydu. Artık gerçekten seçilebiliyor. */}
            <div className="space-y-2.5 bg-canvas p-3 rounded-xl">
              {REVIEW_DIMENSIONS.map((dimension) => (
                <div key={dimension.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-soft">{dimension.label}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          setReviewCategories((prev) => ({ ...prev, [dimension.key]: star }))
                        }
                        aria-label={`${dimension.label}: ${star} yıldız`}
                        className="p-0.5 cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            star <= reviewCategories[dimension.key]
                              ? 'fill-star text-star'
                              : 'text-line'
                          }`}
                        />
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>

            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Yorumunuz (İsteğe bağlı)..."
              rows={2}
              className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:bg-surface focus:border-brand"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-line text-ink-soft font-bold text-xs"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={isBusy}
                className="flex-1 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-on-brand font-bold text-xs shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busyAction === 'review' ? 'Kaydediliyor…' : 'Puanı Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
