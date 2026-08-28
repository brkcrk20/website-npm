import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { Listing } from '../../types';
import { SAFE_MEETING_POINTS } from '../../constants';
import {
  ArrowLeft,
  MapPin,
  Star,
  Navigation,
  Info,
  Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getCurrentCoords } from '../../services/geoLocationService';

// YAKINIMDAKİLER
//
// Bu ekran eskiden bir HARİTA taklidiydi ve gösterdiği hemen her şey
// uydurmaydı:
//
//   * Noktalı bir arka planın üstüne ilanlar SABİT yüzdelere (30/25,
//     72/60, 22/70…) yerleştiriliyordu. Kullanıcı bir harita gördüğünü
//     ve pinlerin konum anlattığını sanıyordu; anlatmıyorlardı.
//   * "3 Doğrulanmış Güvenli Buluşma Noktası" — hiçbir noktayı kimse
//     doğrulamamıştı; liste bileşenin içine elle yazılmıştı.
//   * "8 aktif takas planlandı" — böyle bir sayaç hiç var olmadı.
//   * 2/5/10 km düğmeleri: `activeRadius` state'e yazılıyor ama HİÇBİR
//     yerde okunmuyordu. Kullanıcı 2 km'ye basıyor, liste değişmiyordu.
//   * "Yakınımdaki Takaslar (N)" — N, Türkiye genelindeki ilan sayısıydı.
//
// Bir takas uygulamasında buluşma noktası tavsiyesi güvenlik tavsiyesidir;
// arkasında bir doğrulama yokken "doğrulanmış" demek, kullanıcının gerçek
// dünyada bir yabancıyla buluşacağı yeri uydurulmuş bir güvenceye
// dayandırmaktır. Bu yüzden ekran, elimizde GERÇEKTEN olan iki şeyin
// üstüne yeniden kuruldu: hesaplanmış mesafe ve şehir bazlı öneri listesi.
//
// Harita gerçekten gerektiğinde (gerçek tile'lar, gerçek koordinatlar)
// ayrı bir iş olarak eklenir; taklidi burada durmaz.

const RADIUS_OPTIONS = [2, 5, 10] as const;

