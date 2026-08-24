import { TradeOffer, TradeStatus, UserProfile, Listing, Review, TradeEvent } from '../types';
import { impactService } from './impactService';
import { supabase } from '../lib/supabase';
import { mapProfile } from './authService';
import { enrichListings } from './listingService';
import type { TablesInsert, TablesUpdate } from '../types/supabase';

// ─────────────────────────────────────────────────────────────────────────
// Takas teklifi / takas süreci veri katmanı.
//
// DB şeması ile frontend `TradeOffer` tipi arasındaki eşleşme:
//  - `trade_offers`     : teklif (sender/receiver/status/message/
//                          delivery_method/parent_offer_id)
//  - `trade_offer_items`: teklife dahil ilanlar, `role` = 'offered'|'requested'
//  - `trades`           : teklif KABUL EDİLİNCE oluşan kayıt (durum/teslimat)
//  - `trade_events`     : trades.id'ye bağlı olay günlüğü
//
// PERFORMANS: Önceden her teklif için ayrı ayrı trade satırı, olaylar,
// değerlendirmeler ve ilan zenginleştirmesi sorgulanıyordu — 20 teklifli
// bir liste 150'den fazla HTTP isteği demekti. Artık liste sorguları
// toplu çalışıyor: teklifler + trade satırları + olaylar + ilanlar +
// değerlendirmeler, teklif sayısından bağımsız olarak sabit sayıda
// sorguyla çekiliyor.
// ─────────────────────────────────────────────────────────────────────────

type TradeOfferRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  message: string | null;
  delivery_method?: string | null;
  parent_offer_id: string | null;
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
  role: string;
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
  delivery_notes: string | null;
  started_at: string;
  completed_at: string | null;
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
  '*, sender:profiles!trade_offers_sender_id_fkey(*), receiver:profiles!trade_offers_receiver_id_fkey(*), items:trade_offer_items(*, listing:listings(*, user:profiles(*), images:listing_images(storage_path, sort_order)))';

/** Teklifin geçerlilik süresi (DB'de expires_at kolonu yok, UI göstergesi). */
const OFFER_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Bekleniyor';

  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildTimeline(
  offerRow: TradeOfferRow,
  tradeRow: TradeRow | null,
  events: TradeEventRow[],
  initiator: UserProfile,
  receiver: UserProfile,
  status: TradeStatus,
  co2eKg: number
): TradeEvent[] {
  const deliveryEvent = events.find((e) => e.event_type === 'delivery_planned');
  const verifiedEvent = events.find((e) => e.event_type === 'verified');
  const completedEvent = events.find((e) => e.event_type === 'completed');

  const rejected = offerRow.status === 'rejected';
  const accepted = !!tradeRow;

  return [
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
      description: rejected
        ? 'Teklif reddedildi.'
        : accepted
          ? `${receiver.fullName} teklifi kabul etti.`
          : 'Karşı tarafın onayı bekleniyor.',
      timestamp: rejected
        ? fmtDateTime(offerRow.updated_at)
        : accepted
          ? fmtDateTime(tradeRow!.started_at)
          : 'Bekleniyor',
      actorId: receiver.id,
      actorName: receiver.fullName,
      status: rejected ? 'failed' : accepted ? 'completed' : 'pending',
    },
    {
      id: `${offerRow.id}-step3`,
      step: 3,
      title: 'Ürünler Kilitlendi',
      description: accepted
        ? 'Ürünler diğer kullanıcılara kapatıldı.'
        : 'Takas onaylandığında ürünler kilitlenecek.',
      timestamp: accepted ? fmtDateTime(tradeRow!.started_at) : 'Bekleniyor',
      actorId: 'system',
      actorName: 'Swaloop',
      status: rejected ? 'failed' : accepted ? 'completed' : 'pending',
    },
    {
      id: `${offerRow.id}-step4`,
      step: 4,
      title: 'Teslimat & Buluşma',
      description: 'Ürünlerin karşılıklı teslimi.',
      timestamp: fmtDateTime(deliveryEvent?.created_at ?? null),
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
      description: 'Ürünlerin teslim alındığının doğrulanması.',
      timestamp: fmtDateTime(verifiedEvent?.created_at ?? null),
      actorId: 'both',
      actorName: 'Her İki Taraf',
      status: status === 'verified' || status === 'completed' ? 'completed' : 'pending',
    },
    {
      id: `${offerRow.id}-step6`,
      step: 6,
      title: 'Takas Tamamlandı',
      description:
        status === 'completed'
          ? `Takas tamamlandı. Toplam +${co2eKg} kg CO₂e tasarrufu sağlandı.`
          : 'Çevresel etki hesabı ve puanların profile işlenmesi.',
      timestamp: fmtDateTime(completedEvent?.created_at ?? tradeRow?.completed_at ?? null),
      actorId: 'system',
      actorName: 'Swaloop',
      status: status === 'completed' ? 'completed' : 'pending',
    },
  ];
}

