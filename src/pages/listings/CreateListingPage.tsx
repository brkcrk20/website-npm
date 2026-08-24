import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { storageService } from '../../services/storageService';
import { impactService } from '../../services/impactService';
import { CATEGORIES, CONDITION_LABELS } from '../../constants';
import { CategoryId, ProductCondition } from '../../types';
import { useApp } from '../../context/AppContext';
import { ImpactCard } from '../../components/common/ImpactCard';
import { convertManyToWebp, formatBytes } from '../../utils/image';
import { getCachedLocation, requestDeviceLocation } from '../../utils/geo';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

const MAX_IMAGES = 6;
/** Dönüştürmeden ÖNCEKİ dosya sınırı — WebP'e çevrilince zaten çok küçülür. */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

interface PreparedImage {
  /** Yüklenecek WebP dosyası. */
  file: File;
  /** Önizleme için object URL. */
  previewUrl: string;
  originalBytes: number;
  bytes: number;
}

const CONDITION_HINTS: Record<ProductCondition, string> = {
  zero: 'Kutusu açılmamış, hiç kullanılmamış',
  like_new: 'Kusursuz, çiziksiz durumda',
  very_good: 'Çok az kullanılmış, temiz',
  good: 'Normal kullanım izleri var',
  acceptable: 'Çalışır durumda, yıpranmış',
};

