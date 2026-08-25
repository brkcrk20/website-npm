import {
  TradeOffer,
  TradeStatus,
  UserProfile,
  Listing,
  Review,
  TradeEvent,
  TradeCancellationReason,
} from '../types';
import { supabase } from '../lib/supabase';
import { mapProfile } from './authService';
import { enrichListings } from './listingService';
import { messageService } from './messageService';
import type { TablesInsert, TablesUpdate } from '../types/supabase';

/**
 * Profil join'lerinde çekilen kolonlar.
 *
 * GÜVENLİK: `profiles(*)` kullanılmamalı — `profiles` üzerindeki RLS
 * politikası satır bazlıdır (`using (true)`), Postgres'te kolon bazlı RLS
 * yoktur. `*` ile sorgulandığında karşı tarafın `phone` alanı da istemciye
 * iniyordu. Ekranda kullanılmıyor; join açık kolon listesine sabitlendi.
 */
const PROFILE_COLUMNS = 'id, full_name, avatar_url, city, district';


// ─────────────────────────────────────────────────────────────────────────
// NOT: Bu dosya artık mockData yerine gerçek Supabase sorguları kullanıyor.
//
// DB şeması ile frontend `TradeOffer` tipi arasındaki fark için
// swaloop-devam-plani.md §5.2'ye bakın. Özetle:
//  - `trade_offers`  : teklif (sender/receiver/status/message/parent_offer_id)
//  - `trade_offer_items`: teklife dahil ilanlar, `role` = 'offered' | 'requested'
//  - `trades`        : teklif KABUL EDİLİNCE oluşan ayrı kayıt (status/delivery)
//  - `trade_events`  : trades.id'ye bağlı serbest formatlı olay günlüğü
//
// `trade_offer_items.role` DEĞERLERİ (rapor 1.2 fix):
// Bu kolon eskiden düz `text` idi ve 'offered' / 'requested' değerleri hiç
// doğrulanmamış bir varsayımdı. Artık:
//   1) DB'de `trade_offer_items_role_check` CHECK constraint'i var
//      (bkz. supabase/migrations/20260819070000_add_trade_offer_items_role_check.sql)
//      — sadece 'offered' ve 'requested' kabul edilir, başka bir değer
//      INSERT anında anlaşılır bir Postgres hatası verir.
//   2) Kodda bu iki değer TRADE_ITEM_ROLE sabiti üzerinden tek noktadan
//      kullanılıyor (aşağıda), böylece "offered" gibi bir string'in bir
//      yerde yanlış yazılması (typo) derleme zamanında yakalanır.
// ─────────────────────────────────────────────────────────────────────────

// Bir teklifin yanıtsız kalabileceği süre. DB tarafındaki karşılığı
// `trade_offers.expires_at` kolonunun varsayılanıdır (48 saat) — ikisi
// birlikte değişmeli (bkz. migration 20260820000000, rapor md. 32).
export const OFFER_LIFETIME_HOURS = 48;

// Tek doğruluk kaynağı: DB CHECK constraint'i ile birebir eşleşmeli.
export const TRADE_ITEM_ROLE = {
  OFFERED: 'offered',
  REQUESTED: 'requested',
} as const;

type TradeItemRole = (typeof TRADE_ITEM_ROLE)[keyof typeof TRADE_ITEM_ROLE];

type TradeOfferRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  message: string | null;
  parent_offer_id: string | null;
  delivery_method: string | null;
  delivery_scheduled_at: string | null;
  delivery_location_name: string | null;
  delivery_notes: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
  sender?: any;
  receiver?: any;
  items?: TradeOfferItemRow[];
};

type TradeOfferItemRow = {
  id: string;
  offer_id: string;
  listing_id: string;
  owner_id: string;
  role: TradeItemRole;
  created_at: string;
  listing?: any;
};

type TradeRow = {
  id: string;
  offer_id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  delivery_method: string | null;
  delivery_scheduled_at: string | null;
  delivery_location_name: string | null;
  delivery_notes: string | null;
  started_at: string;
  completed_at: string | null;
  sender_confirmed_at: string | null;
  receiver_confirmed_at: string | null;
};

type TradeEventRow = {
  id: string;
  trade_id: string;
  actor_id: string | null;
  event_type: string;
  note: string | null;
  created_at: string;
};

const OFFER_SELECT =
  `*, sender:profiles!trade_offers_sender_id_fkey(${PROFILE_COLUMNS}), receiver:profiles!trade_offers_receiver_id_fkey(${PROFILE_COLUMNS}), items:trade_offer_items(*, listing:listings(*, user:profiles(${PROFILE_COLUMNS}), images:listing_images(storage_path)))`;

