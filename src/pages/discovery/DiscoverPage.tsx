import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { CATEGORIES } from '../../constants';
import { ProductCard } from '../../components/common/ProductCard';
import { Listing } from '../../types';
import { ArrowRight, Loader2, Navigation, Plus, Repeat, Search, Sparkles, TrendingUp } from 'lucide-react';

/**
 * Keşfet — uygulamanın ana ekranı.
 *
 * Sadeleştirildi: eskiden burada aynı ilan listesi iki kez basılıyor,
 * ayrıca gizemli kutu / topluluk etkinlikleri gibi hiçbir gerçek veriye
 * dayanmayan dört tanıtım kartı yer alıyordu. Artık ekran tek bir işi
 * yapıyor: takas edebileceğin eşyaları hızlıca göstermek.
 */
export const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated } = useApp();

  const [listings, setListings] = useState<Listing[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [all, counts] = await Promise.all([
      listingService.getAllListings(),
      listingService.getCategoryCounts(),
    ]);
    setListings(all);
    setCategoryCounts(counts);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Kendi ilanların keşfet akışında görünmez — kendi eşyanla takas yapamazsın.
  const feed = useMemo(
    () => listings.filter((listing) => listing.userId !== currentUser.id),
    [listings, currentUser.id]
  );

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return feed.filter((listing) => {
      if (selectedCategory !== 'all' && listing.categoryId !== selectedCategory) return false;
      if (!query) return true;

      return (
        listing.title.toLowerCase().includes(query) ||
        listing.lookingFor.toLowerCase().includes(query) ||
        listing.description.toLowerCase().includes(query)
      );
    });
  }, [feed, selectedCategory, searchQuery]);

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchQuery.trim()) navigate(`/arama?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  const visibleCategories = CATEGORIES.filter(
    (category) => (categoryCounts[category.id] ?? 0) > 0 || selectedCategory === category.id
  );

  return (
    <div className="min-h-full bg-stone-50 dark:bg-stone-950 pb-6 text-stone-900 dark:text-stone-100">
      <div className="px-4 pt-3 space-y-4">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ne takas etmek istiyorsun?"
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 focus:border-emerald-600 outline-hidden text-sm font-medium shadow-xs placeholder-stone-400"
          />
        </form>

        {/* Hızlı erişim */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Eşleştir', icon: Sparkles, path: '/eslesme', accent: 'text-amber-500' },
            { label: 'Yakınımda', icon: Navigation, path: '/yakinimdakiler', accent: 'text-sky-600' },
            { label: 'Döngüler', icon: Repeat, path: '/donguler', accent: 'text-emerald-600' },
          ].map((shortcut) => (
            <button
              key={shortcut.path}
              type="button"
              onClick={() => navigate(shortcut.path)}
              className="p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 flex flex-col items-center gap-1.5 hover:border-emerald-500/60 transition-colors cursor-pointer"
            >
              <shortcut.icon className={`w-5 h-5 ${shortcut.accent}`} />
              <span className="text-[11px] font-bold">{shortcut.label}</span>
            </button>
          ))}
        </div>

        {/* Kategoriler */}
        {visibleCategories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800'
              }`}
            >
              Tümü ({feed.length})
            </button>

            {visibleCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() =>
                  setSelectedCategory((prev) => (prev === category.id ? 'all' : category.id))
                }
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === category.id
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800'
                }`}
              >
                {category.name}
                {categoryCounts[category.id] ? ` (${categoryCounts[category.id]})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Kendi ilanını yayınlamaya davet */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => navigate('/ilan-ver')}
            className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2.5 min-w-0 text-left">
              <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="text-xs font-bold block">Kullanmadığın bir şey mi var?</span>
                <span className="text-[11px] text-emerald-100/80 block truncate">
                  Fotoğrafını çek, dakikalar içinde yayında olsun
                </span>
              </span>
            </span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        )}

        {/* İlan akışı */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              {selectedCategory === 'all'
                ? 'Takasa hazır ilanlar'
                : CATEGORIES.find((c) => c.id === selectedCategory)?.name}{' '}
              ({filtered.length})
            </h2>

            <button
              type="button"
              onClick={() => navigate('/arama')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 cursor-pointer"
            >
              Filtreler →
            </button>
          </div>

          {isLoading && (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 text-stone-300 animate-spin" />
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <TrendingUp className="w-9 h-9 text-stone-300 dark:text-stone-700 mx-auto" />
              <p className="text-xs text-stone-500 dark:text-stone-400 px-6">
                {feed.length === 0
                  ? 'Henüz yayında ilan yok. İlk ilanı sen ver, takas topluluğunu başlat.'
                  : 'Bu filtreye uyan ilan bulunamadı.'}
              </p>
              <button
                type="button"
                onClick={() => (feed.length === 0 ? navigate('/ilan-ver') : setSelectedCategory('all'))}
                className="px-4 py-2.5 rounded-2xl bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                {feed.length === 0 ? 'İlan ver' : 'Filtreyi temizle'}
              </button>
            </div>
          )}

          {!isLoading && filtered.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map((listing) => (
                <ProductCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
