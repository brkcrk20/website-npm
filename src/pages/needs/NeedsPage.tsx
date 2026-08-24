import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Trash2, Pause, Play, Check, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { needService } from '../../services/needService';
import { CATEGORIES } from '../../constants';
import { CategoryId, Need, NeedMatch } from '../../types';
import { ProductCard } from '../../components/common/ProductCard';

// "Aradıklarım" — Swaloop'un ikinci temel nesnesi olan İHTİYAÇ ekranı
// (bkz. swaloop-urun-sistem-tasarimi.md, rapor md. 78-82).
//
// Bu ekranın TEK amacı var (rapor md. 145): kullanıcı ne aradığını söylesin
// ve karşılığında ona uyan ilanları görsün. İlan vermek zorunda değil.

const STATUS_LABEL: Record<Need['status'], string> = {
  active: 'Aranıyor',
  paused: 'Duraklatıldı',
  fulfilled: 'Karşılandı',
};

export const NeedsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [needs, setNeeds] = useState<Need[]>([]);
  const [matches, setMatches] = useState<NeedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId | ''>('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);

    const userNeeds = await needService.getUserNeeds(currentUser.id);
    setNeeds(userNeeds);

    // Eşleşmeler ihtiyaçlara bağlı; hiç ihtiyaç yoksa sorguya hiç girmiyoruz.
    setMatches(
      userNeeds.some((n) => n.status === 'active')
        ? await needService.getMatchesForUser(currentUser.id, { city: currentUser.city })
        : []
    );

    setLoading(false);
  }, [currentUser.id, currentUser.city]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!title.trim()) return;

    setSaving(true);

    const created = await needService.createNeed({
      userId: currentUser.id,
      title,
      categoryId: categoryId || undefined,
      note,
    });

    setSaving(false);

    if (!created) {
      showToast(
        'İhtiyaç eklenemedi',
        'Bu ihtiyaç zaten listende olabilir ya da açık ihtiyaç sınırına ulaştın.',
        'error'
      );
      return;
    }

    setTitle('');
    setCategoryId('');
    setNote('');
    setFormOpen(false);
    showToast('Eklendi', `"${created.title}" artık aradıkların arasında.`, 'success');
    load();
  };

  const handleStatus = async (need: Need, status: Need['status']) => {
    const updated = await needService.updateNeed(need.id, { status });

    if (!updated) {
      showToast('Güncellenemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    load();
  };

  const handleDelete = async (need: Need) => {
    const ok = await needService.deleteNeed(need.id);

    if (!ok) {
      showToast('Silinemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    showToast('Silindi', `"${need.title}" listenden kaldırıldı.`, 'info');
    load();
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24 text-stone-900">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-stone-900 font-display">Aradıklarım</h1>
            <p className="text-xs text-stone-500">
              {needs.filter((n) => n.status === 'active').length} açık ihtiyaç
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            İhtiyaç Ekle
          </button>
        </div>

        {formOpen && (
          <form
            onSubmit={handleCreate}
            className="bg-white rounded-3xl p-4 border border-stone-200 space-y-3"
          >
            <div>
              <label htmlFor="need-title" className="text-xs font-bold text-stone-700">
                Ne arıyorsun?
              </label>
              <input
                id="need-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn. Aynasız fotoğraf makinesi"
                maxLength={80}
                className="mt-1 w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm outline-hidden focus:border-emerald-600"
              />
            </div>

            <div>
              <span className="text-xs font-bold text-stone-700">Kategori (opsiyonel)</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CATEGORIES.map((category) => {
                  const selected = categoryId === category.id;

                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setCategoryId(selected ? '' : category.id)}
                      aria-pressed={selected}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        selected
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-stone-50 border-stone-200 text-stone-600 hover:border-emerald-600'
                      }`}
                    >
                      {selected && <Check className="w-3 h-3 inline mr-1" />}
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="need-note" className="text-xs font-bold text-stone-700">
                Özel isteğin (opsiyonel)
              </label>
              <textarea
                id="need-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Örn. Sony veya Canon aynasız gövde arıyorum."
                className="mt-1 w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm outline-hidden focus:border-emerald-600 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="w-full py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold text-sm transition-colors"
            >
              {saving ? 'Ekleniyor…' : 'Listeme Ekle'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-3xl bg-stone-200/60 animate-pulse" />
            ))}
          </div>
        ) : needs.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-stone-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <Search className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Ne arıyorsun?</h3>
              <p className="text-xs text-stone-500 max-w-xs mx-auto mt-1">
                Aradığın şeyleri buraya ekle; ilan vermek zorunda değilsin. Uyan bir ilan
                yayınlandığında burada göreceksin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md transition-colors"
            >
              İlk İhtiyacını Ekle
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {needs.map((need) => {
              const category = CATEGORIES.find((c) => c.id === need.categoryId);

              return (
                <li
                  key={need.id}
                  className="bg-white rounded-3xl p-4 border border-stone-200 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-stone-900 truncate">{need.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {/* Renk tek başına durum belirtmiyor (rapor md. 98):
                          durum her zaman metinle birlikte yazılıyor. */}
                      ● {STATUS_LABEL[need.status]}
                      {category ? ` · ${category.name}` : ''}
                    </p>
                    {need.note && (
                      <p className="text-xs text-stone-600 mt-1.5 line-clamp-2">{need.note}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {need.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => handleStatus(need, 'paused')}
                        aria-label="Duraklat"
                        title="Duraklat"
                        className="w-11 h-11 rounded-2xl bg-stone-50 border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-100"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatus(need, 'active')}
                        aria-label="Tekrar ara"
                        title="Tekrar ara"
                        className="w-11 h-11 rounded-2xl bg-stone-50 border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-100"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(need)}
                      aria-label="Sil"
                      title="Sil"
                      className="w-11 h-11 rounded-2xl bg-stone-50 border border-stone-200 text-stone-600 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && needs.some((n) => n.status === 'active') && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-stone-900 font-display">
                Aradıklarına uyan ilanlar
              </h2>
            </div>

            {matches.length === 0 ? (
              <div className="bg-white rounded-3xl p-6 border border-stone-200 text-center">
                <p className="text-sm font-bold text-stone-900">Henüz uyan bir ilan yok</p>
                <p className="text-xs text-stone-500 mt-1">
                  Aradıkların kayıtlı. Uygun bir ilan yayınlandığında burada listelenecek.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {matches.map((match) => (
                  <div key={`${match.need.id}-${match.listing.id}`} className="space-y-1.5">
                    <ProductCard listing={match.listing} variant="horizontal" />
                    <p className="text-[11px] text-stone-500 px-1">
                      <span className="font-semibold text-emerald-800">
                        "{match.need.title}" ile takas uyumu %{match.score}
                      </span>
                      {match.reasons.length > 0 && ` · ${match.reasons.join(' · ')}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
