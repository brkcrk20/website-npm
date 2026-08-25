import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import { listingService } from '../../services/listingService';
import { ProductCard } from '../../components/common/ProductCard';
import { Listing } from '../../types';

// 14. FAVORİLER
export const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listingService.getFavorites().then((data) => {
      setFavorites(data);
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg text-ink">Favoriler</h1>
            <p className="text-xs text-ink-soft">{favorites.length} kayıtlı ilan</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sw-skeleton aspect-[4/3]" />
            ))}
          </div>
        ) : favorites.length === 0 ? (
          <div className="sw-card p-10 text-center">
            <span className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-dark flex items-center justify-center mx-auto">
              <Heart className="w-6 h-6" />
            </span>
            <h2 className="text-base text-ink mt-4">Henüz bir şey kaydetmedin</h2>
            <p className="text-xs text-ink-soft mt-1.5 max-w-xs mx-auto">
              Beğendiğin ilanları buraya kaydedip sonra teklif verebilirsin.
            </p>
            <button
              type="button"
              onClick={() => navigate('/kesfet')}
              className="sw-btn sw-btn-primary mt-4"
            >
              İlanları keşfet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {favorites.map((listing) => (
              <ProductCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
