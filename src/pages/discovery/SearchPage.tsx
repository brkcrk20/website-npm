import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { listingService } from '../../services/listingService';
import { needService, NeedSeeker } from '../../services/needService';
import { useApp } from '../../context/AppContext';
import { CATEGORIES } from '../../constants';
import { ProductCard } from '../../components/common/ProductCard';
import { Search, SlidersHorizontal, ArrowLeft, X, Filter } from 'lucide-react';
import { Listing, Need } from '../../types';

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useApp();

  const queryParam = searchParams.get('q') || '';
  const [query, setQuery] = useState(queryParam);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<string>('all');
  const [maxDistance, setMaxDistance] = useState<number>(25);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setQuery(queryParam);
  }, [queryParam]);

  const [results, setResults] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Rapor md. 76: aynı kelime iki farklı soruyu yanıtlar —
  //   "kim veriyor?" (ilanlar)  ve  "kim arıyor?" (ihtiyaçlar).
  // Swaloop'u klasik ilan sitelerinden ayıran şey ikincisi.
  const [tab, setTab] = useState<'giving' | 'seeking'>('giving');
  const [seekers, setSeekers] = useState<Array<{ need: Need; seeker: NeedSeeker }>>([]);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    listingService
      .searchListings(query, selectedCategory, selectedCondition, maxDistance)
      .then((data) => {
        if (!isCancelled) {
          setResults(data);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [query, selectedCategory, selectedCondition, maxDistance]);

  useEffect(() => {
    let isCancelled = false;

    if (!query.trim()) {
      setSeekers([]);
      return;
    }

    needService
      .searchNeeds(query, { excludeUserId: currentUser.id })
      .then((data) => {
        if (!isCancelled) setSeekers(data);
      });

    return () => {
      isCancelled = true;
    };
  }, [query, currentUser.id]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(query ? { q: query } : {});
  };

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-3xl lg:max-w-5xl mx-auto px-4 pt-3 space-y-4">
        {/* Search header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-surface border border-line text-ink-soft flex items-center justify-center hover:bg-canvas transition-colors shrink-0 shadow-xs"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="İlan veya istenen ürün ara..."
              autoFocus
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-surface border border-line focus:border-brand focus:outline-hidden text-sm font-medium shadow-xs"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSearchParams({});
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-soft"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-colors shrink-0 shadow-xs cursor-pointer ${
              showFilters || selectedCategory !== 'all' || selectedCondition !== 'all'
                ? 'bg-brand text-on-brand border-brand'
                : 'bg-surface border-line text-ink-soft hover:bg-canvas'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Drawer / Accordion */}
        {showFilters && (
          <div className="bg-surface rounded-2xl p-4 border border-line shadow-sm space-y-4 animate-in fade-in zoom-in-98 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" />
                Detaylı Filtreler
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedCondition('all');
                  setMaxDistance(25);
                }}
                className="text-xs text-ink-faint hover:text-brand-dark font-semibold"
              >
                Sıfırla
              </button>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-bold text-ink-soft mb-1.5">Kategori</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                    selectedCategory === 'all'
                      ? 'bg-brand text-on-brand'
                      : 'bg-canvas text-ink-soft'
                  }`}
                >
                  Tümü
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                      selectedCategory === cat.id
                        ? 'bg-brand text-on-brand'
                        : 'bg-canvas text-ink-soft'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition */}
            <div>
              <label className="block text-xs font-bold text-ink-soft mb-1.5">Kondisyon</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Tümü' },
                  { id: 'zero', label: 'Sıfır' },
                  { id: 'like_new', label: 'Sıfır Gibi' },
                  { id: 'very_good', label: 'Çok İyi' },
                  { id: 'good', label: 'İyi' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCondition(c.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                      selectedCondition === c.id
                        ? 'bg-brand text-on-brand'
                        : 'bg-canvas text-ink-soft'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-ink-soft mb-1">
                <span>Maksimum Mesafe</span>
                <span className="text-brand-dark">{maxDistance} km</span>
              </div>
              <input
                type="range"
                min="1"
                max="50"
                value={maxDistance}
                onChange={(e) => setMaxDistance(Number(e.target.value))}
                className="w-full accent-emerald-700"
              />
            </div>
          </div>
        )}

        {/* Results Stream */}
        <div>
          {query.trim() && (
            <div className="inline-flex p-0.5 rounded-2xl bg-line/70 mb-3">
              <button
                type="button"
                onClick={() => setTab('giving')}
                aria-pressed={tab === 'giving'}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  tab === 'giving' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft'
                }`}
              >
                Verenler ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('seeking')}
                aria-pressed={tab === 'seeking'}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  tab === 'seeking' ? 'bg-surface text-ink shadow-xs' : 'text-ink-soft'
                }`}
              >
                Arayanlar ({seekers.length})
              </button>
            </div>
          )}

          {/* Arama kutusu boşaltılırsa sekme durumu takılı kalmasın:
              "Arayanlar" yalnızca aktif bir arama varken anlamlı. */}
          {tab === 'seeking' && query.trim() ? (
            seekers.length === 0 ? (
              <div className="bg-surface rounded-3xl p-8 border border-line text-center space-y-2">
                <h3 className="text-base font-bold text-ink">Bunu arayan kimse yok</h3>
                <p className="text-xs text-ink-soft max-w-xs mx-auto">
                  Sen arayabilirsin: aradığın şeyi listene ekle, uygun bir ilan yayınlandığında
                  haberin olsun.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/aradiklarim')}
                  className="px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-bold hover:bg-brand-dark transition-colors"
                >
                  Aradıklarıma Ekle
                </button>
              </div>
            ) : (
              <ul className="space-y-2">
                {seekers.map(({ need, seeker }) => (
                  <li key={need.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/profil/${seeker.id}`)}
                      className="w-full bg-surface rounded-2xl p-3 border border-line flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
                    >
                      {seeker.avatarUrl ? (
                        <img
                          src={seeker.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-full bg-canvas shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-ink truncate">
                          {need.title}
                        </span>
                        <span className="block text-[11px] text-ink-soft truncate">
                          {seeker.fullName}
                          {seeker.district ? ` · ${seeker.district}` : ''}
                          {seeker.city ? `, ${seeker.city}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-2xl bg-canvas animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="bg-surface rounded-3xl p-8 border border-line text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-canvas text-ink-faint flex items-center justify-center mx-auto">
                <Search className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-ink">
                Henüz sana uygun takas bulunamadı.
              </h3>
              <p className="text-xs text-ink-soft max-w-xs mx-auto">
                Arama kelimeni değiştirebilir veya filtreleri sıfırlayarak tekrar deneyebilirsin.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedCategory('all');
                  setSelectedCondition('all');
                }}
                className="px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-bold hover:bg-brand-dark transition-colors"
              >
                Tüm İlanları Göster
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.map((listing) => (
                <ProductCard key={listing.id} listing={listing} variant="grid" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
