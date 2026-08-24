import { supabase } from '../lib/supabase';
import { JourneyStep, Listing, UserProfile } from '../types';
import { enrichListings } from './listingService';

/**
 * "Takas Yolculuğum" (kırmızı ataç / basamak yükseltme) verisi.
 *
 * Bu ekran önceden tamamen uydurma basamaklardan (`useState` içine sabit
 * yazılmış Unsplash görselleri) oluşuyordu ve sayfa yenilenince sıfırlanan
 * bir demoydu. Artık yolculuk TAMAMEN gerçek takas geçmişinden türetiliyor:
 *
 *   basamak 0  → ilk tamamlanan takasta VERDİĞİN ürün (başlangıç eşyası)
 *   basamak n  → n. tamamlanan takasta ALDIĞIN ürün
 *   "şu an"    → elindeki en güncel yayında olan ilan
 *   "hedef"    → profildeki `journey_target` (kullanıcının yazdığı hedef)
 *
 * Böylece yolculuk, kullanıcı takas yaptıkça kendiliğinden ilerler;
 * ayrıca senkronize edilmesi gereken ikinci bir tablo yoktur.
 */

const JOURNEY_TARGET_STORAGE_KEY = 'swaloop_journey_target';

/** `profiles.journey_target` kolonu yoksa (migration uygulanmadıysa) verilen hata kodu. */
const UNDEFINED_COLUMN = '42703';

interface CompletedTradeRow {
  id: string;
  offer_id: string;
  completed_at: string | null;
  started_at: string;
  sender_id: string;
  receiver_id: string;
}

export interface Journey {
  steps: JourneyStep[];
  target: string;
  totalCo2eKg: number;
  completedCount: number;
}

function toStep(
  listing: Listing | undefined,
  index: number,
  kind: JourneyStep['kind'],
  extras: Partial<JourneyStep> = {}
): JourneyStep | null {
  if (!listing) return null;

  return {
    index,
    title: listing.title,
    imageUrl: listing.images[0],
    co2eKg: listing.estimatedImpact.co2eKg,
    kind,
    listingId: listing.id,
    ...extras,
  };
}

