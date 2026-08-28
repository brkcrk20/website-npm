import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getCurrentCoords,
  reverseGeocode,
  searchTurkeyAddress,
  ResolvedLocation,
  GeolocationFailureReason,
} from '../../services/geoLocationService';
import { MapPin, ChevronDown, LocateFixed, Loader2, Search, X } from 'lucide-react';

const GEO_ERROR_MESSAGES: Record<GeolocationFailureReason, string> = {
  denied: 'Konum izni reddedildi. Tarayıcı ayarlarından izin verip tekrar deneyebilirsin.',
  unavailable: 'Konumun tespit edilemedi. Lütfen adresini yazarak seç.',
  timeout: 'Konum alınırken zaman aşımı oluştu. Lütfen tekrar dene.',
  unsupported: 'Cihazın konum tespitini desteklemiyor. Lütfen adresini yazarak seç.',
};

export const LocationPicker: React.FC = () => {
  const { currentLocation, setCurrentLocation, t } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResolvedLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dışarı tıklanınca menüyü kapat.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Menü açılır açılmaz yazmaya başlayabilsin diye input'a odaklan.
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Yazdıkça otomatik tamamlama: 400ms debounce + önceki isteği iptal et.
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const matches = await searchTurkeyAddress(trimmed, controller.signal);
        setResults(matches);
        setErrorMessage(matches.length === 0 ? 'Eşleşen bir adres bulunamadı.' : null);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setErrorMessage('Adres araması başarısız oldu. Lütfen tekrar dene.');
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query]);

  const applyLocation = (loc: ResolvedLocation | { city: string; district: string }) => {
    setCurrentLocation(loc);
    setIsOpen(false);
  };

  // Öncelikli akış: nokta atışı konum tespiti (GPS + ters coğrafi kodlama).
  const handleUseMyLocation = async () => {
    setErrorMessage(null);
    setIsLocating(true);
    try {
      const position = await getCurrentCoords();
      const resolved = await reverseGeocode(
        position.coords.latitude,
        position.coords.longitude
      );

      if (!resolved.city || !resolved.district) {
        setErrorMessage('Konumun tam olarak çözümlenemedi. Lütfen adresini yazarak seç.');
        return;
      }

      applyLocation(resolved);
    } catch (err: any) {
      const reason: GeolocationFailureReason = err?.reason ?? 'unavailable';
      setErrorMessage(GEO_ERROR_MESSAGES[reason]);
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <div className="relative shrink min-w-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-brand-dark bg-canvas/90 hover:bg-line/70 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap"
      >
        <MapPin className="w-3.5 h-3.5 text-brand-dark shrink-0" />
        <span className="max-w-[70px] xs:max-w-[105px] sm:max-w-none truncate">
          {currentLocation.neighbourhood && currentLocation.district
            ? `${currentLocation.neighbourhood}, ${currentLocation.district}`
            : currentLocation.district
            ? `${currentLocation.district}, ${currentLocation.city}`
            : currentLocation.city || t('header_select_location')}
        </span>
        <ChevronDown className="w-3 h-3 text-ink-faint shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-surface rounded-2xl shadow-xl border border-line py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 pb-2">
            {/* Öncelikli hedef: tek dokunuşla nokta atışı konum tespiti */}
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={isLocating}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand hover:bg-brand-dark text-on-brand text-xs font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-70"
            >
              {isLocating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LocateFixed className="w-4 h-4" />
              )}
              {isLocating ? 'Konumun bulunuyor...' : 'Konumumu Kullan'}
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 my-1">
            <div className="h-px flex-1 bg-line" />
            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider">veya</span>
            <div className="h-px flex-1 bg-line" />
          </div>

          {/* Manuel: yazdıkça adres otomatik tamamlama */}
          <div className="px-3 relative">
            <Search className="w-3.5 h-3.5 text-ink-faint absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mahalle, ilçe veya il yaz..."
              className="w-full pl-8 pr-7 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sonuç listesi / durum mesajları */}
          <div className="mt-1 max-h-64 overflow-y-auto">
            {isSearching && (
              <div className="px-3 py-3 flex items-center gap-2 text-xs text-ink-faint">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aranıyor...
              </div>
            )}

            {!isSearching && errorMessage && (
              <div className="px-3 py-2 text-xs text-warn bg-warn-soft mx-3 my-1 rounded-lg">
                {errorMessage}
              </div>
            )}

            {!isSearching &&
              results.map((r) => (
                <button
                  key={`${r.lat}-${r.lon}`}
                  type="button"
                  onClick={() => applyLocation(r)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-brand-soft transition-colors"
                >
                  <span className="font-semibold text-ink block truncate">
                    {r.label}
                  </span>
                </button>
              ))}

            {/* Arama boşken sade bir yönlendirme metni — sahte/demo konum listesi yok */}
            {!query && results.length === 0 && !isSearching && (
              <div className="px-3 py-3 text-xs text-ink-faint text-center">
                {t('header_location_hint')}
              </div>
            )}
          </div>

          <div className="px-3 pt-2 mt-1 border-t border-line">
            <span className="text-[9px] text-ink-faint">
              Adres verileri © OpenStreetMap katkıda bulunanları
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
