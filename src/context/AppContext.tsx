import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, Listing, TradeOffer, NotificationItem } from '../types';
import { authService } from '../services/authService';
import { GUEST_USER } from '../constants/guestUser';
import { supabase } from '../lib/supabase';
import { listingService, setViewerCoords } from '../services/listingService';
import { tradeService } from '../services/tradeService';
import { notificationService } from '../services/notificationService';
import { messageService } from '../services/messageService';
import { onServiceError } from '../lib/serviceError';
import { Language, TranslationKey, getTranslation } from '../utils/translations';

interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description?: string;
}

// Oturumun TEK kaynağı. Rota koruması eskiden her gezinmede kendi başına
// `getUser()` çağırıyordu; hem gereksiz ağ isteğiydi hem de "oturum var
// ama profil yok" durumunu hiç ayırt etmiyordu.
//
//   checking      → henüz bilinmiyor (ilk açılış)
//   anon          → Supabase oturumu yok
//   needs-profile → oturum var, profil satırı YOK (kayıt yarıda kalmış)
//   ready         → oturum ve profil var
export type SessionState = 'checking' | 'anon' | 'needs-profile' | 'ready';

interface AppContextType {
  currentUser: UserProfile;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  sessionState: SessionState;
  // lat/lon isteğe bağlıdır ve yalnızca konum GERÇEKTEN çözümlendiğinde
  // (GPS ya da adres araması) dolar. İlan mesafeleri buna göre hesaplanır;
  // koordinat yoksa hiçbir ilanda mesafe gösterilmez.
  currentLocation: {
    city: string;
    district: string;
    neighbourhood?: string;
    label?: string;
    lat?: number;
    lon?: number;
  };
  setCurrentLocation: (loc: {
    city: string;
    district: string;
    neighbourhood?: string;
    label?: string;
    lat?: number;
    lon?: number;
  }) => void;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  favoritesCount: number;
  // Okunmamış MESAJ sayısı. Bildirim sayısından ayrıdır: alt menüdeki
  // "Mesajlar" rozeti eskiden `unreadNotificationCount` gösteriyordu, yani
  // teklif/değerlendirme bildirimleri mesaj rozetini kabartıyordu.
  unreadMessageCount: number;
  refreshUnreadMessageCount: () => Promise<void>;
  // Yanıt bekleyen gelen teklif sayısı. Alt menüdeki "Takaslarım" rozeti:
  // yanıtsız kalan teklif, tamamlanan takas sayacının durduğu yerdir.
  pendingOfferCount: number;
  refreshPendingOfferCount: () => Promise<void>;
  refreshUserData: () => Promise<void>;
  logoutUser: () => Promise<void>;
  toasts: ToastMessage[];
  showToast: (title: string, description?: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  deviceFrameMode: boolean;
  setDeviceFrameMode: (enabled: boolean) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  t: (key: TranslationKey) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(authService.getCurrentUser());
  const [sessionState, setSessionState] = useState<SessionState>('checking');
  const [currentLocation, setCurrentLocation] = useState<{
    city: string;
    district: string;
    neighbourhood?: string;
    label?: string;
    lat?: number;
    lon?: number;
  }>({ city: 'İstanbul', district: '' });
  // Bildirimler artık gerçek: `notifications` tablosundan geliyor, satırları
  // DB trigger'ları üretiyor (rapor md. 44-45). Önceden sabit bir mock
  // listeydi ve hiçbir olaydan tetiklenmiyordu.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [deviceFrameMode, setDeviceFrameMode] = useState<boolean>(false);
  const [language, setLanguageState] = useState<'tr' | 'en'>(() => {
    return (localStorage.getItem('swaloop_lang') as 'tr' | 'en') || 'tr';
  });
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('swaloop_theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    // Uygulama açıldığında Supabase'den güncel kullanıcıyı kontrol et.
    //
    // "Oturum var mı?" ve "profil var mı?" AYRI sorular. OTP doğrulanınca
    // Supabase oturumu açılıyor ama profil henüz yok; kullanıcı adres
    // çubuğundan /kesfet'e gidip ADI BOŞ bir profille geziniyor ve ilan
    // verince yabancı anahtar hatası alıyordu.
    const checkUserSession = async () => {
      const hasSession = await authService.hasActiveSession();

      if (!hasSession) {
        authService.clearCachedUser();
        setCurrentUser(GUEST_USER);
        setSessionState('anon');
        return;
      }

      const user = await authService.getCurrentUserFromSupabase();

      if (user) {
        setCurrentUser(user);
        setSessionState('ready');
      } else {
        setSessionState('needs-profile');
      }
    };
    checkUserSession();

    // Açılıştaki tek seferlik kontrol yetmiyor: oturum başka bir sekmede
    // kapatıldığında, token yenilenemediğinde ya da oturum sunucu tarafında
    // iptal edildiğinde uygulama, önbellekteki kullanıcıyı göstermeye devam
    // ediyordu. Rota koruması (RequireAuth) bunu ilk gezinmede yakalıyor
    // ama açık duran ekran eski kullanıcıyla kalıyordu. Artık oturum
    // değişimleri anında yansıyor.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // Önbellek DE düşürülüyor: eskiden burada `getCurrentUser()`
        // çağrılıyordu ve o da tam olarak düşürülmemiş önbelleği okuyordu,
        // yani çıkış yapan kullanıcının adı/avatarı/isAdmin bayrağı ekranda
        // kalmaya devam ediyordu.
        authService.clearCachedUser();
        setCurrentUser(GUEST_USER);
        setSessionState('anon');
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        checkUserSession();
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const setLanguage = (lang: 'tr' | 'en') => {
    setLanguageState(lang);
    localStorage.setItem('swaloop_lang', lang);
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('swaloop_theme', newTheme);
  };

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;

  const [favoritesCount, setFavoritesCount] = useState<number>(0);

  const refreshFavoritesCount = () => {
    listingService.getFavorites().then((favs) => setFavoritesCount(favs.length));
  };

  useEffect(() => {
    refreshFavoritesCount();
  }, []);

  const refreshNotifications = useCallback(async () => {
    const items = await notificationService.getUserNotifications(currentUser.id);
    setNotifications(items);
  }, [currentUser.id]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  const [unreadMessageCount, setUnreadMessageCount] = useState<number>(0);

  const refreshUnreadMessageCount = useCallback(async () => {
    setUnreadMessageCount(await messageService.getUnreadMessageCount(currentUser.id));
  }, [currentUser.id]);

  useEffect(() => {
    refreshUnreadMessageCount();
  }, [refreshUnreadMessageCount]);

  const [pendingOfferCount, setPendingOfferCount] = useState<number>(0);

  const refreshPendingOfferCount = useCallback(async () => {
    setPendingOfferCount(await tradeService.getPendingIncomingOfferCount(currentUser.id));
  }, [currentUser.id]);

  useEffect(() => {
    refreshPendingOfferCount();
  }, [refreshPendingOfferCount]);

  const markNotificationAsRead = (id: string) => {
    // Önce arayüzü güncelle (bildirime tıklayan kullanıcı beklemesin),
    // sonra DB'ye yaz.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    notificationService.markAsRead(id);
  };

  const markAllNotificationsAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await notificationService.markAllAsRead(currentUser.id);
  };

  const showToast = (title: string, description?: string, type: ToastMessage['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastMessage = { id, title, description, type };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Servis katmanındaki hatalar eskiden yalnızca konsola yazılıyordu; ekrana
  // hiçbir şey yansımıyordu. Sorgular hatada `[]` döndüğü için kullanıcı
  // "Henüz ilan yok" görüyor ve bunu BOŞLUK sanıyordu — bir sorun olduğunu
  // ve tekrar denemesi gerektiğini öğrenemiyordu.
  //
  // Sayfa sayfa hata durumu yazmak doğru nihai çözüm; bu ara katman o iş
  // yapılana kadar sessizliği bitiriyor. Tek bir uyarı gösterilir: bir
  // ekran açılışında birden çok sorgu birden patlarsa kullanıcıyı toast
  // yağmuruna tutmamak için 8 saniyelik bir kısma var.
  const lastServiceErrorAt = useRef(0);

  const announceDataFailure = useCallback((detail: string) => {
    const now = Date.now();
    if (now - lastServiceErrorAt.current < 8000) return;
    lastServiceErrorAt.current = now;

    showToast('Veriler alınamadı', detail, 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stop = onServiceError((context) => {
      announceDataFailure(
        `${context.replace(/:$/, '')} — bağlantını kontrol edip tekrar dene.`
      );
    });

    // İKİNCİ AĞ: yukarıdaki dinleyici yalnızca sunucunun döndürdüğü
    // hataları (`{ data, error }`) yakalar. Bağlantı hiç kurulamazsa
    // (uçak modu, DNS, sunucu kapalı) supabase-js sözü REDDEDER; servisler
    // try/catch kullanmadığı ve sayfalar `.then(setState)` yazdığı için bu
    // red hiçbir yere ulaşmıyor — konsolda bile yalnızca "unhandled
    // rejection" olarak görünüyordu. Kullanıcı boş bir liste görüp
    // "hiç ilan yok" sanıyordu.
    const onRejection = (event: PromiseRejectionEvent) => {
      announceDataFailure('Sunucuya ulaşılamadı — bağlantını kontrol edip tekrar dene.');
      // Konsolda görünmeye devam etsin; sessizce yutmuyoruz.
      console.error('İşlenmemiş servis hatası:', event.reason);
    };

    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      stop();
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [announceDataFailure]);

  const refreshUserData = async () => {
    const user = await authService.getCurrentUserFromSupabase();
    if (user) {
      setCurrentUser(user);
      setSessionState('ready');
    } else {
      // Profil okunamadıysa ÖNBELLEĞE düşmüyoruz: önbellek tam da bu
      // durumda yanıltıcı (oturum bitmiş olabilir).
      setCurrentUser(GUEST_USER);
    }
  };

  const logoutUser = async () => {
    await authService.logout();
    setCurrentUser(GUEST_USER);
    setSessionState('anon');
    showToast('Çıkış Yapıldı', 'Hesabınızdan güvenli bir şekilde çıkış yapıldı.', 'info');
  };

  // İlan mesafeleri, seçili konumun koordinatı biliniyorsa hesaplanır.
  // Koordinat yoksa `setViewerCoords(null)` ile mesafe tamamen kapatılır —
  // uydurma bir "0 km" göstermektense mesafeyi hiç göstermemek doğru
  // davranış (bkz. README "Mesafe ya gerçektir ya da yoktur").
  useEffect(() => {
    setViewerCoords(
      typeof currentLocation.lat === 'number' && typeof currentLocation.lon === 'number'
        ? { lat: currentLocation.lat, lng: currentLocation.lon }
        : null
    );
  }, [currentLocation.lat, currentLocation.lon]);

  const t = (key: TranslationKey): string => {
    return getTranslation(key, language);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        sessionState,
        currentLocation,
        setCurrentLocation,
        notifications,
        unreadNotificationCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        refreshNotifications,
        favoritesCount,
        unreadMessageCount,
        refreshUnreadMessageCount,
        pendingOfferCount,
        refreshPendingOfferCount,
        refreshUserData,
        logoutUser,
        toasts,
        showToast,
        removeToast,
        deviceFrameMode,
        setDeviceFrameMode,
        language,
        setLanguage,
        theme,
        setTheme,
        toggleTheme,
        t,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};