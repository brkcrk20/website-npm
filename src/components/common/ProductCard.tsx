import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MapPin } from 'lucide-react';
import { Listing } from '../../types';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';

// İLAN KARTI
//
// Kartın tek işi şu soruyu yanıtlamak: "Buna bakmak istiyor muyum?"
// (md. 16-17). Bu yüzden kartta YALNIZCA: fotoğraf, başlık, aradığı şey,
// konum, favori. CO₂/su/enerji/puan/rozet/uzun açıklama ve her türlü
// maddi değer ifadesi kartta yok.
//
// Fotoğraf oranı 4:3 (md. 71): ürünü göstermeye kare ya da dikeyden daha
// uygun.

interface ProductCardProps {
  listing: Listing;
  className?: string;
  variant?: 'grid' | 'horizontal';
}

export const ProductCard: React.FC<ProductCardProps> = ({
  listing,
  className = '',
  variant = 'grid',
}) => {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const [isFavorite, setIsFavorite] = React.useState(!!listing.isFavorite);

  const handleToggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();

    const next = await listingService.toggleFavorite(listing.id);
    setIsFavorite(next);
    showToast(
      next ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı',
      listing.title,
      'info'
    );
  };

  const open = () => navigate(`/ilan/${listing.slug || listing.id}`);

  const locationText =
    [listing.location.district, listing.location.city].filter(Boolean).join(', ') ||
    'Konum belirtilmedi';

  if (variant === 'horizontal') {
    return (
      <button
        type="button"
        onClick={open}
        className={`sw-card w-full p-2.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer ${className}`}
      >
        <img
          src={listing.images[0]}
          alt=""
          loading="lazy"
          className="w-16 h-16 rounded-xl object-cover shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink truncate">{listing.title}</span>
          <span className="block text-xs text-ink-soft truncate mt-0.5">{locationText}</span>
          {listing.lookingFor && (
            <span className="block text-[11px] text-brand-dark truncate mt-1">
              Arıyor: {listing.lookingFor}
            </span>
          )}
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          onClick={handleToggleFavorite}
          onKeyDown={(e) => e.key === 'Enter' && handleToggleFavorite(e as never)}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-ink-faint hover:text-brand shrink-0"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-brand text-brand' : ''}`} />
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={open}
      className={`sw-card overflow-hidden cursor-pointer hover:border-brand-line transition-colors ${className}`}
    >
      <div className="relative aspect-[4/3] bg-canvas">
        <img
          src={listing.images[0]}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
        />
        <button
          type="button"
          onClick={handleToggleFavorite}
          aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center text-ink-soft hover:text-brand transition-colors cursor-pointer"
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-brand text-brand' : ''}`} />
        </button>
      </div>

      <div className="p-3">
        <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2">
          {listing.title}
        </h3>
        <p className="flex items-center gap-1 text-[11px] text-ink-soft mt-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{locationText}</span>
        </p>
      </div>
    </div>
  );
};
