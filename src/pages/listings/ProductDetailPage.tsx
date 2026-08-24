import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Share2,
  MapPin,
  Flag,
  MessageSquare,
  ArrowLeftRight,
  Search,
  Truck,
  Package,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { listingService } from '../../services/listingService';
import { messageService } from '../../services/messageService';
import { needService } from '../../services/needService';
import { reportService, REPORT_REASONS, ReportReason } from '../../services/reportService';
import { Listing } from '../../types';
import { CATEGORIES } from '../../constants';
import { useApp } from '../../context/AppContext';

// 10. İLAN DETAY
//
// Ekranın tek amacı: "bu takası isteyip istemediğine karar ver" (md. 145).
// Bu yüzden sayfada çevresel etki tabloları, puan kartları veya uzun
// istatistikler yok; karar için gerekenler var: fotoğraf, ne olduğu,
// karşılığında ne aradığı, konum, sahibinin güvenilirliği.

const CONDITION_LABELS: Record<Listing['condition'], string> = {
  zero: 'Sıfır',
  like_new: 'Sıfır gibi',
  very_good: 'Çok iyi',
  good: 'İyi',
  acceptable: 'Kullanılabilir',
};

const DELIVERY_LABELS: Record<string, { label: string; icon: typeof Truck }> = {
  in_person: { label: 'Yüz yüze', icon: Package },
  safe_point: { label: 'Güvenli buluşma noktası', icon: ShieldCheck },
  cargo: { label: 'Kargo', icon: Truck },
};

