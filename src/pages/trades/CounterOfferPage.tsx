import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Check, Truck, MapPin, Package } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { Listing, TradeOffer } from '../../types';

// KARŞI TEKLİF (rapor md. 26)
//
// Senaryo: Ahmet kamera veriyor, Eren karşılığında PS5 teklif ediyor.
// Ahmet PS5 istemiyor ama Eren'in bisikletini istiyor. "Reddet" ile
// "Kabul et" arasındaki bu üçüncü yol gerçek takas deneyiminin parçası.
//
// Servis (`tradeService.createCounterOffer`) baştan beri vardı ama hiçbir
// ekran çağırmıyordu; bu sayfa o boşluğu dolduruyor.
//
// Rollere dikkat: karşı teklifi VEREN, orijinal teklifin ALICISIDIR.
//   * "Vereceklerin"  → benim ilanlarım (varsayılan: karşı tarafın zaten
//                       istediği ilan)
//   * "İstediklerin"  → karşı tarafın ilanları (varsayılan: ilk teklifte
//                       önerdiği ilan)

// MVP sınırı (rapor md. 25): çoklu ürün teklifleri sistemi hızla
// karmaşıklaştırdığı için başlangıçta her iki tarafta en fazla 2 ilan.
const MAX_ITEMS_PER_SIDE = 2;

const DELIVERY_OPTIONS: Array<{
  id: TradeOffer['deliveryMethod'];
  title: string;
  desc: string;
  icon: React.ElementType;
}> = [
  { id: 'safe_point', title: 'Güvenli Nokta', desc: 'Kalabalık kamu alanı', icon: MapPin },
  { id: 'in_person', title: 'Yüz Yüze', desc: 'Elden teslim', icon: Package },
  { id: 'cargo', title: 'Kargo', desc: 'Adrese gönderim', icon: Truck },
];

