import React from 'react';
import { Link } from 'react-router-dom';
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
      <span className="w-16 h-16 rounded-lg mb-1.5 bg-canvas border border-line flex items-center justify-center text-ink-faint">
        <ImageOff className="w-5 h-5" />
        <span className="sr-only">Fotoğraf eklenmemiş</span>
      </span>
    );
  }

  return (
    <span className="w-16 h-16 rounded-lg overflow-hidden bg-canvas mb-1.5 block">
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
  const offeredItem = trade.offeredListings[0];
  const requestedItem = trade.requestedListings[0];
  const otherUser = isIncoming ? trade.initiator : trade.receiver;

  // Etiketler artık tek kaynaktan (src/utils/tradeStatus.ts) geliyor.
  const statusInfo = tradeStatusBadge(trade.status);
  const StatusIcon = statusInfo.icon;

  return (
    <div
      className={`relative bg-surface rounded-2xl border border-line p-4 hover:border-brand focus-within:border-brand hover:shadow-md transition-all ${className}`}
    >
      {/* Header: User & Status */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2.5">
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.fullName}
            className="w-9 h-9 rounded-full object-cover border border-line"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-ink">{otherUser.fullName}</span>
              {/* Puanı olmayan kullanıcıya "4.8" yazmak yerine gerçek
                  durumu göster (bkz. src/utils/trustDisplay.ts). */}
              <TrustCard trustProfile={otherUser.trustProfile} variant="compact" />
            </div>
            <span className="text-[11px] text-ink-faint">
              {new Date(trade.createdAt).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>

        {/* Rozet artık ikon da taşıyor: renk tek başına durum
            belirtmemeli (md. 98). */}
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${statusInfo.color}`}
        >
          <StatusIcon className="w-3 h-3 shrink-0" />
          {statusInfo.label}
        </span>
      </div>

      {/* Side-by-Side Comparison Container */}
      <div className="grid grid-cols-2 gap-2.5 my-3 relative items-center">
        {/* Left Side: Senin Ürünün */}
        <div className="p-2.5 rounded-xl bg-canvas border border-line flex flex-col items-center text-center">
          <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-1">
            {isIncoming ? 'İstenen Ürünün' : 'Teklif Ettiğin Ürün'}
          </span>
          <ItemThumb listing={isIncoming ? requestedItem : offeredItem} />
          <span className="text-xs font-bold text-ink line-clamp-1">
            {isIncoming ? requestedItem?.title : offeredItem?.title}
          </span>
        </div>

        {/* Center Exchange Icon badge */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-surface border border-line shadow-xs flex items-center justify-center">
          <ArrowLeftRight className="w-3.5 h-3.5 text-brand-dark" />
        </div>

        {/* Right Side: Karşı Tarafın Ürünü */}
        <div className="p-2.5 rounded-xl bg-canvas border border-line flex flex-col items-center text-center">
          <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider mb-1">
            {isIncoming ? 'Teklif Edilen Ürün' : 'İstediğin Ürün'}
          </span>
          <ItemThumb listing={isIncoming ? offeredItem : requestedItem} />
          <span className="text-xs font-bold text-ink line-clamp-1">
            {isIncoming ? offeredItem?.title : requestedItem?.title}
          </span>
        </div>
      </div>

      {/* Note preview if any */}
      {trade.note && (
        <div className="p-2 rounded-xl bg-canvas text-xs text-ink-soft italic mb-3 line-clamp-1">
          "{trade.note}"
        </div>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-line text-xs text-ink-soft">
        {/* Quick action buttons if incoming and waiting.
            NOT: koşul eskiden yalnızca 'offer_received' idi; oysa DB'den
            gelen bekleyen teklifler hydrateOffer() içinde 'offer_sent'e
            eşleniyor — yani bu butonlar pratikte hiç görünmüyordu. */}
        {isIncoming &&
        (trade.status === 'offer_received' || trade.status === 'offer_sent') &&
        onAccept &&
        onReject ? (
          <div className="relative z-10 flex items-center gap-1.5 mr-auto">
            <button
              type="button"
              onClick={() => onReject(trade.id)}
              className="px-2.5 py-1 rounded-lg border border-line text-ink-soft hover:bg-canvas text-xs font-semibold transition-colors cursor-pointer"
            >
              Reddet
            </button>
            {/* Karşı teklif: reddet ile kabul arasındaki üçüncü yol
                (rapor md. 26) */}
            {onCounter && (
              <button
                type="button"
                onClick={() => onCounter(trade.id)}
                className="px-2.5 py-1 rounded-lg border border-brand-line bg-brand-soft/60 text-brand-dark hover:bg-brand-soft text-xs font-semibold transition-colors cursor-pointer"
              >
                Karşı Teklif
              </button>
            )}
            <button
              type="button"
              onClick={() => onAccept(trade.id)}
              className="px-3 py-1 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Kabul Et
            </button>
          </div>
        ) : null}
        <Link
          to={`/teklif/${trade.id}`}
          className="text-[11px] font-semibold text-brand-dark outline-hidden after:absolute after:inset-0 after:rounded-2xl"
        >
          Detayları Gör
          <span className="sr-only"> — {statusInfo.label}</span> →
        </Link>
      </div>
    </div>
  );
};