export const NearbyMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentLocation, setCurrentLocation } = useApp();
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [activeRadius, setActiveRadius] = useState<number | null>(5);
  const [locationDenied, setLocationDenied] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);

  const hasCoords =
    typeof currentLocation.lat === 'number' && typeof currentLocation.lon === 'number';

  // "Yakınımdakiler" mesafenin tek anlamlı olduğu ekran; konumu burada bir
  // kez isteyip AppContext'e yazıyoruz. enrichListings mesafeyi buradan
  // okur — izin verilmezse mesafe HİÇ gösterilmez, liste yine çalışır ama
  // bunu kullanıcıya açıkça söylüyoruz (aşağıdaki uyarı kartı).
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      if (!cancelled) listingService.getAllListings().then(setAllListings);
    };

    if (currentLocation.lat === undefined) {
      getCurrentCoords()
        .then((position) => {
          if (cancelled) return;
          setCurrentLocation({
            ...currentLocation,
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setLocationDenied(true);
          load();
        });
      return () => {
        cancelled = true;
      };
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation.lat, currentLocation.lon]);

  const requestLocation = () => {
    setRequestingLocation(true);
    getCurrentCoords()
      .then((position) => {
        setLocationDenied(false);
        setCurrentLocation({
          ...currentLocation,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      })
      .catch(() => setLocationDenied(true))
      .finally(() => setRequestingLocation(false));
  };

  // Mesafeye göre sıralı ve yarıçapa göre süzülmüş liste. Mesafesi
  // BİLİNMEYEN ilan elenmez (listingService'teki kuralın aynısı) ama
  // sıralamada sona gider — "yakınımdakiler" başlığı altında mesafesi
  // bilinmeyen bir ilanı en üste koymak yanıltıcı olurdu.
  const nearbyListings = useMemo(() => {
    const withinRadius = allListings.filter((listing) => {
      if (activeRadius === null) return true;
      const distance = listing.location.distanceKm;
      if (distance === undefined) return true;
      return distance <= activeRadius;
    });

    return [...withinRadius].sort((a, b) => {
      const da = a.location.distanceKm;
      const db = b.location.distanceKm;
      if (da === undefined && db === undefined) return 0;
      if (da === undefined) return 1;
      if (db === undefined) return -1;
      return da - db;
    });
  }, [allListings, activeRadius]);

  // Öneri listesi src/constants/index.ts'te duruyordu ve hiçbir ekran
  // okumuyordu; bu ekran ise kendi içine yazdığı üç İstanbul noktasını
  // "doğrulanmış" diye gösteriyordu. Artık tek kaynak var ve şehre göre
  // süzülüyor — kullanıcının şehri yoksa İstanbul'a DÜŞMÜYOR.
  const meetingPoints = useMemo(
    () => SAFE_MEETING_POINTS.filter((point) => point.city === currentLocation.city),
    [currentLocation.city]
  );

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-3 space-y-4">
        {/* Başlık */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shadow-xs shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-ink font-display">Yakınımdakiler</h1>
            <p className="text-xs text-ink-soft truncate">
              {currentLocation.district ? `${currentLocation.district}, ` : ''}
              {currentLocation.city}
            </p>
          </div>
        </div>

        {/* Konum izni yoksa mesafe hesaplanamaz; bunu saklamak yerine
            söylüyoruz — yoksa "yakınımdakiler" başlığı yalan olur. */}
        {!hasCoords && (
          <div className="p-4 rounded-2xl bg-surface border border-line shadow-xs space-y-2.5">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-ink-soft shrink-0 mt-0.5" />
              <p className="text-xs text-ink-soft leading-relaxed">
                {locationDenied
                  ? 'Konum izni verilmediği için mesafe hesaplanamıyor. Aşağıdaki liste mesafeye göre sıralanmıyor.'
                  : 'Konumun alınıyor. Mesafe hesaplanana kadar liste sıralanmadan gösteriliyor.'}
              </p>
            </div>
            <button
              type="button"
              onClick={requestLocation}
              disabled={requestingLocation}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-dark hover:underline disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              {requestingLocation ? 'Konum isteniyor…' : 'Konumumu paylaş'}
            </button>
          </div>
        )}

        {/* Yarıçap: yalnızca mesafe gerçekten hesaplanabiliyorsa gösterilir.
            Çalışmayan bir filtre düğmesi göstermek, filtre olmamasından
            daha kötüdür. */}
        {hasCoords && (
          <div className="flex items-center gap-1 bg-surface p-1 rounded-xl border border-line text-xs font-semibold w-fit">
            {RADIUS_OPTIONS.map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => setActiveRadius(radius)}
                aria-pressed={activeRadius === radius}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  activeRadius === radius
                    ? 'bg-brand text-on-brand shadow-xs'
                    : 'text-ink-soft hover:bg-canvas'
                }`}
              >
                {radius} km
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActiveRadius(null)}
              aria-pressed={activeRadius === null}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                activeRadius === null
                  ? 'bg-brand text-on-brand shadow-xs'
                  : 'text-ink-soft hover:bg-canvas'
              }`}
            >
              Tümü
            </button>
          </div>
        )}

        {/* İlanlar */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-ink font-display">
            {hasCoords && activeRadius !== null
              ? `${activeRadius} km içinde ${nearbyListings.length} ilan`
              : `${nearbyListings.length} ilan`}
          </h2>

          {nearbyListings.length === 0 ? (
            <div className="p-6 rounded-2xl bg-surface border border-line text-center space-y-2">
              <MapPin className="w-6 h-6 text-ink-faint mx-auto" />
              <p className="text-xs text-ink-soft">
                {hasCoords && activeRadius !== null
                  ? `${activeRadius} km içinde ilan yok. Yarıçapı genişletmeyi dene.`
                  : 'Burada gösterilecek ilan yok.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {nearbyListings.slice(0, 20).map((listing) => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => navigate(`/ilan/${listing.slug || listing.id}`)}
                  className="w-full text-left p-3.5 bg-surface rounded-2xl border border-line shadow-xs flex items-center justify-between gap-3 hover:border-brand focus-visible:border-brand focus-visible:outline-hidden transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={listing.user.avatarUrl}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover border border-line shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-ink truncate">
                          {listing.user.fullName}
                        </span>
                        {/* Puan yoksa "4.8" uydurulmuyor; `★` metin glifi
                            yerine lucide ikonu (md. 149: yalnızca lucide). */}
                        {listing.user.reviewCount > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-brand-dark bg-brand-soft px-1.5 py-0.5 rounded shrink-0">
                            <Star className="w-2.5 h-2.5 fill-current" />
                            {listing.user.trustScore.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-ink-faint shrink-0">
                            Yeni üye
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-soft truncate mt-0.5 font-medium">
                        {listing.title}
                      </p>
                      <span className="text-[11px] text-ink-faint block">
                        {listing.location.district}
                        {listing.location.distanceKm !== undefined
                          ? ` • ${listing.location.distanceKm} km uzakta`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-canvas border border-line shrink-0">
                    <img
                      src={listing.images[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Önerilen buluşma noktaları — "doğrulanmış" DEĞİL. Swaloop bu
            yerleri denetlemiyor; bunlar kalabalık, aydınlık ve kamusal
            oldukları için öneriliyor. Aradaki fark, kullanıcının gerçek
            hayatta aldığı riski değiştirir. */}
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-bold text-ink font-display">Önerilen buluşma noktaları</h2>

          {meetingPoints.length === 0 ? (
            <div className="p-4 rounded-2xl bg-surface border border-line">
              <p className="text-xs text-ink-soft leading-relaxed">
                {currentLocation.city} için önerilen bir nokta henüz yok. Buluşmayı
                kalabalık, aydınlık ve kamusal bir yerde — iskele meydanı, metro
                çıkışı, alışveriş merkezi girişi gibi — gündüz saatinde yapın.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {meetingPoints.map((point) => (
                <div
                  key={point.id}
                  className="p-3.5 bg-surface rounded-2xl border border-line shadow-xs flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-brand-soft border border-brand-line text-brand-dark flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-ink">{point.name}</h3>
                    <p className="text-[11px] text-ink-soft mt-0.5 leading-snug">
                      {point.address}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint mt-1">
                      <Clock className="w-3 h-3" />
                      {point.hours}
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-ink-faint leading-relaxed px-1">
                Bu noktalar Swaloop tarafından denetlenmiyor; kalabalık ve kamusal
                oldukları için öneriliyor. Buluşmayı gündüz yapın, ürünü teslim
                etmeden önce inceleyin.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
