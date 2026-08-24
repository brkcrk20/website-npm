import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { journeyService, Journey } from '../../services/journeyService';
import { PLACEHOLDER_IMAGE } from '../../constants';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  Leaf,
  Package,
  Pencil,
  Plus,
  Target,
  TrendingUp,
} from 'lucide-react';

/**
 * Takas Yolculuğu (basamak yükseltme).
 *
 * Küçük bir eşyayla başlayıp her takasta bir üst basamağa çıkma fikri.
 * Basamaklar uydurma değil: tamamlanmış takaslarından türetiliyor
 * (bkz. `journeyService`). Sen takas yaptıkça yolculuk kendiliğinden uzar.
 */
export const JourneyPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, showToast } = useApp();

  const [journey, setJourney] = useState<Journey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await journeyService.getJourney(currentUser);
    setJourney(data);
    setTargetInput(data.target);
    setIsLoading(false);
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveTarget = async () => {
    const value = targetInput.trim();

    setIsSavingTarget(true);
    const ok = await journeyService.setJourneyTarget(currentUser.id, value);
    setIsSavingTarget(false);

    if (!ok) {
      showToast('Kaydedilemedi', 'Hedefin kaydedilirken bir sorun oluştu.', 'error');
      return;
    }

    setCurrentUser((prev) => ({ ...prev, journeyTarget: value || undefined }));
    setIsEditingTarget(false);
    showToast('Hedef güncellendi', value || 'Hedef kaldırıldı', 'success');
    await load();
  };

  const steps = journey?.steps ?? [];
  const completedSteps = steps.filter((step) => step.kind === 'completed');

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Takas Yolculuğum</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Küçük bir eşyadan başla, her takasta bir basamak yüksel
            </p>
          </div>
        </div>

        {/* Özet */}
        <section className="rounded-3xl bg-gradient-to-br from-emerald-900 to-stone-900 text-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5" />
            Yolculuk Özeti
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-2xl bg-white/10 border border-white/10">
              <span className="text-2xl font-black block">{completedSteps.length}</span>
              <span className="text-[11px] text-emerald-200">Tamamlanan basamak</span>
            </div>
            <div className="p-3 rounded-2xl bg-white/10 border border-white/10">
              <span className="text-2xl font-black block">{journey?.totalCo2eKg ?? 0} kg</span>
              <span className="text-[11px] text-emerald-200">Önlenen CO₂e</span>
            </div>
          </div>
        </section>

        {/* Hedef */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              Nihai hedefin
            </span>

            {!isEditingTarget && (
              <button
                type="button"
                onClick={() => setIsEditingTarget(true)}
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
                {journey?.target ? 'Değiştir' : 'Belirle'}
              </button>
            )}
          </div>

          {isEditingTarget ? (
            <div className="space-y-2">
              <input
                value={targetInput}
                maxLength={100}
                placeholder="Örn: Şehir bisikleti"
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveTarget}
                  disabled={isSavingTarget}
                  className="flex-1 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {isSavingTarget ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTarget(false);
                    setTargetInput(journey?.target ?? '');
                  }}
                  className="px-4 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold">
              {journey?.target || (
                <span className="text-stone-400 font-normal text-xs">
                  Henüz bir hedef belirlemedin. Ulaşmak istediğin eşyayı yaz, yolculuğun sonuna
                  eklensin.
                </span>
              )}
            </p>
          )}
        </section>

        {/* Basamaklar */}
        {isLoading && <p className="text-center text-xs text-stone-400 py-8">Yükleniyor...</p>}

        {!isLoading && steps.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <Package className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto" />
            <p className="text-xs text-stone-500 dark:text-stone-400 px-6">
              Yolculuğun henüz başlamadı. Elindeki küçük bir eşyayı yayınla; ilk takasını
              tamamladığında ilk basamağın burada belirecek.
            </p>
            <button
              type="button"
              onClick={() => navigate('/ilan-ver')}
              className="px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              İlk eşyanı ekle
            </button>
          </div>
        )}

        {!isLoading && steps.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Basamaklar
            </h2>

            {steps.map((step, index) => {
              const isLast = index === steps.length - 1;

              return (
                <div key={`${step.kind}-${step.index}-${step.listingId ?? step.title}`}>
                  <div
                    className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
                      step.kind === 'completed'
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                        : step.kind === 'current'
                          ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400 dark:border-amber-800'
                          : 'bg-white dark:bg-stone-900 border-dashed border-stone-300 dark:border-stone-700'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        step.kind === 'completed'
                          ? 'bg-emerald-700 text-white'
                          : step.kind === 'current'
                            ? 'bg-amber-500 text-white'
                            : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                      }`}
                    >
                      {step.kind === 'completed' ? (
                        <Check className="w-4 h-4" />
                      ) : step.kind === 'target' ? (
                        <Flag className="w-3.5 h-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    {step.kind !== 'target' && (
                      <img
                        src={step.imageUrl || PLACEHOLDER_IMAGE}
                        alt={step.title}
                        className="w-12 h-12 rounded-xl object-cover border border-stone-200 dark:border-stone-700 shrink-0"
                        loading="lazy"
                      />
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold truncate">{step.title}</h3>
                      <span className="text-[10px] text-stone-500 dark:text-stone-400 block truncate">
                        {step.kind === 'target'
                          ? 'Ulaşmak istediğin eşya'
                          : step.kind === 'current'
                            ? 'Şu an elinde'
                            : step.partnerName
                              ? `${step.partnerName} ile takas`
                              : 'Tamamlanan takas'}
                      </span>
                      {step.co2eKg > 0 && (
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-0.5 mt-0.5">
                          <Leaf className="w-3 h-3" />+{step.co2eKg} kg CO₂e
                        </span>
                      )}
                    </div>

                    {step.kind === 'current' && (
                      <button
                        type="button"
                        onClick={() => navigate('/eslesme')}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold rounded-xl shrink-0 transition-colors cursor-pointer"
                      >
                        Yükselt
                      </button>
                    )}
                  </div>

                  {!isLast && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="w-4 h-4 text-stone-300 dark:text-stone-700 rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
};
