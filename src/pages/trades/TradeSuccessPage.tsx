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
import { badgeEarnedAtTradeCount } from '../../constants/badges';

const REVIEW_DIMENSIONS = [
  { key: 'trustworthiness', label: 'Güvenilirlik' },
  { key: 'communication', label: 'İletişim' },
  { key: 'itemAccuracy', label: 'Açıklamaya uygunluk' },
  { key: 'delivery', label: 'Teslimat' },
] as const;

export const TradeSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { currentUser, showToast, refreshUserData } = useApp();

  const [trade, setTrade] = useState<TradeOffer | undefined>(undefined);
  // Rozet bildirimi GERÇEK sayıya dayanmalı. `currentUser` sayfa açılışından
  // beri bellekte duruyor olabilir; takas az önce tamamlandığı için sayaç
  // bayat olur. Taze veri gelene kadar rozet kutusu hiç çizilmiyor.
  const [statsFresh, setStatsFresh] = useState(false);

  useEffect(() => {
    if (!id) return;
    tradeService.getTradeById(id).then(setTrade);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    refreshUserData().finally(() => {
      if (!cancelled) setStatsFresh(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bu takasla BİRLİKTE kazanılan rozet. Eşik tam bu takasta aşıldıysa
  // rozet yenidir; aksi hâlde YOKTUR ve kutu hiç çıkmaz.
  const newBadge = statsFresh ? badgeEarnedAtTradeCount(currentUser.stats.totalTrades) : null;

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

  // DEĞERLENDİRME DÖRT BOYUTLU.
  //
  // Eskiden tek bir yıldız satırı vardı ve `categories`'in dördüne de AYNI
  // sayı yazılıyordu: {trustworthiness: r, communication: r, itemAccuracy: r,
  // delivery: r}. Yani veritabanındaki dört ayrı sütun tek bir sayının dört
  // kopyasıydı ve "İletişim iyiydi ama ürün açıklandığı gibi değildi"
  // diyecek bir yol yoktu — dört boyut da sıfır bilgi taşıyordu.
  const [ratings, setRatings] = useState({
    trustworthiness: 5,
    communication: 5,
    itemAccuracy: 5,
    delivery: 5,
  });
  const rating = Math.round(
    (ratings.trustworthiness + ratings.communication + ratings.itemAccuracy + ratings.delivery) / 4
  );
  // Yorum alanı BOŞ başlar. Eskiden "Harika bir takastı, ürün tam
  // açıklandığı gibiydi." ön dolu geliyordu; çoğu kullanıcı dokunmadan
  // gönderdiği için kendi yazmadığı bir övgü onun adına kaydoluyordu.
  const [comment, setComment] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trade || !otherUser) return;

    const result = await tradeService.submitReview({
      tradeId: trade.id,
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      authorAvatar: currentUser.avatarUrl,
      targetUserId: otherUser.id,
      overallRating: rating,
      categories: ratings,
      comment: comment.trim(),
    });

    if (result.error) {
      showToast('Değerlendirme kaydedilemedi', result.error, 'error');
      return;
    }

    setShowReviewModal(false);
    showToast('Değerlendirme Kaydedildi', 'Güven puanına katkı sağladınız.', 'success');
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

        {/* Rozet kutusu yalnızca GERÇEKTEN yeni bir rozet kazanıldıysa.
            Eskiden koşulsuzdu ve her takasta "'İlk Takasım' rozeti
            profilinize eklendi" diyordu — 50. takasını yapan kullanıcı da
            aynı cümleyi okuyordu. */}
        {newBadge && (
          <div className="p-4 rounded-2xl bg-surface border border-line shadow-xs flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand-line text-brand-dark flex items-center justify-center shrink-0">
              <newBadge.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-ink block">Yeni Rozet Kazanıldı</span>
              <span className="text-[11px] text-ink-soft">
                "{newBadge.title}" rozeti profiline eklendi.
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/rozetlerim')}
              className="text-xs font-bold text-brand-dark hover:underline cursor-pointer shrink-0"
            >
              Gör →
            </button>
          </div>
        )}
      </div>

      {/* DEĞERLENDİRME GÜNCELLENEMİYOR, O YÜZDEN ÖYLE DENMİYOR.
          Düğme, değerlendirme bırakılmışken "Değerlendirmeyi Güncelle"
          diyordu; oysa `submitReview` yalnızca INSERT yapıyor ve
          `reviews_one_per_reviewer_key` ikincisini reddediyor. Yani düğmeye
          basan kullanıcı, dört yıldızı yeniden verip kaydete bastıktan
          sonra "Bu takas için değerlendirmeni zaten bıraktın." hatası
          alıyordu. Takas detay ekranı bunu zaten doğru yapıyordu; iki ekran
          artık aynı şeyi söylüyor. */}
      <div className="max-w-md md:max-w-xl mx-auto px-4 w-full pt-4 space-y-2.5">
        {isReviewed ? (
          <div className="w-full py-3.5 rounded-2xl bg-brand-soft border border-brand-line text-brand-dark font-bold text-sm flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Bu takas için değerlendirmeni bıraktın</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowReviewModal(true)}
            className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark text-on-brand font-bold text-base shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Star className="w-5 h-5 fill-star text-star" />
            <span>Değerlendir</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="w-full py-3 rounded-2xl bg-surface border border-line text-ink-soft font-bold text-sm hover:bg-canvas transition-colors cursor-pointer"
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

            {/* Dört boyut, dört ayrı puan. `reviews` tablosunda dördü için
                ayrı sütun var (20260828000000 §7); tek yıldızı dört kez
                kopyalamak o sütunları anlamsız kılıyordu. */}
            <div className="space-y-2 py-1">
              {REVIEW_DIMENSIONS.map((dimension) => (
                <div key={dimension.key} className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-ink-soft">{dimension.label}</span>
                  <div className="flex gap-0.5 shrink-0">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          setRatings((prev) => ({ ...prev, [dimension.key]: star }))
                        }
                        aria-label={`${dimension.label}: ${star} yıldız`}
                        aria-pressed={ratings[dimension.key] === star}
                        className="p-0.5 transition-transform active:scale-125 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand rounded"
                      >
                        <Star
                          className={`w-6 h-6 ${
                            star <= ratings[dimension.key]
                              ? 'fill-star text-star'
                              : 'text-muted'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-ink-faint text-center pt-1">
                Genel puan: {rating}/5
              </p>
            </div>

            {/* Comment */}
            <div>
              <label htmlFor="review-comment" className="text-xs font-bold text-ink-soft block mb-1">
                Yorumun
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Takas nasıl geçti?"
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
