import { CategoryId, Listing, Need, NeedMatch, NeedStatus } from '../types';
import { supabase } from '../lib/supabase';
import { enrichListings } from './listingService';
import type { TablesInsert, TablesUpdate } from '../types/supabase';

// ─────────────────────────────────────────────────────────────────────────
// İHTİYAÇ ("Need") SERVİSİ
//
// Ürün/sistem tasarım raporunun (swaloop-urun-sistem-tasarimi.md) en önemli
// mimari kararı: Swaloop'un temel birimi sadece İLAN ("elimde bu var")
// değil, İHTİYAÇ ("buna ihtiyacım var") da olmalı (rapor md. 78-82).
//
// Bu dosya o ikinci nesnenin CRUD'ını ve iki yönlü eşleştirmesini içerir:
//   * getMatchesForUser  → "aradığın bir ürün yeni eklendi" (md. 45)
//   * getSeekersForListing → "bu ürünü arayan N kişi var" (md. 77)
//
// KRİTİK KURAL (rapor md. 3, 47, 116): burada hiçbir yerde parasal değer,
// fiyat ya da "denklik" hesabı YOKTUR. Skor, iki tarafın İHTİYAÇLARININ
// birbirini karşılayıp karşılamadığını anlatır; "bu ürün şu kadar eder"
// demez. Skorun nedenleri (`reasons`) kullanıcıya olduğu gibi
// gösterilebilecek kadar açık tutulur (md. 39: algoritma açıklanabilir
// olmalı).
// ─────────────────────────────────────────────────────────────────────────

type NeedRow = {
  id: string;
  user_id: string;
  title: string;
  category_id: string | null;
  note: string | null;
  status: string;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
  category?: { slug: string } | null;
};

const NEED_SELECT = '*, category:categories(slug)';

// Arama sonuçlarında "bunu arayanlar" listesini gösterebilmek için ihtiyaç
// sahibinin görünen bilgileri de çekilir (telefon/konum detayı DEĞİL —
// rapor md. 109).
const NEED_WITH_SEEKER_SELECT =
  '*, category:categories(slug), user:profiles(id, full_name, avatar_url, city, district)';

export interface NeedSeeker {
  id: string;
  fullName: string;
  avatarUrl: string;
  city: string;
  district: string;
}

// Eşleşme sayılabilmesi için gereken en düşük skor. Bunun altındaki
// sonuçlar kullanıcıya gösterilmez — "alakasız ilan çöplüğü" üretmemek
// için (rapor md. 15).
export const MATCH_THRESHOLD = 40;

const STOP_WORDS = new Set([
  'ile',
  'veya',
  'ya',
  'için',
  'bir',
  'bu',
  'şu',
  'takas',
  'arıyorum',
  'aranıyor',
  'istiyorum',
  'gibi',
  've',
  'de',
  'da',
]);

/**
 * Türkçe'ye duyarlı küçültme + kelimelere ayırma.
 * ("İPHONE" → "iphone", "Kamera, Lens" → ["kamera", "lens"])
 */
export function tokenize(text: string): string[] {
  return (text ?? '')
    .toLocaleLowerCase('tr')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export function mapNeed(row: NeedRow): Need {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    categoryId: (row.category?.slug as CategoryId | undefined) ?? undefined,
    note: row.note ?? undefined,
    status: row.status as NeedStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fulfilledAt: row.fulfilled_at ?? undefined,
  };
}

/**
 * Bir ihtiyacın açık bir ilanla ne kadar örtüştüğü (0-100) ve nedenleri.
 *
 * Saf fonksiyon: ağ/DB erişimi yok, bu yüzden doğrudan test edilebilir.
 * Ağırlıklar bilinçli olarak basit ve açıklanabilir tutuldu:
 *   +50  ihtiyacın kategorisi ile ilanın kategorisi aynı
 *   +40  ihtiyaç metnindeki kelimelerin ilan başlığı/etiketleri ile örtüşmesi
 *   +10  aynı şehir (rapor md. 35: mesafe önemli ama tek başına belirleyici değil)
 */
export function scoreNeedAgainstListing(
  need: Pick<Need, 'title' | 'categoryId'>,
  listing: Pick<Listing, 'title' | 'categoryId' | 'tags' | 'location' | 'description'>,
  seekerCity?: string
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (need.categoryId && need.categoryId === listing.categoryId) {
    score += 50;
    reasons.push('Aradığın kategoride');
  }

  const needWords = tokenize(need.title);
  const listingWords = new Set([
    ...tokenize(listing.title),
    ...(listing.tags ?? []).flatMap(tokenize),
    ...tokenize(listing.description ?? ''),
  ]);

  const hits = needWords.filter((word) => listingWords.has(word));

  if (needWords.length && hits.length) {
    score += Math.round((hits.length / needWords.length) * 40);
    reasons.push(`Aradığın kelimelerle eşleşiyor: ${hits.join(', ')}`);
  }

  if (seekerCity && listing.location?.city && seekerCity === listing.location.city) {
    score += 10;
    reasons.push('Aynı şehirde');
  }

  return { score: Math.min(score, 100), reasons };
}