export const CounterOfferPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currentUser, showToast } = useApp();

  const [original, setOriginal] = useState<TradeOffer | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [theirListings, setTheirListings] = useState<Listing[]>([]);
  const [givingIds, setGivingIds] = useState<string[]>([]);
  const [wantingIds, setWantingIds] = useState<string[]>([]);
  const [deliveryMethod, setDeliveryMethod] =
    useState<TradeOffer['deliveryMethod']>('safe_point');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    tradeService.getTradeById(id || '').then(async (offer) => {
      if (cancelled) return;

      if (!offer) {
        setOriginal(undefined);
        setIsLoading(false);
        return;
      }

      setOriginal(offer);
      setDeliveryMethod(offer.deliveryMethod);

      const [mine, theirs] = await Promise.all([
        listingService.getUserListings(offer.receiverId),
        listingService.getUserListings(offer.initiatorId),
      ]);

      if (cancelled) return;

      // Kilitli / takas edilmiş ilanlar seçilemez.
      const selectable = (list: Listing[]) => list.filter((l) => l.status === 'active');

      setMyListings(selectable(mine));
      setTheirListings(selectable(theirs));

      // Varsayılan seçim: ilk teklifin iki tarafı. Kullanıcı sadece
      // değiştirmek istediği tarafa dokunur (rapor md. 144: hızlı olmalı).
      setGivingIds(offer.requestedListingIds.slice(0, MAX_ITEMS_PER_SIDE));
      setWantingIds(offer.offeredListingIds.slice(0, MAX_ITEMS_PER_SIDE));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const toggle = (
    listingId: string,
    selected: string[],
    setSelected: (ids: string[]) => void
  ) => {
    if (selected.includes(listingId)) {
      setSelected(selected.filter((item) => item !== listingId));
      return;
    }

    if (selected.length >= MAX_ITEMS_PER_SIDE) {
      showToast(
        'Şimdilik en fazla 2 ilan',
        'Karşı teklifte her taraftan en fazla 2 ilan seçilebilir.',
        'info'
      );
      return;
    }

    setSelected([...selected, listingId]);
  };

  const giving = useMemo(
    () => myListings.filter((l) => givingIds.includes(l.id)),
    [myListings, givingIds]
  );
  const wanting = useMemo(
    () => theirListings.filter((l) => wantingIds.includes(l.id)),
    [theirListings, wantingIds]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!original || giving.length === 0 || wanting.length === 0) return;

    setIsSubmitting(true);

    const counter = await tradeService.createCounterOffer(
      original.id,
      giving,
      wanting,
      deliveryMethod,
      note.trim() || undefined
    );

    setIsSubmitting(false);

    if (!counter) {
      showToast('Karşı teklif gönderilemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    showToast('Karşı teklif gönderildi', 'Karşı taraf yanıtladığında haberin olacak.', 'success');
    navigate(`/teklif/${counter.id}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-700 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!original) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 flex flex-col items-center justify-center text-center">
        <p className="text-sm font-bold text-stone-700 mb-3">Bu teklif bulunamadı.</p>
        <button
          type="button"
          onClick={() => navigate('/takaslarim')}
          className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Takaslarıma Dön
        </button>
      </div>
    );
  }

  // Karşı teklifi sadece teklifi ALAN kişi, sadece teklif hâlâ
  // yanıtlanmamışken verebilir.
  const canCounter =
    original.receiverId === currentUser.id && original.status === 'offer_sent';

  if (!canCounter) {
    return (
      <div className="min-h-screen bg-stone-50 p-6 flex flex-col items-center justify-center text-center">
        <p className="text-sm font-bold text-stone-700 mb-1">Bu teklife karşı teklif veremezsin.</p>
        <p className="text-xs text-stone-500 mb-3">
          Karşı teklif yalnızca sana gelen ve henüz yanıtlanmamış teklifler için verilebilir.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/teklif/${original.id}`)}
          className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer"
        >
          Teklifi Görüntüle
        </button>
      </div>
    );
  }

  const renderPicker = (
    listings: Listing[],
    selected: string[],
    setSelected: (ids: string[]) => void,
    emptyText: string
  ) =>
    listings.length === 0 ? (
      <p className="text-xs text-stone-500">{emptyText}</p>
    ) : (
      <ul className="space-y-2">
        {listings.map((listing) => {
          const isSelected = selected.includes(listing.id);

          return (
            <li key={listing.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(listing.id, selected, setSelected)}
                className={`w-full p-2.5 rounded-2xl border-2 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/60'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <img
                  src={listing.images[0]}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-stone-900 truncate">
                    {listing.title}
                  </span>
                  <span className="block text-[11px] text-stone-500 truncate">
                    {listing.location.district || listing.location.city}
                  </span>
                </span>
                {isSelected && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="min-h-screen bg-stone-50 pb-24 text-stone-900">
      <form onSubmit={handleSubmit} className="max-w-md md:max-w-2xl mx-auto px-4 pt-3 space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center hover:bg-stone-100 transition-colors shadow-xs cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-stone-900 font-display">Karşı Teklif</h1>
            <p className="text-xs text-stone-500">
              {original.initiator.fullName} adlı kullanıcıya alternatif öner
            </p>
          </div>
        </div>

        {/* Özet: ne değişiyor */}
        <div className="bg-white rounded-2xl border border-stone-200 p-3 flex items-center gap-2 text-xs">
          <span className="flex-1 min-w-0 truncate font-semibold text-stone-800">
            {giving.map((l) => l.title).join(', ') || 'Vereceğin seçilmedi'}
          </span>
          <ArrowLeftRight className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="flex-1 min-w-0 truncate font-semibold text-stone-800 text-right">
            {wanting.map((l) => l.title).join(', ') || 'İstediğin seçilmedi'}
          </span>
        </div>

        <section className="bg-white rounded-3xl border border-stone-200 p-4 space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Vereceklerin
          </h2>
          {renderPicker(
            myListings,
            givingIds,
            setGivingIds,
            'Aktif ilanın yok. Karşı teklif verebilmek için önce bir ilan yayınlamalısın.'
          )}
        </section>

        <section className="bg-white rounded-3xl border border-stone-200 p-4 space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Karşılığında istediklerin
          </h2>
          {renderPicker(
            theirListings,
            wantingIds,
            setWantingIds,
            'Karşı tarafın şu an takasa açık başka bir ilanı yok.'
          )}
        </section>

        <section className="bg-white rounded-3xl border border-stone-200 p-4 space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Takas Yöntemi
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {DELIVERY_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = deliveryMethod === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setDeliveryMethod(option.id)}
                  className={`p-3 rounded-2xl border-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/60'
                      : 'border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <Icon className="w-4 h-4 text-emerald-700 mb-1" />
                  <span className="block text-[11px] font-bold text-stone-900">{option.title}</span>
                  <span className="block text-[10px] text-stone-500">{option.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-stone-200 p-4 space-y-2">
          <label htmlFor="counter-note" className="text-xs font-bold uppercase tracking-wider text-stone-700">
            Notun (opsiyonel)
          </label>
          <textarea
            id="counter-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Örn. PS5 bende zaten var, bisikletinle takas edebilir miyiz?"
            className="w-full px-4 py-3 rounded-2xl bg-stone-50 border border-stone-200 text-sm outline-hidden focus:border-emerald-600 resize-none"
          />
        </section>

        <button
          type="submit"
          disabled={giving.length === 0 || wanting.length === 0 || isSubmitting}
          className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white font-bold text-sm shadow-md transition-colors cursor-pointer"
        >
          {isSubmitting ? 'Gönderiliyor…' : 'Karşı Teklifi Gönder'}
        </button>
      </form>
    </div>
  );
};
