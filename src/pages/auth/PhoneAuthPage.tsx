import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { SwaloopLogo } from '../../components/common/SwaloopLogo';
import { ArrowLeft, ShieldCheck, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PhoneAuthPageProps {
  isRegister: boolean;
}

export const PhoneAuthPage: React.FC<PhoneAuthPageProps> = ({ isRegister }) => {
  const navigate = useNavigate();
  const { setCurrentUser, showToast } = useApp();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = authService.formatPhoneNumber(e.target.value);
    setPhone(formatted);
  };

  // KAYIT: telefon numarası benzersiz mi kontrol edilir, sonra OTP gönderilir.
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authService.isValidPhone(phone)) {
      showToast('Geçersiz Numara', 'Lütfen 10 haneli geçerli bir telefon numarası giriniz (5XX...).', 'error');
      return;
    }

    setIsSubmitting(true);
    const check = await authService.checkPhoneRegistered(phone);
    setIsSubmitting(false);

    if (check.exists) {
      showToast(
        'Bu Numara Zaten Kayıtlı',
        'Bu telefon numarasına ait bir hesap bulunmaktadır. Lütfen giriş yapınız.',
        'error'
      );
      navigate('/giris');
      return;
    }

    const otpResult = await authService.sendOtp(phone);
    if (!otpResult.success) {
      showToast('Kod Gönderilemedi', otpResult.error || 'SMS gönderiminde bir hata oluştu.', 'error');
      return;
    }

    navigate('/dogrulama', {
      state: { phone, isExisting: false },
    });
  };

  // GİRİŞ: telefon + şifre. Kullanıcı ayarlarından "her girişte SMS iste"
  // açıksa şifre doğrulansa bile /dogrulama sayfasına ek doğrulama için
  // yönlendirilir; kapalıysa direkt oturum açılır.
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authService.isValidPhone(phone)) {
      showToast('Geçersiz Numara', 'Lütfen 10 haneli geçerli bir telefon numarası giriniz (5XX...).', 'error');
      return;
    }

    if (!password) {
      showToast('Eksik Bilgi', 'Lütfen şifreni gir.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const result = await authService.loginWithPassword(phone, password);
    setIsSubmitting(false);

    if (!result.success) {
      showToast('Giriş Başarısız', result.error || 'Telefon numarası veya şifre hatalı.', 'error');
      return;
    }

    if (result.requiresOtp) {
      showToast('Ek Doğrulama Gerekli', 'Hesap ayarların gereği SMS kodu gönderildi.', 'info');
      navigate('/dogrulama', {
        state: { phone, isExisting: true, passwordVerified: true },
      });
      return;
    }

    if (result.user) setCurrentUser(result.user);
    showToast('Giriş Başarılı!', 'Tekrar hoş geldin.', 'success');
    navigate('/kesfet');
  };

  const handleSubmit = isRegister ? handleRegisterSubmit : handleLoginSubmit;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-between p-6 max-w-md mx-auto">
      {/* Top Bar */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <SwaloopLogo size="sm" />
          <div className="w-10" />
        </div>

        <div className="space-y-2 mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-display tracking-tight">
            {isRegister ? 'Yeni Hesap Oluştur' : 'Tekrar Hoş Geldin'}
          </h1>
          <p className="text-sm text-stone-500">
            {isRegister
              ? 'Swaloop topluluğuna katılmak için telefon numaranı gir.'
              : 'Telefon numaran ve şifrenle giriş yap.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
              Telefon Numarası
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center gap-1.5 text-stone-500 font-medium text-sm border-r border-stone-200 pr-2.5">
                <span className="text-base">🇹🇷</span>
                <span className="font-semibold text-stone-800">TR +90</span>
              </div>
              <input
                type="tel"
                value={phone.replace('+90 ', '')}
                onChange={handlePhoneChange}
                placeholder="5XX XXX XX XX"
                maxLength={13}
                autoFocus
                className="w-full pl-28 pr-4 py-4 rounded-2xl bg-white border-2 border-stone-200 focus:border-emerald-600 focus:outline-hidden text-base font-semibold text-stone-900 tracking-wide transition-all shadow-xs"
              />
            </div>
            {isRegister && (
              <span className="text-[11px] text-stone-400 mt-1.5 block">
                Örnek: 532 123 45 67 (Önce SMS ile telefonun doğrulanır)
              </span>
            )}
          </div>

          {!isRegister && (
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifreni gir"
                  className="w-full pl-11 pr-11 py-4 rounded-2xl bg-white border-2 border-stone-200 focus:border-emerald-600 focus:outline-hidden text-base font-semibold text-stone-900 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              <span className="text-[11px] text-stone-400 mt-1.5 block">
                SMS doğrulaması varsayılan olarak her girişte istenmez; profil ayarlarından açabilirsin.
              </span>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900 leading-relaxed">
              <strong className="block font-bold">1 Telefon = 1 Hesap Kuralı</strong>
              Her telefon numarasıyla yalnızca tek bir Swaloop hesabı açılabilir. Güvenli takas
              ağımız doğrulanmış gerçek profillerle korunur.
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || phone.length < 5 || (!isRegister && !password)}
            className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-base shadow-md shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting ? 'Kontrol Ediliyor...' : isRegister ? 'Devam Et' : 'Giriş Yap'}
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Footer info */}
      <div className="pt-6 text-center text-xs text-stone-400">
        Devam ederek Swaloop <span className="underline text-stone-600">Kullanım Koşulları</span> ve{' '}
        <span className="underline text-stone-600">Gizlilik Politikası</span>'nı kabul etmiş olursun.
      </div>
    </div>
  );
};