export const journeyService = {
  async getJourneyTarget(user: UserProfile): Promise<string> {
    if (user.journeyTarget) return user.journeyTarget;

    if (!user.id) return localStorage.getItem(JOURNEY_TARGET_STORAGE_KEY) ?? '';

    const { data, error } = await supabase
      .from('profiles')
      .select('journey_target')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      if (error.code !== UNDEFINED_COLUMN) console.error('Yolculuk hedefi alınamadı:', error);
      return localStorage.getItem(JOURNEY_TARGET_STORAGE_KEY) ?? '';
    }

    return data?.journey_target ?? '';
  },

  /**
   * Hedefi profile yazar. `journey_target` kolonu henüz canlıya
   * uygulanmadıysa cihazda saklayıp true döner — kullanıcı açısından
   * özellik yine çalışır, sadece cihaza özel kalır.
   */
  async setJourneyTarget(userId: string, target: string): Promise<boolean> {
    localStorage.setItem(JOURNEY_TARGET_STORAGE_KEY, target);

    if (!userId) return true;

    const { error } = await supabase
      .from('profiles')
      .update({ journey_target: target, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      if (error.code === UNDEFINED_COLUMN) {
        console.warn(
          'profiles.journey_target kolonu bulunamadı — hedef yalnızca bu cihazda ' +
            'saklandı. Kalıcı olması için 20260824091000_swap_core_improvements.sql ' +
            'migration’ını uygulayın.'
        );
        return true;
      }

      console.error('Yolculuk hedefi kaydedilemedi:', error);
      return false;
    }

    return true;
  },

  /**
   * Kullanıcının tamamlanmış takaslarından yolculuk basamaklarını kurar.
   */
  async getJourney(user: UserProfile): Promise<Journey> {
    const target = await this.getJourneyTarget(user);

    const empty: Journey = { steps: [], target, totalCo2eKg: 0, completedCount: 0 };

    if (!user.id) return empty;

    const { data: tradeRows, error: tradeError } = await supabase
      .from('trades')
      .select('id, offer_id, completed_at, started_at, sender_id, receiver_id')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: true });

    if (tradeError) {
      console.error('Takas geçmişi alınamadı:', tradeError);
      return empty;
    }

    const trades = (tradeRows ?? []) as CompletedTradeRow[];

    // Elindeki güncel ürün: en son yayına aldığın aktif ilan.
    const { data: activeListingRows } = await supabase
      .from('listings')
      .select('*, user:profiles(*), images:listing_images(storage_path)')
      .eq('owner_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    const [currentListing] = await enrichListings(activeListingRows ?? []);

    if (!trades.length) {
      const steps: JourneyStep[] = [];
      const currentStep = toStep(currentListing, 0, 'current', {
        partnerName: 'Elindeki ürün',
      });

      if (currentStep) steps.push(currentStep);

      if (target) {
        steps.push({
          index: steps.length,
          title: target,
          co2eKg: 0,
          kind: 'target',
        });
      }

      return { ...empty, steps };
    }

    const offerIds = trades.map((t) => t.offer_id);

    const { data: itemRows, error: itemError } = await supabase
      .from('trade_offer_items')
      .select('offer_id, owner_id, listing:listings(*, user:profiles(*), images:listing_images(storage_path))')
      .in('offer_id', offerIds);

    if (itemError) {
      console.error('Takas kalemleri alınamadı:', itemError);
      return empty;
    }

    const rawListings = (itemRows ?? [])
      .map((row: any) => row.listing)
      .filter(Boolean);

    const listings = await enrichListings(rawListings);
    const listingById = new Map(listings.map((l) => [l.id, l]));

    const itemsByOffer = new Map<string, { ownerId: string; listing: Listing | undefined }[]>();

    for (const row of (itemRows ?? []) as any[]) {
      if (!row.listing) continue;
      const bucket = itemsByOffer.get(row.offer_id) ?? [];
      bucket.push({ ownerId: row.owner_id, listing: listingById.get(row.listing.id) });
      itemsByOffer.set(row.offer_id, bucket);
    }

    const steps: JourneyStep[] = [];

    trades.forEach((trade, tradeIndex) => {
      const items = itemsByOffer.get(trade.offer_id) ?? [];
      const given = items.find((i) => i.ownerId === user.id)?.listing;
      const received = items.find((i) => i.ownerId !== user.id)?.listing;
      // Aldığın ürünün sahibi, o takastaki karşı taraftır.
      const partner = received?.user.fullName;
      const completedAt = trade.completed_at ?? trade.started_at;

      // İlk takasın "verdiğin" ürünü yolculuğun başlangıç basamağıdır.
      if (tradeIndex === 0) {
        const startStep = toStep(given, steps.length, 'completed', {
          partnerName: 'Başlangıç eşyan',
          completedAt,
        });
        if (startStep) steps.push(startStep);
      }

      const step = toStep(received, steps.length, 'completed', {
        partnerName: partner,
        completedAt,
      });

      if (step) steps.push(step);
    });

    // Elindeki aktif ilan zaten bir basamak olarak eklenmediyse "şu an" olarak ekle.
    if (currentListing && !steps.some((s) => s.listingId === currentListing.id)) {
      const currentStep = toStep(currentListing, steps.length, 'current', {
        partnerName: 'Elindeki ürün',
      });
      if (currentStep) steps.push(currentStep);
    }

    if (target) {
      steps.push({ index: steps.length, title: target, co2eKg: 0, kind: 'target' });
    }

    return {
      steps,
      target,
      completedCount: steps.filter((s) => s.kind === 'completed').length,
      totalCo2eKg: Number(
        steps.filter((s) => s.kind === 'completed').reduce((sum, s) => sum + s.co2eKg, 0).toFixed(1)
      ),
    };
  },
};
