import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services/authService';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { messageService } from '../../services/messageService';
import { ProductCard } from '../../components/common/ProductCard';
import { TrustCard } from '../../components/common/TrustCard';
import { Listing, Review, UserProfile } from '../../types';
import { getUserBadges } from '../../constants/badges';
import { ArrowLeft, MessageSquare, ShieldCheck, MapPin, Calendar, Star, Leaf, Loader2 } from 'lucide-react';

export const PublicProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { currentUser, showToast } = useApp();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userListings, setUserListings] = useState<Listing[]>([]);
  const [userReviews, setUserReviews] = useState<Review[]>([]);

  // Önceden bu sayfa hep OTHER_USERS mock verisini gösteriyordu, gerçek
  // Supabase profiline hiç bağlı değildi. Artık id ile gerçek profil
  // çekiliyor.
  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    authService.getPublicProfile(id).then((profile) => {
      setUser(profile);
      setIsLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!user) return;
    listingService.getUserListings(user.id).then(setUserListings);
    tradeService.getReviewsForUser(user.id).then(setUserReviews);
  }, [user?.id]);

  const earnedBadges = user ? getUserBadges(user).filter((b) => b.isEarned) : [];

  const handleStartChat = async () => {
    if (!user) return;
    const conv = await messageService.getOrCreateConversationWithUser(currentUser.id, user.id);
    if (conv) {
      navigate(`/mesajlar/${conv.id}`);
    } else {
      showToast('Sohbet açılamadı', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-700 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-stone-700">Bu kullanıcı bulunamadı.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs font-bold text-emerald-700 hover:underline"
        >
          Geri dön
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 text-stone-900">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-3 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-stone-900">Kullanıcı Profili</h1>
        </div>

        {/* User Card */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-16 h-16 rounded-full object-cover border-2 border-emerald-700"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-stone-900">{user.fullName}</h2>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full">
                    {user.trustProfile?.level || 'Doğrulanmış Üye'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
                  <MapPin className="w-3 h-3 text-stone-400" />
                  <span>{user.district}, {user.city}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                  <Calendar className="w-3 h-3 text-stone-400" />
                  <span>{user.memberSince}'den beri üye</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartChat}
              className="p-2.5 rounded-xl bg-emerald-800 text-white hover:bg-emerald-900 transition-colors"
              title="Mesaj Gönder"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>

          {user.bio && (
            <p className="text-xs text-stone-600 leading-relaxed mt-3 pt-3 border-t border-stone-100">
              "{user.bio}"
            </p>
          )}

          {/* SVS Stats */}
          <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-stone-100 text-center">
            <div className="p-2 rounded-xl bg-stone-50">
              <span className="text-sm font-bold text-emerald-800">
                +{user.stats.totalCo2Prevented} kg
              </span>
              <span className="text-[10px] text-stone-500 block">CO₂e Engellendi</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50">
              <span className="text-sm font-bold text-stone-900">{user.stats.totalTrades}</span>
              <span className="text-[10px] text-stone-500 block">Tamamlanan Takas</span>
            </div>
            <div className="p-2 rounded-xl bg-stone-50">
              <span className="text-sm font-bold text-emerald-800">
                ★ {(user.trustProfile?.score ?? 4.8).toFixed(1)}
              </span>
              <span className="text-[10px] text-stone-500 block">Güven Skoru</span>
            </div>
          </div>

          {/* Kazanılan rozetler — küçük önizleme, tamamı /rozetlerim'de değil
              başka kullanıcının profilinde ayrı bir liste sayfası yok, bu
              yüzden burada doğrudan gösteriliyor */}
          {earnedBadges.length > 0 && (
            <div className="pt-3 mt-3 border-t border-stone-100">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-2">
                Rozetler ({earnedBadges.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {earnedBadges.map((badge) => (
                  <span
                    key={badge.id}
                    title={`${badge.title} — ${badge.description}`}
                    className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-sm shrink-0 cursor-default"
                  >
                    {badge.iconName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User's Active Listings */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            {user.fullName} Kullanıcısının İlanları ({userListings.length})
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {userListings.map((listing) => (
              <ProductCard key={listing.id} listing={listing} />
            ))}
          </div>
        </div>

        {/* Trust Profile Breakdown */}
        <TrustCard trustProfile={user.trustProfile} />
      </div>
    </div>
  );
};
