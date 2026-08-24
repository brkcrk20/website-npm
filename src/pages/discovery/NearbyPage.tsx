import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { ProductCard } from '../../components/common/ProductCard';
import { Listing } from '../../types';
import { getCachedLocation, requestDeviceLocation } from '../../utils/geo';
import { useApp } from '../../context/AppContext';
import { ArrowLeft, MapPin, Navigation, ShieldCheck } from 'lucide-react';
import { SAFE_MEETING_POINTS } from '../../constants';

const RADIUS_OPTIONS = [2, 5, 15, 50];

/**
 * Yakınımdakiler.
 *
 * Bu sayfa eskiden dekoratif bir "harita" idi: ilanların yeri, ekrana
 * elle yazılmış x/y yüzdeleriyle konumlandırılmış noktalardı ve mesafeler
 * uydurmaydı. Artık cihaz konumu (izin verilirse) ile ilanın gerçek
 * koordinatı arasındaki kuş uçuşu mesafe hesaplanıyor; izin yoksa bu
 * açıkça söyleniyor.
 */
export const NearbyPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [listings, setListings] = useState<Listing[]>([]);
  const [radius, setRadius] = useState(5);
  const [hasLocation, setHasLocation] = useState(!!getCachedLocation());
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const all = await listingService.getAllListings();
    setListings(all.filter((listing) => listing.userId !== currentUser.id));
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEnableLocation = async () => {
    const coords = await requestDeviceLocation();

    if (!coords) {
      showToast(
        'Konum alınamadı',
        'Tarayıcı konum iznini reddetti. İlanlar yine de listeleniyor.',
        'warning'
      );
      return;
    }

    setHasLocation(true);
    await load();
    showToast('Konum açıldı', 'İlanlar sana olan gerçek uzaklığa göre sıralandı.', 'success');
  };

  const withDistance = listings.filter((listing) => listing.location.distanceKm !== undefined);
  const withoutDistance = listings.filter((listing) => listing.location.distanceKm === undefined);

  const nearby = withDistance
    .filter((listing) => (listing.location.distanceKm ?? 0) <= radius)
    .sort((a, b) => (a.location.distanceKm ?? 0) - (b.location.distanceKm ?? 0));

  const meetingPoints = SAFE_MEETING_POINTS.filter(
    (point) => !currentUser.city || point.city === currentUser.city
  );

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-8 text-stone-900 dark:text-stone-100">
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
          <div>
            <h1 className="text-base font-bold">Yakınımdakiler</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Elden teslim edebileceğin mesafedeki takaslar
            </p>
          </div>
        </div>

        {!hasLocation && (
          <button
            type="button"
            onClick={handleEnableLocation}
            className="w-full p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-3 text-left hover:bg-emerald-100/70 transition-colors cursor-pointer"
          >
            <Navigation className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
                Konumunu aç
              </span>
              <span className="text-[11px] text-emerald-800/80 dark:text-emerald-300/70">
                Mesafeleri görebilmek için konum iznine ihtiyacımız var. Konumun cihazından
                dışarı çıkmaz.
              </span>
            </div>
          </button>
        )}

        {hasLocation && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRadius(option)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  radius === option
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300'
                }`}
              >
                {option} km
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="text-center text-xs text-stone-400 py-8">Yükleniyor...</p>}

        {!isLoading && hasLocation && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              {radius} km içinde {nearby.length} ilan
            </h2>

            {nearby.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 py-6 text-center">
                Bu mesafede ilan yok. Yarıçapı büyütmeyi dene.
              </p>
            ) : (
              <div className="space-y-2.5">
                {nearby.map((listing) => (
                  <ProductCard key={listing.id} listing={listing} variant="horizontal" />
                ))}
              </div>
            )}
          </section>
        )}

        {!isLoading && withoutDistance.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Konumu belirtilmemiş ilanlar ({withoutDistance.length})
            </h2>
            <div className="space-y-2.5">
              {withoutDistance.slice(0, 20).map((listing) => (
                <ProductCard key={listing.id} listing={listing} variant="horizontal" />
              ))}
            </div>
          </section>
        )}

        {meetingPoints.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Güvenli buluşma noktaları
            </h2>

            {meetingPoints.map((point) => (
              <div
                key={point.id}
                className="p-3.5 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 flex items-start gap-3"
              >
                <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-bold block">{point.name}</span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 block">
                    {point.address}
                  </span>
                  <span className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {point.district} · {point.hours}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};