const SWIPE_THRESHOLD = 40;

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [listing, setListing] = useState<Listing | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [seekerCount, setSeekerCount] = useState(0);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | ''>('');
  const [isReporting, setIsReporting] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    setIsLoading(true);

    listingService.getListingById(id || '').then((data) => {
      setListing(data);
      setIsFavorite(!!data?.isFavorite);
      setIsLoading(false);

      if (data) {
        needService.getSeekersForListing(data).then((seekers) => setSeekerCount(seekers.length));
      } else {
        setSeekerCount(0);
      }
    });
  }, [id]);

  if (isLoading) {
    return (
      <div className="sw-screen">
        <div className="sw-container pt-4 space-y-3">
          <div className="sw-skeleton aspect-[4/3]" />
          <div className="sw-skeleton h-6 w-2/3" />
          <div className="sw-skeleton h-20" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="sw-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg text-ink">İlan bulunamadı</h1>
        <p className="text-sm text-ink-soft mt-1.5">
          Bu ilan yayından kaldırılmış ya da takas edilmiş olabilir.
        </p>
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="sw-btn sw-btn-primary mt-5"
        >
          Ana sayfaya dön
        </button>
      </div>
    );
  }

  const isOwnListing = listing.user.id === currentUser.id;
  const categoryName = CATEGORIES.find((c) => c.id === listing.categoryId)?.name ?? 'Diğer';

  const handleFavoriteToggle = async () => {
    const next = await listingService.toggleFavorite(listing.id);
    setIsFavorite(next);
    showToast(next ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı', listing.title, 'info');
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing.title,
        text: `Swaloop'ta takas ilanı: ${listing.title}`,
        url: window.location.href,
      });
      return;
    }

    navigator.clipboard.writeText(window.location.href);
    showToast('Bağlantı kopyalandı', 'İlan linki panoya kopyalandı.', 'success');
  };

  const goToImage = (delta: number) => {
    setActiveImageIndex((prev) => {
      const total = listing.images.length || 1;
      return (prev + delta + total) % total;
    });
  };

  const handleStartChat = async () => {
    const conversation = await messageService.getOrCreateConversationWithUser(
      currentUser.id,
      listing.user.id,
      listing.id
    );

    if (!conversation) {
      showToast('Sohbet açılamadı', 'Lütfen tekrar dene.', 'error');
      return;
    }

    navigate(`/mesajlar/${conversation.id}`);
  };

  const handleReportSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!reportReason) return;

    setIsReporting(true);
    const ok = await reportService.createReport({
      reporterId: currentUser.id,
      targetType: 'listing',
      targetId: listing.id,
      targetTitle: listing.title,
      reason: reportReason,
    });
    setIsReporting(false);

    if (!ok) {
      showToast('Şikayet gönderilemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    setShowReportModal(false);
    setReportReason('');
    showToast('Şikayetin alındı', 'Moderatörlerimiz ilanı inceleyecek.', 'info');
  };

  return (
    <div className="sw-screen pb-32">
      <div className="sw-container pt-3">
        {/* Fotoğraf */}
        <div
          className="relative rounded-2xl overflow-hidden bg-surface border border-line aspect-[4/3]"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
            touchDeltaX.current = 0;
          }}
          onTouchMove={(e) => {
            if (touchStartX.current === null) return;
            touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
          }}
          onTouchEnd={() => {
            if (touchDeltaX.current > SWIPE_THRESHOLD) goToImage(-1);
            else if (touchDeltaX.current < -SWIPE_THRESHOLD) goToImage(1);
            touchStartX.current = null;
            touchDeltaX.current = 0;
          }}
        >
          <img
            src={listing.images[activeImageIndex]}
            alt={listing.title}
            className="w-full h-full object-cover"
          />

          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-ink cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Paylaş"
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-ink cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleFavoriteToggle}
              aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-ink cursor-pointer"
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-brand text-brand' : ''}`} />
            </button>
          </div>

          {listing.images.length > 1 && (
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5">
              {listing.images.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`${index + 1}. fotoğraf`}
                  onClick={() => setActiveImageIndex(index)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    index === activeImageIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Başlık */}
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="sw-badge">{categoryName}</span>
            <span className="sw-badge">{CONDITION_LABELS[listing.condition]}</span>
          </div>

          <h1 className="text-xl text-ink mt-2.5">{listing.title}</h1>

          <p className="flex items-center gap-1.5 text-xs text-ink-soft mt-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {[listing.location.district, listing.location.city].filter(Boolean).join(', ')}
            {listing.location.distanceKm > 0 && ` · ${listing.location.distanceKm} km`}
          </p>
        </div>

        {/* Karşılığında ne arıyor */}
        <div className="sw-card p-4 mt-4 bg-brand-soft border-brand-line">
          <div className="flex items-start gap-2.5">
            <ArrowLeftRight className="w-4 h-4 text-brand-dark shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-dark">Karşılığında arıyor</p>
              <p className="text-sm text-ink mt-1">{listing.lookingFor || 'Belirtilmemiş'}</p>
              {listing.lookingForCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {listing.lookingForCategories.map((catId) => (
                    <span key={catId} className="sw-badge bg-white">
                      {CATEGORIES.find((c) => c.id === catId)?.name ?? catId}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bu ürünü arayanlar (md. 77) */}
        {seekerCount > 0 && (
          <button
            type="button"
            onClick={() => navigate('/aradiklarim')}
            className="sw-card w-full p-3 mt-3 flex items-center gap-2.5 text-left hover:bg-canvas transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4 text-brand shrink-0" />
            <span className="text-xs font-semibold text-ink flex-1">
              Bu ürünü arayan {seekerCount} kişi var
            </span>
            <ChevronRight className="w-4 h-4 text-ink-faint" />
          </button>
        )}

        {/* Açıklama */}
        {listing.description && (
          <section className="mt-5">
            <h2 className="text-sm text-ink mb-1.5">Açıklama</h2>
            <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </section>
        )}

        {/* Takas tercihleri */}
        <section className="mt-5">
          <h2 className="text-sm text-ink mb-2">Takas tercihleri</h2>
          <div className="flex flex-wrap gap-2">
            {listing.deliveryOptions.map((option) => {
              const meta = DELIVERY_LABELS[option];
              if (!meta) return null;
              const Icon = meta.icon;

              return (
                <span key={option} className="sw-badge">
                  <Icon className="w-3 h-3" />
                  {meta.label}
                </span>
              );
            })}
          </div>
        </section>

        {/* İlan sahibi */}
        <section className="mt-5">
          <h2 className="text-sm text-ink mb-2">İlan sahibi</h2>
          <button
            type="button"
            onClick={() => navigate(`/profil/${listing.user.id}`)}
            className="sw-card w-full p-3 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
          >
            <img
              src={listing.user.avatarUrl}
              alt=""
              className="w-11 h-11 rounded-full object-cover shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink truncate">
                {listing.user.fullName}
              </span>
              <span className="flex items-center gap-1 text-xs text-ink-soft mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand" />
                {listing.user.trustScore.toFixed(1)} güven puanı
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
          </button>
        </section>

        {/* Güvenlik + şikayet */}
        <div className="flex items-center justify-between mt-5">
          <p className="text-[11px] text-ink-faint max-w-[70%]">
            Swaloop takaslarında para gönderilmez. Ödeme bilgilerini paylaşma.
          </p>
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="text-[11px] font-semibold text-ink-soft hover:text-danger flex items-center gap-1 cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" />
            Şikayet et
          </button>
        </div>
      </div>

      {/* Alt eylem çubuğu */}
      {!isOwnListing && (
        <div className="fixed bottom-16 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line">
          <div className="sw-container py-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartChat}
              className="sw-btn sw-btn-ghost flex-1"
            >
              <MessageSquare className="w-4 h-4" />
              Mesaj
            </button>
            <button
              type="button"
              onClick={() => navigate(`/teklif-ver?targetId=${listing.id}`)}
              className="sw-btn sw-btn-primary flex-[2]"
            >
              Takas Teklifi Yap
            </button>
          </div>
        </div>
      )}

      {isOwnListing && (
        <div className="fixed bottom-16 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line">
          <div className="sw-container py-3">
            <button
              type="button"
              onClick={() => navigate('/ilanlarim')}
              className="sw-btn sw-btn-ghost sw-btn-block"
            >
              Bu senin ilanın · İlanlarımı yönet
            </button>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div>
              <h3 className="text-base text-ink">İlanı şikayet et</h3>
              <p className="text-xs text-ink-soft mt-1">
                Kurallara aykırı ya da yanıltıcı bir durum mu var?
              </p>
            </div>

            <form onSubmit={handleReportSubmit} className="space-y-3">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as ReportReason)}
                required
                className="sw-input"
                aria-label="Şikayet nedeni"
              >
                <option value="">Şikayet nedeni seç</option>
                {REPORT_REASONS.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.label}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="sw-btn sw-btn-ghost"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={!reportReason || isReporting}
                  className="sw-btn sw-btn-primary"
                  style={{ backgroundColor: 'var(--color-danger)' }}
                >
                  {isReporting ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
