import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { authService } from '../../services/authService';

// 2-4. ONBOARDING
//
// Özellik listesi değil, hikâye (md. 10): üç ekran, her biri tek bir fikir.
// Önceki sürümde dört ekran vardı ve ikisi ürünün ikincil katmanlarını
// anlatıyordu — kullanıcı daha ne olduğunu anlamadan.

const ILLUSTRATION_BG = '#e8f5ee';

const SwapIllustration: React.FC = () => (
  <svg viewBox="0 0 240 160" className="w-full h-full" role="img" aria-hidden="true">
    <ellipse cx="120" cy="140" rx="92" ry="12" fill={ILLUSTRATION_BG} />
    <rect x="34" y="62" width="58" height="52" rx="8" fill="#2e9e5f" opacity="0.9" />
    <rect x="34" y="62" width="58" height="16" rx="6" fill="#24804c" />
    <rect x="148" y="62" width="58" height="52" rx="8" fill="#9fd3b6" />
    <rect x="148" y="62" width="58" height="16" rx="6" fill="#6bbd90" />
    <path
      d="M100 78h40"
      stroke="#16231d"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path d="M132 70l10 8-10 8" stroke="#16231d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M140 100h-40" stroke="#16231d" strokeWidth="4" strokeLinecap="round" />
    <path d="M108 92l-10 8 10 8" stroke="#16231d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="63" cy="40" r="14" fill="#16231d" opacity="0.85" />
    <circle cx="177" cy="40" r="14" fill="#16231d" opacity="0.5" />
  </svg>
);

const TrustIllustration: React.FC = () => (
  <svg viewBox="0 0 240 160" className="w-full h-full" role="img" aria-hidden="true">
    <ellipse cx="120" cy="140" rx="92" ry="12" fill={ILLUSTRATION_BG} />
    <path
      d="M120 26l46 18v34c0 28-19 48-46 58-27-10-46-30-46-58V44l46-18z"
      fill="#2e9e5f"
    />
    <path
      d="M100 84l14 14 28-28"
      stroke="#fff"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="50" cy="56" r="9" fill="#9fd3b6" />
    <circle cx="192" cy="70" r="7" fill="#9fd3b6" />
    <circle cx="70" cy="112" r="5" fill="#c9e6d6" />
  </svg>
);

const LoopIllustration: React.FC = () => (
  <svg viewBox="0 0 240 160" className="w-full h-full" role="img" aria-hidden="true">
    <ellipse cx="120" cy="140" rx="92" ry="12" fill={ILLUSTRATION_BG} />
    <circle cx="120" cy="76" r="46" fill="#e8f5ee" />
    <path
      d="M92 76a28 28 0 0 1 28-28c9 0 17 4 22 11"
      stroke="#2e9e5f"
      strokeWidth="9"
      strokeLinecap="round"
      fill="none"
    />
    <path d="M144 40v18h-18" stroke="#2e9e5f" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path
      d="M148 76a28 28 0 0 1-28 28c-9 0-17-4-22-11"
      stroke="#24804c"
      strokeWidth="9"
      strokeLinecap="round"
      fill="none"
    />
    <path d="M96 112V94h18" stroke="#24804c" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="46" cy="52" r="7" fill="#9fd3b6" />
    <circle cx="196" cy="100" r="9" fill="#9fd3b6" />
  </svg>
);

const STEPS = [
  {
    illustration: SwapIllustration,
    title: 'Takasın yeni nesli ile tanış',
    description:
      'İhtiyaçlarını paylaş, fazlalıklarını değerlendir. Para yok, sadece anlamlı takaslar var.',
  },
  {
    illustration: TrustIllustration,
    title: 'Güvenli, şeffaf ve topluluk odaklı',
    description:
      'Güven puanı sistemi ile her takas daha güvenli. Kimin ne yaptığını görürsün.',
  },
  {
    illustration: LoopIllustration,
    title: 'Döngüyü birlikte büyütelim',
    description:
      'Daha az tüket, daha çok paylaş. Daha iyi bir dünya için swaloop’a katıl.',
  },
];

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const finish = () => {
    authService.setOnboardingDone(true);
    navigate('/kayit');
  };

  const current = STEPS[step];
  const Illustration = current.illustration;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex-1 flex flex-col max-w-md w-full mx-auto px-6 pt-6 pb-8">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={finish}
            className="text-xs font-semibold text-ink-soft hover:text-ink px-3 py-2 cursor-pointer"
          >
            Atla
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="h-52 sm:h-60">
            <Illustration />
          </div>

          <h1 className="text-2xl text-ink mt-10 leading-snug">{current.title}</h1>
          <p className="text-sm text-ink-soft mt-3 leading-relaxed">{current.description}</p>
        </div>

        <div className="flex items-center justify-between mt-8">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tanıtım adımları">
            {STEPS.map((_, index) => (
              <span
                key={index}
                role="tab"
                aria-selected={index === step}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? 'w-6 bg-brand' : 'w-1.5 bg-line'
                }`}
              />
            ))}
          </div>

          {isLast ? (
            <button type="button" onClick={finish} className="sw-btn sw-btn-primary px-8">
              Başlayalım
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              aria-label="Sonraki"
              className="w-12 h-12 rounded-full bg-brand text-on-brand flex items-center justify-center hover:bg-brand-dark transition-colors cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
