import React from 'react';

/** Sayfa paketleri yüklenirken ve oturum doğrulanırken gösterilen ara ekran. */
export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Yükleniyor...' }) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-ink-faint">
    <span className="w-8 h-8 rounded-full border-2 border-line border-t-emerald-600 animate-spin" />
    <span className="text-xs font-medium">{label}</span>
  </div>
);