/** Sohbete düşen takas kartının metni: "PS5 ↔ Kamera" (rapor md. 33). */
function buildTradeSummary(offered: Listing[], requested: Listing[]): string {
  const left = offered.map((l) => l.title).join(' + ') || 'Ürün';
  const right = requested.map((l) => l.title).join(' + ') || 'Ürün';

  return `${left} ↔ ${right}`;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Bekleniyor';
  return new Date(iso).toLocaleDateString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Rapor 1.3 fix: teslimat detaylarını (tarih/konum/not) tradeRow varsa
// oradan (kabul sonrası kilitlenmiş değer), yoksa offerRow'dan (teklif
// anında seçilen, henüz kabul edilmemiş değer) okur. Üç alan de boşsa
// `undefined` döner, böylece TradeDetailPage'in kendi placeholder
// metinleri devreye girebilir.
function buildDeliveryDetails(
  tradeRow: TradeRow | null,
  offerRow: TradeOfferRow
): TradeOffer['deliveryDetails'] {
  const scheduledDate = tradeRow?.delivery_scheduled_at ?? offerRow.delivery_scheduled_at;
  const locationName = tradeRow?.delivery_location_name ?? offerRow.delivery_location_name;
  const notes = tradeRow?.delivery_notes ?? offerRow.delivery_notes;

  if (!scheduledDate && !locationName && !notes) return undefined;

  return {
    ...(scheduledDate ? { scheduledDate } : {}),
    ...(locationName ? { locationName } : {}),
    ...(notes ? { notes } : {}),
  };
}

<<<<<<< HEAD
/** Adım 5 açıklaması: kimin onayladığı, kimin beklendiği. */
function describeConfirmations(
  tradeRow: TradeRow | null,
  initiatorName: string,
  receiverName: string
): string {
  if (!tradeRow) return 'Ürünlerin teslim alındığının doğrulanması.';

  const senderOk = !!tradeRow.sender_confirmed_at;
  const receiverOk = !!tradeRow.receiver_confirmed_at;

  if (senderOk && receiverOk) return 'İki taraf da teslimatı onayladı.';
  if (senderOk) return `${initiatorName} onayladı, ${receiverName} bekleniyor.`;
  if (receiverOk) return `${receiverName} onayladı, ${initiatorName} bekleniyor.`;

  return 'Ürünlerin teslim alındığının doğrulanması.';
}

function hydrateOffer(
  offerRow: TradeOfferRow,
  tradeRow: TradeRow | null,
  events: TradeEventRow[],
  listingsById: Map<string, Listing>
): TradeOffer {
  const initiator = mapProfile(offerRow.sender);
  const receiver = mapProfile(offerRow.receiver);

  const pickListings = (role: TradeItemRole): Listing[] =>
    (offerRow.items ?? [])
      .filter((i) => i.role === role)
      .map((i) => listingsById.get(i.listing_id))
      .filter((l): l is Listing => Boolean(l));

  const offeredListings = pickListings(TRADE_ITEM_ROLE.OFFERED);
  const requestedListings = pickListings(TRADE_ITEM_ROLE.REQUESTED);
=======
async function hydrateOffer(
  offerRow: TradeOfferRow,
  tradeRow: TradeRow | null,
  events: TradeEventRow[]
): Promise<TradeOffer> {
  const initiator = mapProfile(offerRow.sender);
  const receiver = mapProfile(offerRow.receiver);

  const offeredItemRows = (offerRow.items ?? []).filter((i) => i.role === TRADE_ITEM_ROLE.OFFERED);
  const requestedItemRows = (offerRow.items ?? []).filter((i) => i.role === TRADE_ITEM_ROLE.REQUESTED);

  const offeredListings = await enrichListings(
    offeredItemRows.map((i) => i.listing).filter(Boolean)
  );
  const requestedListings = await enrichListings(
    requestedItemRows.map((i) => i.listing).filter(Boolean)
  );
>>>>>>> aa112bc (Son güncellemeler)

  // Frontend durumu: teklif reddedilmediyse ve henüz `trades` satırı yoksa
  // teklifin kendi durumu (offer_sent / counter_offered) geçerli; `trades`
  // satırı oluştuktan sonra asıl ilerleme onun `status`'una göre okunur.
  // DB'deki ham status değerleri (trade_offers_status_check /
  // trades_status_check constraint'lerine uyan kısıtlı kelime kümesi)
  // burada UI'nin kullandığı zengin TradeStatus kümesine çevrilir.
  const rawStatus = tradeRow?.status ?? offerRow.status;
  const DB_TO_UI_STATUS: Record<string, TradeStatus> = {
    pending: 'offer_sent',
    countered: 'counter_offered',
    received: 'verified',
    in_transit: 'shipped',
  };
  const status: TradeStatus = (DB_TO_UI_STATUS[rawStatus] ?? rawStatus) as TradeStatus;

  const deliveryEvent = events.find((e) => e.event_type === 'delivery_planned');
  const verifiedEvent = events.find((e) => e.event_type === 'verified');
  const completedEvent = events.find((e) => e.event_type === 'completed');

  const step2Failed = offerRow.status === 'rejected';
  const accepted = !!tradeRow;

  const timeline: TradeEvent[] = [
    {
      id: `${offerRow.id}-step1`,
      step: 1,
      title: 'Teklif Gönderildi',
      description: `${initiator.fullName} takas teklifini iletti.`,
      timestamp: fmtDateTime(offerRow.created_at),
      actorId: initiator.id,
      actorName: initiator.fullName,
      status: 'completed',
    },
    {
      id: `${offerRow.id}-step2`,
      step: 2,
      title: 'Teklif Kabulü',
      description: step2Failed
        ? 'Teklif reddedildi.'
        : accepted
        ? `${receiver.fullName} teklifi kabul etti.`
        : 'Karşı tarafın onayı bekleniyor.',
      timestamp: step2Failed
        ? fmtDateTime(offerRow.updated_at)
        : accepted
        ? fmtDateTime(tradeRow!.started_at)
        : 'Bekleniyor',
      actorId: receiver.id,
      actorName: receiver.fullName,
      status: step2Failed ? 'failed' : accepted ? 'completed' : 'pending',
    },
    {
      id: `${offerRow.id}-step3`,
      step: 3,
      title: 'Ürünler Kilitlendi',
      description: accepted
        ? 'Ürünler diğer kullanıcılara kilitlendi.'
        : 'Takas onaylandığında ürünler kilitlenecek.',
      timestamp: accepted ? fmtDateTime(tradeRow!.started_at) : 'Bekleniyor',
      actorId: 'system',
      actorName: 'Swaloop Sistemi',
      status: step2Failed ? 'failed' : accepted ? 'completed' : 'pending',
    },
    {
      id: `${offerRow.id}-step4`,
      step: 4,
      title: 'Teslimat & Buluşma',
      description: 'Teslimat aşaması.',
      timestamp: fmtDateTime(deliveryEvent?.created_at ?? (accepted ? tradeRow!.started_at : null)),
      actorId: 'both',
      actorName: 'Her İki Taraf',
      status: !accepted
        ? 'pending'
        : status === 'verified' || status === 'completed'
        ? 'completed'
        : 'in_progress',
    },
    {
      id: `${offerRow.id}-step5`,
      step: 5,
      title: 'Karşılıklı Onay',
      // Bu adım artık gerçekten karşılıklı: takas ancak iki taraf da
      // `confirm_trade_receipt()` çağırdıktan sonra ilerliyor
      // (bkz. migration 20260828000000). Eskiden tek taraf tıklayınca
      // takas "doğrulandı" oluyor ve iki tarafın güven sayacı da artıyordu.
      description: describeConfirmations(tradeRow, initiator.fullName, receiver.fullName),
      timestamp: fmtDateTime(verifiedEvent?.created_at ?? null),
      actorId: 'both',
      actorName: 'Her İki Taraf',
      status:
<<<<<<< HEAD
        status === 'verified' || status === 'completed'
          ? 'completed'
          : tradeRow?.sender_confirmed_at || tradeRow?.receiver_confirmed_at
          ? 'in_progress'
          : 'pending',
=======
        status === 'verified' || status === 'completed' ? 'completed' : 'pending',
>>>>>>> aa112bc (Son güncellemeler)
    },
    {
      id: `${offerRow.id}-step6`,
      step: 6,
      title: 'Takas Tamamlandı',
      description:
        status === 'completed'
          ? 'Takas başarıyla tamamlandı.'
          : 'Takas tamamlandığında profiliniz güncellenecek.',
      timestamp: fmtDateTime(completedEvent?.created_at ?? tradeRow?.completed_at ?? null),
      actorId: 'system',
      actorName: 'Swaloop Sistemi',
      status: status === 'completed' ? 'completed' : 'pending',
    },
  ];

  return {
    id: offerRow.id,
    initiatorId: offerRow.sender_id,
    initiator,
    receiverId: offerRow.receiver_id,
    receiver,
    offeredListingIds: offeredListings.map((l) => l.id),
    offeredListings,
    requestedListingIds: requestedListings.map((l) => l.id),
    requestedListings,
    note: offerRow.message ?? undefined,
    // Teklif kabul edilene kadar `trades` satırı yok, bu yüzden
    // teslimat tercihi `trade_offers`'tan (offerRow) okunur — bu, teklif
    // eden kişinin MakeOfferPage'de seçtiği değerdir. Kabul edildikten
    // sonra `trades` satırı oluşurken bu değerler oraya kopyalanır
    // (bkz. acceptOffer) ve artık `tradeRow`'dan (kilitlenmiş/nihai
    // değer olarak) okunur. Rapor 1.3 fix.
    deliveryMethod: ((tradeRow?.delivery_method ?? offerRow.delivery_method) as
      | TradeOffer['deliveryMethod']
      | null) ?? 'in_person',
    deliveryDetails: buildDeliveryDetails(tradeRow, offerRow),
    status,
    createdAt: offerRow.created_at,
    // Teklif ömrü artık gerçek bir DB alanı (rapor md. 32):
    // `trade_offers.expires_at`, varsayılan oluşturulma + 48 saat. Süresi
    // geçen bekleyen teklifleri `expire_stale_trade_offers()` kapatır
    // (bkz. migration 20260820000000). Kolon migration uygulanmadan önce
    // oluşmuş satırlarda boş olabilir, o yüzden eski hesap yedek kalıyor.
    expiresAt:
      offerRow.expires_at ??
      new Date(
        new Date(offerRow.created_at).getTime() + OFFER_LIFETIME_HOURS * 60 * 60 * 1000
      ).toISOString(),
    updatedAt: offerRow.updated_at,
    counterOfferFromId: offerRow.parent_offer_id ?? undefined,
    timeline,
<<<<<<< HEAD
    // Teslimat onayları (rapor: "Karşılıklı Onay" adımı). Arayüz bunlara
    // bakıp "onayın kaydedildi, karşı taraf bekleniyor" diyebiliyor.
    isConfirmedByInitiator: !!tradeRow?.sender_confirmed_at,
    isConfirmedByReceiver: !!tradeRow?.receiver_confirmed_at,
=======
>>>>>>> aa112bc (Son güncellemeler)
    // DB tarafında review'ların hangi teklife ait olduğunu görmek için ayrı
    // bir sorgu gerekiyor; bu iki alan getTradeById içinde ayrıca dolduruluyor.
    isReviewedByInitiator: undefined,
    isReviewedByReceiver: undefined,
  };
}

async function fetchTradeRowByOfferId(offerId: string): Promise<TradeRow | null> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();

  if (error) {
    console.error('Trade kaydı alınamadı:', error);
    return null;
  }
  return data as TradeRow | null;
}

<<<<<<< HEAD
/**
 * Bir teklif listesini TAM olarak, teklif sayısından BAĞIMSIZ sabit sayıda
 * istekle hidratlar.
 *
 * Önceki hâli her teklif için ayrı ayrı `trades`, `trade_events`, `reviews`
 * sorgusu ve iki kez `enrichListings` (o da kendi içinde 2 sorgu) atıyordu:
 * 20 teklifli bir "Takaslarım" ekranı ~140 HTTP isteği demekti. README'nin
 * "liste sorguları toplu çalışır, istek sayısı teklif sayısından bağımsızdır"
 * cümlesi kod tarafında karşılıksızdı. Artık gerçekten öyle: 3 sorgu +
 * enrichListings'in sabit 2 sorgusu.
 */
async function hydrateOffers(offerRows: TradeOfferRow[]): Promise<TradeOffer[]> {
  if (!offerRows.length) return [];

  const offerIds = offerRows.map((o) => o.id);

  const { data: tradeRows, error: tradeError } = await supabase
    .from('trades')
    .select('*')
    .in('offer_id', offerIds);

  if (tradeError) console.error('Trade kayıtları alınamadı:', tradeError);

  const tradeByOfferId = new Map<string, TradeRow>();
  for (const row of (tradeRows ?? []) as TradeRow[]) {
    tradeByOfferId.set(row.offer_id, row);
  }

  const tradeIds = [...tradeByOfferId.values()].map((t) => t.id);

  const [eventsResult, reviewsResult] = await Promise.all([
    tradeIds.length
      ? supabase
          .from('trade_events')
          .select('*')
          .in('trade_id', tradeIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as const),
    tradeIds.length
      ? supabase.from('reviews').select('trade_id, reviewer_id').in('trade_id', tradeIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (eventsResult.error) console.error('Trade eventleri alınamadı:', eventsResult.error);
  if (reviewsResult.error) console.error('Değerlendirme bayrakları alınamadı:', reviewsResult.error);

  const eventsByTradeId = new Map<string, TradeEventRow[]>();
  for (const row of (eventsResult.data ?? []) as TradeEventRow[]) {
    const list = eventsByTradeId.get(row.trade_id);
    if (list) list.push(row);
    else eventsByTradeId.set(row.trade_id, [row]);
  }

  const reviewersByTradeId = new Map<string, Set<string>>();
  for (const row of (reviewsResult.data ?? []) as { trade_id: string; reviewer_id: string }[]) {
    const set = reviewersByTradeId.get(row.trade_id);
    if (set) set.add(row.reviewer_id);
    else reviewersByTradeId.set(row.trade_id, new Set([row.reviewer_id]));
  }

  // Tüm tekliflerin tüm ilanları TEK seferde zenginleştirilir. Aynı ilan
  // birden fazla teklifte geçebileceği için önce id'ye göre tekilleştiriliyor.
  const listingRowById = new Map<string, any>();
  for (const offerRow of offerRows) {
    for (const item of offerRow.items ?? []) {
      if (item.listing && !listingRowById.has(item.listing_id)) {
        listingRowById.set(item.listing_id, item.listing);
      }
    }
  }

  const enriched = await enrichListings([...listingRowById.values()]);
  const listingsById = new Map<string, Listing>(enriched.map((l) => [l.id, l]));

  return offerRows.map((offerRow) => {
    const tradeRow = tradeByOfferId.get(offerRow.id) ?? null;
    const events = tradeRow ? eventsByTradeId.get(tradeRow.id) ?? [] : [];
    const offer = hydrateOffer(offerRow, tradeRow, events, listingsById);

    if (!tradeRow) return offer;

    const reviewers = reviewersByTradeId.get(tradeRow.id);

    return {
      ...offer,
      isReviewedByInitiator: reviewers ? reviewers.has(offer.initiatorId) : false,
      isReviewedByReceiver: reviewers ? reviewers.has(offer.receiverId) : false,
    };
  });
}

async function fullyHydrate(offerRow: TradeOfferRow): Promise<TradeOffer> {
  const [offer] = await hydrateOffers([offerRow]);
  return offer;
=======
async function fetchEventsForTrade(tradeId: string | undefined): Promise<TradeEventRow[]> {
  if (!tradeId) return [];
  const { data, error } = await supabase
    .from('trade_events')
    .select('*')
    .eq('trade_id', tradeId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Trade eventleri alınamadı:', error);
    return [];
  }
  return (data ?? []) as TradeEventRow[];
}

async function attachReviewFlags(
  offer: TradeOffer,
  tradeId: string | undefined
): Promise<TradeOffer> {
  if (!tradeId) return offer;

  const { data, error } = await supabase
    .from('reviews')
    .select('reviewer_id')
    .eq('trade_id', tradeId);

  if (error || !data) return offer;

  return {
    ...offer,
    isReviewedByInitiator: data.some((r) => r.reviewer_id === offer.initiatorId),
    isReviewedByReceiver: data.some((r) => r.reviewer_id === offer.receiverId),
  };
}

async function fullyHydrate(offerRow: TradeOfferRow): Promise<TradeOffer> {
  const tradeRow = await fetchTradeRowByOfferId(offerRow.id);
  const events = await fetchEventsForTrade(tradeRow?.id);
  const offer = await hydrateOffer(offerRow, tradeRow, events);
  return attachReviewFlags(offer, tradeRow?.id);
>>>>>>> aa112bc (Son güncellemeler)
}

export const tradeService = {
  /**
   * Admin/genel bakış amaçlı. Büyük veri setlerinde sayfalama eklenmeli.
   */
  async getAllTrades(): Promise<TradeOffer[]> {
    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Takas teklifleri alınamadı:', error);
      return [];
    }

<<<<<<< HEAD
    return hydrateOffers(data as unknown as TradeOfferRow[]);
=======
    return Promise.all(data.map((row: any) => fullyHydrate(row)));
>>>>>>> aa112bc (Son güncellemeler)
  },

  async getTradeById(id: string): Promise<TradeOffer | undefined> {
    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      console.error('Takas teklifi alınamadı:', error);
      return undefined;
    }

    return fullyHydrate(data as any);
  },

  async getUserIncomingTrades(userId: string): Promise<TradeOffer[]> {
    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Gelen teklifler alınamadı:', error);
      return [];
    }

<<<<<<< HEAD
    return hydrateOffers(data as unknown as TradeOfferRow[]);
=======
    return Promise.all(data.map((row: any) => fullyHydrate(row)));
>>>>>>> aa112bc (Son güncellemeler)
  },

  async getUserOutgoingTrades(userId: string): Promise<TradeOffer[]> {
    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('sender_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Giden teklifler alınamadı:', error);
      return [];
    }

<<<<<<< HEAD
    return hydrateOffers(data as unknown as TradeOfferRow[]);
=======
    return Promise.all(data.map((row: any) => fullyHydrate(row)));
>>>>>>> aa112bc (Son güncellemeler)
  },

  async createTradeOffer(data: {
    initiator: UserProfile;
    receiver: UserProfile;
    offeredListings: Listing[];
    requestedListings: Listing[];
    note?: string;
    deliveryMethod: 'in_person' | 'cargo' | 'safe_point';
    deliveryDetails?: {
      scheduledDate?: string;
      locationName?: string;
      notes?: string;
    };
    // Sohbete düşen kartın etiketi için: karşı teklif mi, ilk teklif mi?
    isCounterOffer?: boolean;
<<<<<<< HEAD
    // Karşı teklifte, yanıtlanan orijinal teklifin id'si. INSERT'in KENDİSİNDE
    // yazılmak zorunda: `notify_on_new_offer()` tetikleyicisi bildirim türünü
    // (`trade_offer` / `counter_offer`) `new.parent_offer_id`'ye bakarak
    // seçiyor ve o an satır zaten yazılmış oluyor. Eskiden bu alan INSERT'ten
    // SONRA ayrı bir UPDATE ile set ediliyordu, dolayısıyla her karşı teklif
    // karşı tarafa "Yeni takas teklifi" olarak bildiriliyordu.
    parentOfferId?: string;
  }): Promise<TradeOffer | undefined> {
    if (data.initiator.id === data.receiver.id) {
      console.error('Kendine takas teklifi gönderilemez.');
      return undefined;
    }

    const insertPayload: TablesInsert<'trade_offers'> = {
      sender_id: data.initiator.id,
      receiver_id: data.receiver.id,
      parent_offer_id: data.parentOfferId ?? null,
=======
  }): Promise<TradeOffer | undefined> {
    const insertPayload: TablesInsert<'trade_offers'> = {
      sender_id: data.initiator.id,
      receiver_id: data.receiver.id,
>>>>>>> aa112bc (Son güncellemeler)
      // DB check constraint (trade_offers_status_check) sadece
      // 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled' |
      // 'expired' değerlerine izin veriyor. UI'daki zengin durumlar
      // ('offer_sent' vb.) hydrateOffer() içinde bu DB değerinden türetiliyor.
      status: 'pending',
      message: data.note ?? null,
      // Rapor 1.3 fix: teklif anında seçilen teslimat tercihi artık
      // trade_offers'a yazılıyor. `trades` satırı henüz yok (ancak
      // acceptOffer'da oluşuyor), bu yüzden bu bilgi teklif kabul
      // edilene kadar burada tutulur; acceptOffer sırasında trades'e
      // kopyalanır.
      delivery_method: data.deliveryMethod,
      delivery_scheduled_at: data.deliveryDetails?.scheduledDate
        ? new Date(data.deliveryDetails.scheduledDate).toISOString()
        : null,
      delivery_location_name: data.deliveryDetails?.locationName ?? null,
      delivery_notes: data.deliveryDetails?.notes ?? null,
    };

    const { data: offerRow, error: offerError } = await supabase
      .from('trade_offers')
      .insert(insertPayload)
      .select()
      .single();

    if (offerError || !offerRow) {
      console.error('Teklif oluşturulamadı:', offerError);
      return undefined;
    }

    const itemRows: TablesInsert<'trade_offer_items'>[] = [
      ...data.offeredListings.map((l) => ({
        offer_id: offerRow.id,
        listing_id: l.id,
        owner_id: data.initiator.id,
        role: TRADE_ITEM_ROLE.OFFERED,
      })),
      ...data.requestedListings.map((l) => ({
        offer_id: offerRow.id,
        listing_id: l.id,
        owner_id: data.receiver.id,
        role: TRADE_ITEM_ROLE.REQUESTED,
      })),
    ];

    const { error: itemsError } = await supabase
      .from('trade_offer_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Teklif kalemleri oluşturulamadı:', itemsError);
      // Teklif satırı yetim kalmasın diye geri alınıyor.
      await supabase.from('trade_offers').delete().eq('id', offerRow.id);
      return undefined;
    }

    // Sohbeti takas bağlamına bağla (rapor md. 33): teklif gönderildiğinde
    // iki kullanıcının sohbetine "şu ↔ bu" kartı düşer.
    //
    // Bilerek yutuluyor: teklif zaten oluştu; sohbet kartı yazılamadı diye
    // kullanıcıya "teklif gönderilemedi" demek yanlış olur.
    try {
      await messageService.attachTradeToConversation(
        data.initiator.id,
        data.receiver.id,
        offerRow.id,
        buildTradeSummary(data.offeredListings, data.requestedListings),
        data.isCounterOffer ? 'counter_card' : 'trade_card'
      );
    } catch (chatError) {
      console.error('Teklif oluştu ama sohbete takas kartı düşürülemedi:', chatError);
    }

    return this.getTradeById(offerRow.id);
  },

<<<<<<< HEAD
  /**
   * Teklifi kabul eder.
   *
   * Eskiden bu üç ayrı istekti (teklifi 'accepted' yap → `trades` satırı aç →
   * olay kaydı yaz) ve aralarında hiçbir atomiklik yoktu:
   *   * ikinci istek başarısız olursa teklif "kabul edildi" görünüp arkasında
   *     takas olmuyordu; o teklif kalıcı olarak ilerletilemez hâle geliyordu,
   *   * çift tıklamada aynı teklif için İKİ `trades` satırı oluşuyor ve
   *     `fetchTradeRowByOfferId()`'nin .maybeSingle()'ı yüzünden teklif
   *     detayı bir daha hiç açılmıyordu,
   *   * teklifin durumu (reddedilmiş / süresi dolmuş / zaten kabul edilmiş)
   *     ve çağıranın gerçekten alıcı olup olmadığı hiç kontrol edilmiyordu.
   *
   * Üçü de `accept_trade_offer()` içinde tek işlem olarak yapılıyor
   * (bkz. migration 20260827000000). Fonksiyon idempotent: aynı teklif için
   * tekrar çağrılırsa var olan takası döndürür.
   */
  async acceptOffer(tradeId: string): Promise<TradeOffer | undefined> {
    const { error } = await supabase.rpc('accept_trade_offer', {
      p_offer_id: tradeId,
    });
=======
  async acceptOffer(tradeId: string): Promise<TradeOffer | undefined> {
    const { data: offerRow, error: offerError } = await supabase
      .from('trade_offers')
      .select('*')
      .eq('id', tradeId)
      .maybeSingle();
>>>>>>> aa112bc (Son güncellemeler)

    if (error) {
      console.error('Teklif kabul edilemedi:', error);
      return undefined;
    }

<<<<<<< HEAD
=======
    const { error: updateError } = await supabase
      .from('trade_offers')
      .update({ status: 'accepted' })
      .eq('id', tradeId);

    if (updateError) {
      console.error('Teklif durumu güncellenemedi:', updateError);
      return undefined;
    }

    const tradeInsert: TablesInsert<'trades'> = {
      offer_id: offerRow.id,
      sender_id: offerRow.sender_id,
      receiver_id: offerRow.receiver_id,
      status: 'locked',
      // Rapor 1.3 fix: teklif oluşturulurken trade_offers'a kaydedilen
      // teslimat tercihi burada trades'e taşınıyor, böylece kabul
      // edildikten sonra da kaybolmuyor.
      delivery_method: offerRow.delivery_method,
      delivery_scheduled_at: offerRow.delivery_scheduled_at,
      delivery_location_name: offerRow.delivery_location_name,
      delivery_notes: offerRow.delivery_notes,
    };

    const { data: tradeRow, error: tradeError } = await supabase
      .from('trades')
      .insert(tradeInsert)
      .select()
      .single();

    if (tradeError || !tradeRow) {
      console.error('Trade kaydı oluşturulamadı:', tradeError);
      return undefined;
    }

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      actor_id: offerRow.receiver_id,
      event_type: 'offer_accepted',
      note: 'Teklif kabul edildi, ürünler kilitlendi.',
    } as TablesInsert<'trade_events'>);

>>>>>>> aa112bc (Son güncellemeler)
    return this.getTradeById(tradeId);
  },

  async rejectOffer(
    tradeId: string,
    reason?: TradeCancellationReason,
    note?: string
  ): Promise<TradeOffer | undefined> {
    // DÜZELTİLDİ: burada eskiden `message: reason` yazılıyordu — yani ret
    // nedeni, teklifi gönderenin yazdığı NOTUN ÜZERİNE geçiyordu ve not
    // kalıcı olarak kayboluyordu. Neden artık kendi kolonunda tutuluyor
    // (rapor md. 31); ileride güven sisteminin girdisi olacak.
    const { error } = await supabase
      .from('trade_offers')
      .update({
        status: 'rejected',
        cancellation_reason: reason ?? null,
        cancellation_note: note ?? null,
      })
      .eq('id', tradeId);

    if (error) {
      console.error('Teklif reddedilemedi:', error);
      return undefined;
    }

    return this.getTradeById(tradeId);
  },

  /**
   * Takastan vazgeçme (rapor md. 31).
   *
   * İki durumu birden karşılar:
   *   * Teklif henüz kabul edilmediyse (`trades` satırı yok) → teklif geri
   *     çekilir.
   *   * Takas başlamışsa → `trades.status = 'cancelled'`. Bu, önceki
   *     migration'daki `release_listings_on_trade_end()` trigger'ını
   *     tetikleyip kilitli ilanları tekrar `active` yapar; aksi hâlde
   *     ilanlar sonsuza kadar kilitli kalırdı.
   */
  async cancelTrade(
    offerId: string,
    reason: TradeCancellationReason,
    note?: string
  ): Promise<TradeOffer | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(offerId);

    if (!tradeRow) {
      const { error } = await supabase
        .from('trade_offers')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancellation_note: note ?? null,
        })
        .eq('id', offerId);

      if (error) {
        console.error('Teklif geri çekilemedi:', error);
        return undefined;
      }

      return this.getTradeById(offerId);
    }

    const { error } = await supabase
      .from('trades')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancellation_note: note ?? null,
      })
      .eq('id', tradeRow.id);

    if (error) {
      console.error('Takas iptal edilemedi:', error);
      return undefined;
    }

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      event_type: 'cancelled',
      note: note ?? null,
    } as TablesInsert<'trade_events'>);

    return this.getTradeById(offerId);
  },

  async createCounterOffer(
    originalTradeId: string,
    newOfferedListings: Listing[],
    newRequestedListings: Listing[],
    newDeliveryMethod: 'in_person' | 'cargo' | 'safe_point',
    note?: string
  ): Promise<TradeOffer | undefined> {
    const orig = await this.getTradeById(originalTradeId);
    if (!orig) return undefined;
<<<<<<< HEAD
=======

    await supabase
      .from('trade_offers')
      .update({ status: 'countered' })
      .eq('id', originalTradeId);
>>>>>>> aa112bc (Son güncellemeler)

    // Karşı teklif ÖNCE oluşturulur. Eskiden orijinal teklif hemen
    // 'countered' yapılıyordu; karşı teklif oluşturulamazsa (ağ hatası,
    // engellenmiş kullanıcı) orijinal teklif geri alınamaz biçimde
    // "karşı teklif verildi" durumunda kalıyor ve iki taraf da onu bir daha
    // yanıtlayamıyordu.
    const counterOffer = await this.createTradeOffer({
      initiator: orig.receiver,
      receiver: orig.initiator,
      offeredListings: newOfferedListings,
      requestedListings: newRequestedListings,
      deliveryMethod: newDeliveryMethod,
      isCounterOffer: true,
<<<<<<< HEAD
      parentOfferId: originalTradeId,
=======
>>>>>>> aa112bc (Son güncellemeler)
      // Orijinal teklifte kararlaştırılan tarih/buluşma yeri karşı teklifte
      // kaybolmasın; karşı teklif veren yalnızca yöntemi değiştirebiliyor.
      deliveryDetails: orig.deliveryDetails,
      note: note || `Karşı teklif: ${orig.offeredListings[0]?.title ?? ''} yerine alternatif öneri.`,
    });

    if (!counterOffer) return undefined;

    const { error: markError } = await supabase
      .from('trade_offers')
<<<<<<< HEAD
      .update({ status: 'countered' })
      .eq('id', originalTradeId);

    if (markError) {
      console.error('Orijinal teklif "karşı teklif verildi" olarak işaretlenemedi:', markError);
    }
=======
      .update({ parent_offer_id: originalTradeId })
      .eq('id', counterOffer.id);
>>>>>>> aa112bc (Son güncellemeler)

    return this.getTradeById(counterOffer.id);
  },

