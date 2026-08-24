import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Phone, ShieldCheck, Clock, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { Review } from '../../types';

// 16. GÜVEN PUANI DETAYI
//
// Tek bir sayı yeterli değil (md. 38-39): kullanıcı "94 neden?" diye
// sorduğunda cevabını görebilmeli. Bu ekran skoru oluşturan bileşenleri
// tek tek gösterir.

const CircularScore: React.FC<{ score: number }> = ({ score }) => {
  const percentage = Math.max(0, Math.min(1, score / 5));
  const radius = 62;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative w-40 h-40 mx-auto">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percentage)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-ink">{score.toFixed(1)}</span>
        <span className="text-[11px] text-ink-soft">5 üzerinden</span>
      </div>
    </div>
  );
};

export const TrustScorePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    tradeService.getReviewsForUser(currentUser.id).then(setReviews);
  }, [currentUser.id]);

  const trust = currentUser.trustProfile;

  const factors = [
    {
      icon: ShieldCheck,
      label: 'Tamamlanan takas',
      value: `${trust.successfulTradesCount}`,
    },
    {
      icon: Star,
      label: 'Ortalama değerlendirme',
      value: trust.averageRating ? `${trust.averageRating.toFixed(1)} / 5` : '—',
    },
    {
      icon: Clock,
      label: 'Yanıt oranı',
      value: `%${Math.round((trust.responseRate ?? 0) * 100)}`,
    },
    {
      icon: XCircle,
      label: 'İptal oranı',
      value: `%${Math.round((trust.cancellationRate ?? 0) * 100)}`,
    },
    {
      icon: Phone,
      label: 'Telefon doğrulaması',
      value: trust.phoneVerified ? 'Doğrulandı' : 'Bekliyor',
    },
  ];

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
          <h1 className="text-lg text-ink">Güven Puanım</h1>
        </div>

        <div className="sw-card p-6 text-center">
          <CircularScore score={trust.score} />
          <p className="text-sm font-semibold text-ink mt-3">{trust.level}</p>
          <p className="text-xs text-ink-soft mt-1 max-w-xs mx-auto">
            Güven puanı; tamamlanan takaslar, aldığın değerlendirmeler, yanıt davranışın ve iptal
            oranından hesaplanır.
          </p>
        </div>

        <section>
          <h2 className="sw-label">Puanı etkileyenler</h2>
          <div className="sw-card divide-y divide-line">
            {factors.map((factor) => {
              const Icon = factor.icon;

              return (
                <div key={factor.label} className="px-4 py-3 flex items-center gap-3">
                  <Icon className="w-4 h-4 text-ink-soft shrink-0" />
                  <span className="text-sm text-ink flex-1">{factor.label}</span>
                  <span className="text-sm font-semibold text-ink">{factor.value}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="sw-label">Son değerlendirmeler</h2>

          {reviews.length === 0 ? (
            <div className="sw-card p-6 text-center">
              <p className="text-sm text-ink-soft">
                Henüz değerlendirme yok. İlk takasını tamamladığında burada görünecek.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {reviews.slice(0, 10).map((review) => (
                <li key={review.id} className="sw-card p-3.5">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-3.5 h-3.5 ${
                          star <= Math.round(review.overallRating)
                            ? 'text-star fill-star'
                            : 'text-line fill-line'
                        }`}
                      />
                    ))}
                    <span className="text-[11px] text-ink-faint ml-1">{review.createdAt}</span>
                    <span className="text-[11px] font-semibold text-ink ml-auto truncate">
                      {review.authorName}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">{review.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
