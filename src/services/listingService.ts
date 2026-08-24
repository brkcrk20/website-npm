import { Listing, CategoryId, ListingCondition } from '../types';
import { impactService } from './impactService';
import { storageService } from './storageService';
import { supabase } from '../lib/supabase';
import { DEFAULT_AVATAR, PLACEHOLDER_IMAGE } from '../constants';
import { Coordinates, getCachedLocation, haversineKm } from '../utils/geo';
import type { TablesUpdate } from '../types/supabase';

/**
 * İlan (takas eşyası) veri katmanı.
 *
 * Sorgu şekli tek bir sabitte toplandı (`LISTING_SELECT`) ve zenginleştirme
 * (`enrichListings`) artık kategori, güven puanı ve favori bilgisini TEK
 * turda, paralel üç sorguyla çekiyor. Önceden favori durumu hiç
 * okunmadığı için kalp ikonu her zaman boş görünüyordu.
 */

const LISTING_SELECT =
  '*, user:profiles(*), images:listing_images(storage_path, sort_order)';

/**
 * Favori id'leri kısa süreli önbellek. Keşfet ekranı sayfa başına birden
 * çok liste çekebiliyor; her biri için ayrı favori sorgusu atmamak için
 * kısa bir pencere boyunca aynı sonuç kullanılıyor. Favori değiştiğinde
 * anında geçersiz kılınır.
 */
let favoriteCache: { ids: Set<string>; fetchedAt: number } | null = null;
const FAVORITE_CACHE_MS = 15_000;

export function invalidateFavoriteCache() {
  favoriteCache = null;
}

async function getFavoriteIdSet(): Promise<Set<string>> {
  if (favoriteCache && Date.now() - favoriteCache.fetchedAt < FAVORITE_CACHE_MS) {
    return favoriteCache.ids;
  }

  // getSession() oturumu yerelden okur; getUser() her çağrıda auth
  // sunucusuna gider. Bu fonksiyon her liste çiziminde çalıştığı için
  // yerel okuma tercih ediliyor.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;

  if (!userId) {
    favoriteCache = { ids: new Set(), fetchedAt: Date.now() };
    return favoriteCache.ids;
  }

  const { data, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId);

  if (error) {
    console.error('Favoriler alınamadı:', error);
    return new Set();
  }

  favoriteCache = {
    ids: new Set((data ?? []).map((row) => row.listing_id)),
    fetchedAt: Date.now(),
  };

  return favoriteCache.ids;
}

async function getCategoryUuid(categoryId: CategoryId | string): Promise<string | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', categoryId)
    .maybeSingle();

  if (error) {
    console.error('Kategori bulunamadı:', error);
    return null;
  }

  return data?.id ?? null;
}

function mapImages(raw: any): string[] {
  if (!Array.isArray(raw) || !raw.length) return [PLACEHOLDER_IMAGE];

  const urls = [...raw]
    .sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
    .map((img: any) => (typeof img === 'string' ? img : img?.storage_path))
    .filter((url: unknown): url is string => typeof url === 'string' && url.length > 0);

  return urls.length ? urls : [PLACEHOLDER_IMAGE];
}