export const CreateListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast, refreshScorecard } = useApp();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId>('electronics');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<ProductCondition>('very_good');
  const [lookingFor, setLookingFor] = useState('');
  const [deliveryOptions, setDeliveryOptions] = useState<('in_person' | 'cargo' | 'safe_point')[]>([
    'in_person',
  ]);
  const [city, setCity] = useState(currentUser.city);
  const [district, setDistrict] = useState(currentUser.district);

  const [images, setImages] = useState<PreparedImage[]>([]);
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Object URL'leri sızdırmamak için bileşen kaldırılırken serbest bırak.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(
    () => () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    []
  );

  const liveImpact = impactService.calculateEstimatedImpact(categoryId, condition);

  /**
   * Seçilen fotoğrafları HEMEN WebP'e çevirir. Dönüşüm burada, yayınlama
   * anında değil yapılıyor; böylece kullanıcı "yayınla"ya bastığında
   * yüklenecek dosyalar hazır ve küçük oluyor.
   */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!selected.length) return;

    const remainingSlots = MAX_IMAGES - images.length;

    if (remainingSlots <= 0) {
      showToast('Limit doldu', `En fazla ${MAX_IMAGES} fotoğraf ekleyebilirsin.`, 'warning');
      return;
    }

    const oversized = selected.filter((file) => file.size > MAX_SOURCE_BYTES);
    if (oversized.length) {
      showToast('Çok büyük dosya', `${oversized[0].name} 20 MB sınırını aşıyor.`, 'warning');
    }

    const valid = selected
      .filter((file) => file.type.startsWith('image/') && file.size <= MAX_SOURCE_BYTES)
      .slice(0, remainingSlots);

    if (!valid.length) return;

    setIsPreparingImages(true);
    const converted = await convertManyToWebp(valid);
    setIsPreparingImages(false);

    setImages((prev) => [
      ...prev,
      ...converted.map((item) => ({
        file: item.file,
        previewUrl: URL.createObjectURL(item.file),
        originalBytes: item.originalBytes,
        bytes: item.bytes,
      })),
    ]);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleToggleDelivery = (option: 'in_person' | 'cargo' | 'safe_point') => {
    setDeliveryOptions((prev) => {
      if (prev.includes(option)) {
        // En az bir teslimat yöntemi seçili kalmalı.
        return prev.length > 1 ? prev.filter((item) => item !== option) : prev;
      }
      return [...prev, option];
    });
  };

  const handlePublish = async () => {
    if (!title.trim() || !lookingFor.trim() || !images.length) {
      showToast('Eksik bilgi', 'Başlık, en az bir fotoğraf ve aradığın ürün zorunlu.', 'warning');
      return;
    }

    setIsPublishing(true);
    setPublishStatus('Fotoğraflar yükleniyor...');

    const uploads = await storageService.uploadListingImages(images.map((image) => image.file));
    const uploadedUrls = uploads.filter((item): item is NonNullable<typeof item> => !!item);

    if (!uploadedUrls.length) {
      setIsPublishing(false);
      setPublishStatus('');
      showToast(
        'Fotoğraflar yüklenemedi',
        'Oturumun sona ermiş olabilir. Çıkış yapıp tekrar giriş yapmayı dene.',
        'error'
      );
      return;
    }

    if (uploadedUrls.length < images.length) {
      showToast(
        'Bazı fotoğraflar yüklenemedi',
        `${images.length - uploadedUrls.length} fotoğraf atlandı, ilan diğerleriyle yayınlanıyor.`,
        'warning'
      );
    }

    setPublishStatus('İlan yayınlanıyor...');

    // Konum izni verilmişse ilanın koordinatı da kaydedilir; böylece
    // "yakınımdakiler" listesi gerçek mesafeye göre çalışır.
    const coords = getCachedLocation();

    const listing = await listingService.createListing({
      userId: currentUser.id,
      title: title.trim(),
      description: description.trim() || `${title.trim()} takasa uygun durumda.`,
      categoryId,
      condition,
      images: uploadedUrls.map((item) => item.url),
      lookingFor: lookingFor.trim(),
      deliveryOptions,
      location: {
        city: city.trim() || currentUser.city,
        district: district.trim() || currentUser.district,
        lat: coords?.lat,
        lng: coords?.lng,
      },
      user: {
        id: currentUser.id,
        fullName: currentUser.fullName,
        avatarUrl: currentUser.avatarUrl,
        trustScore: currentUser.trustProfile.score,
        city: currentUser.city,
        district: currentUser.district,
        isVerified: currentUser.isVerified,
      },
    });

    setIsPublishing(false);
    setPublishStatus('');

    if (!listing) {
      showToast('Yayınlanamadı', 'İlan kaydedilirken bir sorun oluştu. Tekrar dene.', 'error');
      return;
    }

    refreshScorecard();
    showToast('İlanın yayında! 🎉', 'Takas teklifleri gelmeye başlayabilir.', 'success');
    navigate(`/ilan/${listing.id}`, { replace: true });
  };

  const savedBytes = images.reduce((sum, image) => sum + (image.originalBytes - image.bytes), 0);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((prev) => (prev - 1) as 1 | 2) : navigate(-1))}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1">
            {[1, 2, 3].map((index) => (
              <span
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === step
                    ? 'w-6 bg-emerald-700'
                    : index < step
                      ? 'w-3 bg-emerald-400'
                      : 'w-3 bg-stone-200 dark:bg-stone-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 1. Adım: fotoğraf + temel bilgi */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-extrabold">Ne takas etmek istiyorsun?</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Fotoğraflar otomatik olarak WebP'e çevrilir; yükleme saniyeler sürer.
              </p>
            </div>

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  Fotoğraflar ({images.length}/{MAX_IMAGES})
                </label>
                {savedBytes > 0 && (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatBytes(savedBytes)} tasarruf edildi
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {images.map((image, index) => (
                  <div
                    key={image.previewUrl}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                  >
                    <img
                      src={image.previewUrl}
                      alt={`Fotoğraf ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-emerald-700 text-white text-[9px] font-bold">
                        Kapak
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-stone-950/70 text-white flex items-center justify-center hover:bg-rose-600 transition-colors cursor-pointer"
                      aria-label="Fotoğrafı kaldır"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {images.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isPreparingImages}
                    className="aspect-square rounded-2xl border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-emerald-600 bg-stone-50 dark:bg-stone-800/50 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isPreparingImages ? (
                      <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
                    ) : (
                      <Camera className="w-5 h-5 text-stone-400" />
                    )}
                    <span className="text-[10px] font-semibold text-stone-500">
                      {isPreparingImages ? 'Hazırlanıyor' : 'Fotoğraf ekle'}
                    </span>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              <p className="text-[11px] text-stone-400">
                İlk fotoğraf kapak görseli olur. İyi ışıkta, ürünü ortalayarak çek.
              </p>
            </section>

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <div>
                <label htmlFor="title" className="block text-xs font-bold mb-1.5">
                  İlan başlığı *
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Apple Watch Series 7 45mm"
                  className="w-full px-4 py-3 rounded-2xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm font-semibold"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-xs font-bold mb-1.5">
                  Kategori *
                </label>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value as CategoryId)}
                  className="w-full px-4 py-3 rounded-2xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm font-semibold"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-xs font-bold mb-1.5">
                  Açıklama
                </label>
                <textarea
                  id="description"
                  value={description}
                  rows={3}
                  maxLength={600}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kutusu var mı, aksesuarları neler, bilinen bir kusuru var mı?"
                  className="w-full px-4 py-3 rounded-2xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm resize-none"
                />
              </div>
            </section>

            <button
              type="button"
              disabled={!title.trim() || images.length === 0 || isPreparingImages}
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              Devam et
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Adım: durum, aranan ürün, teslimat */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-extrabold">Takas tercihlerin</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Karşılığında ne aradığını net yazarsan doğru teklifler gelir.
              </p>
            </div>

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                Ürün durumu
              </label>

              <div className="space-y-2">
                {(Object.keys(CONDITION_HINTS) as ProductCondition[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCondition(key)}
                    className={`w-full p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer ${
                      condition === key
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40'
                        : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{CONDITION_LABELS[key]}</span>
                      {condition === key && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">
                      {CONDITION_HINTS[key]}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <div>
                <label htmlFor="lookingFor" className="block text-xs font-bold mb-1.5">
                  Karşılığında ne istiyorsun? *
                </label>
                <input
                  id="lookingFor"
                  type="text"
                  value={lookingFor}
                  maxLength={120}
                  onChange={(e) => setLookingFor(e.target.value)}
                  placeholder="Örn: Bisiklet, Nintendo Switch veya benzeri tablet"
                  className="w-full px-4 py-3 rounded-2xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="listing-city" className="block text-xs font-bold mb-1.5">
                    İl
                  </label>
                  <input
                    id="listing-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="listing-district" className="block text-xs font-bold mb-1.5">
                    İlçe
                  </label>
                  <input
                    id="listing-district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:border-emerald-600 outline-hidden text-sm"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const coords = await requestDeviceLocation();
                  showToast(
                    coords ? 'Konum eklendi' : 'Konum alınamadı',
                    coords
                      ? 'İlanın mesafesi karşı tarafta doğru görünecek.'
                      : 'İzin verilmedi; ilan yine de yayınlanabilir.',
                    coords ? 'success' : 'warning'
                  );
                }}
                className="w-full py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                Konumumu ilana ekle (isteğe bağlı)
              </button>
            </section>

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                Teslimat
              </label>

              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    { id: 'in_person', title: 'Elden teslim', hint: 'Yüz yüze buluşarak' },
                    { id: 'safe_point', title: 'Güvenli nokta', hint: 'Kamera/güvenlik olan yerler' },
                    { id: 'cargo', title: 'Kargo', hint: 'Karşılıklı gönderim' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleToggleDelivery(option.id)}
                    className={`p-3 rounded-2xl border-2 flex items-center justify-between transition-colors cursor-pointer ${
                      deliveryOptions.includes(option.id)
                        ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40'
                        : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                  >
                    <span className="text-left">
                      <span className="text-xs font-bold block">{option.title}</span>
                      <span className="text-[10px] text-stone-500 dark:text-stone-400">
                        {option.hint}
                      </span>
                    </span>
                    {deliveryOptions.includes(option.id) && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              disabled={!lookingFor.trim()}
              onClick={() => setStep(3)}
              className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              Son adım: önizleme
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 3. Adım: önizleme ve yayınla */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-extrabold">Önizleme & yayınla</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Bu ürünü dolaşıma soktuğunda doğaya kazandıracağın fayda:
              </p>
            </div>

            <ImpactCard impact={liveImpact} variant="detailed" />

            <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200 dark:border-stone-800 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500 block">
                İlan özeti
              </span>

              <div className="flex gap-3 items-center">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
                  {images[0] && (
                    <img src={images[0].previewUrl} alt={title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">{title}</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    İstediğin:{' '}
                    <span className="font-semibold text-emerald-800 dark:text-emerald-400">
                      {lookingFor}
                    </span>
                  </p>
                  <span className="text-[11px] text-stone-400 block">
                    {[district, city].filter(Boolean).join(', ')} · {CONDITION_LABELS[condition]}
                  </span>
                </div>
              </div>
            </section>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-950 dark:text-emerald-200 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Nakit yok, sadece takas</strong>
                Swaloop'ta para transferi yapılmaz. Ürünü teslim ettiğinde karşı tarafın onayıyla
                takas tamamlanır.
              </div>
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-base shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isPublishing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 text-amber-300" />
              )}
              <span>{isPublishing ? publishStatus : 'İlanı ücretsiz yayınla'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
