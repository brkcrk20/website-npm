import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { TradeOffer, TradeStatus } from '../../types';
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Calendar,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
} from 'lucide-react';

const STATUS_TO_STEP: Partial<Record<TradeStatus, number>> = {
  offer_sent: 1,
  offer_received: 1,
  counter_offered: 1,
  accepted: 2,
  locked: 3,
  delivery_planned: 4,
  shipped: 4,
  received: 4,
  verified: 5,
  completed: 6,
};

export const TradeProcessPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { showToast } = useApp();

  const [trade, setTrade] = useState<TradeOffer | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);

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

  const currentStep = trade ? STATUS_TO_STEP[trade.status] ?? 3 : 3;

  const steps = [
    { num: 1, title: 'Teklif', desc: 'Teklif iletildi' },
    { num: 2, title: 'Kabul', desc: 'Teklif onaylandı' },
    { num: 3, title: 'Kilitlendi', desc: 'Ürünler rezerve edildi' },
    { num: 4, title: 'Teslimat', desc: 'Fiziki buluşma / Kargo' },
    { num: 5, title: 'Onay', desc: 'Ürün kontrolü ve doğrulama' },
    { num: 6, title: 'Tamamlandı', desc: 'Takas tamamlandı' },
  ];

  const handleNextStep = async () => {
    if (!trade) return;
    setIsAdvancing(true);
    if (currentStep === 3) {
      const updated = await tradeService.advanceTradeStep(trade.id, 4);
      setIsAdvancing(false);
      if (updated) {
        setTrade(updated);
        showToast('Teslimat Planlandı', 'Karşı tarafa buluşma detayları bildirildi.', 'success');
      }
    } else if (currentStep === 4) {
      // Adım 5 karşılıklı: onayın kaydediliyor, takas ancak karşı taraf da
      // onayladığında ilerliyor (bkz. tradeService.confirmReceipt).
      const result = await tradeService.confirmReceipt(trade.id);
      setIsAdvancing(false);
      if (result?.trade) {
        setTrade(result.trade);
        if (result.bothConfirmed) {
          showToast('Teslimat Doğrulandı', 'İki taraf da onayladı, takası tamamlayabilirsin.', 'success');
        } else {
          showToast('Onayın Kaydedildi', 'Karşı tarafın onayı bekleniyor.', 'info');
        }
      } else {
        showToast('Onay kaydedilemedi', 'Lütfen tekrar dene.', 'error');
      }
    } else if (currentStep === 5) {
      const updated = await tradeService.advanceTradeStep(trade.id, 6);
      setIsAdvancing(false);
      if (updated) {
        setTrade(updated);
        navigate(`/takas-tamamlandi/${trade.id}`);
      }
    } else {
      setIsAdvancing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
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
          className="px-4 py-2 bg-brand text-white rounded-xl text-xs font-bold"
        >
          Takaslarıma Dön
        </button>
      </div>
    );
  }

  const deliveryType =
    trade.deliveryMethod === 'cargo'
      ? 'Kargo ile Gönderim'
      : trade.deliveryMethod === 'safe_point'
      ? 'Güvenli Takas Noktası'
      : 'Elden Buluşma';
  const safeMeetingPoint = trade.deliveryDetails?.locationName || 'Buluşma noktası henüz belirlenmedi';
  const deliveryDate = trade.deliveryDetails?.scheduledDate || 'Sohbet üzerinden kararlaştırılabilir';

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-4 space-y-6">
        {/* Top Header Matching Screen 11 */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-extrabold text-ink font-display">Takas Süreci</h1>
          <div className="w-10" />
        </div>

        {/* 6-Step Horizontal Timeline Matching Screen 11 */}
        <div className="bg-surface p-3.5 sm:p-4 rounded-3xl border border-line shadow-xs overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-between relative min-w-[320px] px-1">
            {/* Connecting background line */}
            <div className="absolute left-4 right-4 top-3.5 h-0.5 bg-line -z-0" />

            {steps.map((step) => {
              const isPassed = step.num < currentStep;
              const isCurrent = step.num === currentStep;

              return (
                <div key={step.num} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-brand text-white ring-3 ring-brand scale-105'
                        : isPassed
                        ? 'bg-brand text-white'
                        : 'bg-line text-ink-soft'
                    }`}
                  >
                    {isPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.num}
                  </div>
                  <span
                    className={`text-[9px] sm:text-[10px] mt-1 font-semibold whitespace-nowrap ${
                      isCurrent
                        ? 'text-brand-dark font-bold'
                        : isPassed
                        ? 'text-brand-dark'
                        : 'text-ink-faint'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Step Content Box Matching Screen 11 */}
        <div className="text-center py-5 px-4 bg-surface rounded-3xl border border-line shadow-xs space-y-1.5">
          <span className="text-[11px] font-extrabold text-brand-dark tracking-wider uppercase block">
            {currentStep}. ADIM
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-ink font-display">
            {currentStep === 1 && 'Takas Teklifi İletildi'}
            {currentStep === 2 && 'Teklif Kabul Edildi'}
            {currentStep === 3 && 'Takas Kilitlendi'}
            {currentStep === 4 && 'Teslimat Süreci'}
            {currentStep === 5 && 'Fiziki Onay & Kontrol'}
            {currentStep === 6 && 'Takas Tamamlandı'}
          </h2>
          <p className="text-xs text-ink-soft max-w-xs mx-auto leading-relaxed">
            {currentStep === 3
              ? 'Ürünler takas için hazır. Lütfen teslimat planını oluşturun.'
              : currentStep === 4
              ? 'Belirlenen randevu saatinde güvenli buluşma noktasında takası gerçekleştirin.'
              : currentStep === 5
              ? 'Ürünü fiziki olarak inceleyin ve durumunu onaylayın.'
              : 'Takas süreciniz başarıyla ilerliyor.'}
          </p>
        </div>

        {/* Teslimat Bilgileri Card Matching Screen 11 */}
        <div className="bg-surface rounded-3xl border border-line p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <span className="text-xs font-bold text-ink">Teslimat Bilgileri</span>
            <ChevronDown className="w-4 h-4 text-ink-faint" />
          </div>

          <div className="space-y-2.5 text-xs text-ink-soft">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-brand-dark" />
              </div>
              <div>
                <span className="font-bold text-ink block">{deliveryType}</span>
                <span className="text-[11px] text-ink-faint">{safeMeetingPoint}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-brand-dark" />
              </div>
              <div>
                <span className="font-bold text-ink block">{deliveryDate}</span>
                <span className="text-[11px] text-ink-faint">Karşılıklı onaylanmış randevu</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Lock Guarantee */}
        <div className="p-4 rounded-2xl bg-brand-soft/80 border border-brand-line flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-brand-dark shrink-0 mt-0.5" />
          <div className="text-xs text-brand-dark leading-relaxed">
            <strong className="block font-bold">Kilitli Ürün Güvencesi</strong>
            Takas kilitlendiğinde eşyalar diğer kullanıcılara teklife kapatılır. Teslimat tamamlanana kadar haklarınız korunur.
          </div>
        </div>

        {/* Bottom Action Button Matching Screen 11 */}
        {currentStep < 6 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleNextStep}
              disabled={isAdvancing || currentStep < 3}
              className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>
                {isAdvancing
                  ? 'İşleniyor...'
                  : currentStep === 3
                  ? 'Teslimatı Planla'
                  : currentStep === 4
                  ? 'Teslim Edildi Olarak İşaretle'
                  : currentStep === 5
                  ? 'Ürünü Onayla & Tamamla'
                  : 'Takas onaylanmayı bekliyor'}
              </span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
