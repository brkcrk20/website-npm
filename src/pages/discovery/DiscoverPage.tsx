import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, Sparkles, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { needService } from '../../services/needService';
import { CATEGORIES } from '../../constants';
import { Listing, NeedMatch } from '../../types';
import { ProductCard } from '../../components/common/ProductCard';

// 9. ANA SAYFA
//
// Ana ekran ilan çöplüğü değil, ihtiyaç eşleştirme ekranıdır (md. 14-15).
// Sıralama: arama → kategoriler → sana uygun → yeni ilanlar.
//
// Önceki sürümde burada Loop, Takas Yolculuğum, Gizemli Kutu, Etkinlikler
// gibi beş ayrı tanıtım kutusu vardı; ilanlar en aşağıda kalıyordu. Bu
// bölümler kendi ekranlarında duruyor, ana sayfa sadeleşti (md. 15, 145).

export const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [matches, setMatches] = useState<NeedMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    listingService
      .getAllListings()
      .then((data) => {
        if (cancelled) return;
        setListings(data);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    needService
      .getMatchesForUser(currentUser.id, { city: currentUser.city, limit: 4 })
      .then((found) => {
        if (!cancelled) setMatches(found);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser.id, currentUser.city]);

  const filtered = listings.filter(
    (item) => selectedCategory === 'all' || item.categoryId === selectedCategory
  );

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (searchQuery.trim()) {
      navigate(`/arama?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4 space-y-6">
        {/* Arama */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Bir şeyler ara..."
              className="sw-input pl-10"
              aria-label="Ara"
            />
          </div>
          <button
            type="button"
            onClick={() => navigate('/kategoriler')}
            aria-label="Kategoriler"
            className="sw-btn sw-btn-ghost w-12 px-0 shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </form>

        {/* Kategori çipleri */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            aria-pressed={selectedCategory === 'all'}
            className={`sw-chip ${selectedCategory === 'all' ? 'sw-chip-active' : ''}`}
          >
            Tümü
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category.id)}
              aria-pressed={selectedCategory === category.id}
              className={`sw-chip ${selectedCategory === category.id ? 'sw-chip-active' : ''}`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {/* Sana uygun — kullanıcının açık ihtiyaçlarıyla eşleşenler */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base text-ink flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-brand" />
              Sana Uygun
            </h2>
            <button
              type="button"
              onClick={() => navigate('/aradiklarim')}
              className="text-xs font-semibold text-brand-dark hover:underline cursor-pointer"
            >
              Aradıklarım →
            </button>
          </div>

          {matches.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {matches.map((match) => (
                <div key={match.listing.id} className="space-y-1">
                  <ProductCard listing={match.listing} />
                  <p className="text-[10px] text-brand-dark font-semibold px-1 truncate">
                    “{match.need.title}” · %{match.score} uyum
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/aradiklarim')}
              className="sw-card w-full p-4 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
            >
              <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
                <Search className="w-4 h-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Ne arıyorsun?</span>
                <span className="block text-xs text-ink-soft mt-0.5">
                  Aradıklarını ekle, sana uyan ilanlar burada görünsün.
                </span>
              </span>
              <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" />
            </button>
          )}
        </section>

        {/* Yeni ilanlar */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base text-ink">Yeni İlanlar</h2>
            <button
              type="button"
              onClick={() => navigate('/arama')}
              className="text-xs font-semibold text-brand-dark hover:underline cursor-pointer"
            >
              Tümünü gör →
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="sw-skeleton aspect-[4/3]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="sw-card p-8 text-center">
              <p className="text-sm font-semibold text-ink">Bu kategoride henüz ilan yok</p>
              <p className="text-xs text-ink-soft mt-1">
                İlk ilanı sen ekleyebilirsin; birinin aradığı şey olabilir.
              </p>
              <button
                type="button"
                onClick={() => navigate('/ilan-ver')}
                className="sw-btn sw-btn-primary mt-4"
              >
                İlan Ver
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filtered.slice(0, 12).map((listing) => (
                <ProductCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
