import React, { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { needService } from '../../services/needService';
import { CATEGORIES } from '../../constants';
import { CategoryId } from '../../types';
import { TURKEY_CITIES, getDistrictsForCity } from '../../data/turkeyLocations';
import { ArrowLeft, Camera, User, Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — bkz. avatars bucket file_size_limit

export const CreateProfilePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentUser, showToast, refreshUserData } = useApp();

  const state = (location.state as { phone?: string }) || {};
  const phone = state.phone || '+90 532 890 12 34';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  // Kayıt üç adıma bölündü: profil → konum → ne arıyorsun.
  // Her ekranın tek bir amacı olsun diye (md. 145); tek uzun formda 12 alan
  // gören kullanıcı kaçıyor (md. 142).
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const districtsForCity = useMemo(() => getDistrictsForCity(city), [city]);

  const handleCityChange = (newCity: string) => {
    setCity(newCity);
    const districts = getDistrictsForCity(newCity);
    setDistrict(districts[0] ?? '');
  };

  // Varsayılan olarak stok bir portre atamak yerine boş bırakılıyor:
  // kullanıcı fotoğraf yüklemediyse baş harfleri gösteriliyor.
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [selectedInterests, setSelectedInterests] = useState<CategoryId[]>([]);
  const [selectedWanted, setSelectedWanted] = useState<CategoryId[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleAvatarButtonClick = () => {
    if (isUploadingAvatar) return;
    avatarInputRef.current?.click();
  };

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
    showToast('Profil Fotoğrafı Yüklendi', 'Görsel güncellendi.', 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName.trim() || !lastName.trim()) {
      showToast('Eksik Bilgi', 'Lütfen adını ve soyadını ayrı ayrı giriniz.', 'warning');
      return;
    }

    if (!authService.isValidEmail(email)) {
      showToast('Geçersiz E-posta', 'Lütfen geçerli bir e-posta adresi giriniz.', 'warning');
      return;
    }

    if (!authService.isValidPassword(password)) {
      showToast(
        'Zayıf Şifre',
        'Şifre en az 8 karakter olmalı ve en az bir harf ile bir rakam içermelidir.',
        'warning'
      );
      return;
    }

    if (password !== passwordConfirm) {
      showToast('Şifreler Uyuşmuyor', 'Girdiğin iki şifre birbiriyle aynı değil.', 'warning');
      return;
    }

    if (!city || !district) {
      showToast('Eksik Bilgi', 'Lütfen il ve ilçe seçiniz.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const result = await authService.createProfile({
      phone,
      firstName,
      lastName,
      email,
      password,
      city,
      district,
      avatarUrl,
      username,
      bio,
      interests: selectedInterests,
      wantedCategories: selectedWanted,
    });
    setIsSubmitting(false);

    if (!result.user) {
      // Supabase'in söylediği gerçek sebep gösteriliyor. Önceden her hata
      // "Profil oluşturulamadı. Lütfen tekrar deneyin." cümlesine düşüyordu;
      // aynı hata tekrar tekrar alındığında kullanıcının yapabileceği hiçbir
      // şey yoktu çünkü neyin bozulduğu hiçbir yerde yazmıyordu.
      showToast(
        'Profil Oluşturulamadı',
        result.error ?? 'Bilinmeyen bir hata oluştu. Lütfen tekrar deneyin.',
        'error'
      );
      return;
    }

    setCurrentUser(result.user);
    // Oturum durumunu 'needs-profile'dan 'ready'ye taşır. Yapılmazsa
    // RequireAuth kullanıcıyı bu ekrana geri gönderir (profil oluştu ama
    // AppContext bunu bilmiyor).
    await refreshUserData();

    // KAYITTA SORULAN SORUNUN CEVABI KULLANILIYOR.
    //
    // "Ne arıyorsun?" burada soruluyor ve cevabı `wanted_categories`
    // sütununa yazılıyordu — ama o sütunu eşleştirme motoru HİÇ okumuyor;
    // motor yalnızca `needs` tablosuna bakıyor. Sonuç: kullanıcı ne
    // aradığını yazıyor, /kesfet'e düşüyor ve orada "Ne arıyorsun?" boş
    // durumuyla YENİDEN karşılaşıyordu. "Aradığın bulundu" bildirimi de
    // ilk ihtiyacını elle girene kadar hiç çalışmıyordu.
    //
    // Seçilen kategoriler artık gerçek ihtiyaca dönüşüyor. Hata kaydı
    // engellemez: profil oluşmuşken kayıt akışı burada kesilmemeli.
    try {
      await Promise.all(
        selectedWanted.slice(0, 10).map((categoryId) =>
          needService.createNeed({
            userId: result.user!.id,
            title: CATEGORIES.find((c) => c.id === categoryId)?.name ?? categoryId,
            categoryId,
          })
        )
      );
    } catch {
      // Sessiz geçilir: ihtiyaçlar "Aradıklarım" ekranından eklenebilir.
    }

    if (result.warning) {
      showToast('E-posta Eklenemedi', result.warning, 'warning');
    }

    showToast(
      'Profil Oluşturuldu',
      selectedWanted.length > 0
        ? 'Aradıklarını "Aradıklarım" ekranından düzenleyebilirsin.'
        : 'Swaloop dünyasına hoş geldin.',
      'success'
    );
    navigate('/kesfet');
  };

  const isFormValid =
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    password &&
    passwordConfirm &&
    city &&
    district;

  const step1Valid =
    firstName.trim() && lastName.trim() && email.trim() && password && passwordConfirm;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileChange}
        className="hidden"
      />

      <div className="max-w-md w-full mx-auto px-6 pt-6 pb-10 flex-1 flex flex-col">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => (step === 1 ? navigate(-1) : setStep((s) => (s === 3 ? 2 : 1)))}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-semibold text-ink-faint">{step} / 3</span>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col mt-4">
          {step === 1 && (
            <div className="flex-1">
              <h1 className="text-2xl text-ink">Profili Tamamla</h1>
              <p className="text-sm text-ink-soft mt-2">
                Diğer kullanıcıların seni tanıyabilmesi için birkaç bilgi.
              </p>

              <div className="flex justify-center my-6">
                <button
                  type="button"
                  onClick={handleAvatarButtonClick}
                  className="relative w-24 h-24 rounded-full bg-canvas border border-line flex items-center justify-center overflow-hidden cursor-pointer hover:border-brand-line transition-colors"
                  aria-label="Profil fotoğrafı seç"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-9 h-9 text-ink-faint" />
                  )}
                  <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-on-brand flex items-center justify-center border-2 border-white">
                    {isUploadingAvatar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ad"
                    className="sw-input"
                    aria-label="Ad"
                  />
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Soyad"
                    className="sw-input"
                    aria-label="Soyad"
                  />
                </div>

                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı adı (opsiyonel)"
                  className="sw-input"
                  aria-label="Kullanıcı adı"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-posta"
                  className="sw-input"
                  aria-label="E-posta"
                />

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre (en az 8 karakter)"
                    className="sw-input pr-12"
                    aria-label="Şifre"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-ink-faint cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Şifre tekrar"
                  className="sw-input"
                  aria-label="Şifre tekrar"
                />

                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  maxLength={160}
                  placeholder="Kısa bio (opsiyonel)"
                  className="sw-input resize-none"
                  aria-label="Kısa bio"
                />
              </div>

              <button
                type="button"
                disabled={!step1Valid}
                onClick={() => setStep(2)}
                className="sw-btn sw-btn-primary sw-btn-block mt-6"
              >
                Devam Et
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex-1">
              <h1 className="text-2xl text-ink">Konumunu Seç</h1>
              <p className="text-sm text-ink-soft mt-2">
                Takasların daha kolay gerçekleşmesi için konumunu seç. Tam adresin kimseye
                gösterilmez, yalnızca ilçe ve yaklaşık mesafe görünür.
              </p>

              <div className="space-y-3 mt-6">
                <div>
                  <label htmlFor="city" className="sw-label">
                    İl
                  </label>
                  <select
                    id="city"
                    value={city}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="sw-input"
                  >
                    <option value="">İl Seçin</option>
                    {TURKEY_CITIES.map((cityName) => (
                      <option key={cityName} value={cityName}>
                        {cityName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="district" className="sw-label">
                    İlçe
                  </label>
                  <select
                    id="district"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    disabled={!city}
                    className="sw-input disabled:opacity-60"
                  >
                    <option value="">İlçe Seçin</option>
                    {districtsForCity.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={!city || !district}
                onClick={() => setStep(3)}
                className="sw-btn sw-btn-primary sw-btn-block mt-6"
              >
                Devam Et
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex-1">
              <h1 className="text-2xl text-ink">Ne arıyorsun?</h1>
              <p className="text-sm text-ink-soft mt-2">
                Aradığın kategorileri seç; sana uygun takasları bulalım. Sonradan
                değiştirebilirsin.
              </p>

              <div className="flex flex-wrap gap-2 mt-6">
                {CATEGORIES.map((category) => {
                  const selected = selectedWanted.includes(category.id);

                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleWanted(category.id)}
                      className={`sw-chip ${selected ? 'sw-chip-active' : ''}`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>

              <p className="sw-label mt-8">İlgi alanların (opsiyonel)</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => {
                  const selected = selectedInterests.includes(category.id);

                  return (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleInterest(category.id)}
                      className={`sw-chip ${selected ? 'sw-chip-active' : ''}`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !isFormValid}
                className="sw-btn sw-btn-primary sw-btn-block mt-8"
              >
                {isSubmitting ? 'Kaydediliyor…' : 'Kaydet ve Başla'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
