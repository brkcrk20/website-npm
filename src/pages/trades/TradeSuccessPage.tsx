import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { TradeOffer } from '../../types';
import {
  ArrowLeft,
  CheckCircle2,
  Star,
  Sparkles,
} from 'lucide-react';

export const TradeSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentUser, showToast } = useApp();

  const [trade, setTrade] = useState<TradeOffer | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    tradeService.getTradeById(id).then(setTrade);
  }, [id]);

  const otherUser = trade
    ? trade.initiatorId === currentUser.id
      ? trade.receiver
      : trade.initiator
    : undefined;
  const isReviewed = trade
    ? trade.initiatorId === currentUser.id
      ? trade.isReviewedByInitiator
      : trade.isReviewedByReceiver
    : false;

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('Harika bir takastı, ürün tam açıklandığı gibiydi.');
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trade || !otherUser) return;

    await tradeService.submitReview({
      tradeId: trade.id,
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      authorAvatar: currentUser.avatarUrl,
      targetUserId: otherUser.id,
      overallRating: rating,
      categories: {
        trustworthiness: rating,
        communication: rating,
        itemAccuracy: rating,
        delivery: rating,
      },
      comment,
    });

    setShowReviewModal(false);
    showToast('Değerlendirme Kaydedildi! ⭐', 'Güven puanına katkı sağladınız.', 'success');
    tradeService.getTradeById(trade.id).then(setTrade);
  };

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink flex flex-col justify-between">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-4 w-full space-y-6">
        {/* Top Header Matching Screen 12 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/takaslarim')}
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-extrabold text-ink font-display">Takas Tamamlandı</h1>
          <div className="w-10" />
        </div>

        {/* Big Green Check Circle with Sparkles Matching Screen 12 */}
        <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center">
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full bg-brand text-on-brand flex items-center justify-center shadow-xl shadow-emerald-900/20 ring-8 ring-brand animate-in zoom-in-90 duration-300">
              <CheckCircle2 className="w-16 h-16 stroke-[2.5]" />
            </div>
            <Sparkles className="w-6 h-6 text-star absolute -top-1 -right-2 animate-bounce" />
            <Sparkles className="w-5 h-5 text-brand absolute -bottom-1 -left-2" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-ink font-display tracking-tight">
            Takas başarıyla tamamlandı!
          </h2>
          <p className="text-sm text-ink-soft mt-1 max-w-xs">
            Swaloop'a katkın için teşekkürler.
          </p>
        </div>

        {/* Additional Badge Unlocked Notification */}
        <div className="p-4 rounded-2xl bg-surface border border-line shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-warn-soft border border-warn-line text-warn flex items-center justify-center text-xl">
            🏅
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-ink block">Yeni Rozet Kazanıldı!</span>
            <span className="text-[11px] text-ink-soft">"İlk Takasım" rozeti profilinize eklendi.</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/rozetlerim')}
            className="text-xs font-bold text-brand-dark hover:underline cursor-pointer"
          >
            Gör →
          </button>
        </div>
      </div>

      {/* Bottom Action Button Matching Screen 12 */}
      <div className="max-w-md md:max-w-xl mx-auto px-4 w-full pt-4 space-y-2.5">
        <button
          type="button"
          onClick={() => setShowReviewModal(true)}
          className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark text-on-brand font-bold text-base shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Star className="w-5 h-5 fill-star text-star" />
          <span>{isReviewed ? 'Değerlendirmeyi Güncelle' : 'Değerlendir'}</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="w-full py-3 rounded-2xl bg-surface border border-line text-ink-soft font-bold text-sm hover:bg-canvas transition-colors"
        >
          Keşfet'e Dön
        </button>
      </div>

      {/* Review Dialog Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-ink">Takas Partnerini Değerlendir</h3>
              <p className="text-xs text-ink-soft">
                {otherUser ? `${otherUser.fullName} ile gerçekleştirdiğin takası puanla` : 'Takas partnerini puanla'}
              </p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="p-1 text-2xl transition-transform active:scale-125"
                >
                  <Star
                    className={`w-8 h-8 ${
                      star <= rating ? 'fill-star text-star' : 'text-stone-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Comment */}
            <div>
              <label className="text-xs font-bold text-ink-soft block mb-1">Yorumunuz</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-2xl bg-canvas border border-line text-xs text-ink focus:border-brand focus:outline-hidden resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 py-3 rounded-xl bg-canvas text-ink-soft text-xs font-bold hover:bg-line"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSubmitReview}
                className="flex-1 py-3 rounded-xl bg-brand text-on-brand text-xs font-bold hover:bg-brand-dark shadow-xs"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
