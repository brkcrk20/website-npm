import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { Listing } from '../../types';
import { CATEGORIES, CONDITION_LABELS, PLACEHOLDER_IMAGE } from '../../constants';
import { formatDistance } from '../../utils/geo';
import {
  ArrowLeft,
  Heart,
  Info,
  Leaf,
  Loader2,
  MapPin,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

const SWIPE_THRESHOLD = 110;

interface Compatibility {
  score: number;
  reasons: string[];
}

/**
 * Takas eşleştirme (kaydırmalı akış).
 *
 * ÖNEMLİ FARK: Bu ekran artık uydurma bir "eşleşme" kutlaması yapmıyor.
 * Eskiden her sağa kaydırmada rastgele bir "%85 uyum" hesaplanıp "Eşleştin!"
 * ekranı açılıyordu — karşı tarafın haberi bile olmuyordu, hiçbir şey de
 * kaydedilmiyordu.
 *
 * Yeni davranış dürüst ve işe yarar:
 *  - sağa kaydırma = ilanı GERÇEKTEN favorilere ekler,
 *  - uyum yüzdesi, karşılaştırılabilir gerçek verilerden hesaplanır
 *    (karşı tarafın aradığı ürün senin ilanlarınla örtüşüyor mu, senin
 *    aradığın kategoriler onun ilanıyla örtüşüyor mu, mesafe, güven puanı),
 *  - ve her kartta doğrudan "teklif ver" adımına geçebilirsin.
 */
export const SwipeMatchPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast, refreshFavoritesCount } = useApp();

  const [deck, setDeck] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<{ listing: Listing; liked: boolean }[]>([]);

  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const [all, mine] = await Promise.all([
        listingService.getAllListings(),
        listingService.getTradableUserListings(currentUser.id),
      ]);

      if (cancelled) return;

      setDeck(all.filter((listing) => listing.userId !== currentUser.id));
      setMyListings(mine);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  const filtered = useMemo(
    () =>
      deck.filter(
        (listing) => selectedCategory === 'all' || listing.categoryId === selectedCategory
      ),
    [deck, selectedCategory]
  );

  const currentListing = filtered[currentIndex];

  /**
   * Gerçek verilere dayanan uyum hesabı. Her puanın gerekçesi kullanıcıya
   * da gösteriliyor — "neden %80?" sorusunun cevabı ekranda.
   */
  const compatibility = useCallback(
    (target: Listing): Compatibility => {
      let score = 40;
      const reasons: string[] = [];

      const wanted = target.lookingFor.toLowerCase();

      // 1) Karşı taraf tam olarak senin elindeki bir şeyi arıyor mu?
      const matchingListing = myListings.find((listing) => {
        const title = listing.title.toLowerCase();
        const categoryName = (
          CATEGORIES.find((c) => c.id === listing.categoryId)?.name ?? ''
        ).toLowerCase();

        return (
          (!!wanted && (wanted.includes(title) || title.includes(wanted))) ||
          (!!categoryName && wanted.includes(categoryName))
        );
      });

      if (matchingListing) {
        score += 30;
        reasons.push(`Aradığı şey senin "${matchingListing.title}" ilanınla örtüşüyor`);
      }

      // 2) Sen bu kategoriyi arıyor musun?
      if (currentUser.wantedCategories?.includes(target.categoryId)) {
        score += 15;
        reasons.push('Aradığın kategorilerden biri');
      }

      // 3) Yakınlık
      const distance = target.location.distanceKm;
      if (distance !== undefined && distance <= 10) {
        score += 10;
        reasons.push(`Sana ${formatDistance(distance)} uzaklıkta`);
      } else if (target.location.city && target.location.city === currentUser.city) {
        score += 8;
        reasons.push('Aynı şehirde');
      }

      // 4) Güven
      if (target.user.trustScore >= 4.5) {
        score += 5;
        reasons.push('Yüksek güven puanlı kullanıcı');
      }

      return { score: Math.min(score, 99), reasons };
    },
    [myListings, currentUser.wantedCategories, currentUser.city]
  );

  const currentMatch = currentListing ? compatibility(currentListing) : null;

  const advance = () => {
    setDragOffset({ x: 0, y: 0 });
    setCurrentIndex((prev) => prev + 1);
  };

  const handleSwipe = async (liked: boolean) => {
    if (!currentListing) return;

    setHistory((prev) => [...prev, { listing: currentListing, liked }]);

    if (liked) {
      // Beğeni gerçekten kaydedilir: ilan favorilere eklenir.
      const isFavorite = await listingService.toggleFavorite(currentListing.id);
      refreshFavoritesCount();

      showToast(
        isFavorite ? 'Favorilerine eklendi' : 'Zaten favorilerindeydi',
        `${currentListing.title} · teklif vermeye hazır`,
        'success'
      );
    }

    advance();
  };

  const handleUndo = () => {
    if (!history.length || currentIndex === 0) {
      showToast('Geri alınacak kart yok', undefined, 'info');
      return;
    }

    setHistory((prev) => prev.slice(0, -1));
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setDragOffset({ x: 0, y: 0 });
  };

  const handleDragStart = (event: React.TouchEvent | React.MouseEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    startPos.current = { x: clientX, y: clientY };
  };

  const handleDragMove = (event: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    setDragOffset({
      x: clientX - startPos.current.x,
      y: clientY - startPos.current.y,
    });
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (Math.abs(dragOffset.x) > SWIPE_THRESHOLD) {
      handleSwipe(dragOffset.x > 0);
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const rotation = dragOffset.x / 18;
  const likeOpacity = Math.min(1, Math.max(0, dragOffset.x / SWIPE_THRESHOLD));
  const passOpacity = Math.min(1, Math.max(0, -dragOffset.x / SWIPE_THRESHOLD));

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 flex items-center justify-center cursor-pointer"
            aria-label="Geri"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <h1 className="text-base font-bold">Takas Eşleştir</h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Sağa kaydır: favorine ekle · Sola: geç
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center cursor-pointer transition-colors ${
              showFilters || selectedCategory !== 'all'
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
            }`}
            aria-label="Filtreler"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setCurrentIndex(0);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800'
              }`}
            >
              Tümü
            </button>
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  setCurrentIndex(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer ${
                  selectedCategory === category.id
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}

        {!isLoading && myListings.length === 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              Teklif verebilmek için önce kendi ilanını yayınlaman gerekiyor. Şimdilik
              beğendiklerini favorilerine ekleyebilirsin.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="py-24 flex justify-center">
            <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
          </div>
        )}

        {/* Kart destesi */}
        {!isLoading && currentListing && (
          <>
            <div
              className="relative select-none touch-none"
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
            >
              <article
                className="rounded-3xl overflow-hidden bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-lg"
                style={{
                  transform: `translate(${dragOffset.x}px, ${dragOffset.y * 0.25}px) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 200ms ease-out',
                }}
              >
                <div className="relative aspect-4/5 bg-stone-200 dark:bg-stone-800">
                  <img
                    src={currentListing.images[0] || PLACEHOLDER_IMAGE}
                    alt={currentListing.title}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />

                  <span
                    className="absolute top-4 left-4 px-3 py-1.5 rounded-xl border-2 border-emerald-500 text-emerald-400 font-black text-lg rotate-[-12deg] bg-stone-950/40"
                    style={{ opacity: likeOpacity }}
                  >
                    BEĞENDİM
                  </span>
                  <span
                    className="absolute top-4 right-4 px-3 py-1.5 rounded-xl border-2 border-rose-500 text-rose-400 font-black text-lg rotate-[12deg] bg-stone-950/40"
                    style={{ opacity: passOpacity }}
                  >
                    GEÇ
                  </span>

                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-stone-950/90 to-transparent text-white">
                    <div className="flex items-center gap-2 text-[11px] mb-1">
                      <span className="px-2 py-0.5 rounded-md bg-white/20 font-semibold">
                        {CONDITION_LABELS[currentListing.condition] ?? currentListing.condition}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {currentListing.location.district || currentListing.location.city}
                        {currentListing.location.distanceKm !== undefined &&
                          ` · ${formatDistance(currentListing.location.distanceKm)}`}
                      </span>
                    </div>

                    <h2 className="text-lg font-black leading-tight">{currentListing.title}</h2>

                    <p className="text-xs text-white/80 mt-1 line-clamp-1">
                      Karşılığında arıyor: {currentListing.lookingFor || '—'}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={currentListing.user.avatarUrl}
                        alt={currentListing.user.fullName}
                        className="w-7 h-7 rounded-full object-cover bg-stone-100 shrink-0"
                      />
                      <span className="text-xs font-bold truncate">
                        {currentListing.user.fullName}
                      </span>
                      <span className="flex items-center gap-0.5 text-[11px] text-amber-600 font-semibold shrink-0">
                        <Star className="w-3 h-3 fill-current" />
                        {currentListing.user.trustScore.toFixed(1)}
                      </span>
                    </div>

                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                      <Leaf className="w-3.5 h-3.5" />+{currentListing.estimatedImpact.co2eKg} kg
                    </span>
                  </div>

                  {currentMatch && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Uyum: %{currentMatch.score}
                        </span>
                      </div>
                      {currentMatch.reasons.length > 0 ? (
                        <ul className="space-y-0.5">
                          {currentMatch.reasons.map((reason) => (
                            <li
                              key={reason}
                              className="text-[10px] text-emerald-800/90 dark:text-emerald-300/80"
                            >
                              · {reason}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[10px] text-emerald-800/80 dark:text-emerald-300/70">
                          Ortak bir sinyal bulunamadı — yine de teklif verebilirsin.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </article>
            </div>

            {/* Eylemler */}
            <div className="flex items-center justify-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => handleSwipe(false)}
                className="w-14 h-14 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-rose-500 flex items-center justify-center shadow-sm hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                aria-label="Geç"
              >
                <X className="w-6 h-6 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={handleUndo}
                className="w-11 h-11 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                aria-label="Geri al"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleSwipe(true)}
                className="w-14 h-14 rounded-full bg-emerald-700 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform cursor-pointer"
                aria-label="Beğen"
              >
                <Heart className="w-6 h-6 fill-current" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/teklif-ver?targetId=${currentListing.id}`)}
              disabled={!myListings.length}
              className="w-full py-3.5 rounded-2xl bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Repeat className="w-4 h-4" />
              Bu ilana takas teklifi ver
            </button>

            <p className="text-center text-[11px] text-stone-400">
              {currentIndex + 1} / {filtered.length}
            </p>
          </>
        )}

        {/* Deste bitti */}
        {!isLoading && !currentListing && (
          <div className="text-center py-16 space-y-3">
            <Sparkles className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto" />
            <p className="text-sm font-bold">
              {filtered.length ? 'Bu kategorideki tüm ilanları gördün' : 'Gösterilecek ilan yok'}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 px-8">
              Beğendiklerin favorilerinde seni bekliyor. Yeni ilanlar geldikçe burası dolar.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCurrentIndex(0)}
                className="px-4 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-xs font-bold cursor-pointer"
              >
                Baştan başla
              </button>
              <button
                type="button"
                onClick={() => navigate('/favoriler')}
                className="px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Favorilerime git
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
