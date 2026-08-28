import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SwaloopLogo } from '../../components/common/SwaloopLogo';
import { authService } from '../../services/authService';

// 1. SPLASH
//
// Splash uzun sürmemeli (md. 9): logo, marka cümlesi ve kısa bir yükleme
// çizgisi. 1.6 saniye sonra otomatik geçiş — onboarding görülmemişse
// tanıtıma, görülmüşse doğrudan uygulamaya.

export const SplashPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(authService.isOnboardingDone() ? '/kesfet' : '/onboarding', {
        replace: true,
      });
    }, 1600);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-night text-white flex flex-col items-center justify-center px-8">
      <SwaloopLogo size="xl" variant="white" />

      <p className="text-sm text-white/70 mt-4 text-center max-w-xs">
        İhtiyaçlarını paylaş, döngüyü başlat.
      </p>

      {/* Belirsiz süreli yükleme çizgisi: spinner'dan daha sakin. */}
      <div className="w-40 h-1 rounded-full bg-surface/15 overflow-hidden mt-10">
        <div className="h-full w-1/2 rounded-full bg-brand animate-[sw-slide_1.4s_ease-in-out_infinite]" />
      </div>

      <style>{`
        @keyframes sw-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      <button
        type="button"
        onClick={() => navigate('/kesfet', { replace: true })}
        className="absolute bottom-8 text-xs font-semibold text-white/50 hover:text-white/80 transition-colors cursor-pointer"
      >
        Atla
      </button>
    </div>
  );
};
