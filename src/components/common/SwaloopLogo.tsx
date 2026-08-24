import React from 'react';

// SWALOOP MARKA İŞARETİ
//
// Onaylanan tasarımdaki mark: tek renk yeşil, kapalı bir döngü — iki kalın
// yay ve iki ok ucu. Küçük boyutta da okunur (favicon, uygulama ikonu,
// splash), tek renk olduğu için koyu zeminde de çalışır (md. 149).
//
// Önceki sürüm iki renkli (yeşil + amber) ve "swal-oo-p" şeklinde harflerin
// arasına giren bir işaretti; yeni tasarımda mark ve kelime ayrı duruyor.

interface LoopMarkProps {
  size?: number;
  className?: string;
  color?: string;
}

export const LoopMark: React.FC<LoopMarkProps> = ({
  size = 32,
  className = '',
  color = 'currentColor',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Üst yay + sağ ok ucu */}
    <path
      d="M9 24a15 15 0 0 1 15-15c5.2 0 9.8 2.6 12.5 6.6"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M38 6.5V16h-9.5"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Alt yay + sol ok ucu */}
    <path
      d="M39 24a15 15 0 0 1-15 15c-5.2 0-9.8-2.6-12.5-6.6"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M10 41.5V32h9.5"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface SwaloopLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'full' | 'icon-only' | 'white';
  showSlogan?: boolean;
}

const SIZES = {
  sm: { mark: 22, text: 'text-lg' },
  md: { mark: 28, text: 'text-xl' },
  lg: { mark: 40, text: 'text-3xl' },
  xl: { mark: 64, text: 'text-4xl' },
};

export const SwaloopLogo: React.FC<SwaloopLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'full',
  showSlogan = false,
}) => {
  const isWhite = variant === 'white';
  const markColor = isWhite ? '#ffffff' : 'var(--color-brand)';
  const dims = SIZES[size];

  if (variant === 'icon-only') {
    return <LoopMark size={dims.mark} color={markColor} className={className} />;
  }

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <div className="inline-flex items-center gap-2 select-none">
        <LoopMark size={dims.mark} color={markColor} />
        {/* Kelime işareti küçük harf ve orta ağırlıkta: mark zaten güçlü,
            kelimenin de bağırmasına gerek yok. */}
        <span
          className={`font-display ${dims.text} tracking-tight ${
            isWhite ? 'text-white' : 'text-ink'
          }`}
          style={{ fontWeight: 600 }}
        >
          swaloop
        </span>
      </div>

      {showSlogan && (
        <span
          className={`text-xs mt-1.5 ${isWhite ? 'text-white/70' : 'text-ink-soft'}`}
        >
          İhtiyaçlarını paylaş, döngüyü başlat.
        </span>
      )}
    </div>
  );
};

// Geriye dönük uyumluluk: eski adla import eden ekranlar kırılmasın.
export const CircularExchangeIcon: React.FC<{
  size?: number;
  className?: string;
  animate?: boolean;
}> = ({ size = 28, className = '', animate = false }) => (
  <LoopMark
    size={size}
    color="var(--color-brand)"
    className={`${animate ? 'animate-pulse' : ''} ${className}`}
  />
);