function mapListing(row: any, viewerLocation?: Coordinates | null): Listing {
  const categoryId = (row.category_slug ?? row.category_id) as CategoryId;

  const estimatedImpact = impactService.calculateListingImpact(
    categoryId,
    row.condition as ListingCondition
  );

  // row.user, `user:profiles(*)` join'inden gelen HAM satırdır (snake_case);
  // Listing['user'] tipinin beklediği camelCase şekle burada çevrilir.
  // Güven puanı profiles'ta değil trust_profiles'ta durduğu için
  // enrichListings tarafından `owner_trust_score` olarak taşınır.
  const mappedUser = row.user
    ? {
        id: row.user.id ?? row.owner_id,
        fullName: row.user.full_name ?? 'Swaloop Kullanıcısı',
        avatarUrl: row.user.avatar_url || DEFAULT_AVATAR,
        trustScore: Number(row.owner_trust_score ?? 5),
        city: row.user.city ?? '',
        district: row.user.district ?? '',
        isVerified: true,
      }
    : {
        id: row.owner_id,
        fullName: 'Swaloop Kullanıcısı',
        avatarUrl: DEFAULT_AVATAR,
        trustScore: Number(row.owner_trust_score ?? 5),
        city: row.city ?? '',
        district: row.district ?? '',
        isVerified: false,
      };

  const lat = row.latitude ?? undefined;
  const lng = row.longitude ?? undefined;

  const distanceKm =
    viewerLocation && typeof lat === 'number' && typeof lng === 'number'
      ? Number(haversineKm(viewerLocation, { lat, lng }).toFixed(1))
      : undefined;

  return {
    id: row.id,
    userId: row.owner_id,
    user: mappedUser,
    title: row.title ?? '',
    description: row.description ?? '',
    categoryId,
    condition: row.condition as ListingCondition,
    images: mapImages(row.images),
    location: {
      city: row.city ?? '',
      district: row.district ?? '',
      lat,
      lng,
      distanceKm,
    },
    lookingFor: row.looking_for ?? '',
    deliveryOptions: Array.isArray(row.delivery_options) ? row.delivery_options : ['in_person'],
    estimatedImpact,
    status: row.status ?? 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    viewCount: row.view_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
    isFavorite: row.is_favorite ?? false,
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

/**
 * Ham `listings` satırlarını uygulamanın `Listing` tipine çevirir; kategori
 * slug'ı, ilan sahibinin güven puanı ve favori durumu paralel olarak
 * eklenir.
 */
export async function enrichListings(rows: any[]): Promise<Listing[]> {
  if (!rows.length) return [];

  const categoryIds = [...new Set(rows.map((row) => row.category_id).filter(Boolean))];
  const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter(Boolean))];

  const [categoryResult, trustResult, favoriteIds] = await Promise.all([
    categoryIds.length
      ? supabase.from('categories').select('id, slug').in('id', categoryIds)
      : Promise.resolve({ data: [], error: null } as any),
    ownerIds.length
      ? supabase.from('trust_profiles').select('user_id, trust_score').in('user_id', ownerIds)
      : Promise.resolve({ data: [], error: null } as any),
    getFavoriteIdSet(),
  ]);

  const categoryMap = new Map<string, string>();
  for (const category of categoryResult.data ?? []) {
    categoryMap.set(category.id, category.slug);
  }

  const trustScoreMap = new Map<string, number>();
  for (const trust of trustResult.data ?? []) {
    if (trust.user_id != null && trust.trust_score != null) {
      trustScoreMap.set(trust.user_id, Number(trust.trust_score));
    }
  }

  const viewerLocation = getCachedLocation();

  return rows.map((row) =>
    mapListing(
      {
        ...row,
        category_slug: categoryMap.get(row.category_id) ?? row.category_id,
        owner_trust_score: trustScoreMap.get(row.owner_id) ?? 5,
        is_favorite: favoriteIds.has(row.id),
      },
      viewerLocation
    )
  );
}

