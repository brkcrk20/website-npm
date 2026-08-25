import { TradeStatus } from '../types';

// Takas durumlarının TEK kaynaklı, insan dilindeki karşılıkları.
//
// Rapor md. 28: kullanıcıya `delivery_planned` gibi teknik statüler değil,
// ne olduğunu anlatan cümleler gösterilmeli. Etiketler daha önce
// TradeCard içinde gömülüydü ve başka ekranlar (sohbet, takas süreci)
// kendi metinlerini uyduruyordu; artık tek yerden geliyor.

const TRADE_STATUS_META: Record<
  TradeStatus,
  { label: string; color: string }
> = {
  offer_sent: { label: 'Teklif gönderildi', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  offer_received: { label: 'Gelen teklif', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  counter_offered: { label: 'Karşı teklif verildi', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  accepted: { label: 'Teklif kabul edildi', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  locked: { label: 'Ürünler takas için ayrıldı', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  delivery_planned: { label: 'Teslimat planlandı', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  shipped: { label: 'Kargoya verildi', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  received: { label: 'Teslimat onaylandı', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  verified: { label: 'İki taraf onayladı', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  completed: { label: 'Takas tamamlandı', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  rejected: { label: 'Reddedildi', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  cancelled: { label: 'İptal edildi', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  expired: { label: 'Süresi doldu', color: 'bg-stone-100 text-stone-600 border-stone-200' },
  disputed: { label: 'Anlaşmazlık bildirildi', color: 'bg-rose-50 text-rose-800 border-rose-200' },
};

export function tradeStatusLabel(status: TradeStatus): string {
  return TRADE_STATUS_META[status]?.label ?? status;
}

export function tradeStatusBadge(status: TradeStatus): { label: string; color: string } {
  return (
    TRADE_STATUS_META[status] ?? {
      label: status,
      color: 'bg-stone-100 text-stone-700 border-stone-200',
    }
  );
}
