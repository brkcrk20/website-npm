import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

// Oturum koruması (rapor.txt §3).
//
// Önceden hiçbir route korumalı değildi: /ilan-ver, /profil, /admin gibi
// sayfalara oturum açmadan doğrudan URL ile girilebiliyor, uygulama
// sessizce sahte bir "misafir kullanıcı" ile devam ediyordu. Kullanıcı
// giriş yapmış gibi bir arayüz görüp işlemleri sessizce başarısız oluyordu.
//
// SONRA İKİ SORUN KALDI, İKİSİ DE BURADAN KAYNAKLANIYORDU:
//
// 1. **Her gezinmede ağ isteği.** Bu bileşen rota değiştikçe kendi başına
//    `hasActiveSession()` çağırıyordu ve o da `getUser()` ile Supabase'e
//    gidiyordu. Metroda bir saniyelik kopma, oturumu GEÇERLİ olan
//    kullanıcıyı /giris'e fırlatıyordu.
//
// 2. **"Oturum var ama profil yok" hiç ayırt edilmiyordu.** OTP
//    doğrulanınca Supabase oturumu açılıyor, profil henüz oluşmuyor.
//    `hasActiveSession()` `true` döndüğü için kullanıcı adres çubuğundan
//    /kesfet'e gidip ADI BOŞ bir profille geziniyor, ilan verince yabancı
//    anahtar hatası alıyordu.
//
// Oturumun tek kaynağı artık AppContext (`sessionState`); bu bileşen
// yalnızca onu okuyor.

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
}

export const RequireAuth: React.FC<Props> = ({ children, adminOnly = false }) => {
  const location = useLocation();
  const { currentUser, sessionState } = useApp();

  if (sessionState === 'checking') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  if (sessionState === 'anon') {
    // Nereden geldiğini taşıyoruz ki giriş sonrası oraya dönülebilsin.
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />;
  }

  if (sessionState === 'needs-profile') {
    // Kayıt yarıda kalmış: oturum var, profil yok. Kullanıcı buradan
    // kaldığı adıma döner; adres çubuğuyla uygulamanın içine sızmaz.
    return <Navigate to="/profil-olustur" replace />;
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
