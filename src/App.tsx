import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/layout/ToastContainer';
import { PageLoader } from './components/layout/PageLoader';
import { SetupNotice } from './components/layout/SetupNotice';
import { isSupabaseConfigured } from './lib/supabase';

/*
 * Rotalar bilinçli olarak sade tutuldu: uygulama tek bir işe odaklanıyor —
 * eşyanı yayınla, karşılığında bir şey bul, takası tamamla.
 *
 * Her sayfa `lazy` yükleniyor; ilk açılışta sadece açılış + keşfet
 * paketleri indiriliyor, geri kalanı gerektiğinde geliyor. Uygulamanın
 * mobilde hızlı açılmasının en büyük nedeni bu.
 */

// Giriş & kayıt
const SplashPage = lazy(() => import('./pages/auth/SplashPage').then((m) => ({ default: m.SplashPage })));
const OnboardingPage = lazy(() => import('./pages/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const PhoneAuthPage = lazy(() => import('./pages/auth/PhoneAuthPage').then((m) => ({ default: m.PhoneAuthPage })));
const OtpVerificationPage = lazy(() => import('./pages/auth/OtpVerificationPage').then((m) => ({ default: m.OtpVerificationPage })));
const CreateProfilePage = lazy(() => import('./pages/auth/CreateProfilePage').then((m) => ({ default: m.CreateProfilePage })));

// Keşfet
const DiscoverPage = lazy(() => import('./pages/discovery/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const SearchPage = lazy(() => import('./pages/discovery/SearchPage').then((m) => ({ default: m.SearchPage })));
const NearbyPage = lazy(() => import('./pages/discovery/NearbyPage').then((m) => ({ default: m.NearbyPage })));
const FavoritesPage = lazy(() => import('./pages/discovery/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));

// İlanlar
const ProductDetailPage = lazy(() => import('./pages/listings/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })));
const CreateListingPage = lazy(() => import('./pages/listings/CreateListingPage').then((m) => ({ default: m.CreateListingPage })));
const EditListingPage = lazy(() => import('./pages/listings/EditListingPage').then((m) => ({ default: m.EditListingPage })));

// Takas
const TradeOffersPage = lazy(() => import('./pages/trades/TradeOffersPage').then((m) => ({ default: m.TradeOffersPage })));
const MakeOfferPage = lazy(() => import('./pages/trades/MakeOfferPage').then((m) => ({ default: m.MakeOfferPage })));
const TradeDetailPage = lazy(() => import('./pages/trades/TradeDetailPage').then((m) => ({ default: m.TradeDetailPage })));
const SwipeMatchPage = lazy(() => import('./pages/matching/SwipeMatchPage').then((m) => ({ default: m.SwipeMatchPage })));

// Mesaj & bildirim
const MessagesPage = lazy(() => import('./pages/chat/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// Profil
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import('./pages/profile/EditProfilePage').then((m) => ({ default: m.EditProfilePage })));
const PublicProfilePage = lazy(() => import('./pages/profile/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const PointsPage = lazy(() => import('./pages/profile/PointsPage').then((m) => ({ default: m.PointsPage })));
const BadgesPage = lazy(() => import('./pages/profile/BadgesPage').then((m) => ({ default: m.BadgesPage })));
const ImpactBreakdownPage = lazy(() => import('./pages/profile/ImpactBreakdownPage').then((m) => ({ default: m.ImpactBreakdownPage })));

// Döngü & yolculuk
const LoopsPage = lazy(() => import('./pages/loops/LoopsPage').then((m) => ({ default: m.LoopsPage })));
const JourneyPage = lazy(() => import('./pages/loops/JourneyPage').then((m) => ({ default: m.JourneyPage })));

const AboutSwaloopPage = lazy(() => import('./pages/info/AboutSwaloopPage').then((m) => ({ default: m.AboutSwaloopPage })));

/** Eski takas süreci adreslerini teklif detayına yönlendirir. */
const TradeRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/teklif/${id}` : '/takaslarim'} replace />;
};

/**
 * Oturum gerektiren sayfaları korur. Oturum kontrolü sürerken yükleniyor
 * göstergesi çizilir; oturum yoksa kullanıcı, geldiği adres saklanarak
 * giriş ekranına gönderilir.
 */
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isAuthLoading } = useApp();
  const location = useLocation();

  if (isAuthLoading) return <PageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/giris" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Giriş & kayıt */}
      <Route path="/" element={<SplashPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/giris" element={<PhoneAuthPage isRegister={false} />} />
      <Route path="/kayit" element={<PhoneAuthPage isRegister />} />
      <Route path="/dogrulama" element={<OtpVerificationPage />} />
      <Route path="/profil-olustur" element={<CreateProfilePage />} />

      {/* Keşfet — giriş yapmadan da gezilebilir */}
      <Route path="/kesfet" element={<DiscoverPage />} />
      <Route path="/arama" element={<SearchPage />} />
      <Route path="/yakinimdakiler" element={<NearbyPage />} />
      <Route path="/harita" element={<Navigate to="/yakinimdakiler" replace />} />
      <Route path="/ilan/:id" element={<ProductDetailPage />} />
      <Route path="/profil/:id" element={<PublicProfilePage />} />
      <Route path="/hakkimizda" element={<AboutSwaloopPage />} />

      {/* Oturum gerektirenler */}
      <Route path="/favoriler" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
      <Route path="/ilan-ver" element={<RequireAuth><CreateListingPage /></RequireAuth>} />
      <Route path="/ilan/:id/duzenle" element={<RequireAuth><EditListingPage /></RequireAuth>} />

      <Route path="/takaslarim" element={<RequireAuth><TradeOffersPage /></RequireAuth>} />
      <Route path="/eslesme" element={<RequireAuth><SwipeMatchPage /></RequireAuth>} />
      <Route path="/teklif-ver" element={<RequireAuth><MakeOfferPage /></RequireAuth>} />
      <Route path="/teklif/:id" element={<RequireAuth><TradeDetailPage /></RequireAuth>} />
      {/* Takas süreci ve tamamlanma ekranları, teklif detayının kendisidir:
          6 adımlı akış, teslimat onayı ve değerlendirme orada yürür. */}
      <Route path="/takas-sureci/:id" element={<TradeRedirect />} />
      <Route path="/takas-tamamlandi/:id" element={<TradeRedirect />} />

      <Route path="/mesajlar" element={<RequireAuth><MessagesPage /></RequireAuth>} />
      <Route path="/mesajlar/:id" element={<RequireAuth><MessagesPage /></RequireAuth>} />
      <Route path="/bildirimler" element={<RequireAuth><NotificationsPage /></RequireAuth>} />

      <Route path="/profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/profil/duzenle" element={<RequireAuth><EditProfilePage /></RequireAuth>} />
      <Route path="/puanlarim" element={<RequireAuth><PointsPage /></RequireAuth>} />
      <Route path="/rozetlerim" element={<RequireAuth><BadgesPage /></RequireAuth>} />
      <Route path="/etkim" element={<RequireAuth><ImpactBreakdownPage /></RequireAuth>} />

      <Route path="/donguler" element={<RequireAuth><LoopsPage /></RequireAuth>} />
      <Route path="/takas-yolculugum" element={<RequireAuth><JourneyPage /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/kesfet" replace />} />
    </Routes>
  </Suspense>
);

export default function App() {
  // Ortam değişkenleri yoksa uygulama yerine kurulum yönergesi gösterilir.
  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <AppProvider>
      <BrowserRouter>
        {/*
         * Mobil uygulama kabuğu: yükseklik ekranla sınırlı, yalnızca orta
         * bölge kayar. Böylece üst çubuk ve alt gezinme her zaman yerinde
         * durur, sayfa geçişlerinde zıplama olmaz.
         */}
        <div className="h-dvh bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans antialiased selection:bg-emerald-200 selection:text-emerald-900">
          <div className="h-full flex flex-col max-w-lg mx-auto bg-stone-50 dark:bg-stone-950 shadow-xl relative border-x border-stone-200/60 dark:border-stone-800/80 overflow-hidden">
            <Header />

            <main className="flex-1 overflow-y-auto overscroll-contain">
              <AppRoutes />
            </main>

            <BottomNav />
            <ToastContainer />
          </div>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
