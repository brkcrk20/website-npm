import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { storageService } from '../../services/storageService';
import { CATEGORIES, TR_CITIES } from '../../constants';
import { CategoryId } from '../../types';
import { requestDeviceLocation } from '../../utils/geo';
import { ArrowLeft, Camera, Check, Loader2, MapPin } from 'lucide-react';

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

export const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, showToast, refreshScorecard } = useApp();

  const [fullName, setFullName] = useState(currentUser.fullName);
  const [bio, setBio] = useState(currentUser.bio ?? '');
  const [city, setCity] = useState(currentUser.city);
  const [district, setDistrict] = useState(currentUser.district);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl);
  const [interests, setInterests] = useState<CategoryId[]>(currentUser.interests ?? []);
  const [wantedCategories, setWantedCategories] = useState<CategoryId[]>(
    currentUser.wantedCategories ?? []
  );

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggle = (
    list: CategoryId[],
    setList: React.Dispatch<React.SetStateAction<CategoryId[]>>,
    id: CategoryId
  ) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  /**
   * Profil fotoğrafı seçimi. Dosya `storageService` içinde 512px WebP'e
   * çevrilip yükleniyor — eskiden bu düğme sadece sabit bir stok görseli
   * geri yazıyordu.
   */
  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Geçersiz dosya', 'Lütfen bir görsel seçin.', 'warning');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      showToast('Dosya çok büyük', 'En fazla 10 MB boyutunda bir görsel seçin.', 'warning');
      return;
    }

    setIsUploadingAvatar(true);
    const uploaded = await storageService.uploadAvatar(file);
    setIsUploadingAvatar(false);

    if (!uploaded) {
      showToast(
        'Fotoğraf yüklenemedi',
        'Oturumun sona ermiş olabilir. Çıkış yapıp tekrar giriş yapmayı dene.',
        'error'
      );
      return;
    }

    setAvatarUrl(uploaded.url);
    showToast('Fotoğraf hazır', 'Kaydet dediğinde profiline işlenecek.', 'success');
  };

  const handleUseDeviceLocation = async () => {
    const coords = await requestDeviceLocation();

    if (!coords) {
      showToast(
        'Konum alınamadı',
        'Tarayıcı konum iznini reddetti. İl ve ilçeyi elle yazabilirsin.',
        'warning'
      );
      return;
    }

    showToast(
      'Konum kaydedildi',
      'Yakınındaki ilanlar artık gerçek mesafeye göre sıralanacak.',
      'success'
    );
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!fullName.trim()) {
      showToast('Ad soyad gerekli', 'Karşı tarafın seni tanıyabilmesi için gerekli.', 'warning');
      return;
    }

    setIsSaving(true);
    const updated = await authService.updateUserProfile({
      fullName: fullName.trim(),
      bio: bio.trim(),
      city: city.trim(),
      district: district.trim(),
      avatarUrl,
      interests,
      wantedCategories,
    });
    setIsSaving(false);

    if (!updated) {
      showToast('Kaydedilemedi', 'Profil güncellenirken bir sorun oluştu.', 'error');
      return;
    }

    setCurrentUser(updated);
    refreshScorecard();
    showToast('Profil güncellendi', 'Bilgilerin kaydedildi.', 'success');
    navigate('/profil');
  };

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
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
            <h1 className="text-base font-bold">Profili Düzenle</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Eksiksiz profil, daha çok takas teklifi demek.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src={avatarUrl}
                alt="Profil fotoğrafı"
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-700 bg-stone-100"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-emerald-800 text-white shadow-sm hover:bg-emerald-900 transition-colors cursor-pointer disabled:opacity-60"
                aria-label="Fotoğraf seç"
              >
                {isUploadingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>

            <div className="flex-1 text-xs min-w-0">
              <span className="font-bold block mb-0.5">Profil fotoğrafı</span>
              <span className="text-stone-500 dark:text-stone-400 leading-snug block">
                Net bir fotoğraf güven verir. Seçtiğin görsel otomatik olarak WebP'e çevrilip
                küçültülür.
              </span>
            </div>
          </section>

          <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-3">
            <div>
              <label htmlFor="fullName" className="text-xs font-bold block mb-1">
                Ad Soyad *
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-sm outline-hidden focus:border-emerald-600"
                required
              />
            </div>

            <div>
              <label htmlFor="bio" className="text-xs font-bold block mb-1">
                Kendini tanıt
              </label>
              <textarea
                id="bio"
                rows={3}
                value={bio}
                maxLength={240}
                placeholder="Nasıl takas yapmayı seversin? Hangi eşyaları arıyorsun?"
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-sm outline-hidden focus:border-emerald-600 resize-none"
              />
              <span className="text-[10px] text-stone-400 block text-right">{bio.length}/240</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="city" className="text-xs font-bold block mb-1">
                  İl
                </label>
                <input
                  id="city"
                  list="tr-cities"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-sm outline-hidden focus:border-emerald-600"
                />
                <datalist id="tr-cities">
                  {TR_CITIES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="district" className="text-xs font-bold block mb-1">
                  İlçe
                </label>
                <input
                  id="district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl text-sm outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleUseDeviceLocation}
              className="w-full py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
              Konumumu kullan (mesafe hesabı için)
            </button>
          </section>

          <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-2">
            <label className="text-xs font-bold block">Takasa çıkardığın kategoriler</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => {
                const selected = interests.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggle(interests, setInterests, category.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                      selected
                        ? 'bg-emerald-800 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {category.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 space-y-2">
            <label className="text-xs font-bold block">Karşılığında aradığın kategoriler</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => {
                const selected = wantedCategories.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggle(wantedCategories, setWantedCategories, category.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                      selected
                        ? 'bg-teal-700 text-white'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {category.name}
                  </button>
                );
              })}
            </div>
          </section>

          <button
            type="submit"
            disabled={isSaving || isUploadingAvatar}
            className="w-full py-3.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-bold text-sm shadow-md transition-colors cursor-pointer disabled:opacity-60"
          >
            {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
};
