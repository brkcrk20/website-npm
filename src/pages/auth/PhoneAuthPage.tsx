import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PhoneAuthPageProps {
  isRegister: boolean;
}

export const PhoneAuthPage: React.FC<PhoneAuthPageProps> = ({ isRegister }) => {
  const navigate = useNavigate();
  const { setCurrentUser, showToast, markSessionReady } = useApp();
  const location = useLocation();

  // GİRİŞ SONRASI NEREYE?
  //
  // `RequireAuth` korumalı bir sayfadan buraya gönderirken `from`'u
  // taşıyordu ama OKUYAN tek satır yoktu: paylaşılan bir ilan
  // bağlantısından "Teklif ver"e basan kullanıcı giriş yaptıktan sonra
  // Keşfet'e düşüyor ve ilanı yeniden aramak zorunda kalıyordu — dönüşüm
  // hunisinin tam ortasında kayıp.
  //
  // `from` state'ten geliyor ve state kullanıcı tarafından üretilebilir;
  // bu yüzden yalnızca UYGULAMA İÇİ bir yol kabul ediliyor ("//" ile
  // başlayan değerler başka bir siteye açık yönlendirme olurdu).
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from =
    rawFrom && rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/kesfet';
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

    if (check.exists) {
      setIsSubmitting(false);
      showToast(
        'Bu Numara Zaten Kayıtlı',
        'Bu telefon numarasına ait bir hesap bulunmaktadır. Lütfen giriş yapınız.',
        'error'
      );
      navigate('/giris');
      return;
    }

    // Kontrol yapılamadıysa (RPC hatası) kayıt durdurulmuyor — numara zaten
    // kayıtlıysa OTP adımı bunu kendisi yakalar. Ama sebep sessizce
    // yutulmuyor: sonraki adımda bir hata çıkarsa kullanıcı bunun bağlantılı
    // olabileceğini görsün.
    if (check.error) {
      showToast('Numara Kontrol Edilemedi', check.error, 'warning');
    }

    // `isSubmitting` SMS gönderimi boyunca da açık kalıyor. Önceden burada
    // kapatılıyordu; buton yeniden etkinleşip aynı numaraya arka arkaya OTP
    // isteği gönderilebiliyor, bu da Supabase'in SMS kotasına takılıyordu.
    const otpResult = await authService.sendOtp(phone);
    setIsSubmitting(false);

    if (!otpResult.success) {
      showToast('Kod Gönderilemedi', otpResult.error ?? 'SMS gönderiminde bir hata oluştu.', 'error');
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
      showToast('Giriş Başarısız', result.error ?? 'Telefon numarası veya şifre hatalı.', 'error');
      return;
    }

    // Şifre doğru ama profil hiç oluşturulmamış: kayıt yarıda kalmış.
    // Oturum açık olduğu için kullanıcı kaldığı adımdan devam edebilir —
    // önceden bu durum "Kullanıcı profili bulunamadı." hatasıyla kalıcı bir
    // çıkmaza dönüşüyordu (giriş de kayıt da ilerlemiyordu).
    if (result.needsProfile) {
      showToast('Profilini Tamamla', 'Kaydın yarım kalmış, kaldığın yerden devam edelim.', 'info');
      navigate('/profil-olustur', { state: { phone } });
      return;
    }

    if (result.requiresOtp) {
      showToast('Ek Doğrulama Gerekli', 'Hesap ayarların gereği SMS kodu gönderildi.', 'info');
      navigate('/dogrulama', {
        state: { phone, isExisting: true, passwordVerified: true, from },
      });
      return;
    }

    if (result.user) setCurrentUser(result.user);
    // Oturum durumunu beklemeden 'ready' yapıyoruz: `onAuthStateChange`
    // tetiklenip profili çekene kadar korumalı sayfa 'anon' görüp
    // kullanıcıyı /giris'e geri fırlatıyordu.
    markSessionReady();
    showToast('Giriş Başarılı!', 'Tekrar hoş geldin.', 'success');
    navigate(from, { replace: true });
  };

  const handleSubmit = isRegister ? handleRegisterSubmit : handleLoginSubmit;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="max-w-md w-full mx-auto px-6 pt-6 pb-8 flex-1 flex flex-col">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-canvas transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl text-ink">{isRegister ? 'Hesap Oluştur' : 'Giriş Yap'}</h1>
            <p className="text-sm text-ink-soft mt-2">
              {isRegister
                ? 'Telefon numaranı gir, sana bir doğrulama kodu gönderelim.'
                : 'Telefon numaran ve şifrenle hesabına giriş yap.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="phone" className="sw-label">
                Telefon numarası
              </label>
              <div className="flex items-stretch gap-2">
                <span className="sw-input w-20 flex items-center justify-center font-semibold text-ink shrink-0">
                  +90
                </span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone.replace('+90 ', '')}
                  onChange={handlePhoneChange}
                  placeholder="5XX XXX XX XX"
                  maxLength={13}
                  autoFocus
                  className="sw-input flex-1 tracking-wide"
                />
              </div>
            </div>

            {!isRegister && (
              <div>
                <label htmlFor="password" className="sw-label">
                  Şifre
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifreni gir"
                    className="sw-input pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-ink-faint hover:text-ink-soft cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || phone.length < 5 || (!isRegister && !password)}
              className="sw-btn sw-btn-primary sw-btn-block mt-2"
            >
              {isSubmitting ? 'Kontrol ediliyor…' : isRegister ? 'Devam Et' : 'Giriş Yap'}
            </button>
          </form>

          <p className="text-[11px] text-ink-faint text-center mt-5 leading-relaxed">
            Devam ederek kullanım şartlarını ve gizlilik politikasını kabul edersin.
          </p>

          <div className="flex items-center gap-2 mt-8">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
            <p className="text-[11px] text-ink-soft">
              Bir telefon numarasıyla yalnızca tek hesap açılabilir.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(isRegister ? '/giris' : '/kayit')}
            className="text-xs font-semibold text-brand-dark hover:underline mt-6 cursor-pointer"
          >
            {isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
          </button>
        </div>
      </div>
    </div>
  );
};
