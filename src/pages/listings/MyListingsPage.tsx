import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Package, RotateCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { Listing } from '../../types';
import { expiryLabel, isExpiringSoon } from '../../utils/listingExpiry';

// 18. İLANLARIM
//
// Sekmeler: Aktif · Takasta · Tamamlanan · Süresi dolan. Durum renkle DEĞİL,
// metinle belirtiliyor (md. 98).

type Tab = 'active' | 'in_trade' | 'traded' | 'expired';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'active', label: 'Aktif' },
  { id: 'in_trade', label: 'Takasta' },
  { id: 'traded', label: 'Tamamlanan' },
  // Süresi dolan ilan silinmez, buraya düşer ve tek dokunuşla geri alınır
  // (rapor md. 119).
  { id: 'expired', label: 'Süresi dolan' },
];

export const MyListingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [listings, setListings] = useState<Listing[]>([]);
  const [tab, setTab] = useState<Tab>('active');
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await listingService.getUserListings(currentUser.id);
    setListings(data);
    setIsLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = listings.filter((listing) => listing.status === tab);

  const handleDelete = async (listing: Listing) => {
    const result = await listingService.deleteListing(listing.id);

    // Reddin nedeni (ör. "devam eden bir takasta olan ilan kaldırılamaz")
    // kullanıcıya olduğu gibi gösteriliyor; "lütfen tekrar dene" demek
    // yanlış olurdu, tekrar denemek durumu değiştirmiyor.
    if (result.outcome === 'failed') {
      showToast('İlan kaldırılamadı', result.message, 'error');
      return;
    }

    showToast(
      'İlan kaldırıldı',
      result.outcome === 'archived'
        ? `${listing.title} yayından kaldırıldı. Geçmiş takaslarında görünmeye devam edecek.`
        : listing.title,
      'info'
    );
    load();
  };

  const handleRenew = async (listing: Listing) => {
    const result = await listingService.renewListing(listing.id);

    if (!result.expiresAt) {
      showToast('İlan yenilenemedi', result.message, 'error');
      return;
    }

    showToast(
      'İlan yenilendi',
      `${listing.title} yeniden yayında; süresi ${new Date(
        result.expiresAt
      ).toLocaleDateString('tr-TR')} tarihine uzatıldı.`,
      'success'
    );
    load();
  };

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg text-ink flex-1">İlanlarım</h1>
          <button
            type="button"
            onClick={() => navigate('/ilan-ver')}
            className="sw-btn sw-btn-primary text-xs px-4"
          >
            <Plus className="w-4 h-4" />
            Yeni ilan
          </button>
        </div>

        <div className="flex gap-2">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id}
              className={`sw-chip ${tab === item.id ? 'sw-chip-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sw-skeleton h-20" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="sw-card p-10 text-center">
            <span className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-dark flex items-center justify-center mx-auto">
              <Package className="w-6 h-6" />
            </span>
            <h2 className="text-base text-ink mt-4">
              {tab === 'active'
                ? 'Aktif ilanın yok'
                : tab === 'expired'
                  ? 'Süresi dolan ilanın yok'
                  : 'Burada bir şey yok'}
            </h2>
            <p className="text-xs text-ink-soft mt-1.5 max-w-xs mx-auto">
              {tab === 'active'
                ? 'Kullanmadığın bir şeyi ilana çıkar; birinin aradığı şey olabilir.'
                : tab === 'expired'
                  ? 'İlanlar 30 gün yayında kalır. Süresi dolanlar burada birikir, tek dokunuşla geri alırsın.'
                  : 'Takasların ilerledikçe ilanların bu sekmelere düşecek.'}
            </p>
            {tab === 'active' && (
              <button
                type="button"
                onClick={() => navigate('/ilan-ver')}
                className="sw-btn sw-btn-primary mt-4"
              >
                İlan ver
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((listing) => (
              <li key={listing.id} className="sw-card p-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/ilan/${listing.slug || listing.id}`)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <img
                    src={listing.images[0]}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink truncate">
                      {listing.title}
                    </span>
                    <span className="block text-xs text-ink-soft truncate mt-0.5">
                      ● {TABS.find((t) => t.id === listing.status)?.label ?? listing.status}
                      {/* Süre etiketi: `expiresAt` bilinmiyorsa (kolon henüz
                          canlıda yoksa) expiryLabel boş metin döner ve
                          burada hiçbir şey yazılmaz. */}
                      {expiryLabel(listing) && (
                        <span className={isExpiringSoon(listing) ? 'text-danger' : ''}>
                          {' · '}
                          {expiryLabel(listing)}
                        </span>
                      )}
                    </span>
                  </span>
                </button>

                {(listing.status === 'expired' || isExpiringSoon(listing)) && (
                  <button
                    type="button"
                    onClick={() => handleRenew(listing)}
                    className="text-xs font-semibold text-brand-dark hover:text-brand px-3 py-2 cursor-pointer flex items-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Yenile
                  </button>
                )}

                {listing.status === 'active' && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate(`/ilan/${listing.id}/duzenle`)}
                      className="text-xs font-semibold text-ink-soft hover:text-ink px-3 py-2 cursor-pointer"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(listing)}
                      className="text-xs font-semibold text-ink-soft hover:text-danger px-3 py-2 cursor-pointer"
                    >
                      Kaldır
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
