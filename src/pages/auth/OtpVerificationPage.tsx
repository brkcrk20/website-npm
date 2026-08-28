import React, { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../services/authService';
import { ArrowLeft, Delete } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const OtpVerificationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentUser, showToast } = useApp();

  const state =
    (location.state as { phone?: string; isExisting?: boolean; passwordVerified?: boolean }) || {};
  // Numara YALNIZCA bir önceki adımdan gelir. Önceden burada sabit bir demo
  // numarası (+90 532 890 12 34) varsayılan olarak duruyordu: sayfa
  // yenilendiğinde ya da /dogrulama adresine doğrudan girildiğinde router
  // state'i kaybolduğu için doğrulama sessizce O numaraya yapılıyor,
  // kullanıcı ekranda kendi numarasını görmediği hâlde sürekli "Hatalı Kod"
  // alıyordu. Numara yoksa artık en baştan başlanıyor.
  const phone = state.phone ?? '';
  const isExisting = state.isExisting || false;
  const passwordVerified = state.passwordVerified || false;

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [timer, setTimer] = useState<number>(56);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleKeypadPress = (val: string) => {
    if (val === 'backspace') {
      const lastFilledIndex = [...otp].reverse().findIndex((c) => c !== '');
      if (lastFilledIndex !== -1) {
        const actualIndex = 5 - lastFilledIndex;
        const next = [...otp];
        next[actualIndex] = '';
        setOtp(next);
      }
      return;
    }

    const firstEmptyIndex = otp.findIndex((c) => c === '');
    if (firstEmptyIndex !== -1) {
      const next = [...otp];
      next[firstEmptyIndex] = val;
      setOtp(next);

      // If finished 6 digits, auto trigger verification
      if (firstEmptyIndex === 5) {
        verifyCode(next.join(''));
      }
    }
  };

  const handleAutoFillDemo = () => {
    const demoCode = '246810';
    setOtp(demoCode.split(''));
    verifyCode(demoCode);
  };

  const verifyCode = async (code: string) => {
    setIsVerifying(true);
    const res = await authService.verifyOtp(phone, code);
    setIsVerifying(false);

    if (res.success) {
      showToast('Doğrulama Başarılı!', 'Hoş geldiniz.', 'success');
      if (res.isNewUser) {
        navigate('/profil-olustur', { state: { phone } });
      } else {
        if (res.user) setCurrentUser(res.user);
        navigate('/kesfet');
      }
      return;
    }

    // Supabase'in gerçek sebebi gösteriliyor: kodun süresi dolmuş olabilir,
    // SMS sağlayıcısı tanımsız olabilir, istek kotaya takılmış olabilir.
    // Hepsi eskiden tek bir "Hatalı Kod" cümlesine düşüyordu.
    showToast('Doğrulanamadı', res.error ?? 'Lütfen SMS ile gelen 6 haneli kodu kontrol edin.', 'error');
    setOtp(['', '', '', '', '', '']);
  };

  // Numara olmadan bu sayfanın yapabileceği hiçbir şey yok.
  if (!phone) {
    return <Navigate to="/giris" replace />;
  }

  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'demo', '0', 'backspace'];
  const KEY_LETTERS: Record<string, string> = {
    '2': 'ABC',
    '3': 'DEF',
    '4': 'GHI',
    '5': 'JKL',
    '6': 'MNO',
    '7': 'PQRS',
    '8': 'TUV',
    '9': 'WXYZ',
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="max-w-md w-full mx-auto px-6 pt-6 flex-1 flex flex-col">
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

        <div className="text-center mt-6">
          <h1 className="text-2xl text-ink">Doğrulama Kodu</h1>
          <p className="text-sm text-ink-soft mt-2">
            <span className="font-semibold text-ink">{phone}</span> numarasına gönderdiğimiz 6
            haneli kodu gir.
          </p>
        </div>

        {/* Kod kutuları */}
        <div className="flex items-center justify-center gap-2 mt-8" aria-label="Doğrulama kodu">
          {otp.map((digit, index) => (
            <div
              key={index}
              className={`w-11 h-14 rounded-xl border flex items-center justify-center text-xl font-semibold text-ink transition-colors ${
                digit ? 'border-brand bg-brand-soft' : 'border-line bg-canvas'
              }`}
            >
              {digit}
            </div>
          ))}
        </div>

        <div className="text-center mt-5">
          {timer > 0 ? (
            <span className="text-xs text-ink-soft">
              Kodu Tekrar Gönder (00:{String(timer).padStart(2, '0')})
            </span>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const res = await authService.sendOtp(phone);

                if (!res.success) {
                  showToast('Kod Gönderilemedi', res.error ?? 'SMS gönderilemedi.', 'error');
                  return;
                }

                setTimer(56);
                showToast('Kod tekrar gönderildi', undefined, 'info');
              }}
              className="text-xs font-bold text-brand-dark hover:underline cursor-pointer"
            >
              Kodu Tekrar Gönder
            </button>
          )}
        </div>

        {isVerifying && (
          <p className="text-center text-xs text-ink-soft mt-4">Doğrulanıyor…</p>
        )}
      </div>

      {/* Sayısal tuş takımı — mobilde klavye açılmadan hızlı giriş. */}
      <div className="bg-canvas border-t border-line mt-8">
        <div className="max-w-md mx-auto grid grid-cols-3 gap-px bg-line">
          {keypad.map((key) => {
            if (key === 'demo') {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={handleAutoFillDemo}
                  className="h-16 bg-canvas text-[10px] font-bold text-ink-faint hover:bg-surface transition-colors cursor-pointer"
                >
                  DEMO
                </button>
              );
            }

            if (key === 'backspace') {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeypadPress('backspace')}
                  aria-label="Sil"
                  className="h-16 bg-canvas flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypadPress(key)}
                className="h-16 bg-canvas flex flex-col items-center justify-center hover:bg-surface transition-colors cursor-pointer"
              >
                <span className="text-xl font-semibold text-ink leading-none">{key}</span>
                {KEY_LETTERS[key] && (
                  <span className="text-[9px] font-semibold text-ink-faint tracking-widest mt-0.5">
                    {KEY_LETTERS[key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
