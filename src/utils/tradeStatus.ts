import { TradeStatus } from '../types';
import type { LucideIcon } from 'lucide-react';
import {
  Send,
  CornerUpLeft,
  Lock,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';

// Takas durumlarının TEK kaynaklı, insan dilindeki karşılıkları.
//
// Rapor md. 28: kullanıcıya `delivery_planned` gibi teknik statüler değil,
// ne olduğunu anlatan cümleler gösterilmeli. Etiketler daha önce
// TradeCard içinde gömülüydü ve başka ekranlar (sohbet, takas süreci)
// kendi metinlerini uyduruyordu; artık tek yerden geliyor.
//
// ── RENK KARARI ──────────────────────────────────────────────────────────
// Bu dosya 14 durum için SEKİZ ayrı renk ailesi kullanıyordu (amber, emerald,
// purple, blue, indigo, teal, rose, stone). Sonuç bir gökkuşağıydı ve iki
// tasarım kuralını birden çiğniyordu:
//
//   * "Yeşil marka rengidir… her yeri yeşile boyamayın" (md. 64-70) —
//     kuralın amacı renk enflasyonunu önlemek; sekiz rastgele ton bunun
//     tersi. Mor bir rozetin kullanıcıya söylediği hiçbir şey yok:
//     "karşı teklif" ile "kilitlendi" arasındaki fark renkten okunamaz.
//   * Hiçbiri tasarım tokenı değildi, yani koyu temada olduğu gibi kalıp
//     bembeyaz parlıyorlardı.
//
// Yerine DÖRT anlamsal ton kondu — kullanıcının gerçekten sorduğu soru
// "bu takas ne durumda?" ve cevabı dört başlıktan biri:
//
//   nötr    → sıra karşı tarafta / bekliyor
//   marka   → ilerliyor, iyi gidiyor
//   sönük   → kapandı, bir şey çıkmadı
//   tehlike → sorun var, müdahale gerek
//
// Ayrıca her duruma bir ikon eklendi: renk tek başına durum taşımamalı
// (md. 98) — renk körü bir kullanıcı ya da gri basılmış bir ekran görüntüsü
// için etiket + ikon yeterli olmalı.
// ─────────────────────────────────────────────────────────────────────────

export type TradeStatusTone = 'neutral' | 'progress' | 'closed' | 'danger';

const TONE_CLASS: Record<TradeStatusTone, string> = {
  neutral: 'bg-canvas text-ink-soft border-line',
  progress: 'bg-brand-soft text-brand-dark border-brand-line',
  closed: 'bg-canvas text-ink-faint border-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
};

const TRADE_STATUS_META: Record<
  TradeStatus,
  { label: string; tone: TradeStatusTone; icon: LucideIcon }
> = {
  offer_sent: { label: 'Teklif gönderildi', tone: 'neutral', icon: Send },
  offer_received: { label: 'Gelen teklif', tone: 'neutral', icon: Send },
  counter_offered: { label: 'Karşı teklif verildi', tone: 'neutral', icon: CornerUpLeft },
  accepted: { label: 'Teklif kabul edildi', tone: 'progress', icon: CheckCircle2 },
  locked: { label: 'Ürünler takas için ayrıldı', tone: 'progress', icon: Lock },
  delivery_planned: { label: 'Teslimat planlandı', tone: 'progress', icon: Truck },
  shipped: { label: 'Kargoya verildi', tone: 'progress', icon: Truck },
  received: { label: 'Teslimat onaylandı', tone: 'progress', icon: CheckCircle2 },
  verified: { label: 'İki taraf onayladı', tone: 'progress', icon: CheckCircle2 },
  completed: { label: 'Takas tamamlandı', tone: 'progress', icon: CheckCircle2 },
  rejected: { label: 'Reddedildi', tone: 'closed', icon: XCircle },
  cancelled: { label: 'İptal edildi', tone: 'closed', icon: XCircle },
  expired: { label: 'Süresi doldu', tone: 'closed', icon: Clock },
  disputed: { label: 'Anlaşmazlık bildirildi', tone: 'danger', icon: AlertTriangle },
};

export function tradeStatusLabel(status: TradeStatus): string {
  return TRADE_STATUS_META[status]?.label ?? status;
}

export function tradeStatusBadge(status: TradeStatus): {
  label: string;
  color: string;
  tone: TradeStatusTone;
  icon: LucideIcon;
} {
  const meta = TRADE_STATUS_META[status];

  if (!meta) {
    // DB yeni bir durum döndürdüyse ham değeri göstermek, boş bir rozet
    // göstermekten iyidir.
    return { label: status, color: TONE_CLASS.neutral, tone: 'neutral', icon: Clock };
  }

  return { label: meta.label, color: TONE_CLASS[meta.tone], tone: meta.tone, icon: meta.icon };
}
