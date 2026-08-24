import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, NotificationItem, UserPoints, UserProfile } from '../types';
import { authService } from '../services/authService';
import { listingService } from '../services/listingService';
import { notificationService } from '../services/notificationService';
import { pointsService, UserActivity, EMPTY_ACTIVITY, calculatePoints } from '../services/pointsService';
import { GUEST_USER } from '../constants';
import { supabase } from '../lib/supabase';

interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description?: string;
}

interface AppContextType {
  currentUser: UserProfile;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserProfile>>;
  /** Gerçek bir Supabase oturumu var mı? */
  isAuthenticated: boolean;
  /** İlk oturum kontrolü sürüyor mu? (korumalı sayfalarda yönlendirmeyi bekletir) */
  isAuthLoading: boolean;
  logout: () => Promise<void>;

  /** Puan / rozet / aktivite özeti — profil ve keşfet ekranlarında kullanılır. */
  activity: UserActivity;
  points: UserPoints;
  badges: Badge[];
  refreshScorecard: () => Promise<void>;

  currentLocation: { city: string; district: string };
  setCurrentLocation: (loc: { city: string; district: string }) => void;

  notifications: NotificationItem[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  refreshNotifications: () => Promise<void>;

  favoritesCount: number;
  refreshFavoritesCount: () => Promise<void>;

  refreshUserData: () => Promise<void>;

  toasts: ToastMessage[];
  showToast: (title: string, description?: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const EMPTY_POINTS = calculatePoints(EMPTY_ACTIVITY);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Önbellekteki kullanıcıyla anında çiz, ardından gerçek oturumla doğrula.
  const [currentUser, setCurrentUser] = useState<UserProfile>(authService.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Oturum olaylarında gereksiz tekrar sorgu atmamak için güncel kullanıcı id'si.
  const currentUserIdRef = useRef(currentUser.id);
  currentUserIdRef.current = currentUser.id;

  const [activity, setActivity] = useState<UserActivity>(EMPTY_ACTIVITY);
  const [points, setPoints] = useState<UserPoints>(EMPTY_POINTS);
  const [badges, setBadges] = useState<Badge[]>([]);

  const [currentLocation, setCurrentLocation] = useState({ city: '', district: '' });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [theme, setThemeState] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('swaloop_theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const showToast = useCallback(
    (title: string, description?: string, type: ToastMessage['type'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, title, description, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshFavoritesCount = useCallback(async () => {
    const favorites = await listingService.getFavoriteIds();
    setFavoritesCount(favorites.length);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!currentUser.id) {
      setNotifications([]);
      return;
    }
    setNotifications(await notificationService.getNotifications(currentUser.id));
  }, [currentUser.id]);

  const refreshScorecard = useCallback(async () => {
    if (!currentUser.id) {
      setActivity(EMPTY_ACTIVITY);
      setPoints(EMPTY_POINTS);
      setBadges([]);
      return;
    }

    const card = await pointsService.getUserScorecard(currentUser);
    setActivity(card.activity);
    setPoints(card.points);
    setBadges(card.badges);
  }, [currentUser]);

  const refreshUserData = useCallback(async () => {
    const user = await authService.getCurrentUserFromSupabase();

    if (user) {
      setCurrentUser(user);
      setIsAuthenticated(true);
    } else {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setCurrentUser(GUEST_USER);
    setIsAuthenticated(false);
    setActivity(EMPTY_ACTIVITY);
    setPoints(EMPTY_POINTS);
    setBadges([]);
    setNotifications([]);
    setFavoritesCount(0);
  }, []);

  // Oturumu uygulama açılışında doğrula ve Supabase oturum değişimlerini dinle
  // (token yenilenmesi, başka sekmede çıkış yapılması vb.).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await refreshUserData();
      if (!cancelled) setIsAuthLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setCurrentUser(GUEST_USER);
        setIsAuthenticated(false);
        return;
      }

      if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return;

      // Açılıştaki ilk oturum olayı, yukarıdaki refreshUserData() ile aynı
      // kullanıcıyı getirir; aynı kullanıcı için ikinci kez sorgu atma.
      const sessionUserId = session?.user?.id;
      if (sessionUserId && sessionUserId !== currentUserIdRef.current) refreshUserData();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [refreshUserData]);

  // Kullanıcı belli olduğunda ona bağlı verileri tek turda çek.
  useEffect(() => {
    if (!currentUser.id) return;

    if (!currentLocation.city && currentUser.city) {
      setCurrentLocation({ city: currentUser.city, district: currentUser.district });
    }

    refreshFavoritesCount();
    refreshNotifications();
    refreshScorecard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const markNotificationAsRead = useCallback((id: string) => {
    notificationService.markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, []);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications((prev) => {
      notificationService.markAllAsRead(prev);
      return prev.map((n) => ({ ...n, isRead: true }));
    });
  }, []);

  const setTheme = useCallback((next: 'light' | 'dark') => {
    setThemeState(next);
    localStorage.setItem('swaloop_theme', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;

  const value = useMemo<AppContextType>(
    () => ({
      currentUser,
      setCurrentUser,
      isAuthenticated,
      isAuthLoading,
      logout,
      activity,
      points,
      badges,
      refreshScorecard,
      currentLocation,
      setCurrentLocation,
      notifications,
      unreadNotificationCount,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      refreshNotifications,
      favoritesCount,
      refreshFavoritesCount,
      refreshUserData,
      toasts,
      showToast,
      removeToast,
      theme,
      setTheme,
      toggleTheme,
    }),
    [
      currentUser,
      isAuthenticated,
      isAuthLoading,
      logout,
      activity,
      points,
      badges,
      refreshScorecard,
      currentLocation,
      notifications,
      unreadNotificationCount,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      refreshNotifications,
      favoritesCount,
      refreshFavoritesCount,
      refreshUserData,
      toasts,
      showToast,
      removeToast,
      theme,
      setTheme,
      toggleTheme,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }

  return context;
};
