import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { Listing, Review } from '../../types';
import { LISTING_STATUS_LABELS } from '../../constants';
import { BadgeGrid } from '../../components/common/BadgeGrid';
import { PointsCard } from '../../components/common/PointsCard';
import {
  Award,
  ChevronRight,
  Edit3,
  Eye,
  Heart,
  Leaf,
  LogOut,
  MapPin,
  Moon,
  Pause,
  Play,
  Plus,
  Repeat,
  Share2,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  TrendingUp,
} from 'lucide-react';

type ProfileTab = 'listings' | 'reviews' | 'badges';

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    activity,
    points,
    badges,
    refreshScorecard,
    showToast,
    theme,
    setTheme,
    logout,
  } = useApp();

  const [activeTab, setActiveTab] = useState<ProfileTab>('listings');
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!currentUser.id) return;

    setIsLoading(true);
    const [listings, reviews] = await Promise.all([
      listingService.getUserListings(currentUser.id),
      tradeService.getReviewsForUser(currentUser.id),
    ]);
    setMyListings(listings);
    setMyReviews(reviews);
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleShareProfile = async () => {
    const url = `${window.location.origin}/profil/${currentUser.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: currentUser.fullName, url });
        return;
      } catch {
        // Kullanıcı paylaşımı iptal etti; panoya kopyalamaya düşülür.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Profil bağlantısı kopyalandı', url, 'success');
    } catch {
      showToast('Bağlantı kopyalanamadı', url, 'warning');
    }
  };

  const handleToggleListingStatus = async (listing: Listing) => {
    const next = listing.status === 'active' ? 'paused' : 'active';
    setBusyListingId(listing.id);
    const ok = await listingService.setListingStatus(listing.id, next);
    setBusyListingId(null);

    if (!ok) {
      showToast('İşlem başarısız', 'İlan durumu değiştirilemedi.', 'error');
      return;
    }

    setMyListings((prev) =>
      prev.map((item) => (item.id === listing.id ? { ...item, status: next } : item))
    );
    showToast(
      next === 'active' ? 'İlan yeniden yayında' : 'İlan duraklatıldı',
      listing.title,
      'success'
    );
    refreshScorecard();
  };

  const handleDeleteListing = async (listing: Listing) => {
    if (!window.confirm(`"${listing.title}" ilanı kalıcı olarak silinsin mi?`)) return;

    setBusyListingId(listing.id);
    const ok = await listingService.deleteListing(listing.id);
    setBusyListingId(null);

    if (!ok) {
      showToast('Silinemedi', 'İlan silinirken bir sorun oluştu.', 'error');
      return;
    }

    setMyListings((prev) => prev.filter((item) => item.id !== listing.id));
    showToast('İlan silindi', listing.title, 'info');
    refreshScorecard();
  };

  const activeListingCount = myListings.filter((l) => l.status === 'active').length;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100 transition-colors">
      <div className="px-4 pt-4 space-y-4">
        {/* Kimlik kartı */}
        <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-4 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.fullName}
                  className="w-16 h-16 rounded-full object-cover border-2 border-emerald-700"
                />
                {currentUser.isVerified && (
                  <span className="absolute bottom-0 right-0 p-1 rounded-full bg-emerald-700 text-white ring-2 ring-white dark:ring-stone-900">
                    <ShieldCheck className="w-3 h-3" />
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <h1 className="text-base font-bold truncate">{currentUser.fullName}</h1>
                <span className="inline-block mt-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  {points.level.title}
                </span>
                <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 mt-1 truncate">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {[currentUser.district, currentUser.city].filter(Boolean).join(', ') ||
                      'Konum eklenmedi'}
                  </span>
                </div>
                {currentUser.memberSince && (
                  <span className="text-[11px] text-stone-400 block">
                    {currentUser.memberSince} tarihinden beri üye
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleShareProfile}
                className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                title="Profili paylaş"
                aria-label="Profili paylaş"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/profil/duzenle')}
                className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                title="Profili düzenle"
                aria-label="Profili düzenle"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {currentUser.bio && (
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              {currentUser.bio}
            </p>
          )}

          <div className="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-stone-100 dark:border-stone-800 text-center">
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-base font-extrabold block">{activity.completedTrades}</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Takas</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-base font-extrabold block">{activeListingCount}</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Yayında</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-base font-extrabold text-amber-600 block">
                {activity.reviewCount ? activity.averageRating.toFixed(1) : '—'}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Puanı</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 block">
                {activity.reviewCount}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Yorum</span>
            </div>
          </div>

          {activity.profileCompletionPercent < 100 && (
            <button
              type="button"
              onClick={() => navigate('/profil/duzenle')}
              className="mt-3 w-full p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-left flex items-center justify-between gap-2 hover:bg-amber-100/70 transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                  Profilin %{activity.profileCompletionPercent} tamamlandı
                </span>
                <span className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                  Eksikleri tamamla, karşı taraf sana daha kolay güvensin.
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-700 shrink-0" />
            </button>
          )}
        </section>

        {/* Takas puanı */}
        <PointsCard points={points} onDetail={() => navigate('/puanlarim')} />

        {/* Çevresel etki */}
        <button
          type="button"
          onClick={() => navigate('/etkim')}
          className="w-full text-left bg-gradient-to-r from-emerald-900 to-teal-900 text-white rounded-3xl p-4 shadow-xs cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-200 uppercase tracking-wider">
                Çevresel Etkin
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-300" />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'CO₂e', value: `${activity.impact.co2eKg} kg` },
              { label: 'Su', value: `${activity.impact.waterLiters} L` },
              { label: 'Enerji', value: `${activity.impact.energyKwh} kWh` },
            ].map((item) => (
              <div key={item.label} className="p-2.5 rounded-2xl bg-white/10 border border-white/10">
                <span className="text-base font-black block">{item.value}</span>
                <span className="text-[10px] text-emerald-200">{item.label}</span>
              </div>
            ))}
          </div>

          {activity.completedTrades === 0 && (
            <p className="text-[11px] text-emerald-100/70 mt-3">
              İlk takasını tamamladığında buradaki değerler dolmaya başlar.
            </p>
          )}
        </button>

        {/* Sekmeler */}
        <div className="flex items-center gap-1 p-1 bg-stone-200/60 dark:bg-stone-800 rounded-2xl">
          {(
            [
              { id: 'listings', label: `İlanlarım (${myListings.length})` },
              { id: 'reviews', label: `Yorumlar (${myReviews.length})` },
              { id: 'badges', label: `Rozetler (${badges.filter((b) => b.isEarned).length})` },
            ] as { id: ProfileTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-stone-700 text-emerald-900 dark:text-emerald-300 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'listings' && (
          <section className="space-y-2.5">
            <button
              type="button"
              onClick={() => navigate('/ilan-ver')}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Yeni ilan ver
            </button>

            {isLoading && (
              <p className="text-center text-xs text-stone-400 py-6">İlanların yükleniyor...</p>
            )}

            {!isLoading && myListings.length === 0 && (
              <p className="text-center text-xs text-stone-500 dark:text-stone-400 py-8">
                Henüz ilanın yok. Kullanmadığın bir eşyayı yayınla, takas teklifleri gelmeye başlasın.
              </p>
            )}

            {myListings.map((listing) => (
              <article
                key={listing.id}
                className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-3 flex gap-3"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/ilan/${listing.id}`)}
                  className="w-20 h-20 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0 cursor-pointer"
                >
                  <img
                    src={listing.images[0]}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          listing.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : listing.status === 'traded'
                              ? 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {LISTING_STATUS_LABELS[listing.status] ?? listing.status}
                      </span>
                      <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                        <Eye className="w-3 h-3" /> {listing.viewCount}
                      </span>
                      <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                        <Heart className="w-3 h-3" /> {listing.favoriteCount}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold truncate mt-1">{listing.title}</h3>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      İstediği: {listing.lookingFor || '—'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 mt-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/ilan/${listing.id}/duzenle`)}
                      className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-[11px] font-semibold hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> Düzenle
                    </button>

                    {listing.status !== 'traded' && (
                      <button
                        type="button"
                        disabled={busyListingId === listing.id}
                        onClick={() => handleToggleListingStatus(listing)}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-[11px] font-semibold hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      >
                        {listing.status === 'active' ? (
                          <>
                            <Pause className="w-3 h-3" /> Duraklat
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3" /> Yayınla
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busyListingId === listing.id}
                      onClick={() => handleDeleteListing(listing)}
                      className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50"
                      title="İlanı sil"
                      aria-label="İlanı sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === 'reviews' && (
          <section className="space-y-2.5">
            {myReviews.length === 0 ? (
              <p className="text-center text-xs text-stone-500 dark:text-stone-400 py-8">
                Henüz değerlendirme almadın. Takasların tamamlandıkça yorumlar burada birikir.
              </p>
            ) : (
              myReviews.map((review) => (
                <article
                  key={review.id}
                  className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={review.authorAvatar}
                        alt={review.authorName}
                        className="w-8 h-8 rounded-full object-cover bg-stone-100"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold block truncate">{review.authorName}</span>
                        <span className="text-[10px] text-stone-400">{review.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= Math.round(review.overallRating)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-stone-300 dark:text-stone-700'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
                      {review.comment}
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        {activeTab === 'badges' && <BadgeGrid badges={badges} />}

        {/* Kısayollar */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden">
          {[
            { icon: Repeat, label: 'Takas döngülerim', path: '/donguler' },
            { icon: TrendingUp, label: 'Takas yolculuğum', path: '/takas-yolculugum' },
            { icon: Award, label: 'Rozetlerim', path: '/rozetlerim' },
            { icon: ShieldCheck, label: 'Swaloop nasıl çalışır?', path: '/hakkimizda' },
          ].map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="w-full p-3.5 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/60 transition-colors text-xs font-semibold cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <item.icon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                {item.label}
              </span>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
          ))}
        </section>

        {/* Ayarlar */}
        <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold flex items-center gap-2">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-amber-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              Görünüm
            </span>

            <div className="inline-flex p-0.5 rounded-lg bg-stone-200/80 dark:bg-stone-800">
              {(['light', 'dark'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    theme === option
                      ? 'bg-white dark:bg-emerald-800 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  {option === 'light' ? 'Açık' : 'Koyu'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await logout();
              showToast('Çıkış yapıldı', 'Tekrar görüşmek üzere!', 'info');
              navigate('/giris', { replace: true });
            }}
            className="w-full py-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Çıkış yap
          </button>
        </section>
      </div>
    </div>
  );
};
