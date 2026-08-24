import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { messageService } from '../../services/messageService';
import { pointsService, EMPTY_ACTIVITY, calculatePoints, UserActivity } from '../../services/pointsService';
import { ProductCard } from '../../components/common/ProductCard';
import { PageLoader } from '../../components/layout/PageLoader';
import { Listing, Review, UserProfile } from '../../types';
import { ArrowLeft, Calendar, MapPin, MessageSquare, ShieldCheck, Star } from 'lucide-react';

/**
 * Başka bir kullanıcının herkese açık profili.
 *
 * Önceden bu sayfa `mockData.OTHER_USERS` sözlüğünden sabit bir kullanıcı
 * gösteriyordu — adresteki id ne olursa olsun aynı sahte kişi çıkıyordu.
 * Artık profil, ilanlar, değerlendirmeler ve puan gerçek veriden geliyor.
 */
export const PublicProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, showToast } = useApp();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [activity, setActivity] = useState<UserActivity>(EMPTY_ACTIVITY);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingChat, setIsStartingChat] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!id) return;

      setIsLoading(true);
      const profile = await authService.getProfileById(id);

      if (cancelled) return;

      if (!profile) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const [userListings, userReviews, userActivity] = await Promise.all([
        listingService.getUserListings(id),
        tradeService.getReviewsForUser(id),
        pointsService.getUserActivity(profile),
      ]);

      if (cancelled) return;

      setUser(profile);
      setListings(userListings.filter((listing) => listing.status === 'active'));
      setReviews(userReviews);
      setActivity(userActivity);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleStartChat = async () => {
    if (!user) return;

    if (!isAuthenticated) {
      navigate('/giris');
      return;
    }

    setIsStartingChat(true);
    const conversation = await messageService.getOrCreateConversationWithUser(
      currentUser.id,
      user.id
    );
    setIsStartingChat(false);

    if (conversation) {
      navigate(`/mesajlar/${conversation.id}`);
    } else {
      showToast('Sohbet açılamadı', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  if (isLoading) return <PageLoader />;

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-bold">Kullanıcı bulunamadı</p>
        <p className="text-xs text-stone-500">Bu profil kaldırılmış olabilir.</p>
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold cursor-pointer"
        >
          Keşfet'e dön
        </button>
      </div>
    );
  }

  const points = calculatePoints(activity);
  const isSelf = user.id === currentUser.id;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold">Kullanıcı Profili</h1>
        </div>

        <section className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-16 h-16 rounded-full object-cover border-2 border-emerald-700 bg-stone-100 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-bold truncate">{user.fullName}</h2>
                  {user.isVerified && <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                <span className="inline-block mt-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  {points.level.title}
                </span>
                <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 mt-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    {[user.district, user.city].filter(Boolean).join(', ') || 'Konum belirtilmemiş'}
                  </span>
                </div>
                {user.memberSince && (
                  <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-0.5">
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>{user.memberSince} tarihinden beri üye</span>
                  </div>
                )}
              </div>
            </div>

            {!isSelf && (
              <button
                type="button"
                onClick={handleStartChat}
                disabled={isStartingChat}
                className="p-2.5 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-60 shrink-0"
                title="Mesaj gönder"
                aria-label="Mesaj gönder"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
          </div>

          {user.bio && (
            <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
              {user.bio}
            </p>
          )}

          <div className="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-stone-100 dark:border-stone-800 text-center">
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-sm font-extrabold block">{activity.completedTrades}</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Takas</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-sm font-extrabold block">{listings.length}</span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">İlan</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-sm font-extrabold text-amber-600 block">
                {activity.reviewCount ? activity.averageRating.toFixed(1) : '—'}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Puanı</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60">
              <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 block">
                {points.total}
              </span>
              <span className="text-[10px] text-stone-500 dark:text-stone-400">Puan</span>
            </div>
          </div>
        </section>

        <section className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Yayındaki ilanları ({listings.length})
          </h3>

          {listings.length === 0 ? (
            <p className="text-xs text-stone-500 dark:text-stone-400 py-6 text-center">
              Bu kullanıcının şu anda yayında ilanı yok.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {listings.map((listing) => (
                <ProductCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>

        {reviews.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Değerlendirmeler ({reviews.length})
            </h3>

            {reviews.slice(0, 10).map((review) => (
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
            ))}
          </section>
        )}
      </div>
    </div>
  );
};