/**
 * Teklif satırlarını, kaç tane olursa olsun SABİT sayıda sorguyla
 * `TradeOffer` nesnelerine çevirir.
 */
async function hydrateOffers(offerRows: TradeOfferRow[]): Promise<TradeOffer[]> {
  if (!offerRows.length) return [];

  const offerIds = offerRows.map((row) => row.id);

  const { data: tradeRows } = await supabase.from('trades').select('*').in('offer_id', offerIds);

  const trades = (tradeRows ?? []) as TradeRow[];
  const tradeByOfferId = new Map(trades.map((t) => [t.offer_id, t]));
  const tradeIds = trades.map((t) => t.id);

  const [eventsResult, reviewsResult] = await Promise.all([
    tradeIds.length
      ? supabase
          .from('trade_events')
          .select('*')
          .in('trade_id', tradeIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] } as any),
    tradeIds.length
      ? supabase.from('reviews').select('trade_id, reviewer_id').in('trade_id', tradeIds)
      : Promise.resolve({ data: [] } as any),
  ]);

  const eventsByTradeId = new Map<string, TradeEventRow[]>();
  for (const event of (eventsResult.data ?? []) as TradeEventRow[]) {
    const bucket = eventsByTradeId.get(event.trade_id) ?? [];
    bucket.push(event);
    eventsByTradeId.set(event.trade_id, bucket);
  }

  const reviewersByTradeId = new Map<string, string[]>();
  for (const review of (reviewsResult.data ?? []) as any[]) {
    const bucket = reviewersByTradeId.get(review.trade_id) ?? [];
    bucket.push(review.reviewer_id);
    reviewersByTradeId.set(review.trade_id, bucket);
  }

  // Tüm tekliflerdeki tüm ilanlar TEK seferde zenginleştirilir.
  const allListingRows = offerRows.flatMap((offer) =>
    (offer.items ?? []).map((item) => item.listing).filter(Boolean)
  );

  const uniqueListingRows = [...new Map(allListingRows.map((row: any) => [row.id, row])).values()];
  const enriched = await enrichListings(uniqueListingRows);
  const listingById = new Map(enriched.map((listing) => [listing.id, listing]));

  // Katılımcıların güven puanları da toplu çekilir.
  const userIds = [...new Set(offerRows.flatMap((row) => [row.sender_id, row.receiver_id]))];

  const { data: trustRows } = await supabase
    .from('trust_profiles')
    .select('*')
    .in('user_id', userIds);

  const trustByUserId = new Map((trustRows ?? []).map((row: any) => [row.user_id, row]));

  return offerRows.map((offerRow) => {
    const tradeRow = tradeByOfferId.get(offerRow.id) ?? null;
    const events = tradeRow ? (eventsByTradeId.get(tradeRow.id) ?? []) : [];

    const initiator = mapProfile(offerRow.sender, trustByUserId.get(offerRow.sender_id));
    const receiver = mapProfile(offerRow.receiver, trustByUserId.get(offerRow.receiver_id));

    const pick = (role: string): Listing[] =>
      (offerRow.items ?? [])
        .filter((item) => item.role === role && item.listing)
        .map((item) => listingById.get(item.listing.id))
        .filter((listing): listing is Listing => !!listing);

    const offeredListings = pick('offered');
    const requestedListings = pick('requested');

    const combinedImpact = impactService.calculateCombinedTradeImpact([
      ...offeredListings.map((l) => l.estimatedImpact),
      ...requestedListings.map((l) => l.estimatedImpact),
    ]);

    // Teklif reddedilmediyse ve henüz `trades` satırı yoksa teklifin kendi
    // durumu geçerlidir; satır oluştuktan sonra ilerleme onun durumundan okunur.
    const status = (tradeRow?.status ?? offerRow.status) as TradeStatus;

    const reviewers = tradeRow ? (reviewersByTradeId.get(tradeRow.id) ?? []) : [];

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
      deliveryMethod: (tradeRow?.delivery_method ??
        offerRow.delivery_method ??
        'in_person') as TradeOffer['deliveryMethod'],
      deliveryDetails: tradeRow?.delivery_notes ? { notes: tradeRow.delivery_notes } : undefined,
      status,
      createdAt: offerRow.created_at,
      expiresAt: new Date(new Date(offerRow.created_at).getTime() + OFFER_TTL_MS).toISOString(),
      updatedAt: offerRow.updated_at,
      counterOfferFromId: offerRow.parent_offer_id ?? undefined,
      timeline: buildTimeline(
        offerRow,
        tradeRow,
        events,
        initiator,
        receiver,
        status,
        combinedImpact.co2eKg
      ),
      combinedImpact,
      isReviewedByInitiator: reviewers.includes(offerRow.sender_id),
      isReviewedByReceiver: reviewers.includes(offerRow.receiver_id),
    };
  });
}

