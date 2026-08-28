import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TradeOffer, Listing } from '../../types';
import { tradeStatusBadge } from '../../utils/tradeStatus';
import { ArrowLeftRight, ImageOff } from 'lucide-react';
import { TrustCard } from './TrustCard';

/**
 * Takas kartındaki ürün küçük görseli.
 *
 * Fotoğrafı olmayan ilan için eskiden SABİT bir Unsplash fotoğrafı
 * gösteriliyordu — yani kullanıcı, teklif edilen ürün diye hiç alakasız
 * bir stok fotoğrafı görüyordu. Fotoğraf yoksa doğru davranış, fotoğraf
 * olmadığını söylemektir.
 */
const ItemThumb: React.FC<{ listing?: Listing }> = ({ listing }) => {
  const src = listing?.images?.[0];

  if (!src) {
    return (
      <span className="w-16 h-16 rounded-lg mb-1.5 bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400">
        <ImageOff className="w-5 h-5" />
        <span className="sr-only">Fotoğraf eklenmemiş</span>
      </span>
    );
  }

  return (
    <span className="w-16 h-16 rounded-lg overflow-hidden bg-stone-100 mb-1.5 block">
      <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
    </span>
  );
};

interface TradeCardProps {
  trade: TradeOffer;
  isIncoming?: boolean;
  onAccept?: (tradeId: string) => void;
  onReject?: (tradeId: string) => void;
  onCounter?: (tradeId: string) => void;
  className?: string;
}

export const TradeCard: React.FC<TradeCardProps> = ({
  trade,
  isIncoming = false,
  onAccept,
  onReject,
  onCounter,
  className = '',
}) => {
  const navigate = useNavigate();

  const offeredItem = trade.offeredListings[0];
  const requestedItem = trade.requestedListings[0];
  const otherUser = isIncoming ? trade.initiator : trade.receiver;

  // Etiketler artık tek kaynaktan (src/utils/tradeStatus.ts) geliyor.
  const statusInfo = tradeStatusBadge(trade.status);

  return (
    <div
      onClick={() => navigate(`/teklif/${trade.id}`)}
      className={`bg-white rounded-2xl border border-stone-200/90 p-4 hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer ${className}`}
    >
      {/* Header: User & Status */}
      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2.5">
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.fullName}
            className="w-9 h-9 rounded-full object-cover border border-stone-200"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-stone-900">{otherUser.fullName}</span>
              {/* Puanı olmayan kullanıcıya "4.8" yazmak yerine gerçek
                  durumu göster (bkz. src/utils/trustDisplay.ts). */}
              <TrustCard trustProfile={otherUser.trustProfile} variant="compact" />
            </div>
            <span className="text-[11px] text-stone-400">
              {new Date(trade.createdAt).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {/* Side-by-Side Comparison Container */}
      <div className="grid grid-cols-2 gap-2.5 my-3 relative items-center">
        {/* Left Side: Senin Ürünün */}
        <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
            {isIncoming ? 'İstenen Ürünün' : 'Teklif Ettiğin Ürün'}
          </span>
          <ItemThumb listing={isIncoming ? requestedItem : offeredItem} />
          <span className="text-xs font-bold text-stone-800 line-clamp-1">
            {isIncoming ? requestedItem?.title : offeredItem?.title}
          </span>
        </div>

        {/* Center Exchange Icon badge */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white border border-stone-200 shadow-xs flex items-center justify-center">
          <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-700" />
        </div>

        {/* Right Side: Karşı Tarafın Ürünü */}
        <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 flex flex-col items-center text-center">
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
            {isIncoming ? 'Teklif Edilen Ürün' : 'İstediğin Ürün'}
          </span>
          <ItemThumb listing={isIncoming ? offeredItem : requestedItem} />
          <span className="text-xs font-bold text-stone-800 line-clamp-1">
            {isIncoming ? offeredItem?.title : requestedItem?.title}
          </span>
        </div>
      </div>

      {/* Note preview if any */}
      {trade.note && (
        <div className="p-2 rounded-xl bg-stone-50 text-xs text-stone-600 italic mb-3 line-clamp-1">
          "{trade.note}"
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-stone-100 text-xs text-stone-500">
        {/* Quick action buttons if incoming and waiting.
            NOT: koşul eskiden yalnızca 'offer_received' idi; oysa DB'den
            gelen bekleyen teklifler hydrateOffer() içinde 'offer_sent'e
            eşleniyor — yani bu butonlar pratikte hiç görünmüyordu. */}
        {isIncoming &&
        (trade.status === 'offer_received' || trade.status === 'offer_sent') &&
        onAccept &&
        onReject ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onReject(trade.id)}
              className="px-2.5 py-1 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-100 text-xs font-semibold transition-colors cursor-pointer"
            >
              Reddet
            </button>
            {/* Karşı teklif: reddet ile kabul arasındaki üçüncü yol
                (rapor md. 26) */}
            {onCounter && (
              <button
                type="button"
                onClick={() => onCounter(trade.id)}
                className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100 text-xs font-semibold transition-colors cursor-pointer"
              >
                Karşı Teklif
              </button>
            )}
            <button
              type="button"
              onClick={() => onAccept(trade.id)}
              className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Kabul Et
            </button>
          </div>
        ) : (
          <span className="text-[11px] font-semibold text-emerald-700">Detayları Gör →</span>
        )}
      </div>
    </div>
  );
};