<<<<<<< HEAD
  /**
   * Adım 5 ("Karşılıklı Onay"): çağıran tarafın teslimat onayını kaydeder.
   *
   * Takas ancak İKİ taraf da onayladığında `received` adımına geçer; bunu
   * `confirm_trade_receipt()` tek işlemde yapıyor (bkz. migration
   * 20260828000000). Eskiden bu adım tek taraflı bir UPDATE'ti: bir kullanıcı
   * karşı taraf hiçbir şey onaylamadan takası ilerletip tamamlayabiliyor ve
   * trg_trades_update_trust_counters İKİ profilin de güven sayacını
   * artırıyordu.
   */
  async confirmReceipt(
    offerId: string
  ): Promise<{ trade?: TradeOffer; bothConfirmed: boolean } | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(offerId);

    if (!tradeRow) {
      console.error('confirmReceipt: bu teklife bağlı bir trade kaydı yok.');
      return undefined;
    }

    const { data, error } = await supabase.rpc('confirm_trade_receipt', {
      p_trade_id: tradeRow.id,
    });

    if (error) {
      console.error('Teslimat onaylanamadı:', error);
      return undefined;
    }

    return {
      trade: await this.getTradeById(offerId),
      bothConfirmed: data === 'both_confirmed',
    };
  },

  async advanceTradeStep(tradeId: string, targetStep: 4 | 5 | 6): Promise<TradeOffer | undefined> {
    // Adım 5 artık bir durum güncellemesi değil, bir ONAY: iki taraf da
    // onaylamadan takas ilerlemiyor.
    if (targetStep === 5) {
      const result = await this.confirmReceipt(tradeId);
      return result?.trade;
    }

    const tradeRow = await fetchTradeRowByOfferId(tradeId);
    if (!tradeRow) {
      console.error('advanceTradeStep: bu teklife bağlı bir trade kaydı yok.');
      return undefined;
    }

    // Adım sırası artık DB'de de zorunlu (trg_enforce_trade_transition), ama
    // burada da kontrol ediliyor ki kullanıcıya boş bir hata yerine anlamlı
    // bir sonuç dönebilelim ve gereksiz istek atılmasın. Eskiden hiçbir
    // kontrol yoktu: "kilitli" bir takas tek çağrıda "tamamlandı" yapılabiliyor
    // ve teslimat hiç gerçekleşmeden iki tarafın güven sayacı artıyordu.
    if (tradeRow.status === 'completed' || tradeRow.status === 'cancelled') {
      console.error('advanceTradeStep: sonuçlanmış bir takas ilerletilemez.', tradeRow.status);
      return this.getTradeById(tradeId);
    }

    // Adım 6, iki tarafın da teslimat onayını gerektiriyor (DB'de de zorunlu:
    // trg_enforce_trade_transition). Burada da bakılıyor ki kullanıcı ham bir
    // Postgres hatası yerine anlamlı bir sonuç görsün.
    if (
      targetStep === 6 &&
      (!tradeRow.sender_confirmed_at || !tradeRow.receiver_confirmed_at)
    ) {
      console.error(
        'advanceTradeStep: takas ancak iki taraf da teslimatı onayladıktan sonra tamamlanabilir.'
      );
      return this.getTradeById(tradeId);
    }

    const rank: Record<string, number> = {
      locked: 1,
      delivery_planned: 2,
      in_transit: 3,
      received: 4,
      completed: 5,
    };

=======
  async advanceTradeStep(tradeId: string, targetStep: 4 | 5 | 6): Promise<TradeOffer | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(tradeId);
    if (!tradeRow) {
      console.error('advanceTradeStep: bu teklife bağlı bir trade kaydı yok.');
      return undefined;
    }

>>>>>>> aa112bc (Son güncellemeler)
    let newStatus: string;
    let eventType: string;
    const update: TablesUpdate<'trades'> = {};

    if (targetStep === 4) {
      newStatus = 'delivery_planned';
      eventType = 'delivery_planned';
<<<<<<< HEAD
=======
    } else if (targetStep === 5) {
      // trades_status_check DB constraint'i 'verified' değerini kabul
      // etmiyor (izinli: locked/delivery_planned/in_transit/received/
      // completed/disputed/cancelled) — DB'ye 'received' yazılır, UI
      // tarafı bunu hydrateOffer() içinde 'verified' olarak gösterir.
      newStatus = 'received';
      eventType = 'verified';
>>>>>>> aa112bc (Son güncellemeler)
    } else {
      newStatus = 'completed';
      eventType = 'completed';
      update.completed_at = new Date().toISOString();
    }

<<<<<<< HEAD
    if ((rank[newStatus] ?? 0) <= (rank[tradeRow.status] ?? 0)) {
      console.error(
        `advanceTradeStep: takas adımı geriye alınamaz (${tradeRow.status} -> ${newStatus}).`
      );
      return this.getTradeById(tradeId);
    }
=======
    update.status = newStatus;
>>>>>>> aa112bc (Son güncellemeler)

    update.status = newStatus;

    const { error: updateError } = await supabase
      .from('trades')
      .update(update)
      .eq('id', tradeRow.id);

    if (updateError) {
      console.error('Trade durumu güncellenemedi:', updateError);
      return undefined;
    }

    // actor_id, olay kaydının kim tarafından üretildiğini gösterir; boş
    // bırakıldığında admin panelindeki aktivite akışı olayı kime
    // bağlayacağını bilemiyordu.
    const { data: authData } = await supabase.auth.getUser();

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      actor_id: authData.user?.id ?? null,
      event_type: eventType,
    } as TablesInsert<'trade_events'>);

    return this.getTradeById(tradeId);
  },

  async submitReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(review.tradeId);
    if (!tradeRow) {
      console.error('submitReview: bu teklife bağlı bir trade kaydı yok.');
      return undefined;
    }

