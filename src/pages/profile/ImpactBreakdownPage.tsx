import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { SvsExplanationModal } from '../../components/common/SvsExplanationModal';
import { ArrowLeft, Bath, Car, Droplets, Info, Leaf, Lightbulb, Repeat, Share2, Trees, Zap } from 'lucide-react';

/**
 * Çevresel etki raporu.
 *
 * Buradaki tüm sayılar `pointsService.getUserActivity()` ile tamamlanmış
 * takasların `impact_records` satırlarından toplanır. Eskiden `currentUser
 * .stats` okunuyordu; o alan hiç doldurulmadığı için ekran ya sıfır ya da
 * mockData'dan gelen uydurma değerler gösteriyordu. Ayrıca çalışmayan bir
 * "ay seçici" (Mayıs 2024 / Nisan 2024...) vardı — kaldırıldı.
 */
export const ImpactBreakdownPage: React.FC = () => {
  const navigate = useNavigate();
  const { activity, showToast } = useApp();
  const [showSvsModal, setShowSvsModal] = useState(false);

  const { impact } = activity;

  // Gerçek dünya karşılıkları (yaygın kullanılan dönüşüm katsayıları).
  const equivalents = [
    {
      icon: Trees,
      color: 'text-emerald-700',
      value: (impact.co2eKg / 21.7).toFixed(1),
      unit: 'ağaç',
      label: 'bir yılda bu kadar ağacın emeceği karbon',
    },
    {
      icon: Car,
      color: 'text-stone-700',
      value: Math.round(impact.co2eKg * 7.5).toLocaleString('tr-TR'),
      unit: 'km',
      label: 'ortalama bir otomobille sürülmeyen mesafe',
    },
    {
      icon: Bath,
      color: 'text-sky-600',
      value: Math.round(impact.waterLiters / 65).toLocaleString('tr-TR'),
      unit: 'duş',
      label: 'harcanmayan su miktarı',
    },
    {
      icon: Lightbulb,
      color: 'text-amber-500',
      value: Math.round((impact.energyKwh * 1000) / (10 * 24)).toLocaleString('tr-TR'),
      unit: 'gün',
      label: '10W bir ampulün yanabileceği süre',
    },
  ];

  const metrics = [
    { icon: Leaf, label: 'Önlenen karbon', value: `${impact.co2eKg} kg`, sub: 'CO₂e', color: 'text-emerald-600' },
    { icon: Droplets, label: 'Korunan su', value: `${impact.waterLiters.toLocaleString('tr-TR')} L`, sub: 'sanal su', color: 'text-sky-500' },
    { icon: Zap, label: 'Tasarruf edilen enerji', value: `${impact.energyKwh} kWh`, sub: 'fosil enerji', color: 'text-amber-500' },
    { icon: Repeat, label: 'Dolaşıma giren eşya', value: `${activity.completedTrades * 2}`, sub: 'ürün', color: 'text-teal-600' },
  ];

  const handleShare = async () => {
    const text = `Swaloop'ta takas yaparak ${impact.co2eKg} kg CO₂e emisyonun önlenmesine katkı sağladım.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Swaloop etkim', text });
        return;
      } catch {
        // Paylaşım iptal edildi.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('Kopyalandı', 'Etki özetin panoya kopyalandı.', 'success');
    } catch {
      showToast('Kopyalanamadı', text, 'warning');
    }
  };

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center cursor-pointer"
              aria-label="Geri"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold">Çevresel Etkim</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {activity.completedTrades} tamamlanan takastan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleShare}
            className="p-2 rounded-xl border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 cursor-pointer"
            aria-label="Paylaş"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {activity.completedTrades === 0 ? (
          <div className="text-center py-14 space-y-3">
            <Leaf className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto" />
            <p className="text-sm font-bold">Henüz etki verin yok</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 px-8">
              İlk takasını tamamladığında, yeniden kullanımla önlediğin karbon ve su burada
              görünmeye başlar.
            </p>
            <button
              type="button"
              onClick={() => navigate('/kesfet')}
              className="px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Takas edilecek bir şey bul
            </button>
          </div>
        ) : (
          <>
            <section className="rounded-3xl bg-gradient-to-br from-emerald-900 to-teal-900 text-white p-5 text-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 block">
                Toplam önlenen karbon
              </span>
              <span className="text-5xl font-black block my-1">{impact.co2eKg}</span>
              <span className="text-sm font-semibold text-emerald-200">kg CO₂e</span>
            </section>

            <section className="grid grid-cols-2 gap-2.5">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800"
                >
                  <metric.icon className={`w-4 h-4 ${metric.color} mb-1.5`} />
                  <span className="text-lg font-black block leading-tight">{metric.value}</span>
                  <span className="text-[11px] font-semibold block">{metric.label}</span>
                  <span className="text-[10px] text-stone-400">{metric.sub}</span>
                </div>
              ))}
            </section>

            <section className="space-y-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Gerçek hayatta karşılığı
              </h2>

              {equivalents.map((item) => (
                <div
                  key={item.unit}
                  className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 flex items-center gap-3"
                >
                  <span className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0">
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </span>
                  <div className="min-w-0">
                    <span className="text-sm font-bold block">
                      {item.value} {item.unit}
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      {item.label}
                    </span>
                  </div>
                </div>
              ))}
            </section>
          </>
        )}

        <button
          type="button"
          onClick={() => setShowSvsModal(true)}
          className="w-full p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 flex items-center gap-2.5 text-left cursor-pointer"
        >
          <Info className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span className="text-[11px] text-stone-600 dark:text-stone-300">
            Bu sayılar nasıl hesaplanıyor? <strong className="font-bold">Metodolojiyi gör →</strong>
          </span>
        </button>
      </div>

      {showSvsModal && <SvsExplanationModal onClose={() => setShowSvsModal(false)} />}
    </div>
  );
};