async function fetchTradeRowByOfferId(offerId: string): Promise<TradeRow | null> {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('offer_id', offerId)
    .maybeSingle();

  if (error) {
    console.error('Takas kaydı alınamadı:', error);
    return null;
  }

  return data as TradeRow | null;
}

export const tradeService = {
  async getTradeById(id: string): Promise<TradeOffer | undefined> {
    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('Takas teklifi alınamadı:', error);
      return undefined;
    }

    const [offer] = await hydrateOffers([data as any]);
    return offer;
  },

  async getUserIncomingTrades(userId: string): Promise<TradeOffer[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.error('Gelen teklifler alınamadı:', error);
      return [];
    }

    return hydrateOffers(data as any);
  },

  async getUserOutgoingTrades(userId: string): Promise<TradeOffer[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .eq('sender_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.error('Giden teklifler alınamadı:', error);
      return [];
    }

    return hydrateOffers(data as any);
  },

  /** Kullanıcının gelen + giden tüm tekliflerini tek turda getirir. */
  async getUserTrades(userId: string): Promise<{ incoming: TradeOffer[]; outgoing: TradeOffer[] }> {
    if (!userId) return { incoming: [], outgoing: [] };

    const { data, error } = await supabase
      .from('trade_offers')
      .select(OFFER_SELECT)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.error('Takaslar alınamadı:', error);
      return { incoming: [], outgoing: [] };
    }

    const offers = await hydrateOffers(data as any);

    return {
      incoming: offers.filter((offer) => offer.receiverId === userId),
      outgoing: offers.filter((offer) => offer.initiatorId === userId),
    };
  },

  async createTradeOffer(data: {
    initiator: UserProfile;
    receiver: UserProfile;
    offeredListings: Listing[];
    requestedListings: Listing[];
    note?: string;
    deliveryMethod: 'in_person' | 'cargo' | 'safe_point';
  }): Promise<TradeOffer | undefined> {
    if (!data.offeredListings.length || !data.requestedListings.length) {
      console.error('Teklif için hem verilecek hem istenen ürün gerekli.');
      return undefined;
    }

    const insertPayload: TablesInsert<'trade_offers'> = {
      sender_id: data.initiator.id,
      receiver_id: data.receiver.id,
      status: 'offer_sent',
      message: data.note ?? null,
      delivery_method: data.deliveryMethod,
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
        role: 'offered',
      })),
      ...data.requestedListings.map((l) => ({
        offer_id: offerRow.id,
        listing_id: l.id,
        owner_id: data.receiver.id,
        role: 'requested',
      })),
    ];

    const { error: itemsError } = await supabase.from('trade_offer_items').insert(itemRows);

    if (itemsError) {
      console.error('Teklif kalemleri oluşturulamadı:', itemsError);
      // Teklif satırı yetim kalmasın diye geri alınıyor.
      await supabase.from('trade_offers').delete().eq('id', offerRow.id);
      return undefined;
    }

    return this.getTradeById(offerRow.id);
  },

  /**
   * Teklifi kabul eder ve `trades` satırını açar. İlanların
   * "takasta" durumuna geçmesi DB tetikleyicisiyle yapılır
   * (bkz. lock_listings_on_trade_start).
   */
  async acceptOffer(offerId: string): Promise<TradeOffer | undefined> {
    const { data: offerRow, error: offerError } = await supabase
      .from('trade_offers')
      .select('*')
      .eq('id', offerId)
      .maybeSingle();

    if (offerError || !offerRow) {
      console.error('Teklif bulunamadı:', offerError);
      return undefined;
    }

    const existingTrade = await fetchTradeRowByOfferId(offerId);
    if (existingTrade) return this.getTradeById(offerId);

    const { error: updateError } = await supabase
      .from('trade_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offerId);

    if (updateError) {
      console.error('Teklif durumu güncellenemedi:', updateError);
      return undefined;
    }

    const { data: tradeRow, error: tradeError } = await supabase
      .from('trades')
      .insert({
        offer_id: offerRow.id,
        sender_id: offerRow.sender_id,
        receiver_id: offerRow.receiver_id,
        status: 'locked',
        delivery_method: (offerRow as any).delivery_method ?? 'in_person',
      } as TablesInsert<'trades'>)
      .select()
      .single();

    if (tradeError || !tradeRow) {
      console.error('Takas kaydı oluşturulamadı:', tradeError);
      // Teklifi eski durumuna döndür ki kullanıcı tekrar deneyebilsin.
      await supabase.from('trade_offers').update({ status: 'offer_sent' }).eq('id', offerId);
      return undefined;
    }

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      actor_id: offerRow.receiver_id,
      event_type: 'offer_accepted',
      note: 'Teklif kabul edildi, ürünler kilitlendi.',
    } as TablesInsert<'trade_events'>);

    return this.getTradeById(offerId);
  },

  async rejectOffer(offerId: string, reason?: string): Promise<TradeOffer | undefined> {
    const update: TablesUpdate<'trade_offers'> = {
      status: 'rejected',
      updated_at: new Date().toISOString(),
    };

    if (reason) update.message = reason;

    const { error } = await supabase.from('trade_offers').update(update).eq('id', offerId);

    if (error) {
      console.error('Teklif reddedilemedi:', error);
      return undefined;
    }

    return this.getTradeById(offerId);
  },

  /** Kabul edilmiş bir takası iptal eder; ilanlar tekrar yayına döner. */
  async cancelTrade(offerId: string, reason?: string): Promise<TradeOffer | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(offerId);

    if (!tradeRow) {
      return this.rejectOffer(offerId, reason);
    }

    const { error } = await supabase
      .from('trades')
      .update({ status: 'cancelled' })
      .eq('id', tradeRow.id);

    if (error) {
      console.error('Takas iptal edilemedi:', error);
      return undefined;
    }

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      event_type: 'cancelled',
      note: reason ?? 'Takas iptal edildi.',
    } as TablesInsert<'trade_events'>);

    return this.getTradeById(offerId);
  },

  async createCounterOffer(
    originalOfferId: string,
    newOfferedListings: Listing[],
    newRequestedListings: Listing[],
    newDeliveryMethod: 'in_person' | 'cargo' | 'safe_point',
    note?: string
  ): Promise<TradeOffer | undefined> {
    const original = await this.getTradeById(originalOfferId);
    if (!original) return undefined;

    await supabase
      .from('trade_offers')
      .update({ status: 'counter_offered', updated_at: new Date().toISOString() })
      .eq('id', originalOfferId);

    const counterOffer = await this.createTradeOffer({
      initiator: original.receiver,
      receiver: original.initiator,
      offeredListings: newOfferedListings,
      requestedListings: newRequestedListings,
      deliveryMethod: newDeliveryMethod,
      note: note || 'Karşı teklif gönderildi.',
    });

    if (!counterOffer) return undefined;

    await supabase
      .from('trade_offers')
      .update({ parent_offer_id: originalOfferId })
      .eq('id', counterOffer.id);

    return this.getTradeById(counterOffer.id);
  },

  /**
   * Takası bir sonraki adıma taşır (4: teslimat, 5: karşılıklı onay,
   * 6: tamamlandı). Tamamlandığında çevresel etki kaydı yazılır; profil
   * sayaçları ve ilan durumları DB tetikleyicisiyle güncellenir.
   */
  async advanceTradeStep(offerId: string, targetStep: 4 | 5 | 6): Promise<TradeOffer | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(offerId);

    if (!tradeRow) {
      console.error('advanceTradeStep: bu teklife bağlı bir takas kaydı yok.');
      return undefined;
    }

    const update: TablesUpdate<'trades'> = {};
    let eventType: string;

    if (targetStep === 4) {
      update.status = 'delivery_planned';
      eventType = 'delivery_planned';
    } else if (targetStep === 5) {
      update.status = 'verified';
      eventType = 'verified';
    } else {
      update.status = 'completed';
      update.completed_at = new Date().toISOString();
      eventType = 'completed';
    }

    // Etki kaydı takas TAMAMLANMADAN önce yazılır: `impact_records.trade_id`
    // benzersizdir ve tamamlanma tetikleyicisi bu satırı okuyabilir.
    if (targetStep === 6) {
      const offer = await this.getTradeById(offerId);

      if (offer) {
        const { error: impactError } = await supabase.from('impact_records').upsert(
          {
            trade_id: tradeRow.id,
            co2e_kg: offer.combinedImpact.co2eKg,
            water_liters: offer.combinedImpact.waterLiters,
            energy_kwh: offer.combinedImpact.energyKwh,
            material_kg: offer.combinedImpact.rawMaterialKg,
            waste_kg: offer.combinedImpact.wasteReductionKg,
            reuse_count: offer.combinedImpact.reuseCount,
            methodology_version: offer.combinedImpact.methodologyVersion,
          } as TablesInsert<'impact_records'>,
          { onConflict: 'trade_id' }
        );

        if (impactError) console.error('Etki kaydı oluşturulamadı:', impactError);
      }
    }

    const { error: updateError } = await supabase
      .from('trades')
      .update(update)
      .eq('id', tradeRow.id);

    if (updateError) {
      console.error('Takas durumu güncellenemedi:', updateError);
      return undefined;
    }

    await supabase.from('trade_events').insert({
      trade_id: tradeRow.id,
      event_type: eventType,
    } as TablesInsert<'trade_events'>);

    return this.getTradeById(offerId);
  },

  async submitReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review | undefined> {
    const tradeRow = await fetchTradeRowByOfferId(review.tradeId);

    if (!tradeRow) {
      console.error('submitReview: bu teklife bağlı bir takas kaydı yok.');
      return undefined;
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        trade_id: tradeRow.id,
        reviewer_id: review.authorId,
        reviewed_user_id: review.targetUserId,
        rating: review.overallRating,
        communication_rating: review.categories.communication,
        item_accuracy_rating: review.categories.itemAccuracy,
        delivery_rating: review.categories.delivery,
        comment: review.comment,
      } as TablesInsert<'reviews'>)
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
      overallRating: Number(data.rating),
      categories: {
        // DB'de ayrı bir "güvenilirlik" kolonu yok; genel puanla aynı değer.
        trustworthiness: Number(data.rating),
        communication: Number(data.communication_rating ?? review.categories.communication),
        itemAccuracy: Number(data.item_accuracy_rating ?? review.categories.itemAccuracy),
        delivery: Number(data.delivery_rating ?? review.categories.delivery),
      },
      comment: data.comment ?? '',
      createdAt: data.created_at,
    };
  },

  async getReviewsForUser(userId: string): Promise<Review[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('reviews')
      .select('*, reviewer:profiles!reviews_reviewer_id_fkey(*)')
      .eq('reviewed_user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.error('Değerlendirmeler alınamadı:', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      tradeId: row.trade_id,
      authorId: row.reviewer_id,
      authorName: row.reviewer?.full_name ?? 'Swaloop Kullanıcısı',
      authorAvatar: row.reviewer?.avatar_url ?? '',
      targetUserId: row.reviewed_user_id,
      overallRating: Number(row.rating),
      categories: {
        trustworthiness: Number(row.rating),
        communication: Number(row.communication_rating ?? row.rating),
        itemAccuracy: Number(row.item_accuracy_rating ?? row.rating),
        delivery: Number(row.delivery_rating ?? row.rating),
      },
      comment: row.comment ?? '',
      createdAt: new Date(row.created_at).toLocaleDateString('tr-TR'),
    }));
  },
};