<<<<<<< HEAD
    // DB tarafında da zorunlu (reviews_insert_trade_party politikası +
    // reviews_not_self_check / reviews_one_per_reviewer_key kısıtları), ama
    // istemcide de kontrol ediliyor ki kullanıcı ham bir RLS hatası yerine
    // ne olduğunu anlasın. Eskiden hiçbiri kontrol edilmiyordu: henüz teslim
    // edilmemiş bir takasa da, kendine de, aynı takasa defalarca da
    // değerlendirme yazılabiliyordu.
    if (tradeRow.status !== 'completed') {
      console.error('submitReview: değerlendirme yalnızca tamamlanmış bir takasa yazılabilir.');
      return undefined;
    }

    if (review.authorId === review.targetUserId) {
      console.error('submitReview: kullanıcı kendini değerlendiremez.');
      return undefined;
    }

    if (
      ![tradeRow.sender_id, tradeRow.receiver_id].includes(review.authorId) ||
      ![tradeRow.sender_id, tradeRow.receiver_id].includes(review.targetUserId)
    ) {
      console.error('submitReview: değerlendiren ve değerlendirilen bu takasın tarafı olmalı.');
      return undefined;
    }

=======
>>>>>>> aa112bc (Son güncellemeler)
    const insertPayload: TablesInsert<'reviews'> = {
      trade_id: tradeRow.id,
      reviewer_id: review.authorId,
      reviewed_user_id: review.targetUserId,
      rating: review.overallRating,
<<<<<<< HEAD
      // Eskiden bu puan sessizce atılıyordu: DB'de karşılığı olan bir kolon
      // yoktu ve okurken yerine genel puan gösteriliyordu, yani kullanıcının
      // verdiği "güvenilirlik" notu hiçbir yere ulaşmıyordu.
      trustworthiness_rating: review.categories.trustworthiness,
=======
>>>>>>> aa112bc (Son güncellemeler)
      communication_rating: review.categories.communication,
      item_accuracy_rating: review.categories.itemAccuracy,
      delivery_rating: review.categories.delivery,
      comment: review.comment,
    };

    const { data, error } = await supabase
      .from('reviews')
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      console.error('Değerlendirme kaydedilemedi:', error);
      return undefined;
    }

    return {
      id: data.id,
      tradeId: review.tradeId,
      authorId: review.authorId,
      authorName: review.authorName,
      authorAvatar: review.authorAvatar,
      targetUserId: review.targetUserId,
      overallRating: data.rating,
      categories: {
<<<<<<< HEAD
        trustworthiness: data.trustworthiness_rating ?? data.rating,
=======
        // DB'de ayrı bir "güvenilirlik" (trustworthiness) kolonu yok;
        // genel puan (rating) ile aynı değer kullanılıyor. Gerekirse
        // reviews tablosuna trustworthiness_rating kolonu eklenmeli.
        trustworthiness: data.rating,
>>>>>>> aa112bc (Son güncellemeler)
        communication: data.communication_rating ?? review.categories.communication,
        itemAccuracy: data.item_accuracy_rating ?? review.categories.itemAccuracy,
        delivery: data.delivery_rating ?? review.categories.delivery,
      },
      comment: data.comment ?? '',
      createdAt: data.created_at,
    };
  },

async getReviewsForUser(userId: string): Promise<Review[]> {
    if (!userId || userId === 'user-current' || userId.length < 30) {
      return [];
    }

    const { data, error } = await supabase
      .from('reviews')
      .select(`*, reviewer:profiles!reviews_reviewer_id_fkey(${PROFILE_COLUMNS})`)
      .eq('reviewed_user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Değerlendirmeler alınamadı:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      tradeId: row.trade_id,
      authorId: row.reviewer_id,
      authorName: row.reviewer?.full_name ?? 'Swaloop Kullanıcısı',
      authorAvatar: row.reviewer?.avatar_url ?? '',
      targetUserId: row.reviewed_user_id,
      overallRating: row.rating,
      categories: {
<<<<<<< HEAD
        trustworthiness: row.trustworthiness_rating ?? row.rating,
=======
        trustworthiness: row.rating,
>>>>>>> aa112bc (Son güncellemeler)
        communication: row.communication_rating ?? row.rating,
        itemAccuracy: row.item_accuracy_rating ?? row.rating,
        delivery: row.delivery_rating ?? row.rating,
      },
      comment: row.comment ?? '',
      createdAt: row.created_at,
    }));
  }
}