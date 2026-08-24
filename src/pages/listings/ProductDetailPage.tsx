import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { messageService } from '../../services/messageService';
import { ImpactCard } from '../../components/common/ImpactCard';
import { ReportModal } from '../../components/common/ReportModal';
import { PageLoader } from '../../components/layout/PageLoader';
import { CONDITION_LABELS, DELIVERY_LABELS, LISTING_STATUS_LABELS, PLACEHOLDER_IMAGE } from '../../constants';
import { Listing } from '../../types';
import { formatDistance } from '../../utils/geo';
import { useApp } from '../../context/AppContext';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Edit3,
  Eye,
  Heart,
  MapPin,
  MessageSquare,
  Repeat,
  Share2,
  Star,
} from 'lucide-react';

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, showToast, refreshFavoritesCount } = useApp();

  const [listing, setListing] = useState<Listing | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!id) return;

      setIsLoading(true);
      const data = await listingService.getListingById(id);

      if (cancelled) return;

      setListing(data);
      setIsFavorite(!!data?.isFavorite);
      setIsLoading(false);

      // Görüntülenme sayacı: kendi ilanını açman sayılmaz.
      if (data && data.userId !== currentUser.id) {
        listingService.incrementViewCount(data.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, currentUser.id]);

  if (isLoading) return <PageLoader />;

  if (!listing) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center gap-3">
        <h2 className="text-base font-bold">İlan bulunamadı</h2>
        <p className="text-xs text-stone-500">Bu ilan yayından kaldırılmış olabilir.</p>
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

  const isOwner = listing.userId === currentUser.id;
  const distance = formatDistance(listing.location.distanceKm);

  const handleFavoriteToggle = async () => {
    if (!isAuthenticated) {
      navigate('/giris');
      return;
    }

    const next = !isFavorite;
    setIsFavorite(next);
    const actual = await listingService.toggleFavorite(listing.id);
    setIsFavorite(actual);
    refreshFavoritesCount();
    showToast(actual ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', listing.title, 'info');
  };

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, text: `Swaloop'ta takas: ${listing.title}`, url });
        return;
      } catch {
        // Paylaşım iptal edildi.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('Bağlantı kopyalandı', 'İlan linki panoya kopyalandı.', 'success');
    } catch {
      showToast('Kopyalanamadı', url, 'warning');
    }
  };

  const handleStartChat = async () => {
    if (!isAuthenticated) {
      navigate('/giris');
      return;
    }

    setIsStartingChat(true);
    const conversation = await messageService.getOrCreateConversationWithUser(
      currentUser.id,
      listing.user.id,
      listing.id
    );
    setIsStartingChat(false);

    if (conversation) {
      navigate(`/mesajlar/${conversation.id}`);
    } else {
      showToast('Sohbet açılamadı', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      navigate('/giris');
      return;
    }
    navigate(`/teklif-ver?targetId=${listing.id}`);
  };

  const isTradable = listing.status === 'active';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-28 text-stone-900 dark:text-stone-100">
      <div className="sticky top-[52px] z-30 bg-stone-50/90 dark:bg-stone-950/90 backdrop-blur-md px-4 py-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              aria-label="Paylaş"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {isOwner ? (
              <button
                type="button"
                onClick={() => navigate(`/ilan/${listing.id}/duzenle`)}
                className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center cursor-pointer"
                aria-label="Düzenle"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFavoriteToggle}
                className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-colors cursor-pointer ${
                  isFavorite
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-600'
                    : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
                }`}
                aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              >
                <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Galeri */}
        <div className="space-y-2">
          <div className="relative aspect-4/3 w-full rounded-3xl overflow-hidden bg-stone-200 dark:bg-stone-800">
            <img
              src={listing.images[activeImageIndex] || PLACEHOLDER_IMAGE}
              alt={listing.title}
              className="w-full h-full object-cover"
            />
            {listing.images.length > 1 && (
              <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-stone-950/70 text-white text-xs font-semibold">
                {activeImageIndex + 1} / {listing.images.length}
              </span>
            )}
            {!isTradable && (
              <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-stone-950/80 text-white text-[11px] font-bold">
                {LISTING_STATUS_LABELS[listing.status] ?? listing.status}
              </span>
            )}
          </div>

          {listing.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {listing.images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all cursor-pointer ${
                    activeImageIndex === index ? 'border-emerald-600' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Başlık & bilgiler */}
        <section className="bg-white dark:bg-stone-900 rounded-3xl p-4 border border-stone-200/90 dark:border-stone-800 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-xs font-semibold">
              {CONDITION_LABELS[listing.condition] ?? listing.condition}
            </span>
            <span className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400 font-medium">
              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
              {[listing.location.district, listing.location.city].filter(Boolean).join(', ') ||
                'Konum belirtilmemiş'}
              {distance && ` · ${distance}`}
            </span>
          </div>

          <h1 className="text-xl font-bold">{listing.title}</h1>

          <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2.5">
            <Repeat className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Karşılığında aradığı
              </span>
              <p className="text-xs font-semibold mt-0.5 text-emerald-950 dark:text-emerald-100">
                {listing.lookingFor || 'Belirtilmemiş'}
              </p>
            </div>
          </div>

          {listing.description && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">
                Açıklama
              </h2>
              <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-line">
                {listing.description}
              </p>
            </div>
          )}

          <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex flex-wrap gap-2">
            {listing.deliveryOptions.map((option) => (
              <span
                key={option}
                className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-medium flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {DELIVERY_LABELS[option] ?? option}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-stone-400 pt-1">
            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> {listing.viewCount} görüntülenme
            </span>
            <span className="flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" /> {listing.favoriteCount} favori
            </span>
          </div>
        </section>

        <ImpactCard impact={listing.estimatedImpact} variant="detailed" />

        {/* İlan sahibi */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">İlan sahibi</h2>

          <button
            type="button"
            onClick={() => navigate(`/profil/${listing.user.id}`)}
            className="w-full p-4 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 hover:border-emerald-500/50 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={listing.user.avatarUrl}
                alt={listing.user.fullName}
                className="w-12 h-12 rounded-full object-cover border border-stone-200 dark:border-stone-700 bg-stone-100 shrink-0"
                loading="lazy"
              />
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{listing.user.fullName}</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-500 fill-current" />
                  {listing.user.trustScore.toFixed(1)}
                  {listing.user.city && ` · ${listing.user.city}`}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </button>
        </section>

        {!isOwner && (
          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => (isAuthenticated ? setShowReport(true) : navigate('/giris'))}
              className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Bu ilanı şikayet et
            </button>
          </div>
        )}
      </div>

      {/* Alt eylem çubuğu */}
      {!isOwner && (
        <div className="fixed bottom-0 left-0 right-0 z-30 max-w-lg mx-auto bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200/90 dark:border-stone-800 p-3 safe-area-bottom">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleStartChat}
              disabled={isStartingChat}
              className="flex-1 py-3.5 rounded-2xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <MessageSquare className="w-4 h-4" />
              Mesaj
            </button>

            <button
              type="button"
              onClick={handleMakeOffer}
              disabled={!isTradable}
              className="flex-[1.4] py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Repeat className="w-4 h-4 stroke-[2.5]" />
              {isTradable ? 'Takas teklifi ver' : 'Takasa kapalı'}
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="fixed bottom-0 left-0 right-0 z-30 max-w-lg mx-auto bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200/90 dark:border-stone-800 p-3 safe-area-bottom">
          <button
            type="button"
            onClick={() => navigate(`/ilan/${listing.id}/duzenle`)}
            className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
            İlanı düzenle
          </button>
        </div>
      )}

      {showReport && (
        <ReportModal
          targetType="listing"
          targetId={listing.id}
          title={listing.title}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
};