/**
 * PostgREST `or()` filtresi virgül/parantez ile ayrıştırıldığı için
 * kullanıcıdan gelen metin doğrudan gömülemez — yoksa "Canon, 50mm (yeni)"
 * gibi bir başlık filtreyi bozar.
 */
function sanitizeForFilter(value: string): string {
  return value.replace(/[,()*\\%]/g, ' ').trim();
}

async function categoryUuidBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  return data?.id ?? null;
}

export const needService = {
  async getUserNeeds(userId: string): Promise<Need[]> {
    const { data, error } = await supabase
      .from('needs')
      .select(NEED_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('İhtiyaçlar alınamadı:', error);
      return [];
    }

    return (data as unknown as NeedRow[]).map(mapNeed);
  },

  async createNeed(data: {
    userId: string;
    title: string;
    categoryId?: CategoryId;
    note?: string;
  }): Promise<Need | undefined> {
    const title = data.title.trim();

    if (!title) {
      console.error('İhtiyaç başlığı boş olamaz.');
      return undefined;
    }

    const categoryUuid = data.categoryId
      ? await categoryUuidBySlug(data.categoryId)
      : null;

    const insert: TablesInsert<'needs'> = {
      user_id: data.userId,
      title,
      category_id: categoryUuid,
      note: data.note?.trim() || null,
      status: 'active',
    };

    const { data: created, error } = await supabase
      .from('needs')
      .insert(insert)
      .select(NEED_SELECT)
      .single();

    if (error || !created) {
      // Beklenen iki hata: aynı ihtiyacın tekrar eklenmesi
      // (needs_user_title_unique_idx) ve açık ihtiyaç limiti
      // (enforce_active_need_limit) — ikisi de migration'da tanımlı.
      console.error('İhtiyaç oluşturulamadı:', error);
      return undefined;
    }

    return mapNeed(created as unknown as NeedRow);
  },

  async updateNeed(
    needId: string,
    updates: { title?: string; categoryId?: CategoryId | null; note?: string; status?: NeedStatus }
  ): Promise<Need | undefined> {
    const patch: TablesUpdate<'needs'> = {};

    if (updates.title !== undefined) patch.title = updates.title.trim();
    if (updates.note !== undefined) patch.note = updates.note.trim() || null;
    if (updates.status !== undefined) patch.status = updates.status;

    if (updates.categoryId !== undefined) {
      patch.category_id = updates.categoryId
        ? await categoryUuidBySlug(updates.categoryId)
        : null;
    }

    const { data, error } = await supabase
      .from('needs')
      .update(patch)
      .eq('id', needId)
      .select(NEED_SELECT)
      .single();

    if (error || !data) {
      console.error('İhtiyaç güncellenemedi:', error);
      return undefined;
    }

    return mapNeed(data as unknown as NeedRow);
  },

  async deleteNeed(needId: string): Promise<boolean> {
    const { error } = await supabase.from('needs').delete().eq('id', needId);

    if (error) {
      console.error('İhtiyaç silinemedi:', error);
      return false;
    }

    return true;
  },

  /**
   * "Aradığın bulundu" (rapor md. 45/79): kullanıcının açık ihtiyaçlarına
   * uyan, başkalarına ait aktif ilanlar.
   *
   * Aday havuzu önce DB'de daraltılır (kategori VEYA başlık benzerliği),
   * skorlama sonra istemcide yapılır — böylece eşleşmenin NEDENİ de
   * kullanıcıya gösterilebilir.
   */
  async getMatchesForUser(
    userId: string,
    options: { city?: string; limit?: number } = {}
  ): Promise<NeedMatch[]> {
    const needs = (await this.getUserNeeds(userId)).filter((n) => n.status === 'active');

    if (!needs.length) return [];

    const categorySlugs = [...new Set(needs.map((n) => n.categoryId).filter(Boolean))] as string[];

    let categoryUuids: string[] = [];

    if (categorySlugs.length) {
      const { data } = await supabase
        .from('categories')
        .select('id')
        .in('slug', categorySlugs);

      categoryUuids = (data ?? []).map((c) => c.id);
    }

    const keywordFilters = needs
      .flatMap((n) => tokenize(n.title))
      .map(sanitizeForFilter)
      .filter(Boolean)
      .slice(0, 10)
      .map((word) => `title.ilike.%${word}%`);

    let query = supabase
      .from('listings')
      .select('*, user:profiles(*), images:listing_images(storage_path)')
      .eq('status', 'active')
      .neq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(120);

    if (categoryUuids.length && keywordFilters.length) {
      query = query.or(
        [`category_id.in.(${categoryUuids.join(',')})`, ...keywordFilters].join(',')
      );
    } else if (categoryUuids.length) {
      query = query.in('category_id', categoryUuids);
    } else if (keywordFilters.length) {
      query = query.or(keywordFilters.join(','));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Eşleşen ilanlar alınamadı:', error);
      return [];
    }

    const listings = await enrichListings(data ?? []);
    const matches: NeedMatch[] = [];

    for (const listing of listings) {
      let best: NeedMatch | null = null;

      for (const need of needs) {
        const { score, reasons } = scoreNeedAgainstListing(need, listing, options.city);

        if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
          best = { need, listing, score, reasons };
        }
      }

      if (best) matches.push(best);
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 20);
  },

  /**
   * "Bu ürünü arayanlar" (rapor md. 77): bir ilanın karşılayabileceği açık
   * ihtiyaçlar. İlan detayında "bu ürünü N kişi arıyor" göstergesi ve
   * ilan sahibine "kime teklif götürebilirim" bilgisi buradan gelir.
   */
  async getSeekersForListing(
    listing: Pick<Listing, 'id' | 'userId' | 'title' | 'categoryId' | 'tags' | 'location' | 'description'>,
    options: { limit?: number } = {}
  ): Promise<Array<{ need: Need; score: number; reasons: string[] }>> {
    const categoryUuid = await categoryUuidBySlug(listing.categoryId);

    const keywordFilters = tokenize(listing.title)
      .map(sanitizeForFilter)
      .filter(Boolean)
      .slice(0, 10)
      .map((word) => `title.ilike.%${word}%`);

    let query = supabase
      .from('needs')
      .select(NEED_SELECT)
      .eq('status', 'active')
      .neq('user_id', listing.userId)
      .limit(120);

    if (categoryUuid && keywordFilters.length) {
      query = query.or([`category_id.eq.${categoryUuid}`, ...keywordFilters].join(','));
    } else if (categoryUuid) {
      query = query.eq('category_id', categoryUuid);
    } else if (keywordFilters.length) {
      query = query.or(keywordFilters.join(','));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Bu ürünü arayanlar alınamadı:', error);
      return [];
    }

    return (data as unknown as NeedRow[])
      .map(mapNeed)
      .map((need) => ({ need, ...scoreNeedAgainstListing(need, listing) }))
      .filter((row) => row.score >= MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 20);
  },

  /**
   * Arama ekranındaki "Arayanlar" sekmesi (rapor md. 76): aynı kelime için
   * "bu ürünü VERENLER" (ilanlar) ile "bu ürünü ARAYANLAR" (ihtiyaçlar)
   * ayrı ayrı gösterilebilsin diye ihtiyaçlarda metin araması.
   */
  async searchNeeds(
    query: string,
    options: { excludeUserId?: string; limit?: number } = {}
  ): Promise<Array<{ need: Need; seeker: NeedSeeker }>> {
    const term = sanitizeForFilter(query);

    if (!term) return [];

    let request = supabase
      .from('needs')
      .select(NEED_WITH_SEEKER_SELECT)
      .eq('status', 'active')
      .or([`title.ilike.%${term}%`, `note.ilike.%${term}%`].join(','))
      .order('created_at', { ascending: false })
      .limit(options.limit ?? 30);

    if (options.excludeUserId) {
      request = request.neq('user_id', options.excludeUserId);
    }

    const { data, error } = await request;

    if (error) {
      console.error('Arayanlar alınamadı:', error);
      return [];
    }

    return (data as unknown as Array<NeedRow & { user?: any }>).map((row) => ({
      need: mapNeed(row),
      seeker: {
        id: row.user?.id ?? row.user_id,
        fullName: row.user?.full_name ?? 'Swaloop Kullanıcısı',
        avatarUrl: row.user?.avatar_url ?? '',
        city: row.user?.city ?? '',
        district: row.user?.district ?? '',
      },
    }));
  },

  /**
   * "Bölgede en çok aranan şeyler" (rapor md. 77). Parasal hiçbir bilgi
   * içermez; sadece kaç kişinin neyi aradığını söyler.
   */
  async getPopularNeeds(
    limit = 10
  ): Promise<Array<{ title: string; count: number }>> {
    const { data, error } = await supabase
      .from('needs')
      .select('title')
      .eq('status', 'active')
      .limit(500);

    if (error) {
      console.error('Popüler ihtiyaçlar alınamadı:', error);
      return [];
    }

    const counts = new Map<string, { title: string; count: number }>();

    for (const row of data ?? []) {
      const key = (row.title ?? '').toLocaleLowerCase('tr').trim();
      if (!key) continue;

      const existing = counts.get(key);

      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { title: row.title, count: 1 });
      }
    }

    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
};
