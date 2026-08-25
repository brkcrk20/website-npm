import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Check, Package, ShieldCheck, Truck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { Listing, TradeOffer, UserProfile } from '../../types';

// 11. TAKAS TEKLİFİ
//
// Hedef: ilana giren kullanıcı 10-20 saniye içinde teklif gönderebilmeli
// (md. 144). Bu yüzden ekran üç sorudan ibaret: neyi veriyorsun, nasıl
// buluşalım, eklemek istediğin bir not var mı.
//
// MVP sınırı: en fazla 2 ilan teklif edilebilir (md. 25).

const MAX_OFFER_ITEMS = 2;

const DELIVERY_OPTIONS: Array<{
  id: TradeOffer['deliveryMethod'];
  title: string;
  desc: string;
  icon: typeof Truck;
}> = [
  { id: 'safe_point', title: 'Güvenli nokta', desc: 'Kalabalık kamu alanı', icon: ShieldCheck },
  { id: 'in_person', title: 'Yüz yüze', desc: 'Elden teslim', icon: Package },
  { id: 'cargo', title: 'Kargo', desc: 'Adrese gönderim', icon: Truck },
];

export const MakeOfferPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetListingId = searchParams.get('targetId');
  const { currentUser, showToast } = useApp();

  const [targetListing, setTargetListing] = useState<Listing | undefined>(undefined);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deliveryMethod, setDeliveryMethod] =
    useState<TradeOffer['deliveryMethod']>('safe_point');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const targetPromise = targetListingId
      ? listingService.getListingById(targetListingId)
      : Promise.resolve(undefined);

    Promise.all([targetPromise, listingService.getUserListings(currentUser.id)]).then(
      ([target, mine]) => {
        if (cancelled) return;

        setTargetListing(target);
        const active = mine.filter((l) => l.status === 'active');
        setMyListings(active);
        setSelectedIds(active.length ? [active[0].id] : []);
        setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [targetListingId, currentUser.id]);

  const selectedListings = useMemo(
    () => myListings.filter((l) => selectedIds.includes(l.id)),
    [myListings, selectedIds]
  );

  const toggleListing = (listingId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(listingId)) {
        return prev.filter((id) => id !== listingId);
      }

      if (prev.length >= MAX_OFFER_ITEMS) {
        showToast(
          'Şimdilik en fazla 2 ilan',
          'Bir teklifte en fazla iki ilanını sunabilirsin.',
          'info'
        );
        return prev;
      }

      return [...prev, listingId];
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!targetListing || selectedListings.length === 0) return;

    setIsSubmitting(true);

    // createTradeOffer yalnızca alıcının id'sini kullanıyor; burada ilan
    // verisinden minimum bir profil kabuğu oluşturuluyor.
    const receiver = {
      id: targetListing.userId,
      fullName: targetListing.user.fullName,
      avatarUrl: targetListing.user.avatarUrl,
      city: targetListing.location.city,
      district: targetListing.location.district,
      isVerified: targetListing.user.isVerified,
    } as unknown as UserProfile;

    const offer = await tradeService.createTradeOffer({
      initiator: currentUser,
      receiver,
      offeredListings: selectedListings,
      requestedListings: [targetListing],
      note: note.trim() || undefined,
      deliveryMethod,
    });

    setIsSubmitting(false);

    if (!offer) {
      showToast('Teklif gönderilemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    showToast('Teklif gönderildi', 'Karşı taraf yanıtladığında haberin olacak.', 'success');
    navigate(`/teklif/${offer.id}`);
  };

  if (isLoading) {
    return (
      <div className="sw-screen">
        <div className="sw-container pt-4 space-y-3">
          <div className="sw-skeleton h-24" />
          <div className="sw-skeleton h-24" />
        </div>
      </div>
    );
  }

  if (!targetListing) {
    return (
      <div className="sw-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg text-ink">Takas yapılacak ilan bulunamadı</h1>
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="sw-btn sw-btn-primary mt-5"
        >
          Ana sayfaya dön
        </button>
      </div>
    );
  }

  if (targetListing.user.id === currentUser.id) {
    return (
      <div className="sw-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg text-ink">Kendi ilanına teklif veremezsin</h1>
        <button type="button" onClick={() => navigate(-1)} className="sw-btn sw-btn-primary mt-5">
          Geri dön
        </button>
      </div>
    );
  }

  return (
    <div className="sw-screen">
      <form onSubmit={handleSubmit} className="sw-container pt-3 space-y-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg text-ink">Takas Teklifi Yap</h1>
        </div>

        {/* Karşı tarafın ürünü */}
        <section>
          <h2 className="sw-label">İstediğin ürün</h2>
          <div className="sw-card p-3 flex items-center gap-3">
            <img
              src={targetListing.images[0]}
              alt=""
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{targetListing.title}</p>
              <p className="text-xs text-ink-soft truncate mt-0.5">
                {targetListing.user.fullName}
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <span className="w-9 h-9 rounded-full bg-brand-soft text-brand-dark flex items-center justify-center">
            <ArrowLeftRight className="w-4 h-4" />
          </span>
        </div>

        {/* Senin ürünün */}
        <section>
          <h2 className="sw-label">Karşılığında ne veriyorsun?</h2>

          {myListings.length === 0 ? (
            <div className="sw-card p-5 text-center">
              <p className="text-sm font-semibold text-ink">Aktif ilanın yok</p>
              <p className="text-xs text-ink-soft mt-1">
                Teklif verebilmek için önce takas edebileceğin bir ilan yayınla.
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
            <ul className="space-y-2">
              {myListings.map((listing) => {
                const selected = selectedIds.includes(listing.id);

                return (
                  <li key={listing.id}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleListing(listing.id)}
                      className={`w-full p-3 rounded-2xl border-2 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-brand bg-brand-soft'
                          : 'border-line bg-surface hover:bg-canvas'
                      }`}
                    >
                      <img
                        src={listing.images[0]}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink truncate">
                          {listing.title}
                        </span>
                        <span className="block text-xs text-ink-soft truncate mt-0.5">
                          {listing.location.district || listing.location.city}
                        </span>
                      </span>
                      {selected && <Check className="w-4 h-4 text-brand shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Takas yöntemi */}
        <section>
          <h2 className="sw-label">Nasıl takas edelim?</h2>
          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = deliveryMethod === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setDeliveryMethod(option.id)}
                  className={`p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer ${
                    selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
                  }`}
                >
                  <Icon className="w-4 h-4 text-brand-dark mb-1.5" />
                  <span className="block text-[11px] font-semibold text-ink leading-tight">
                    {option.title}
                  </span>
                  <span className="block text-[10px] text-ink-soft mt-0.5">{option.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Not */}
        <section>
          <label htmlFor="offer-note" className="sw-label">
            Mesaj (opsiyonel)
          </label>
          <textarea
            id="offer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Örn. Ürün temiz durumda, yanında kılıfı da var."
            className="sw-input resize-none"
          />
        </section>

        <button
          type="submit"
          disabled={selectedListings.length === 0 || isSubmitting}
          className="sw-btn sw-btn-primary sw-btn-block"
        >
          {isSubmitting ? 'Gönderiliyor…' : 'Teklifi Gönder'}
        </button>
      </form>
    </div>
  );
};
