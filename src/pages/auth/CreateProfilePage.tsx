import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { storageService } from '../../services/storageService';
import { CATEGORIES, DEFAULT_AVATAR, TR_CITIES } from '../../constants';
import { CategoryId } from '../../types';
import { ArrowLeft, Camera, Loader2, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const CreateProfilePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentUser, showToast, refreshUserData } = useApp();

  const state = (location.state as { phone?: string }) || {};
  const phone = state.phone ?? '';

  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);
  const [selectedInterests, setSelectedInterests] = useState<CategoryId[]>([]);
  const [selectedWanted, setSelectedWanted] = useState<CategoryId[]>([]);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Telefon doğrulaması yapılmadan bu adıma gelinemez.
  useEffect(() => {
    if (!phone) navigate('/giris', { replace: true });
  }, [phone, navigate]);

  const toggleInterest = (id: CategoryId) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleWanted = (id: CategoryId) => {
    setSelectedWanted((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  /**
   * Gerçek profil fotoğrafı yüklemesi. Önceden bu düğme hazır stok
   * görseller arasında dönüyordu; artık kullanıcının seçtiği fotoğraf
   * WebP'e çevrilip Storage'a yükleniyor.
   */
  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !file.type.startsWith('image/')) return;

    setIsUploadingAvatar(true);
    const uploaded = await storageService.uploadAvatar(file);
    setIsUploadingAvatar(false);

    if (!uploaded) {
      showToast('Fotoğraf yüklenemedi', 'Fotoğrafsız da devam edebilirsin.', 'warning');
      return;
    }

    setAvatarUrl(uploaded.url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      showToast('Eksik bilgi', 'Lütfen adını ve soyadını gir.', 'warning');
      return;
    }

    setIsSaving(true);
    const newUser = await authService.createProfile({
      phone,
      fullName: fullName.trim(),
      city: city.trim(),
      district: district.trim(),
      // Yer tutucu avatar DB'ye yazılmaz; kullanıcı sonradan ekleyebilir.
      avatarUrl: avatarUrl === DEFAULT_AVATAR ? undefined : avatarUrl,
      interests: selectedInterests,
      wantedCategories: selectedWanted,
    });
    setIsSaving(false);

    if (!newUser) {
      showToast('Hata', 'Profil oluşturulamadı. Lütfen tekrar deneyin.', 'error');
      return;
    }

    setCurrentUser(newUser);
    await refreshUserData();
    showToast('Profilin hazır 🎉', 'Swaloop’a hoş geldin.', 'success');
    navigate('/kesfet', { replace: true });
  };

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col justify-between p-6 max-w-md mx-auto">
      <div>
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 flex items-center justify-center hover:bg-stone-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            Adım 3 / 3
          </span>
        </div>

        <div className="space-y-2 mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 font-display tracking-tight">
            Profilini Oluştur
          </h1>
          <p className="text-sm text-stone-500">
            Topluluğun seni tanıması ve akıllı takas eşleşmeleri için birkaç bilgi ekle.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Profil fotoğrafı */}
          <div className="flex flex-col items-center justify-center my-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="relative group cursor-pointer disabled:opacity-60"
            >
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-stone-100 dark:bg-stone-800">
                <img src={avatarUrl} alt="Profil fotoğrafı" className="w-full h-full object-cover" />
              </div>
              <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-700 text-white flex items-center justify-center border-2 border-white shadow-md">
                {isUploadingAvatar ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />

            <span className="text-[11px] text-stone-400 mt-2">
              İsteğe bağlı — sonradan da ekleyebilirsin
            </span>
          </div>

          {/* Ad Soyad */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
              Ad Soyad
            </label>
            <div className="relative">
              <User className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Adını ve soyadını gir"
                required
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 focus:border-emerald-600 focus:outline-hidden text-sm font-semibold shadow-xs"
              />
            </div>
          </div>

          {/* Şehir & İlçe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                Şehir
              </label>
              <input
                list="create-profile-cities"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="İlini yaz"
                className="w-full px-3.5 py-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 focus:border-emerald-600 focus:outline-hidden text-sm font-semibold shadow-xs"
              />
              <datalist id="create-profile-cities">
                {TR_CITIES.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
                İlçe
              </label>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="İlçeni gir"
                className="w-full px-3.5 py-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 focus:border-emerald-600 focus:outline-hidden text-sm font-semibold shadow-xs"
              />
            </div>
          </div>

          {/* İlgi Alanların */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-1.5">
              İlgi Alanların & Sahip Olduğun Kategoriler
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = selectedInterests.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleInterest(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && '✓ '}
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={!fullName.trim() || isSaving || isUploadingAvatar}
            className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-base shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer mt-4"
          >
            {isSaving ? 'Oluşturuluyor...' : 'Kaydı tamamla ve keşfet'}
          </button>
        </form>
      </div>
    </div>
  );
};
