import React from 'react';
import { TrustProfile } from '../../types';
import { trustSummary } from '../../utils/trustDisplay';
import { ShieldCheck, CheckCircle2, XCircle, Star, Award, Sprout } from 'lucide-react';

// GÜVEN KARTI
//
// Bu bileşen daha önce her alanı için UYDURMA bir varsayılan tutuyordu:
// puan 4.8, seviye "Doğrulanmış Üye", telefon "doğrulandı", 14 başarılı
// takas, %98 yanıt oranı, 12 değerlendirme ve üç tane hiç alınmamış övgü
// ("Zamanında Teslim", "Ürün Açıklamayla Uyumlu", "Hızlı İletişim").
// Yani sıfır geçmişi olan bir kullanıcının profilinde, ona eşyasını
// teslim edip etmeyeceğine karar veren yabancıya tamamen hayalî bir sicil
// gösteriliyordu. Artık gösterilen her sayı gerçek; geçmiş yoksa bu
// dürüstçe söyleniyor (bkz. src/utils/trustDisplay.ts).
//
// "Yanıt oranı" tamamen kaldırıldı: `trust_profiles.response_rate` hiçbir
// trigger ya da servis tarafından güncellenmiyor, varsayılanı 1 — yani
// herkes sonsuza kadar %100 görünüyordu.

interface TrustCardProps {
  trustProfile?: TrustProfile;
  userName?: string;
  className?: string;
  variant?: 'compact' | 'full';
}

export const TrustCard: React.FC<TrustCardProps> = ({
  trustProfile,
  userName = 'Bu üye',
  className = '',
  variant = 'full',
}) => {
  const summary = trustSummary(trustProfile);

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${
          summary.isRated
            ? 'bg-brand-soft border-brand-line text-brand-dark'
            : 'bg-canvas border-line text-ink-soft'
        } ${className}`}
        title={summary.detail}
      >
        {summary.isRated ? (
          <>
            <Star className="w-3.5 h-3.5 fill-current" />
            {summary.scoreText}
          </>
        ) : (
          <>
            <Sprout className="w-3.5 h-3.5" />
            Yeni üye
          </>
        )}
      </span>
    );
  }

  // Değerlendirilmemiş üye: sayı uydurmak yerine ne bilindiğini söyle.
  if (!summary.isRated) {
    return (
      <div className={`sw-card p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-canvas border border-line text-ink-soft flex items-center justify-center shrink-0">
            <Sprout className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Yeni üye</p>
            <p className="text-xs text-ink-soft">{summary.detail}</p>
          </div>
        </div>
        <p className="text-xs text-ink-soft mt-3 leading-relaxed">
          {userName} henüz değerlendirilmedi. İlk takasta buluşma yerini herkese açık bir yer
          seçmen ve ürünü teslim etmeden önce görmen önerilir.
        </p>
      </div>
    );
  }

  const trades = trustProfile?.successfulTradesCount ?? 0;
  const cancellationRate = trustProfile?.cancellationRate ?? 0;
  const reviewCount = trustProfile?.reviewCount ?? 0;
  const rating = trustProfile?.averageRating ?? 0;

  return (
    <div className={`sw-card p-4 ${className}`}>
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">Güven karnesi</p>
            <p className="text-[11px] text-ink-soft truncate">{trustProfile?.level}</p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xl font-semibold text-ink font-display">
            {summary.scoreText}
            <span className="text-xs text-ink-faint font-normal"> / 5</span>
          </p>
          {/* Yıldızlar gerçek ortalamayı yansıtır; eskiden puan ne olursa
              olsun beşi de dolu çiziliyordu. */}
          <span className="flex items-center gap-0.5 justify-end">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3 h-3 ${
                  star <= Math.round(rating) ? 'text-star fill-star' : 'text-line fill-line'
                }`}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div className="p-2 rounded-xl bg-canvas border border-line">
          <span className="flex items-center gap-1 text-ink-soft text-[10px]">
            <Award className="w-3.5 h-3.5 shrink-0" />
            Tamamlanan
          </span>
          <span className="font-semibold text-ink">{trades} takas</span>
        </div>

        <div className="p-2 rounded-xl bg-canvas border border-line">
          <span className="flex items-center gap-1 text-ink-soft text-[10px]">
            <Star className="w-3.5 h-3.5 shrink-0" />
            Değerlendirme
          </span>
          <span className="font-semibold text-ink">{reviewCount} adet</span>
        </div>

        <div className="p-2 rounded-xl bg-canvas border border-line">
          <span className="flex items-center gap-1 text-ink-soft text-[10px]">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            İptal oranı
          </span>
          <span className="font-semibold text-ink">%{Math.round(cancellationRate * 100)}</span>
        </div>
      </div>

      {trustProfile?.phoneVerified && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-soft mt-3">
          <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />
          Telefon numarası doğrulanmış
        </p>
      )}
    </div>
  );
};
