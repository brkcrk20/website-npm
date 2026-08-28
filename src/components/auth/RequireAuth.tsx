import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/authService';
import { useApp } from '../../context/AppContext';

// Oturum koruması (rapor.txt §3).
//
// Önceden hiçbir route korumalı değildi: /ilan-ver, /profil, /admin gibi
// sayfalara oturum açmadan doğrudan URL ile girilebiliyor, uygulama
// sessizce sahte bir "misafir kullanıcı" (mockData.CURRENT_USER) ile devam
// ediyordu. Kullanıcı giriş yapmış gibi bir arayüz görüp işlemleri sessizce
// başarısız oluyordu.
//
// Kontrol localStorage'a değil GERÇEK Supabase oturumuna bakar: ikisi
// birbirinden bağımsızdır (önbellek dolu, oturum sona ermiş olabilir).

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export const RequireAuth: React.FC<Props> = ({ children, adminOnly = false }) => {
  const location = useLocation();
  const { currentUser } = useApp();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    let cancelled = false;

    authService.hasActiveSession().then((hasSession) => {
      if (cancelled) return;
      setState(hasSession ? 'allowed' : 'denied');
    });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state === 'checking') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state === 'denied') {
    // Nereden geldiğini taşıyoruz ki giriş sonrası oraya dönülebilsin.
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && !currentUser.isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-base font-bold text-ink">Bu sayfaya erişimin yok</h1>
        <p className="text-xs text-ink-soft max-w-xs">
          Yönetim paneli yalnızca Swaloop ekibi içindir.
        </p>
        <a href="/kesfet" className="text-xs font-bold text-brand-dark hover:underline">
          Keşfete dön
        </a>
      </div>
    );
  }

  return <>{children}</>;
};
