import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { CATEGORIES } from '../../constants';
import { TURKEY_CITIES, getDistrictsForCity } from '../../data/turkeyLocations';
import { ArrowLeft, Camera, Check, Loader2 } from 'lucide-react';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — bkz. avatars bucket file_size_limit

export const EditProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser, showToast } = useApp();

  // Ad/Soyad kayıt formuyla (CreateProfilePage) aynı şekilde ayrı ayrı
  // düzenlenir. Eski kullanıcılarda first_name/last_name boş olabilir
  // (yalnızca fullName vardı) — bu durumda fullName'i tek kelimeye
  // düşürmek yerine ilk boşluktan ayırıyoruz.
  const [nameParts] = useState(() => {
    if (currentUser.firstName || currentUser.lastName) {
      return { first: currentUser.firstName ?? '', last: currentUser.lastName ?? '' };
    }
    const [first, ...rest] = (currentUser.fullName ?? '').trim().split(' ');
    return { first: first ?? '', last: rest.join(' ') };
  });
  const [firstName, setFirstName] = useState(nameParts.first);
  const [lastName, setLastName] = useState(nameParts.last);
  const [bio, setBio] = useState(currentUser.bio || '');

  // İl/İlçe, kayıt formundaki gibi kademeli seçim: il değişince ilçe
  // listesi otomatik güncellenir, böylece ikisi birbirinden bağımsız
  // görünmez. Kullanıcının mevcut ilçesi, seçili ilin ilçe listesinde
  // yoksa (örn. eski/serbest metin veri) listeye eklenir, veri kaybı
  // olmaz.
  const [city, setCity] = useState(currentUser.city || TURKEY_CITIES[0]);
  const [district, setDistrict] = useState(currentUser.district || '');
  const districtsForCity = useMemo(() => {
    const base = getDistrictsForCity(city);
    return district && !base.includes(district) ? [district, ...base] : base;
  }, [city, district]);

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    const districts = getDistrictsForCity(newCity);
    setDistrict(districts[0] ?? '');
  };

  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [interests, setInterests] = useState(currentUser.interests);
  const [wantedCategories, setWantedCategories] = useState(currentUser.wantedCategories);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için input'u sıfırla
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Geçersiz Dosya', 'Lütfen bir resim dosyası seçin.', 'error');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      showToast('Dosya Çok Büyük', 'Profil fotoğrafı en fazla 5 MB olabilir.', 'error');
      return;
    }

    setIsUploadingAvatar(true);
    const uploadedUrl = await authService.uploadAvatar(file);
    setIsUploadingAvatar(false);

    if (!uploadedUrl) {
      showToast('Yükleme Başarısız', 'Fotoğraf yüklenemedi, lütfen tekrar deneyin.', 'error');
      return;
    }

    setAvatarUrl(uploadedUrl);
    showToast('Fotoğraf Yüklendi', 'Kaydetmek için "Değişiklikleri Kaydet"e basın.', 'success');
  };

  const toggleInterest = (id: any) => {
    if (interests.includes(id)) {
      setInterests(interests.filter((i) => i !== id));
    } else {
      setInterests([...interests, id]);
    }
  };

  const toggleWanted = (id: any) => {
    if (wantedCategories.includes(id)) {
      setWantedCategories(wantedCategories.filter((i) => i !== id));
    } else {
      setWantedCategories([...wantedCategories, id]);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      showToast('Eksik Bilgi', 'Lütfen adını ve soyadını ayrı ayrı giriniz.', 'warning');
      return;
    }

    if (!city || !district) {
      showToast('Eksik Bilgi', 'Lütfen il ve ilçe seçiniz.', 'warning');
      return;
    }

    setIsSaving(true);
    const updated = await authService.updateUserProfile({
      firstName,
      lastName,
      bio,
      city,
      district,
      avatarUrl,
      interests,
      wantedCategories,
    });
    setIsSaving(false);

    if (!updated) {
      showToast('Hata', 'Profil güncellenirken bir sorun oluştu.', 'error');
      return;
    }

    setCurrentUser(updated);
    showToast('Profil Güncellendi', 'Bilgileriniz başarıyla kaydedildi.', 'success');
    navigate('/profil');
  };

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-surface border border-line text-ink-soft hover:bg-canvas transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-ink">Profili Düzenle</h1>
            <p className="text-xs text-ink-soft">Kişisel bilgilerinizi ve ilgi alanlarınızı güncelleyin</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Avatar Edit */}
          <div className="bg-surface rounded-2xl border border-line p-4 flex items-center gap-4">
            <div className="relative">
              <img
                src={avatarUrl}
                alt="Avatar"
                className={`w-16 h-16 rounded-full object-cover border-2 border-brand transition-opacity ${
                  isUploadingAvatar ? 'opacity-50' : ''
                }`}
              />
              {isUploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-brand-dark animate-spin" />
                </div>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-brand text-on-brand shadow-sm disabled:opacity-60"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 text-xs">
              <span className="font-bold text-ink block mb-0.5">Profil Fotoğrafı</span>
              <span className="text-ink-soft">Takas güvenliği için net bir profil resmi tercih ediniz.</span>
            </div>
          </div>

          {/* Form fields */}
          <div className="bg-surface rounded-2xl border border-line p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-ink-soft block mb-1">Ad</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-ink-soft block mb-1">Soyad</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-ink-soft block mb-1">Biyografi & Takas Tarzı</label>
              <textarea
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand resize-none"
              />
            </div>

            {/* İl/İlçe — kayıt formuyla aynı kademeli seçim: il
                değişince ilçe listesi otomatik güncellenir. */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-ink-soft block mb-1">İl</label>
                <select
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
                >
                  {TURKEY_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-ink-soft block mb-1">İlçe</label>
                <select
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
                >
                  {districtsForCity.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Interests selection */}
          <div className="bg-surface rounded-2xl border border-line p-4 space-y-2">
            <label className="text-xs font-bold text-ink block">Dolaşıma Soktuğun Kategoriler</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const isSelected = interests.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleInterest(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 ${
                      isSelected
                        ? 'bg-brand text-on-brand'
                        : 'bg-canvas text-ink-soft hover:bg-line'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 bg-brand hover:bg-brand-dark text-on-brand rounded-2xl font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60"
          >
            {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
};
