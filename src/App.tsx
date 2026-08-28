import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { ToastContainer } from './components/layout/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { RequireAuth } from './components/auth/RequireAuth';

// Auth Pages
const SplashPage = lazy(() => import('./pages/auth/SplashPage').then((m) => ({ default: m.SplashPage })));
const OnboardingPage = lazy(() => import('./pages/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })));
const PhoneAuthPage = lazy(() => import('./pages/auth/PhoneAuthPage').then((m) => ({ default: m.PhoneAuthPage })));
const OtpVerificationPage = lazy(() => import('./pages/auth/OtpVerificationPage').then((m) => ({ default: m.OtpVerificationPage })));
const CreateProfilePage = lazy(() => import('./pages/auth/CreateProfilePage').then((m) => ({ default: m.CreateProfilePage })));

// Discovery Pages
const DiscoverPage = lazy(() => import('./pages/discovery/DiscoverPage').then((m) => ({ default: m.DiscoverPage })));
const SearchPage = lazy(() => import('./pages/discovery/SearchPage').then((m) => ({ default: m.SearchPage })));
const CategoriesPage = lazy(() => import('./pages/discovery/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const NearbyMapPage = lazy(() => import('./pages/discovery/NearbyMapPage').then((m) => ({ default: m.NearbyMapPage })));
const FavoritesPage = lazy(() => import('./pages/discovery/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));

// Needs Pages (İhtiyaç sistemi — bkz. swaloop-urun-sistem-tasarimi.md)
const NeedsPage = lazy(() => import('./pages/needs/NeedsPage').then((m) => ({ default: m.NeedsPage })));

// Listings Pages
const ProductDetailPage = lazy(() => import('./pages/listings/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })));
const CreateListingPage = lazy(() => import('./pages/listings/CreateListingPage').then((m) => ({ default: m.CreateListingPage })));
const EditListingPage = lazy(() => import('./pages/listings/EditListingPage').then((m) => ({ default: m.EditListingPage })));

// Trade Pages
const TradeOffersPage = lazy(() => import('./pages/trades/TradeOffersPage').then((m) => ({ default: m.TradeOffersPage })));
const TradeRequestsPage = lazy(() => import('./pages/trades/TradeRequestsPage').then((m) => ({ default: m.TradeRequestsPage })));
const MakeOfferPage = lazy(() => import('./pages/trades/MakeOfferPage').then((m) => ({ default: m.MakeOfferPage })));
const CounterOfferPage = lazy(() => import('./pages/trades/CounterOfferPage').then((m) => ({ default: m.CounterOfferPage })));
const TradeDetailPage = lazy(() => import('./pages/trades/TradeDetailPage').then((m) => ({ default: m.TradeDetailPage })));
const DisputePage = lazy(() => import('./pages/trades/DisputePage').then((m) => ({ default: m.DisputePage })));
const SwipeMatchPage = lazy(() => import('./pages/matching/SwipeMatchPage').then((m) => ({ default: m.SwipeMatchPage })));

// Messages / Chat
const MessagesPage = lazy(() => import('./pages/chat/MessagesPage').then((m) => ({ default: m.MessagesPage })));

// Notifications
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

// Profile Pages
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const EditProfilePage = lazy(() => import('./pages/profile/EditProfilePage').then((m) => ({ default: m.EditProfilePage })));
const PublicProfilePage = lazy(() => import('./pages/profile/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const BadgesPage = lazy(() => import('./pages/profile/BadgesPage').then((m) => ({ default: m.BadgesPage })));
const TrustScorePage = lazy(() => import('./pages/profile/TrustScorePage').then((m) => ({ default: m.TrustScorePage })));
const SettingsPage = lazy(() => import('./pages/profile/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const MyListingsPage = lazy(() => import('./pages/listings/MyListingsPage').then((m) => ({ default: m.MyListingsPage })));

// Trade Steps & Admin Pages
const TradeProcessPage = lazy(() => import('./pages/trades/TradeProcessPage').then((m) => ({ default: m.TradeProcessPage })));
const TradeSuccessPage = lazy(() => import('./pages/trades/TradeSuccessPage').then((m) => ({ default: m.TradeSuccessPage })));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AboutSwaloopPage = lazy(() => import('./pages/info/AboutSwaloopPage').then((m) => ({ default: m.AboutSwaloopPage })));
const HelpPage = lazy(() => import('./pages/info/HelpPage').then((m) => ({ default: m.HelpPage })));

// Sayfa parçası indirilirken gösterilen iskelet (rapor md. 92: beyaz ekran
// + spinner yerine içeriğin silüeti).
const RouteFallback: React.FC = () => (
  <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-4 space-y-3" aria-hidden="true">
    <div className="h-10 rounded-2xl bg-line/70 animate-pulse" />
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="aspect-[3/4] rounded-2xl bg-line/60 animate-pulse" />
      ))}
    </div>
  </div>
);

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-canvas text-ink font-sans antialiased selection:bg-brand-soft selection:text-brand-dark transition-colors duration-200">
          <div className="min-h-screen flex flex-col max-w-5xl mx-auto bg-canvas shadow-xl relative border-x border-line">
            <Header />

            <main className="flex-1">
              {/* Kod bölme (rapor.txt §3): tüm sayfalar tek bir dev JS
                  paketinde geliyordu. Artık her route ayrı bir parça olarak
                  yükleniyor; ilk açılışta sadece açılan ekran indiriliyor.
                  Yükleme sırasında beyaz ekran yerine iskelet gösteriliyor
                  (rapor md. 92). */}
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                {/* Auth & Onboarding */}
                <Route path="/" element={<SplashPage />} />
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route path="/giris" element={<PhoneAuthPage isRegister={false} />} />
                <Route path="/kayit" element={<PhoneAuthPage isRegister={true} />} />
                <Route path="/dogrulama" element={<OtpVerificationPage />} />
                <Route path="/profil-olustur" element={<CreateProfilePage />} />

                {/* Discovery & Search */}
                <Route path="/kesfet" element={<DiscoverPage />} />
                <Route path="/arama" element={<SearchPage />} />
                <Route path="/kategoriler" element={<CategoriesPage />} />
                <Route path="/harita" element={<NearbyMapPage />} />
                <Route path="/favoriler" element={<RequireAuth><FavoritesPage /></RequireAuth>} />

                {/* Needs — "Aradıklarım" */}
                <Route path="/aradiklarim" element={<RequireAuth><NeedsPage /></RequireAuth>} />
                <Route path="/ihtiyaclarim" element={<Navigate to="/aradiklarim" replace />} />

                {/* Listings */}
                <Route path="/ilan/:id" element={<ProductDetailPage />} />
                <Route path="/ilan-ver" element={<RequireAuth><CreateListingPage /></RequireAuth>} />
                <Route path="/ilan/:id/duzenle" element={<RequireAuth><EditListingPage /></RequireAuth>} />

                {/* Trades */}
                <Route path="/takaslarim" element={<RequireAuth><TradeOffersPage /></RequireAuth>} />
                <Route path="/takas-istekleri" element={<RequireAuth><TradeRequestsPage /></RequireAuth>} />
                <Route path="/istekler" element={<Navigate to="/takas-istekleri" replace />} />
                <Route path="/eslesme" element={<SwipeMatchPage />} />
                {/* Takma adlar kanonik adrese yönlendiriliyor: aynı ekranın
                    dört ayrı adresi olması hangisinin paylaşılacağını
                    belirsizleştiriyordu. */}
                <Route path="/takas-eslesme" element={<Navigate to="/eslesme" replace />} />
                <Route path="/kaydir" element={<Navigate to="/eslesme" replace />} />
                <Route path="/swipe" element={<Navigate to="/eslesme" replace />} />
                <Route path="/teklif-ver" element={<RequireAuth><MakeOfferPage /></RequireAuth>} />
                <Route path="/teklif/:id" element={<RequireAuth><TradeDetailPage /></RequireAuth>} />
                <Route path="/karsi-teklif/:id" element={<RequireAuth><CounterOfferPage /></RequireAuth>} />
                <Route path="/takas-sureci" element={<RequireAuth><TradeProcessPage /></RequireAuth>} />
                <Route path="/takas-sureci/:id" element={<RequireAuth><TradeProcessPage /></RequireAuth>} />
                <Route path="/takas-tamamlandi" element={<RequireAuth><TradeSuccessPage /></RequireAuth>} />
                <Route path="/takas-tamamlandi/:id" element={<RequireAuth><TradeSuccessPage /></RequireAuth>} />
                <Route path="/dispute" element={<RequireAuth><DisputePage /></RequireAuth>} />

                {/* Messages */}
                <Route path="/mesajlar" element={<RequireAuth><MessagesPage /></RequireAuth>} />
                <Route path="/mesajlar/:id" element={<RequireAuth><MessagesPage /></RequireAuth>} />

                {/* Notifications */}
                <Route path="/bildirimler" element={<RequireAuth><NotificationsPage /></RequireAuth>} />

                {/* Profile */}
                <Route path="/profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="/profil/duzenle" element={<RequireAuth><EditProfilePage /></RequireAuth>} />
                <Route path="/profil/:id" element={<PublicProfilePage />} />
                <Route path="/rozetlerim" element={<RequireAuth><BadgesPage /></RequireAuth>} />
                <Route path="/guven-puani" element={<RequireAuth><TrustScorePage /></RequireAuth>} />
                <Route path="/ayarlar" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                <Route path="/ilanlarim" element={<RequireAuth><MyListingsPage /></RequireAuth>} />

                {/* KALDIRILDI — Döngüler / Kırmızı Ataş / Gizemli Kutu /
                    Topluluk / Etkinlikler.
                    Beşi de arayüzden ERİŞİLEMEZ durumdaydı: hiçbir menü, buton
                    ya da bağlantı bu rotalara gitmiyordu (tek istisna,
                    kendisi de erişilemez olan LoopsPage'in Kırmızı Ataş'a
                    verdiği bağlantıydı). İçerikleri tamamen uydurmaydı —
                    Kırmızı Ataş ve Gizemli Kutu %100 mock, Etkinlikler sabit
                    veri, Topluluk'taki lider tablosu ise beş uydurma kişi
                    ("Zeynep Kaya, 6 takas") ve sabit 1. sıra. Tasarım
                    dokümanı §5 topluluğu FAZ 4'e koyuyor ve "moderasyon
                    altyapısı olmadan topluluk açmak ikinci bir ürün
                    yaratmak olur" diyor. Geçmişte duruyor: FAZ 3/4 gelince
                    `git revert` ile geri alınabilir. */}

                {/* Admin & About */}
                <Route path="/admin" element={<RequireAuth adminOnly><AdminDashboardPage /></RequireAuth>} />
                <Route path="/hakkimizda" element={<AboutSwaloopPage />} />
                {/* /yardim rotası YOKTU: Ayarlar'daki "Yardım & Destek"
                    satırı tanımsız bir adrese gidiyor ve `*` kuralıyla
                    sessizce /kesfet'e yönleniyordu. */}
                <Route path="/yardim" element={<HelpPage />} />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/kesfet" replace />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </main>

            <BottomNav />
            <ToastContainer />
          </div>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