export const listingService = {
  async getAllListings(limit = 60): Promise<Listing[]> {
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('İlanlar alınamadı:', error);
      return [];
    }

    return enrichListings(data ?? []);
  },

  async getListingById(id: string): Promise<Listing | undefined> {
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('İlan alınamadı:', error);
      return undefined;
    }

    const [listing] = await enrichListings([data]);
    return listing;
  },

  /**
   * Görüntülenme sayacını artırır. Kullanıcı başkasının ilanını doğrudan
   * UPDATE edemeyeceği için (RLS) bunu `security definer` bir fonksiyon
   * yapar; migration uygulanmamışsa sessizce atlanır.
   */
  async incrementViewCount(id: string): Promise<void> {
    const { error } = await supabase.rpc('increment_listing_view', { p_listing_id: id });

    if (error && error.code !== 'PGRST202') {
      console.warn('Görüntülenme sayacı artırılamadı:', error.message);
    }
  },

  async getUserListings(userId: string): Promise<Listing[]> {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('owner_id', userId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Kullanıcı ilanları alınamadı:', error);
      return [];
    }

    return enrichListings(data ?? []);
  },

  /** Teklif ekranlarında kullanılan, yalnızca takasa uygun ilanlar. */
  async getTradableUserListings(userId: string): Promise<Listing[]> {
    const listings = await this.getUserListings(userId);
    return listings.filter((listing) => listing.status === 'active');
  },

  async createListing(data: {
    userId: string;
    user: Listing['user'];
    title: string;
    description: string;
    categoryId: CategoryId;
    condition: ListingCondition;
    images: string[];
    location: Listing['location'];
    lookingFor: string;
    deliveryOptions: ('in_person' | 'cargo' | 'safe_point')[];
    tags?: string[];
  }): Promise<Listing | undefined> {
    const categoryUuid = await getCategoryUuid(data.categoryId);

    if (!categoryUuid) {
      console.error('Geçersiz kategori:', data.categoryId);
      return undefined;
    }

    const { data: created, error } = await supabase
      .from('listings')
      .insert({
        owner_id: data.userId,
        title: data.title,
        description: data.description,
        category_id: categoryUuid,
        condition: data.condition,
        city: data.location.city,
        district: data.location.district,
        latitude: data.location.lat ?? null,
        longitude: data.location.lng ?? null,
        looking_for: data.lookingFor,
        delivery_options: data.deliveryOptions,
        tags: data.tags ?? [],
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !created) {
      console.error('İlan oluşturulamadı:', error);
      return undefined;
    }

    if (data.images.length > 0) {
      const { error: imageError } = await supabase.from('listing_images').insert(
        data.images.map((url, index) => ({
          listing_id: created.id,
          storage_path: url,
          sort_order: index,
        }))
      );

      if (imageError) {
        console.warn('İlan oluşturuldu fakat fotoğraflar kaydedilemedi:', imageError);
      }
    }

    return {
      ...mapListing({ ...created, category_slug: data.categoryId }),
      user: data.user,
      images: data.images.length ? data.images : [PLACEHOLDER_IMAGE],
      location: data.location,
    };
  },

  async updateListing(id: string, updates: Partial<Listing>): Promise<Listing | undefined> {
    const updateData: TablesUpdate<'listings'> = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.condition !== undefined) updateData.condition = updates.condition;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.lookingFor !== undefined) updateData.looking_for = updates.lookingFor;
    if (updates.deliveryOptions !== undefined) updateData.delivery_options = updates.deliveryOptions;
    if (updates.tags !== undefined) updateData.tags = updates.tags;

    if (updates.categoryId !== undefined) {
      const categoryUuid = await getCategoryUuid(updates.categoryId);

      if (!categoryUuid) {
        console.error('Kategori bulunamadı:', updates.categoryId);
        return undefined;
      }

      updateData.category_id = categoryUuid;
    }

    if (updates.location) {
      updateData.city = updates.location.city;
      updateData.district = updates.location.district;
      updateData.latitude = updates.location.lat ?? null;
      updateData.longitude = updates.location.lng ?? null;
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('listings')
      .update(updateData)
      .eq('id', id)
      .select(LISTING_SELECT)
      .maybeSingle();

    if (error || !data) {
      console.error('İlan güncellenemedi:', error);
      return undefined;
    }

    const [listing] = await enrichListings([data]);
    return listing;
  },

  /** İlanı yayından kaldırır / geri alır. */
  async setListingStatus(id: string, status: Listing['status']): Promise<boolean> {
    const { error } = await supabase
      .from('listings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('İlan durumu değiştirilemedi:', error);
      return false;
    }

    return true;
  },

  async deleteListing(id: string): Promise<boolean> {
    // Fotoğraf satırları `on delete cascade` ile birlikte silinir.
    const { error } = await supabase.from('listings').delete().eq('id', id);

    if (error) {
      console.error('İlan silinemedi:', error);
      return false;
    }

    invalidateFavoriteCache();
    return true;
  },

  /** Favoriye ekler/çıkarır ve yeni durumu (favoride mi) döndürür. */
  async toggleFavorite(id: string): Promise<boolean> {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      console.warn('Favori işlemi için giriş gerekli.');
      return false;
    }

    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('listing_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from('favorites').delete().eq('id', existing.id);

      if (error) {
        console.error('Favori kaldırılamadı:', error);
        return true;
      }

      invalidateFavoriteCache();
      return false;
    }

    const { error } = await supabase
      .from('favorites')
      .insert({ listing_id: id, user_id: userId });

    if (error) {
      console.error('Favori eklenemedi:', error);
      return false;
    }

    invalidateFavoriteCache();
    return true;
  },

  async getFavoriteIds(): Promise<string[]> {
    return [...(await getFavoriteIdSet())];
  },

  async getFavorites(): Promise<Listing[]> {
    const ids = await this.getFavoriteIds();

    if (!ids.length) return [];

    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (error || !data) {
      if (error) console.error('Favori ilanlar alınamadı:', error);
      return [];
    }

    return enrichListings(data);
  },

  async searchListings(
    query: string,
    categoryId?: string,
    condition?: string,
    maxDistance?: number
  ): Promise<Listing[]> {
    let request = supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(60);

    const cleanQuery = query.trim();

    if (cleanQuery) {
      // Virgül ve parantez PostgREST `or` filtresini bozar; temizleniyor.
      const safeQuery = cleanQuery.replace(/[,()]/g, ' ');
      request = request.or(`title.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%,looking_for.ilike.%${safeQuery}%`);
    }

    if (categoryId && categoryId !== 'all') {
      const categoryUuid = await getCategoryUuid(categoryId);
      if (!categoryUuid) return [];
      request = request.eq('category_id', categoryUuid);
    }

    if (condition && condition !== 'all') {
      request = request.eq('condition', condition);
    }

    const { data, error } = await request;

    if (error) {
      console.error('İlan araması başarısız:', error);
      return [];
    }

    const listings = await enrichListings(data ?? []);

    if (maxDistance !== undefined && maxDistance > 0) {
      // Konumu bilinmeyen ilanlar mesafe filtresiyle elenmez — aksi halde
      // konum izni verilmediğinde liste tamamen boşalırdı.
      return listings.filter(
        (listing) =>
          listing.location.distanceKm === undefined || listing.location.distanceKm <= maxDistance
      );
    }

    return listings;
  },

  /** Kategori bazlı gerçek ilan sayıları (keşfet ekranındaki rozetler için). */
  async getCategoryCounts(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('listings')
      .select('category_id')
      .eq('status', 'active');

    if (error || !data) {
      if (error) console.error('Kategori sayıları alınamadı:', error);
      return {};
    }

    const { data: categories } = await supabase.from('categories').select('id, slug');
    const slugById = new Map((categories ?? []).map((c) => [c.id, c.slug]));

    return data.reduce<Record<string, number>>((acc, row) => {
      const slug = slugById.get(row.category_id ?? '') ?? 'other';
      acc[slug] = (acc[slug] ?? 0) + 1;
      return acc;
    }, {});
  },
};

/**
 * İlan fotoğraflarını yükler. Dosyalar `storageService` içinde WebP'e
 * çevrilir; dönen dizi girişle aynı sırada olup başarısız slotlarda
 * `null` taşır.
 */
export async function uploadListingImages(files: File[]): Promise<(string | null)[]> {
  const results = await storageService.uploadListingImages(files);
  return results.map((result) => result?.url ?? null);
}
