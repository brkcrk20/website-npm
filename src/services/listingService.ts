import {
  Listing,
  CategoryId,
  ListingCondition,
} from '../types';

import { supabase } from '../lib/supabase';
import { blockService } from './blockService';
import type { TablesUpdate } from '../types/supabase';
import { convertImagesToWebp } from '../utils/imageToWebp';

const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6bafeb?w=800&auto=format&fit=crop&q=80';

const LISTING_IMAGES_BUCKET = 'listing-images';

/**
 * İlan sorgularında ilan sahibinin profilinden çekilen kolonlar.
 *
 * GÜVENLİK: Buraya `profiles(*)` YAZILMAMALI. `profiles` üzerindeki RLS
 * politikası satır bazlıdır (`profiles_select_all ... using (true)`),
 * Postgres'te kolon bazlı RLS yoktur — yani `*` ile sorgulandığında her
 * ilan sahibinin `phone` (ve e-posta, tercih vb.) alanı istemciye kadar
 * iniyordu. Ekranda bunların hiçbiri gösterilmiyor; join'i açık kolon
 * listesine sabitleyerek veri hiç dışarı çıkmıyor.
 */
const LISTING_OWNER_COLUMNS = 'id, full_name, avatar_url, city, district';

const LISTING_SELECT =
  `*, user:profiles(${LISTING_OWNER_COLUMNS}), images:listing_images(storage_path)`;

/**
 * Kullanıcının arama metnini PostgREST `or()` filtresine gömülebilir hale
 * getirir.
 *
 * GÜVENLİK: `or()` argümanı parametreli bir sorgu değil, ham bir filtre
 * ifadesidir. Metin doğrudan gömüldüğünde `,` yeni bir koşul, `(` `)` ise
 * iç içe and/or grubu başlatır — yani `foo,status.eq.sold` gibi bir arama
 * sorgunun kendi `status = 'active'` kısıtının yanına koşul ekleyebiliyordu.
 * `"` ve `\` ise PostgREST'in değer içindeki tırnak/kaçış karakterleri.
 * Bunların tamamı atılıyor.
 *
 * Ayrıca `%`, `_` ve `*` ilike jokerleridir; kaçırmak yerine atılıyorlar
 * (kaçış karakterinin `or()` ifadesi içinde nasıl yorumlanacağı PostgREST
 * sürümüne bağlı — atmak hem güvenli hem öngörülebilir).
 *
 * `.` bilerek korunuyor: PostgREST her koşulu yalnızca ilk iki noktadan
 * ayırır, gerisi değerin parçasıdır. Yani "3.5mm" gibi aramalar çalışmaya
 * devam ediyor.
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/[,()"\\%_*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kullanıcının seçtiği gerçek fotoğrafları Supabase Storage'a yükler ve
 * herkese açık (public) URL'lerini döndürür. Bucket ve RLS politikaları
 * için bkz. supabase/migrations/20260818150000_create_listing_images_storage_bucket.sql
 *
 * ÖNEMLİ: Dosya yolu (`{ownerId}/{dosya}`) RLS politikasının
 * `(storage.foldername(name))[1] = auth.uid()::text` kontrolüyle
 * eşleşmek ZORUNDA. Bu yüzden `userId` parametresi yerine, isteği
 * gerçekten yapacak olan Supabase oturumundaki `auth.uid()` kullanılıyor
 * (`supabase.auth.getUser()`). Eğer bu ikisi (uygulamanın yerel
 * `currentUser.id`'si ile gerçek oturum kullanıcısı) farklıysa, ya da
 * hiç aktif oturum yoksa (süresi dolmuş / hiç giriş yapılmamış), yükleme
 * "new row violates row-level security policy" hatasıyla reddedilir —
 * bu artık konsola net bir teşhis mesajıyla loglanıyor.
 *
 * Dönen dizi, `files` ile AYNI SIRA ve AYNI UZUNLUKTADIR — bir dosya
 * yüklenemezse o index'te `null` döner (çağıran taraf pozisyona göre
 * eşleştirme yapabilsin diye; array.filter ile sessizce atlarsak sıra
 * kayar ve yanlış görsel yanlış slota eşlenebilir).
 */
