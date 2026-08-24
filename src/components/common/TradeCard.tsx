import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TradeOffer, TradeStatus } from '../../types';
import { PLACEHOLDER_IMAGE } from '../../constants';
import { ArrowLeftRight, Leaf, ShieldCheck } from 'lucide-react';

interface TradeCardProps {
  trade: TradeOffer;
  /** Kartın "gelen mi giden mi" olduğunu bu kimlikten anlar. */
  currentUserId: string;
  onClick?: () => void;
  className?: string;
}

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  offer_sent: { label: 'Yanıt bekliyor', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  offer_received: { label: 'Gelen teklif', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  counter_offered: { label: 'Karşı teklif', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  accepted: { label: 'Kabul edildi', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  locked: { label: 'Ürünler kilitlendi', color: 'bg-sky-50 text-sky-800 border-sky-200' },
  delivery_planned: { label: 'Teslimat planlandı', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  verified: { label: 'Teslim alındı', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  completed: { label: 'Tamamlandı', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  rejected: { label: 'Reddedildi', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  cancelled: { label: 'İptal edildi', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  disputed: { label: 'Anlaşmazlık', color: 'bg-rose-50 text-rose-800 border-rose-200' },
};

function statusBadge(status: TradeStatus) {
  return STATUS_BADGES[status] ?? { label: status, color: 'bg-stone-100 text-stone-700 border-stone-200' };
}

export const TradeCard: React.FC<TradeCardProps> = ({
  trade,
  currentUserId,
  onClick,
  className = '',
}) => {
  const navigate = useNavigate();

  const isIncoming = trade.receiverId === currentUserId;
  const otherUser = isIncoming ? trade.initiator : trade.receiver;

  // "Senin tarafın" her zaman solda: gelen teklifte senden istenen ürün,
  // giden teklifte senin verdiğin ürün.
  const myItem = isIncoming ? trade.requestedListings[0] : trade.offeredListings[0];
  const theirItem = isIncoming ? trade.offeredListings[0] : trade.requestedListings[0];

  const badge = statusBadge(trade.status);

  return (
    <div
      onClick={() => (onClick ? onClick() : navigate(`/teklif/${trade.id}`))}
      className={`bg-white dark:bg-stone-900 rounded-2xl border border-stone-200/90 dark:border-stone-800 p-4 hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer ${className}`}
    >
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={otherUser.avatarUrl}
            alt={otherUser.fullName}
            className="w-9 h-9 rounded-full object-cover border border-stone-200 dark:border-stone-700 bg-stone-100 shrink-0"
            loading="lazy"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold truncate">{otherUser.fullName}</span>
              {otherUser.trustProfile.reviewCount > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded font-semibold shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  {otherUser.trustProfile.score.toFixed(1)}
                </span>
              )}
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

        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border shrink-0 ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 my-3 relative items-stretch">
        {[
          { item: myItem, label: isIncoming ? 'Senden istenen' : 'Senin verdiğin' },
          { item: theirItem, label: isIncoming ? 'Sana teklif edilen' : 'Senin istediğin' },
        ].map((side, index) => (
          <div
            key={index}
            className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 flex flex-col items-center text-center"
          >
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">
              {side.label}
            </span>
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-700 mb-1.5">
              <img
                src={side.item?.images[0] || PLACEHOLDER_IMAGE}
                alt={side.item?.title ?? 'Ürün'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <span className="text-xs font-bold line-clamp-1">{side.item?.title ?? '—'}</span>
            {side.item && (
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                {side.item.estimatedImpact.co2eKg} kg CO₂e
              </span>
            )}
          </div>
        ))}

        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-xs flex items-center justify-center">
          <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
        </span>
      </div>

      {trade.note && (
        <p className="p-2 rounded-xl bg-stone-50 dark:bg-stone-800/60 text-xs text-stone-600 dark:text-stone-300 mb-3 line-clamp-2">
          {trade.note}
        </p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-stone-100 dark:border-stone-800 text-xs">
        <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-400 font-medium">
          <Leaf className="w-3.5 h-3.5" />
          Toplam +{trade.combinedImpact.co2eKg} kg CO₂e
        </span>
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          Detaylar →
        </span>
      </div>
    </div>
  );
};
