import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Listing } from '../../types';
import { Heart, MapPin, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { CONDITION_LABELS, PLACEHOLDER_IMAGE } from '../../constants';
import { formatDistance } from '../../utils/geo';

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
  const { showToast, isAuthenticated, refreshFavoritesCount } = useApp();

  // Favori durumu iyimser güncellenir: kalp anında dolar, istek arkada gider.
  const [isFavorite, setIsFavorite] = useState(!!listing.isFavorite);
  const [isBusy, setIsBusy] = useState(false);

  const handleToggleFavorite = async (event: React.MouseEvent) => {
    event.stopPropagation();

    if (!isAuthenticated) {
      navigate('/giris');
      return;
    }

    if (isBusy) return;

    const next = !isFavorite;
    setIsFavorite(next);
    setIsBusy(true);

    const actual = await listingService.toggleFavorite(listing.id);
    setIsBusy(false);
    setIsFavorite(actual);
    refreshFavoritesCount();

    showToast(
      actual ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı',
      listing.title,
      'info'
    );
  };

  const distance = formatDistance(listing.location.distanceKm);
  const conditionLabel = CONDITION_LABELS[listing.condition] ?? listing.condition;

  const favoriteButton = (size: 'sm' | 'md') => (
    <button
      type="button"
      onClick={handleToggleFavorite}
      aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      className={`absolute ${
        size === 'sm' ? 'top-1.5 right-1.5 w-7 h-7' : 'top-2.5 right-2.5 w-8 h-8'
      } rounded-full flex items-center justify-center backdrop-blur-md transition-colors cursor-pointer ${
        isFavorite
          ? 'bg-rose-500 text-white'
          : 'bg-white/85 dark:bg-stone-900/80 text-stone-700 dark:text-stone-200 hover:text-rose-500'
      }`}
    >
      <Heart className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${isFavorite ? 'fill-current' : ''}`} />
    </button>
  );

  if (variant === 'horizontal') {
    return (
      <article
        onClick={() => navigate(`/ilan/${listing.id}`)}
        className={`group bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 overflow-hidden hover:border-emerald-500/40 transition-colors cursor-pointer flex p-3 gap-3 ${className}`}
      >
        <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800 shrink-0">
          <img
            src={listing.images[0] || PLACEHOLDER_IMAGE}
            alt={listing.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {favoriteButton('sm')}
        </div>

        <div className="flex flex-col justify-between flex-1 min-w-0">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400 mb-1">
              <span className="px-1.5 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 font-medium">
                {conditionLabel}
              </span>
              <span className="truncate">{listing.location.district}</span>
              {distance && (
                <>
                  <span>·</span>
                  <span className="shrink-0">{distance}</span>
                </>
              )}
            </div>

            <h3 className="text-sm font-bold truncate group-hover:text-emerald-800 dark:group-hover:text-emerald-400 transition-colors">
              {listing.title}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">
              <span className="text-stone-400">Karşılığında:</span> {listing.lookingFor || '—'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800 mt-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              +{listing.estimatedImpact.co2eKg} kg CO₂e
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
              {listing.user.trustScore.toFixed(1)}
            </span>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => navigate(`/ilan/${listing.id}`)}
      className={`group bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 overflow-hidden hover:border-emerald-500/50 transition-colors cursor-pointer flex flex-col ${className}`}
    >
      <div className="relative aspect-4/3 w-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
        <img
          src={listing.images[0] || PLACEHOLDER_IMAGE}
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {favoriteButton('md')}
        <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-md bg-stone-900/75 backdrop-blur-sm text-white text-[10px] font-semibold">
          {conditionLabel}
        </span>
      </div>

      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mb-1 gap-1">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{listing.location.district || 'Konum yok'}</span>
              {distance && <span className="shrink-0">· {distance}</span>}
            </span>
            <span className="flex items-center gap-0.5 text-amber-500 font-semibold shrink-0">
              <Star className="w-3 h-3 fill-current" />
              {listing.user.trustScore.toFixed(1)}
            </span>
          </div>

          <h3 className="text-sm font-bold group-hover:text-emerald-800 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
            {listing.title}
          </h3>

          <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1 mt-1">
            <span className="text-stone-400">Karşılığında:</span> {listing.lookingFor || '—'}
          </p>
        </div>

        <div className="mt-2.5 pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold">
            +{listing.estimatedImpact.co2eKg} kg CO₂e
          </span>
          <span className="text-[11px] text-stone-400 font-medium group-hover:text-emerald-700 transition-colors">
            İncele →
          </span>
        </div>
      </div>
    </article>
  );
};