export async function uploadListingImages(
  userId: string,
  files: File[]
): Promise<(string | null)[]> {
  if (!files.length) return [];

  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    console.error(
      'Fotoğraf yüklenemedi: geçerli bir Supabase oturumu bulunamadı. ' +
        'Kullanıcı arayüzde "giriş yapılmış" görünse bile, gerçek Supabase ' +
        'oturumu sona ermiş olabilir (localStorage önbelleği ile Supabase ' +
        'auth session farklı şeylerdir). Çözüm: kullanıcının tekrar giriş ' +
        '(telefon+OTP) yapması gerekiyor.',
      authError
    );
    return files.map(() => null);
  }

  if (authData.user.id !== userId) {
    console.warn(
      'Uyarı: uygulamanın önbellekteki currentUser.id değeri ile gerçek ' +
        'Supabase oturum kullanıcı id\'si FARKLI. RLS kontrolü oturumdaki ' +
        'id\'ye göre yapılacağı için yükleme buna göre devam ediyor.',
      { sessionUserId: authData.user.id, cachedUserId: userId }
    );
  }

  // RLS foldername kontrolü auth.uid()'e göre çalıştığı için, path'te
  // parametre olarak gelen userId değil, gerçek oturum id'si kullanılır.
  const ownerId = authData.user.id;

  // Yüklemeden önce tüm görselleri tarayıcıda WebP'ye çevir (daha küçük
  // dosya boyutu, daha hızlı yükleme). Dönüşüm başarısız olan dosyalar
  // olduğu gibi (orijinal formatında) yüklenmeye devam eder.
  const webpFiles = await convertImagesToWebp(files);

  const results: (string | null)[] = [];

  for (const file of webpFiles) {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const randomId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const path = `${ownerId}/${randomId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(LISTING_IMAGES_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Fotoğraf yüklenemedi:', file.name, uploadError);
      results.push(null);
      continue;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(LISTING_IMAGES_BUCKET).getPublicUrl(path);

    results.push(publicUrl);
  }

  return results;
}

async function getCategoryUuid(
  categoryId: CategoryId | string
): Promise<string | null> {
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

async function getCategorySlug(
  categoryUuid: string
): Promise<string> {
  const { data } = await supabase
    .from('categories')
    .select('slug')
    .eq('id', categoryUuid)
    .maybeSingle();

  return data?.slug ?? categoryUuid;
}

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';

function mapListing(row: any): Listing {
  const categoryId = row.category_slug ?? row.category_id;

  // row.user, Supabase join'inden (bkz. LISTING_SELECT) gelen HAM profil
  // satırıdır (snake_case: full_name, avatar_url...) — Listing['user']
  // tipinin beklediği camelCase şekille birebir aynı DEĞİLDİR. Önceden
  // bu ham satır doğrudan atanıyordu ve `trustScore` alanı hiç var
  // olmadığı için ProductCard'da `.toFixed(1)` çağrısı patlıyordu.
  // Burada doğru şekilde eşleniyor; güven puanı enrichListings'te
  // ayrıca hesaplanıp `row.owner_trust_score` olarak taşınıyor.
  const mappedUser = row.user
    ? {
        id: row.user.id ?? row.owner_id,
        fullName: row.user.full_name ?? 'Swaloop Kullanıcısı',
        avatarUrl: row.user.avatar_url || DEFAULT_AVATAR,
        trustScore: row.owner_trust_score ?? 5,
        city: row.user.city ?? '',
        district: row.user.district ?? '',
        // Önceden sabit `true` idi: doğrulanmamış her ilan sahibi de
        // "doğrulanmış üye" rozetiyle görünüyordu. Artık gerçek
        // trust_profiles.verification_level değerinden geliyor
        // (enrichListings'te topluca çekiliyor).
        isVerified: row.owner_is_verified ?? false,
      }
    : {
        id: row.owner_id,
        fullName: 'Swaloop Kullanıcısı',
        avatarUrl: DEFAULT_AVATAR,
        trustScore: row.owner_trust_score ?? 5,
        city: row.city ?? '',
        district: row.district ?? '',
        isVerified: false,
      };

  return {
    id: row.id,

    // row.slug DB trigger'ı tarafından garanti üretilir (bkz. migration
    // 20260818180000). Eski/olası boş durumlar için id'ye düşer.
    slug: row.slug || row.id,

    userId: row.owner_id,

    user: mappedUser,

    title: row.title ?? '',
    description: row.description ?? '',

    categoryId: categoryId as CategoryId,

    condition: row.condition as ListingCondition,

    // BURASI GÜNCELLENDİ: Fotoğrafları objeden string'e çeviriyor
    images:
      Array.isArray(row.images) && row.images.length
        ? row.images.map((img: any) => typeof img === 'string' ? img : img.storage_path || img)
        : [DEFAULT_IMAGE],

    location: {
      city: row.city ?? '',
      district: row.district ?? '',
      lat: row.latitude ?? 0,
      lng: row.longitude ?? 0,
<<<<<<< HEAD
      // "Mesafe ya gerçektir ya da yoktur" (README). Önceden burada sabit 0
      // dönülüyordu: hiçbir sorgu `distance_km` üretmediği için HER ilan
      // "0 km uzakta" görünüyor, mesafe filtreleri de (SwipeMatchPage,
      // searchListings) hiçbir şeyi elemiyordu. Artık yalnızca hem ilanın
      // hem de kullanıcının koordinatı biliniyorsa doluyor
      // (bkz. enrichListings → viewerCoords), aksi hâlde undefined kalıyor
      // ve arayüz mesafeyi hiç göstermiyor.
      distanceKm: typeof row.distance_km === 'number' ? row.distance_km : undefined,
=======
      distanceKm: row.distance_km ?? 0,
>>>>>>> aa112bc (Son güncellemeler)
    },

    lookingFor: row.looking_for ?? '',

    // Yapılandırılmış "arıyorum": eşleştirme motorunun okuduğu kategori
    // listesi (bkz. migration 20260820000000, rapor md. 20).
    lookingForCategories: Array.isArray(row.looking_for_categories)
      ? (row.looking_for_categories as CategoryId[])
      : [],

    deliveryOptions:
      Array.isArray(row.delivery_options)
        ? row.delivery_options
        : ['in_person'],

    status: row.status ?? 'active',

    createdAt: row.created_at,
    updatedAt: row.updated_at,

<<<<<<< HEAD
    // 20260829000000 canlıya uygulanana kadar bu kolonlar sorgudan hiç
    // gelmez; o durumda alan `undefined` kalır ve arayüz süreyi göstermez.
    expiresAt: row.expires_at ?? undefined,
    renewedAt: row.renewed_at ?? undefined,

=======
>>>>>>> aa112bc (Son güncellemeler)
    viewCount: row.view_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
    isFavorite: row.is_favorite ?? false,

    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

/**
 * Engellenen kullanıcıların ilanlarını keşif akışlarından düşürür
 * (rapor md. 106).
 *
 * Bilinçli olarak SADECE keşif/arama yollarında uygulanır: devam eden bir
 * takasın ya da geçmişin içindeki ilanlar gizlenirse takas ekranı boş
 * görünür ve kullanıcı ne olduğunu anlamaz.
 */
<<<<<<< HEAD
/**
 * Süresi dolmuş ilanları keşif/arama sonuçlarından düşürür (rapor md. 119).
 *
 * `expire_stale_listings()` bunu zaten yapıyor ama SAATTE BİR çalışıyor:
 * arada kalan sürede süresi bitmiş bir ilan hâlâ `status = 'active'`
 * görünür. Sunucu tarafında `expires_at` filtresi kullanılmıyor, çünkü
 * 20260829000000 canlıya uygulanana kadar o kolon yok ve sorgu tümden
 * hata verirdi — kolon gelmeden keşif ekranının boş kalması, birkaç saat
 * fazladan görünen ilandan çok daha kötü.
 *
 * Bilinçli olarak SADECE keşif/arama yollarında: takas geçmişindeki ya da
 * "İlanlarım"daki süresi dolmuş ilan görünmeye devam etmeli (kullanıcı onu
 * yenileyecek).
 */
export function withoutExpired(rows: any[], now: number = Date.now()): any[] {
  return rows.filter((row) => {
    if (!row?.expires_at) return true;

    const end = new Date(row.expires_at).getTime();

    return Number.isNaN(end) || end > now;
  });
}

=======
>>>>>>> aa112bc (Son güncellemeler)
async function withoutBlockedOwners(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;

  const blockedIds = await blockService.getBlockedIdsForCurrentUser();

  if (!blockedIds.length) return rows;

  const blocked = new Set(blockedIds);

  return rows.filter((row) => !blocked.has(row.owner_id));
}

<<<<<<< HEAD
/**
 * İki koordinat arasındaki kuş uçuşu mesafe (km) — haversine.
 * Dış bir servise/pakete ihtiyaç duymaz; ilan listeleri için yeterince
 * hassastır (birkaç metre hata).
 */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * Mesafe hesabında kullanılacak "benim konumum".
 *
 * Konum izni verilmemişse null kalır ve hiçbir ilana mesafe yazılmaz —
 * uydurma bir değer göstermek yerine mesafe hiç gösterilmez.
 */
let viewerCoords: { lat: number; lng: number } | null = null;

export function setViewerCoords(coords: { lat: number; lng: number } | null): void {
  viewerCoords = coords;
}

export function getViewerCoords(): { lat: number; lng: number } | null {
  return viewerCoords;
}

=======
>>>>>>> aa112bc (Son güncellemeler)
export async function enrichListings(rows: any[]): Promise<Listing[]> {
  if (!rows.length) return [];

  const categoryIds = [
    ...new Set(
      rows
        .map((row) => row.category_id)
        .filter(Boolean)
    ),
  ];

  let categoryMap = new Map<string, string>();

  if (categoryIds.length) {
    const { data } = await supabase
      .from('categories')
      .select('id, slug')
      .in('id', categoryIds);

    for (const category of data ?? []) {
      categoryMap.set(category.id, category.slug);
    }
  }

  // İlan sahiplerinin gerçek güven puanını (trust_profiles.trust_score)
  // topluca çekiyoruz. Önceden bu hiç yapılmıyordu ve ProductCard'ın
  // beklediği `user.trustScore` alanı DB'den gelen ham `profiles` satırında
  // hiç yoktu (yalnızca `trust_profiles` tablosunda tutuluyor) — bu da
  // "Cannot read properties of undefined (reading 'toFixed')" hatasına
  // yol açıyordu. Skor bulunamazsa 5 (varsayılan başlangıç puanı) kullanılır.
  const ownerIds = [
    ...new Set(rows.map((row) => row.owner_id).filter(Boolean)),
  ];

  let trustScoreMap = new Map<string, number>();
  const verifiedMap = new Map<string, boolean>();

  if (ownerIds.length) {
    const { data: trustRows } = await supabase
      .from('trust_profiles')
      .select('user_id, trust_score, verification_level')
      .in('user_id', ownerIds);

    for (const t of trustRows ?? []) {
      if (t.user_id == null) continue;

      if (t.trust_score != null) {
        trustScoreMap.set(t.user_id, t.trust_score);
      }

      verifiedMap.set(t.user_id, t.verification_level === 'id_verified');
    }
  }

<<<<<<< HEAD
  // Favoriler tek sorguda topluca çekiliyor. Önceden `is_favorite` hiçbir
  // sorguda doldurulmuyordu: kullanıcı bir ilanı favorilere eklese bile
  // sayfayı yenileyince kalp boş görünüyordu, hatta /favoriler ekranındaki
  // ilanlarda bile favori işareti çıkmıyordu.
  const favoriteIds = await getFavoriteListingIds(rows.map((row) => row.id));

=======
>>>>>>> aa112bc (Son güncellemeler)
  return rows.map((row) => ({
    ...row,
    category_slug:
      categoryMap.get(row.category_id) ?? row.category_id,
    owner_trust_score: trustScoreMap.get(row.owner_id) ?? 5,
    owner_is_verified: verifiedMap.get(row.owner_id) ?? false,
<<<<<<< HEAD
    is_favorite: favoriteIds.has(row.id),
    distance_km:
      viewerCoords && typeof row.latitude === 'number' && typeof row.longitude === 'number'
        ? haversineKm(viewerCoords.lat, viewerCoords.lng, row.latitude, row.longitude)
        : undefined,
  })).map(mapListing);
}

/** Verilen ilanlardan hangileri oturumdaki kullanıcının favorisinde? */
async function getFavoriteListingIds(listingIds: string[]): Promise<Set<string>> {
  if (!listingIds.length) return new Set();

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
    .in('listing_id', listingIds);

  if (error) {
    console.error('Favori listesi alınamadı:', error);
    return new Set();
  }

  return new Set((data ?? []).map((row) => row.listing_id));
}

/**
 * `deleteListing` sonucu. 'deleted' = satır gerçekten silindi,
 * 'archived' = takas geçmişi referans verdiği için yayından kaldırıldı.
 */
export interface DeleteListingResult {
  /** 'deleted' = satır silindi · 'archived' = yayından kaldırıldı · 'failed' = reddedildi */
  outcome: 'deleted' | 'archived' | 'failed';
  /** Yalnızca 'failed' durumunda dolu: reddin kullanıcıya gösterilecek nedeni. */
  message?: string;
=======
  })).map(mapListing);
>>>>>>> aa112bc (Son güncellemeler)
}

export const listingService = {
  async getAllListings(): Promise<Listing[]> {
    // BURASI GÜNCELLENDİ: İlanla birlikte profil ve fotoğrafları da çekiyoruz
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Listings alınamadı:', error);
      return [];
    }

<<<<<<< HEAD
    return enrichListings(withoutExpired(await withoutBlockedOwners(data ?? [])));
=======
    return enrichListings(await withoutBlockedOwners(data ?? []));
>>>>>>> aa112bc (Son güncellemeler)
  },

  async getListingById(
    idOrSlug: string
  ): Promise<Listing | undefined> {
    if (!idOrSlug) return undefined;

    // UUID format kontrolü (36 karakter ve tire içeren standart yapı).
    // /ilan/:param artık slug taşıyor ("deneme-ilanlari-2") ama eski
    // paylaşılmış linkler hâlâ uuid olabilir — ikisini de destekliyoruz.
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const query = supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq(uuidRegex.test(idOrSlug) ? 'id' : 'slug', idOrSlug);

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      console.warn('İlan bulunamadı:', idOrSlug);
      return undefined;
    }

    if (!(data as any).images) {
      (data as any).images = [];
    }

    const [listing] = await enrichListings([data]);

    return listing;
  },

  async getUserListings(
    userId: string
  ): Promise<Listing[]> {
    // Eğer geçerli bir UUID değilse (örneğin mock/default "user-current" ise) sorgu atma
    if (!userId || userId === 'user-current' || userId.length < 30) {
      return [];
    }

    // Arşivlenen ilanlar ("İlanlarım" ekranında kaldırılmış olanlar) burada
    // görünmez; satır yalnızca takas geçmişi başlıksız kalmasın diye duruyor
    // (bkz. deleteListing).
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(
        'Kullanıcı ilanları alınamadı:',
        error
      );

      return [];
    }

    return enrichListings(data ?? []);
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
    lookingForCategories?: CategoryId[];
    deliveryOptions: (
      | 'in_person'
      | 'cargo'
      | 'safe_point'
    )[];
    tags?: string[];
  }): Promise<Listing | undefined> {
    const categoryUuid = await getCategoryUuid(
      data.categoryId
    );

    if (!categoryUuid) {
      console.error(
        'Geçersiz kategori:',
        data.categoryId
      );

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
        looking_for_categories: data.lookingForCategories ?? [],
        delivery_options: data.deliveryOptions,
        tags: data.tags ?? [],
        status: 'active',
      })
      .select('*')
      .single();

    if (error || !created) {
      console.error(
        'İlan oluşturulamadı:',
        error
      );

      return undefined;
    }

    if (data.images.length > 0) {
      const imageRows = data.images.map(
        (url, index) => ({
          listing_id: created.id,
          storage_path: url,
          sort_order: index,
        })
      );

      const { error: imageError } =
        await supabase
          .from('listing_images')
          .insert(imageRows);

      if (imageError) {
        console.warn(
          'İlan oluşturuldu fakat fotoğraflar kaydedilemedi:',
          imageError
        );
      }
    }

    const listing = mapListing({
      ...created,
      category_slug: data.categoryId,
    });

    return {
      ...listing,

      userId: data.userId,
      user: data.user,

      images:
        data.images.length > 0
          ? data.images
          : [DEFAULT_IMAGE],

      location: data.location,

      lookingFor: data.lookingFor,
      lookingForCategories: data.lookingForCategories ?? [],

      deliveryOptions: data.deliveryOptions,

      tags: data.tags ?? [],

      viewCount: 0,
      favoriteCount: 0,
      isFavorite: false,
    };
  },

  async updateListing(
    id: string,
    updates: Partial<Listing>
  ): Promise<Listing | undefined> {
    const updateData: TablesUpdate<'listings'> = {};

    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }

    if (updates.condition !== undefined) {
      updateData.condition = updates.condition;
    }

    if (updates.categoryId !== undefined) {
      const categoryUuid =
        await getCategoryUuid(
          updates.categoryId
        );

      if (!categoryUuid) {
        console.error(
          'Kategori bulunamadı:',
          updates.categoryId
        );

        return undefined;
      }

      updateData.category_id = categoryUuid;
    }

    if (updates.location) {
      updateData.city =
        updates.location.city;

      updateData.district =
        updates.location.district;

      updateData.latitude =
        updates.location.lat;

      updateData.longitude =
        updates.location.lng;
    }

    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    if (updates.lookingFor !== undefined) {
      updateData.looking_for = updates.lookingFor;
    }

    if (updates.lookingForCategories !== undefined) {
      updateData.looking_for_categories = updates.lookingForCategories;
    }

    if (updates.deliveryOptions !== undefined) {
      updateData.delivery_options = updates.deliveryOptions;
    }

    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
    }

    updateData.updated_at =
      new Date().toISOString();

    const { data, error } = await supabase
      .from('listings')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      console.error(
        'İlan güncellenemedi:',
        error
      );

      return undefined;
    }

    const [listing] =
      await enrichListings([data]);

    return listing;
  },

<<<<<<< HEAD
  /**
   * İlanı kaldırır.
   *
   * Eskiden doğrudan `delete` atılıyordu ve bu, ilana BİR KEZ teklif gelmiş
   * olması hâlinde HER ZAMAN başarısız oluyordu: `trade_offer_items.listing_id`
   * kolonu `listings(id)` referansını `on delete` davranışı olmadan tutuyor
   * (migration 20260818130000), yani Postgres silmeyi foreign key hatasıyla
   * reddediyordu. Kullanıcı "İlan silinemedi" dışında hiçbir açıklama
   * görmüyor ve ilanını bir daha asla kaldıramıyordu.
   *
   * Karar: takas geçmişinde geçen ilan silinmez, ARŞİVLENİR (status =
   * 'removed') — aksi hâlde geçmiş takaslar başlıksız kalırdı. Devam eden
   * bir takastaki ilan ise hiç kaldırılamaz. Kuralın tamamı
   * `delete_listing()` içinde (bkz. migration 20260828000000), böylece
   * hangi ekrandan çağrılırsa çağrılsın aynı şekilde işliyor.
   *
   * Hata mesajı çağırana taşınıyor: reddin nedeni ("devam eden takas")
   * kullanıcının görmesi gereken bir bilgi, konsola yazılıp yutulacak bir
   * ayrıntı değil.
   */
  async deleteListing(
    id: string
  ): Promise<DeleteListingResult> {
    const { data, error } = await supabase.rpc('delete_listing', {
      p_listing_id: id,
    });

    if (error) {
      console.error('İlan kaldırılamadı:', error);

      return {
        outcome: 'failed',
        message: error.message || 'İlan kaldırılırken bir sorun oluştu.',
      };
=======
  async deleteListing(
    id: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(
        'İlan silinemedi:',
        error
      );

      return false;
>>>>>>> aa112bc (Son güncellemeler)
    }

    return { outcome: (data as 'deleted' | 'archived') ?? 'deleted' };
  },

<<<<<<< HEAD
  /**
   * İlanın yayın süresini bugünden itibaren uzatır; süresi dolmuş bir ilanı
   * yeniden yayına alır (rapor md. 119).
   *
   * Neden RPC: `expires_at` istemciden yazılamıyor
   * (`trg_enforce_listing_expiry_update`) ve `expired -> active` geçişini
   * yalnızca sistem yapabiliyor. İkisi tek işlemde olmak zorunda, aksi
   * hâlde ilan "aktif ama süresi geçmiş" hâline düşüp bir sonraki cron
   * turunda tekrar kapanır.
   *
   * Dönen değer: yeni bitiş tarihi (ISO) · başarısızsa `null` ve nedeni
   * `message` içinde.
   */
  async renewListing(
    id: string
  ): Promise<{ expiresAt: string | null; message?: string }> {
    const { data, error } = await supabase.rpc('renew_listing', {
      p_listing_id: id,
    });

    if (error) {
      console.error('İlan yenilenemedi:', error);

      return {
        expiresAt: null,
        message: error.message || 'İlan yenilenirken bir sorun oluştu.',
      };
    }

    return { expiresAt: (data as string) ?? null };
  },

  /**
   * Favoriyi açar/kapatır ve YENİ durumu döndürür.
   *
   * `null` = işlem yapılamadı (giriş yok ya da hata). Önceden hata durumunda
   * da `false` dönüyordu; çağıran taraf bunu "favoriden çıkarıldı" sanıp
   * kalbi boşaltıyor, kullanıcı hiçbir hata görmeden işlemin başarılı
   * olduğunu sanıyordu.
   */
  async toggleFavorite(
    id: string
  ): Promise<boolean | null> {
    const {
      data: userData,
    } = await supabase.auth.getUser();

=======
  async toggleFavorite(
    id: string
  ): Promise<boolean> {
    const {
      data: userData,
    } = await supabase.auth.getUser();

>>>>>>> aa112bc (Son güncellemeler)
    const userId =
      userData.user?.id;

    if (!userId) {
      console.warn(
        'Favori işlemi için giriş gerekli.'
      );

<<<<<<< HEAD
      return null;
=======
      return false;
>>>>>>> aa112bc (Son güncellemeler)
    }

    const {
      data: existing,
    } = await supabase
      .from('favorites')
      .select('id')
      .eq('listing_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const { error } =
        await supabase
          .from('favorites')
          .delete()
          .eq('id', existing.id);

      if (error) {
        console.error(
          'Favori kaldırılamadı:',
          error
        );

<<<<<<< HEAD
        return null;
=======
        return false;
>>>>>>> aa112bc (Son güncellemeler)
      }

      return false;
    }

    const { error } =
      await supabase
        .from('favorites')
        .insert({
          listing_id: id,
          user_id: userId,
        });

    if (error) {
      console.error(
        'Favori eklenemedi:',
        error
      );

<<<<<<< HEAD
      return null;
=======
      return false;
>>>>>>> aa112bc (Son güncellemeler)
    }

    return true;
  },

  async getFavorites(): Promise<Listing[]> {
    const {
      data: userData,
    } = await supabase.auth.getUser();

    const userId =
      userData.user?.id;

    if (!userId) {
      return [];
    }

    const {
      data,
      error,
    } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId);

    if (error || !data) {
      return [];
    }

    const ids =
      data.map(
        (item) => item.listing_id
      );

    if (!ids.length) {
      return [];
    }

    const {
      data: listings,
      error: listingsError,
    } = await supabase
      .from('listings')
      .select(LISTING_SELECT) // BURASI DA GÜNCELLENDİ
      .in('id', ids);

    if (
      listingsError ||
      !listings
    ) {
      return [];
    }

    return enrichListings(
      listings
    );
  },

  async searchListings(
    query: string,
    categoryId?: string,
    condition?: string,
    maxDistance?: number
  ): Promise<Listing[]> {
    // BURASI GÜNCELLENDİ
    let request = supabase
      .from('listings')
      .select(LISTING_SELECT)
      .eq('status', 'active')
      .order('created_at', {
        ascending: false,
      });

    const cleanQuery = sanitizeSearchQuery(query);

    if (cleanQuery) {
      request = request.or(
        `title.ilike.%${cleanQuery}%,description.ilike.%${cleanQuery}%`
      );
    }

    if (
      categoryId &&
      categoryId !== 'all'
    ) {
      const categoryUuid =
        await getCategoryUuid(
          categoryId
        );

      if (!categoryUuid) {
        return [];
      }

      request = request.eq(
        'category_id',
        categoryUuid
      );
    }

    if (
      condition &&
      condition !== 'all'
    ) {
      request = request.eq(
        'condition',
        condition
      );
    }

    const {
      data,
      error,
    } = await request;

    if (error) {
      console.error(
        'İlan araması başarısız:',
        error
      );

      return [];
    }

    let listings =
      await enrichListings(
<<<<<<< HEAD
        withoutExpired(await withoutBlockedOwners(data ?? []))
=======
        await withoutBlockedOwners(data ?? [])
>>>>>>> aa112bc (Son güncellemeler)
      );

    if (
      maxDistance !== undefined &&
      maxDistance > 0
    ) {
<<<<<<< HEAD
      // Mesafesi BİLİNMEYEN ilanlar elenmez (README: "konum izni
      // verilmemişse mesafe filtresi, konumu bilinmeyen ilanları elemez").
      listings =
        listings.filter(
          (listing) =>
            listing.location.distanceKm === undefined ||
            listing.location.distanceKm <= maxDistance
=======
      listings =
        listings.filter(
          (listing) =>
            listing.location
              .distanceKm <=
            maxDistance
>>>>>>> aa112bc (Son güncellemeler)
        );
    }

    return listings;
  },
<<<<<<< HEAD

  /**
   * İlan görüntülenme sayacını artırır.
   *
   * `listings.view_count` kolonu baştan beri vardı ve ilan kartında
   * gösteriliyordu ama HİÇBİR kod yolu onu artırmıyordu: her ilan sonsuza
   * kadar "0 görüntülenme" idi. İstemciden doğrudan UPDATE atılamaz
   * (listings_update_own politikası yalnızca ilan sahibine izin verir, o da
   * kendi sayacını istediği kadar şişirebilirdi), bu yüzden sunucu
   * tarafındaki `increment_listing_view()` fonksiyonu üzerinden gidiliyor.
   *
   * Sessizce başarısız olur: sayaç artırılamadı diye ilan detay sayfası
   * açılmazlık etmemeli.
   */
  async incrementViewCount(listingId: string): Promise<void> {
    if (!listingId) return;

    const { error } = await supabase.rpc('increment_listing_view', {
      p_listing_id: listingId,
    });

    if (error) {
      console.warn('Görüntülenme sayacı artırılamadı:', error);
    }
  },
=======
>>>>>>> aa112bc (Son güncellemeler)
};