import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, MapPin } from 'lucide-react';
import { Listing } from '../../types';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { DEFAULT_LISTING_IMAGE } from '../../utils/placeholders';

// İLAN KARTI
//
// Kartın tek işi şu soruyu yanıtlamak: "Buna bakmak istiyor muyum?"
// (md. 16-17). Bu yüzden kartta YALNIZCA: fotoğraf, başlık, aradığı şey,
// konum, favori. CO₂/su/enerji/puan/rozet/uzun açıklama ve her türlü
// maddi değer ifadesi kartta yok.
//
// Fotoğraf oranı 4:3 (md. 71): ürünü göstermeye kare ya da dikeyden daha
// uygun.
//
// ── NEDEN <Link>, NEDEN "yayılan bağlantı" ──────────────────────────────
// Kart daha önce `<div onClick={navigate}>` idi. Üç sonucu vardı:
//
//   1. Klavyeyle erişilemiyordu — sekme tuşuyla ilana ulaşmanın yolu yoktu,
//      odak halkası da çizilmiyordu.
//   2. Gerçek bir bağlantı olmadığı için orta tıkla/yeni sekmede açma,
//      bağlantıyı kopyalama çalışmıyordu.
//   3. Arama motorları keşfet sayfasından ilan sayfalarına GEÇEMİYORDU.
//      robots.txt "ilan sayfaları organik trafiğin ana kapısı" diyor ama
//      o kapıya giden taranabilir tek bir <a> yoktu.
//
// Favori düğmesi kartın içinde ayrı bir eylem olduğu için bağlantının
// İÇİNE konamaz (iç içe tıklanabilir öğe geçersiz HTML'dir ve ekran
// okuyucuda tek bir karmaşa olarak duyurulur). Çözüm standart "yayılan
// bağlantı" deseni: başlıktaki <Link> `after:absolute after:inset-0` ile
// kartın tamamını kaplar, favori düğmesi ise üstünde ayrı bir katmanda
// durur.

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
  const { showToast } = useApp();
  const [isFavorite, setIsFavorite] = React.useState(!!listing.isFavorite);

  const handleToggleFavorite = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const next = await listingService.toggleFavorite(listing.id);

    // null = işlem yapılamadı (giriş yok / hata). Eskiden bu durum da `false`
    // dönüyordu ve kalp sessizce boşalıp "favorilerden çıkarıldı" deniyordu.
    if (next === null) {
      showToast('Favori güncellenemedi', 'Bunun için giriş yapmalısın.', 'error');
      return;
    }

    setIsFavorite(next);
    showToast(
      next ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı',
      listing.title,
      'info'
    );
  };

  const href = `/ilan/${listing.slug || listing.id}`;
  const image = listing.images?.[0] || DEFAULT_LISTING_IMAGE;

  const locationText =
    [listing.location.district, listing.location.city].filter(Boolean).join(', ') ||
    'Konum belirtilmedi';

  const favoriteButton = (extra: string) => (
    <button
      type="button"
      onClick={handleToggleFavorite}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      className={`relative z-10 flex items-center justify-center transition-colors cursor-pointer ${extra}`}
    >
      <Heart className={`w-4 h-4 ${isFavorite ? 'fill-brand text-brand' : ''}`} />
    </button>
  );

  if (variant === 'horizontal') {
    return (
      <div
        className={`sw-card relative p-2.5 flex items-center gap-3 hover:bg-canvas transition-colors focus-within:border-brand ${className}`}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          className="w-16 h-16 rounded-xl object-cover shrink-0"
        />
        <div className="min-w-0 flex-1">
          <Link
            to={href}
            className="block text-sm font-semibold text-ink truncate outline-hidden after:absolute after:inset-0 after:rounded-2xl"
          >
            {listing.title}
          </Link>
          <span className="block text-xs text-ink-soft truncate mt-0.5">{locationText}</span>
          {listing.lookingFor && (
            <span className="block text-[11px] text-brand-dark truncate mt-1">
              Arıyor: {listing.lookingFor}
            </span>
          )}
        </div>
        {favoriteButton('w-11 h-11 rounded-xl text-ink-faint hover:text-brand shrink-0')}
      </div>
    );
  }

  return (
    <div
      className={`sw-card relative overflow-hidden hover:border-brand-line focus-within:border-brand transition-colors ${className}`}
    >
      <div className="relative aspect-[4/3] bg-canvas">
        <img src={image} alt="" loading="lazy" className="w-full h-full object-cover" />
        {favoriteButton(
          'absolute top-2 right-2 w-9 h-9 rounded-full bg-surface/90 backdrop-blur text-ink-soft hover:text-brand'
        )}
      </div>

      <div className="p-3">
        <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2">
          <Link to={href} className="outline-hidden after:absolute after:inset-0">
            {listing.title}
          </Link>
        </h3>
        <p className="flex items-center gap-1 text-[11px] text-ink-soft mt-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{locationText}</span>
        </p>
      </div>
    </div>
  );
};
