import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingService, uploadListingImages } from '../../services/listingService';
import { supabase } from '../../lib/supabase';
import { CATEGORIES, CONDITION_OPTIONS } from '../../constants';
import { CategoryId, ProductCondition } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeft,
  Camera,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export const CreateListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<CategoryId>('electronics');
  const [description, setDescription] = useState('');

  // images: ekranda gösterilen önizleme URL'leri (gerçek dosya seçilirse
  // geçici bir object URL, örnek görsel seçilirse doğrudan uzak URL).
  // imageFiles: images ile AYNI INDEX'te — o slot gerçek bir dosyaysa
  // File objesini tutar, örnek görselse null'dur. Yayınlarken sadece
  // File olan slotlar Supabase Storage'a gerçekten yüklenir.
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bileşen unmount olduğunda kullanılmayan object URL'leri bellekten temizle
  useEffect(() => {
    return () => {
      images.forEach((img, idx) => {
        if (imageFiles[idx]) URL.revokeObjectURL(img);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [condition, setCondition] = useState<ProductCondition>('very_good');
  const [lookingFor, setLookingFor] = useState('');
  // Yapılandırılmış "arıyorum" (rapor md. 20-21): serbest metnin yanında,
  // eşleştirme motorunun okuyabildiği kategori listesi. Kullanıcı birden
  // fazla kategori seçebilir; zorunlu değildir.
  const [lookingForCategories, setLookingForCategories] = useState<CategoryId[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<('in_person' | 'cargo' | 'safe_point')[]>([
    'in_person',
    'safe_point',
  ]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için input'u sıfırla

    if (!selected.length) return;

    const remainingSlots = 6 - images.length;
    if (remainingSlots <= 0) {
      showToast('Limit Aşıldı', 'En fazla 6 görsel ekleyebilirsiniz.', 'warning');
      return;
    }

    const oversized = selected.find((f) => f.size > 5 * 1024 * 1024);
    if (oversized) {
      showToast('Dosya Çok Büyük', `${oversized.name} 5MB sınırını aşıyor.`, 'warning');
    }

    const validFiles = selected
      .filter((f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024)
      .slice(0, remainingSlots);

    if (!validFiles.length) return;

    const previews = validFiles.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...previews]);
    setImageFiles((prev) => [...prev, ...validFiles]);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      if (imageFiles[index]) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleDelivery = (opt: 'in_person' | 'cargo' | 'safe_point') => {
    setDeliveryOptions((prev) =>
      prev.includes(opt)
        ? prev.length > 1
          ? prev.filter((o) => o !== opt)
          : prev
        : [...prev, opt]
    );
  };

  const [isPublishing, setIsPublishing] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  const handlePublish = async () => {
    if (!title.trim() || !lookingFor.trim() || images.length === 0) {
      showToast('Eksik Bilgi', 'Lütfen tüm zorunlu alanları doldurun.', 'warning');
      return;
    }

    setIsPublishing(true);

    // Gerçek dosya seçilen slotları Supabase Storage'a yükle; örnek
    // görsel seçilen slotlar (imageFiles[i] === null) olduğu gibi kalır.
    let finalImages = images;
    const pendingFiles = imageFiles.filter((f): f is File => f !== null);

    if (pendingFiles.length > 0) {
      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        setIsPublishing(false);
        showToast(
          'Oturum Sona Ermiş',
          'Fotoğraf yüklemek için tekrar giriş yapmanız gerekiyor. Lütfen çıkış yapıp telefon numaranızla tekrar giriş yapın.',
          'error'
        );
        return;
      }

      setIsUploadingPhotos(true);
      const uploadResults = await uploadListingImages(currentUser.id, pendingFiles);
      setIsUploadingPhotos(false);

      let uploadIdx = 0;
      const merged: string[] = [];
      images.forEach((img, i) => {
        if (imageFiles[i]) {
          const uploadedUrl = uploadResults[uploadIdx];
          uploadIdx++;
          if (uploadedUrl) merged.push(uploadedUrl);
          // uploadedUrl null ise (yükleme başarısız oldu) bu fotoğraf atlanır
        } else {
          merged.push(img);
        }
      });

      const failedCount = pendingFiles.length - uploadResults.filter(Boolean).length;
      if (failedCount > 0) {
        showToast(
          'Bazı Fotoğraflar Yüklenemedi',
          `${failedCount} fotoğraf yüklenemedi, ilan geri kalan fotoğraflarla yayınlanıyor.`,
          'warning'
        );
      }

      if (merged.length === 0) {
        setIsPublishing(false);
        showToast('Hata', 'Hiçbir fotoğraf yüklenemedi. Lütfen tekrar deneyin.', 'error');
        return;
      }

      finalImages = merged;
    }

    const newListing = await listingService.createListing({
      userId: currentUser.id,
      title,
      description: description || `${title} temiz durumda, takasa uygundur.`,
      categoryId,
      images: finalImages,
      condition,
      lookingFor,
      lookingForCategories,
      deliveryOptions,
      location: {
        city: currentUser.city,
        district: currentUser.district,
        // Mesafe ilanın bir özelliği değil, bakan kişiye göre hesaplanan
        // türetilmiş bir değerdir; ilan oluştururken yazılmaz.
        distanceKm: undefined,
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

    if (!newListing) {
      showToast('Hata', 'İlan yayınlanırken bir sorun oluştu. Lütfen tekrar deneyin.', 'error');
      return;
    }

    showToast('İlanın Yayında! 🎉', 'Sana uygun takas teklifleri bekleyebilirsin.', 'success');
    navigate(`/ilan/${newListing.slug || newListing.id}`);
  };

  return (
    <div className="min-h-screen bg-canvas pb-28 text-ink">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-3 space-y-5">
        {/* Header & Step progress */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (step > 1) setStep((prev) => (prev - 1) as 1 | 2);
              else navigate(-1);
            }}
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-brand-dark bg-brand-soft px-3 py-1 rounded-full border border-brand-line">
              Adım {step} / 3
            </span>
          </div>
        </div>

        {/* STEP 1: Photos & Basic Info */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink font-display">
                Ne Takas Etmek İstiyorsun?
              </h1>
              <p className="text-xs text-ink-soft mt-0.5">
                Kullanmadığın ürünün fotoğraflarını ve temel bilgilerini ekle.
              </p>
            </div>

            {/* Images Grid */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                Ürün Fotoğrafları ({images.length}/6)
              </label>

              <div className="grid grid-cols-3 gap-2">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-canvas border border-line group"
                  >
                    <img src={img} alt="Product preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-stone-950/70 text-white flex items-center justify-center hover:bg-danger transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {images.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="relative aspect-square rounded-2xl border-2 border-dashed border-line hover:border-brand bg-canvas flex flex-col items-center justify-center text-center p-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-6 h-6 text-ink-faint mb-1" />
                    <span className="text-[10px] font-semibold text-ink-soft">Fotoğraf Ekle</span>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* KALDIRILDI — "Örnek Ürün Görselleri" hızlı seçimi.
                  Burada beş sabit Unsplash fotoğrafı vardı ve tek dokunuşla
                  GERÇEK bir ilana eklenebiliyordu: kullanıcı elinde
                  olmayan bir ürünün stok fotoğrafıyla ilan verebiliyordu.
                  Bir takas pazarında bu, karşı tarafın gördüğü tek kanıtı
                  sahteleştirir. Demo döneminden kalmış bir kolaylıktı. */}
              <p className="text-[11px] text-ink-soft">
                Ürünün kendi fotoğrafını ekle. Gerçek fotoğraf, teklif alma ihtimalini en çok
                artıran şeydir.
              </p>
            </div>

            {/* Title & Category */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  İlan Başlığı *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Apple Watch Series 7 45mm"
                  className="w-full px-4 py-3 rounded-2xl bg-canvas border border-line focus:border-brand focus:outline-hidden text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  Kategori *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value as CategoryId)}
                  className="w-full px-4 py-3 rounded-2xl bg-canvas border border-line focus:border-brand focus:outline-hidden text-sm font-semibold"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  Açıklama (Opsiyonel)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ürünün durumu, kutusu, aksesuarları hakkında bilgi verin..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-2xl bg-canvas border border-line focus:border-brand focus:outline-hidden text-xs sm:text-sm font-medium"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!title.trim() || images.length === 0}
              onClick={() => setStep(2)}
              className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Sonraki Adım: Takas Tercihleri</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 2: Condition & Looking For & Delivery */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink font-display">
                Kondisyon & Aradığın Ürün
              </h1>
              <p className="text-xs text-ink-soft mt-0.5">
                Karşılığında ne takas etmek istediğini belirt.
              </p>
            </div>

            {/* Condition Selection */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                Ürün Kondisyonu
              </label>

              {/* <div onClick> idi: klavyeyle seçilemiyor, odak halkası
                  çizilmiyor, ekran okuyucuda bir seçim olarak
                  duyurulmuyordu. Tek seçimli olduğu için radiogroup. */}
              <div role="radiogroup" aria-label="Ürün kondisyonu" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CONDITION_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={condition === c.id}
                    onClick={() => setCondition(c.id as ProductCondition)}
                    className={`w-full text-left p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                      condition === c.id
                        ? 'border-brand bg-brand-soft/60'
                        : 'border-line hover:bg-canvas'
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">{c.title}</span>
                      {condition === c.id && (
                        <CheckCircle2 className="w-4 h-4 text-brand-dark" />
                      )}
                    </span>
                    <span className="text-[11px] text-ink-soft block mt-0.5">{c.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Looking For Input */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  Ne ile Takas Etmek İstersin? *
                </label>
                <input
                  type="text"
                  value={lookingFor}
                  onChange={(e) => setLookingFor(e.target.value)}
                  placeholder="Örn: Bisiklet, Nintendo Switch veya tablet"
                  className="w-full px-4 py-3 rounded-2xl bg-canvas border border-line focus:border-brand focus:outline-hidden text-sm font-semibold"
                />
                <span className="text-[11px] text-ink-faint block mt-1">
                  İpucu: Net ifadeler yazarsan akıllı algoritmamız sana uygun takasları daha hızlı
                  önerir.
                </span>
              </div>

              {/* Aradığın kategoriler — rapor md. 20-21. Serbest metin insan
                  için, bu liste eşleştirme motoru için. */}
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  Aradığın Kategoriler
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((cat) => {
                    const selected = lookingForCategories.includes(cat.id);

                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setLookingForCategories((prev) =>
                            prev.includes(cat.id)
                              ? prev.filter((id) => id !== cat.id)
                              : [...prev, cat.id]
                          )
                        }
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-brand border-brand text-white'
                            : 'bg-canvas border-line text-ink-soft hover:border-brand'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-ink-faint block mt-1.5">
                  Birden fazla seçebilirsin. Seçmezsen sadece yazdığın metne göre eşleştirilir.
                </span>
              </div>
            </div>

            {/* Delivery Methods */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                Teslimat Tercihleri
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={deliveryOptions.includes('in_person')}
                  onClick={() => handleToggleDelivery('in_person')}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between text-left ${
                    deliveryOptions.includes('in_person')
                      ? 'border-brand bg-brand-soft/60'
                      : 'border-line hover:bg-canvas'
                  }`}
                >
                  <span>
                    <span className="text-xs font-bold block text-ink">Elden Buluşma</span>
                    <span className="text-[10px] text-ink-soft">Güvenli noktalarda</span>
                  </span>
                  {deliveryOptions.includes('in_person') && (
                    <CheckCircle2 className="w-4 h-4 text-brand-dark" />
                  )}
                </button>

                <button
                  type="button"
                  aria-pressed={deliveryOptions.includes('cargo')}
                  onClick={() => handleToggleDelivery('cargo')}
                  className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between text-left ${
                    deliveryOptions.includes('cargo')
                      ? 'border-brand bg-brand-soft/60'
                      : 'border-line hover:bg-canvas'
                  }`}
                >
                  <span>
                    <span className="text-xs font-bold block text-ink">Kargo ile</span>
                    <span className="text-[10px] text-ink-soft">Alıcı / Gönderici</span>
                  </span>
                  {deliveryOptions.includes('cargo') && (
                    <CheckCircle2 className="w-4 h-4 text-brand-dark" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={!lookingFor.trim()}
              onClick={() => setStep(3)}
              className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Sonraki Adım: Onayla & Yayınla</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP 3: Confirm & Publish */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink font-display">
                Onayla & Yayınla
              </h1>
              <p className="text-xs text-ink-soft mt-0.5">
                İlanını son bir kez kontrol et ve takasa hazır hale getir.
              </p>
            </div>

            {/* Listing Summary Preview Box */}
            <div className="bg-surface rounded-3xl p-4 border border-line space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft block">
                İlan Özeti
              </span>

              <div className="flex gap-3 items-center">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-canvas shrink-0">
                  <img src={images[0]} alt="Product" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink">{title}</h3>
                  <p className="text-xs text-ink-soft mt-0.5">
                    İstenen: <span className="font-semibold text-brand-dark">{lookingFor}</span>
                  </p>
                  <span className="text-[11px] text-ink-faint block mt-0.5">
                    {currentUser.district}, {currentUser.city}
                  </span>
                </div>
              </div>
            </div>

            {/* Zero Cash Reminder */}
            <div className="p-4 rounded-2xl bg-brand-soft border border-brand-line text-xs text-brand-dark flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-brand-dark shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Nakit Para Olmadan Takas Güvencesi</strong>
                Swaloop'ta para transferi yapılmaz. Ürününü teslim ettiğinde karşı tarafın da onayını
                alarak güvenle takasını tamamlarsın.
              </div>
            </div>

            <button
              type="button"
              onClick={handlePublish}
              disabled={isPublishing}
              className="w-full py-4 rounded-2xl bg-brand hover:bg-brand-dark text-white font-bold text-base shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
            >
              <Sparkles className="w-5 h-5 text-star" />
              <span>
                {isUploadingPhotos
                  ? 'Fotoğraflar yükleniyor...'
                  : isPublishing
                  ? 'Yayınlanıyor...'
                  : 'İlanı Ücretsiz Yayınla'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
