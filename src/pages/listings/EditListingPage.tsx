import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { CATEGORIES, CONDITION_LABELS } from '../../constants';
import { CategoryId, Listing, ProductCondition } from '../../types';
import { PageLoader } from '../../components/layout/PageLoader';
import { ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react';

/**
 * İlan düzenleme.
 *
 * Uygulamada bu ekran hiç yoktu: bir ilanı yayınladıktan sonra başlığını,
 * durumunu ya da aradığın ürünü değiştirmenin yolu yoktu.
 */
export const EditListingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, showToast, refreshUserData } = useApp();

  const [listing, setListing] = useState<Listing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Etiketler ilan oluştururken yazılıyor (CreateListingPage); düzenlerken
  // de değiştirilebilmeli, yoksa tek yönlü bir alan olur.
  const [tagInput, setTagInput] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId>('other');
  const [condition, setCondition] = useState<ProductCondition>('very_good');
  const [lookingFor, setLookingFor] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<('in_person' | 'cargo' | 'safe_point')[]>([
    'in_person',
  ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!id) return;

      const data = await listingService.getListingById(id);
      if (cancelled) return;

      if (data) {
        setListing(data);
        setTitle(data.title);
        setDescription(data.description);
        setTagInput((data.tags ?? []).join(', '));
        setCategoryId(data.categoryId);
        setCondition(data.condition);
        setLookingFor(data.lookingFor);
        setCity(data.location.city);
        setDistrict(data.location.district);
        setDeliveryOptions(data.deliveryOptions.length ? data.deliveryOptions : ['in_person']);
      }

      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleToggleDelivery = (option: 'in_person' | 'cargo' | 'safe_point') => {
    setDeliveryOptions((prev) => {
      if (prev.includes(option)) {
        return prev.length > 1 ? prev.filter((item) => item !== option) : prev;
      }
      return [...prev, option];
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!id || !title.trim() || !lookingFor.trim()) {
      showToast('Eksik bilgi', 'Başlık ve aradığın ürün boş olamaz.', 'warning');
      return;
    }

    setIsSaving(true);
    const parsedTags = Array.from(
      new Set(
        tagInput
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    ).slice(0, 5);

    const updated = await listingService.updateListing(id, {
      title: title.trim(),
      description: description.trim(),
      categoryId,
      tags: parsedTags,
      condition,
      lookingFor: lookingFor.trim(),
      deliveryOptions,
      location: {
        city: city.trim(),
        district: district.trim(),
        // distanceKm hesaplanan bir alan (kullanıcının konumuna göre); ilan
        // düzenlerken değişmez, mevcut değeri korunur.
        distanceKm: listing?.location.distanceKm,
        lat: listing?.location.lat,
        lng: listing?.location.lng,
      },
    });
    setIsSaving(false);

    if (!updated) {
      showToast('Kaydedilemedi', 'İlan güncellenirken bir sorun oluştu.', 'error');
      return;
    }

    refreshUserData();
    showToast('İlan güncellendi', updated.title, 'success');
    navigate(`/ilan/${id}`, { replace: true });
  };

  const handleDelete = async () => {
    if (!id || !listing) return;
    // "Kalıcı olarak" denmiyor: takas geçmişinde geçen bir ilan silinmez,
    // yayından kaldırılır (bkz. listingService.deleteListing).
    if (!window.confirm(`"${listing.title}" ilanı kaldırılsın mı?`)) return;

    const result = await listingService.deleteListing(id);

    if (result.outcome === 'failed') {
      showToast('Kaldırılamadı', result.message, 'error');
      return;
    }

    refreshUserData();
    showToast(
      'İlan kaldırıldı',
      result.outcome === 'archived'
        ? `${listing.title} yayından kaldırıldı. Geçmiş takaslarında görünmeye devam edecek.`
        : listing.title,
      'info'
    );
    navigate('/profil', { replace: true });
  };

  if (isLoading) return <PageLoader />;

  if (!listing) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm font-bold">İlan bulunamadı</p>
        <button
          type="button"
          onClick={() => navigate('/profil')}
          className="px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-bold cursor-pointer"
        >
          Profilime dön
        </button>
      </div>
    );
  }

  if (listing.userId !== currentUser.id) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm font-bold">Bu ilanı düzenleyemezsin</p>
        <p className="text-xs text-ink-soft">Yalnızca kendi ilanlarını düzenleyebilirsin.</p>
        <button
          type="button"
          onClick={() => navigate(`/ilan/${listing.id}`)}
          className="px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-bold cursor-pointer"
        >
          İlana git
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-canvas pb-8 text-ink">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-surface border border-line flex items-center justify-center hover:bg-canvas transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">İlanı düzenle</h1>
            <p className="text-xs text-ink-soft truncate max-w-[220px]">
              {listing.title}
            </p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {listing.images.map((image, index) => (
            <img
              key={`${image}-${index}`}
              src={image}
              alt={`${listing.title} ${index + 1}`}
              className="w-20 h-20 rounded-2xl object-cover border border-line shrink-0"
              loading="lazy"
            />
          ))}
        </div>
        <p className="text-[11px] text-ink-faint -mt-2">
          Fotoğrafları değiştirmek için ilanı silip yeniden yayınlaman gerekiyor.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <section className="bg-surface rounded-2xl border border-line p-4 space-y-3">
            <div>
              <label htmlFor="edit-title" className="block text-xs font-bold mb-1.5">
                Başlık *
              </label>
              <input
                id="edit-title"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm font-semibold"
                required
              />
            </div>

            <div>
              <label htmlFor="edit-category" className="block text-xs font-bold mb-1.5">
                Kategori
              </label>
              <select
                id="edit-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value as CategoryId)}
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm font-semibold"
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-condition" className="block text-xs font-bold mb-1.5">
                Durum
              </label>
              <select
                id="edit-condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value as ProductCondition)}
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm font-semibold"
              >
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-description" className="block text-xs font-bold mb-1.5">
                Açıklama
              </label>
              <textarea
                id="edit-description"
                rows={3}
                maxLength={600}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm resize-none"
              />
            </div>

            <div>
              <label htmlFor="edit-tags" className="block text-xs font-bold mb-1.5">
                Etiketler
              </label>
              <input
                id="edit-tags"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Marka, model, renk… (virgülle ayır)"
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm"
              />
              <p className="text-[11px] text-ink-faint mt-1">
                Bu kelimeler, ürünü arayanların seni bulmasını kolaylaştırır.
              </p>
            </div>

            <div>
              <label htmlFor="edit-looking-for" className="block text-xs font-bold mb-1.5">
                Karşılığında ne istiyorsun? *
              </label>
              <input
                id="edit-looking-for"
                value={lookingFor}
                maxLength={120}
                onChange={(e) => setLookingFor(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm font-semibold"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="edit-city" className="block text-xs font-bold mb-1.5">
                  İl
                </label>
                <input
                  id="edit-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm"
                />
              </div>
              <div>
                <label htmlFor="edit-district" className="block text-xs font-bold mb-1.5">
                  İlçe
                </label>
                <input
                  id="edit-district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-canvas border border-line focus:border-brand outline-hidden text-sm"
                />
              </div>
            </div>
          </section>

          <section className="bg-surface rounded-2xl border border-line p-4 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
              Teslimat
            </label>

            {(
              [
                { id: 'in_person', title: 'Elden teslim' },
                { id: 'safe_point', title: 'Güvenli nokta' },
                { id: 'cargo', title: 'Kargo' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleToggleDelivery(option.id)}
                className={`w-full p-3 rounded-2xl border-2 flex items-center justify-between transition-colors cursor-pointer ${
                  deliveryOptions.includes(option.id)
                    ? 'border-brand bg-brand-soft/60'
                    : 'border-line'
                }`}
              >
                <span className="text-xs font-bold">{option.title}</span>
                {deliveryOptions.includes(option.id) && (
                  <CheckCircle2 className="w-4 h-4 text-brand-dark" />
                )}
              </button>
            ))}
          </section>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3.5 bg-brand hover:bg-brand-dark text-on-brand rounded-2xl font-bold text-sm shadow-md transition-colors cursor-pointer disabled:opacity-60"
          >
            {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri kaydet'}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="w-full py-3 rounded-2xl border border-danger-line text-danger text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-danger-soft transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            İlanı sil
          </button>
        </form>
      </div>
    </div>
  );
};
