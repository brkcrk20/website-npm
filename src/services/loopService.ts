import { Loop, LoopParticipant, CategoryId, Listing } from '../types';
import { supabase } from '../lib/supabase';
import { mapProfile } from './authService';
import { enrichListings } from './listingService';
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
// DB şeması ile frontend `Loop`/`LoopParticipant` tipleri arasındaki fark
// (bkz. swaloop-devam-plani.md §10):
//  - `loops`            : id, creator_id, title, description, category,
//                          max_participants, status, created_at, updated_at.
//  - `loop_participants`: id, loop_id, user_id, offering_listing_id, role,
//                          status, joined_at.
//
// DB'de "kim kime veriyor" (gives_to/receives_from) diye ayrı bir kolon
// YOK — trade sistemindeki 6 adımlı timeline kararıyla aynı desen izlendi
// (bkz. §5.2): UI'ya özgü bu bilgi DB'de tutulmuyor, `joined_at` sırasına
// göre İSTEMCİ TARAFINDA hesaplanıyor. Döngü dairesel olduğu için i.
// katılımcı her zaman (i+1). katılımcıya verir, (i-1). katılımcıdan alır.
// Bu, katılımcı sırası sabit kaldığı sürece tutarlıdır (sıralama `joined_at`
// ile sabitlendiği için katılımcı eklenmediği sürece değişmez).
//
// `loops.status` ve `loop_participants.status` DB'de düz `text` — frontend'in
// beklediği union değerlerinden (`matching|locked|in_delivery|completed|
// cancelled` / `pending|confirmed|delivered|completed`) FARKLI bir legacy
// default'a (`'active'`) sahipler (bkz. migration
// 20260818160000_extend_loops_for_listings.sql). Uygulama satır
// oluştururken durumu her zaman açıkça doğru değerle yazacak; okurken de
// tanınmayan bir DB değeriyle karşılaşılırsa güvenli bir varsayılana
// (`matching` / `pending`) düşülüyor.
// ─────────────────────────────────────────────────────────────────────────

const LOOP_STATUSES = ['matching', 'locked', 'in_delivery', 'completed', 'cancelled'] as const;
const PARTICIPANT_STATUSES = ['pending', 'confirmed', 'delivered', 'completed'] as const;

function normalizeLoopStatus(status: string | null | undefined): Loop['status'] {
  return (LOOP_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as Loop['status'])
    : 'matching';
}

function normalizeParticipantStatus(status: string | null | undefined): LoopParticipant['status'] {
  return (PARTICIPANT_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as LoopParticipant['status'])
    : 'pending';
}

const LOOP_SELECT =
  `*, participants:loop_participants(*, user:profiles(${PROFILE_COLUMNS}), listing:listings(*, user:profiles(${PROFILE_COLUMNS}), images:listing_images(storage_path)))`;

type LoopParticipantRow = {
  id: string;
  loop_id: string;
  user_id: string;
  offering_listing_id: string | null;
  role: string;
  status: string;
  joined_at: string;
  user?: any;
  listing?: any;
};

type LoopRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  category: string;
  max_participants: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  participants?: LoopParticipantRow[];
};

/**
 * Döngü listesini, döngü sayısından BAĞIMSIZ sabit sayıda istekle hidratlar.
 *
 * Önceki hâlinde her döngü kendi `enrichListings` çağrısını yapıyordu; o da
 * içinde kategori + güven puanı + favori sorguları attığı için 10 döngülü bir
 * liste onlarca gereksiz istek üretiyordu.
 */
async function hydrateLoops(rows: LoopRow[]): Promise<Loop[]> {
  if (!rows.length) return [];

  const listingRowById = new Map<string, any>();
  for (const row of rows) {
    for (const p of row.participants ?? []) {
      if (p.offering_listing_id && p.listing && !listingRowById.has(p.offering_listing_id)) {
        listingRowById.set(p.offering_listing_id, p.listing);
      }
    }
  }

  const enriched = await enrichListings([...listingRowById.values()]);
  const listingsById = new Map(enriched.map((l) => [l.id, l]));

  return rows.map((row) => hydrateLoop(row, listingsById));
}

function hydrateLoop(row: LoopRow, listingsById: Map<string, Listing>): Loop {
  // Yalnızca bir ilan seçmiş (offering_listing_id dolu) katılımcılar tam
  // olarak "hazır" sayılır — henüz ilan seçmemiş bir katılım satırı olursa
  // (ör. gelecekte eklenecek "önce katıl, ilanı sonra seç" akışı) dairesel
  // zincir hesaplamasını bozmaması için bunlar dışarıda bırakılıyor.
  const readyRows = (row.participants ?? [])
    .filter((p) => p.offering_listing_id && listingsById.has(p.offering_listing_id))
    .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());

  const base: Omit<LoopParticipant, 'givesToUserId' | 'receivesFromUserId' | 'receivingListing'>[] =
    readyRows.map((p) => ({
      userId: p.user_id,
      user: mapProfile(p.user),
      offeringListing: listingsById.get(p.offering_listing_id as string) as Listing,
      hasConfirmed: p.status === 'confirmed' || p.status === 'delivered' || p.status === 'completed',
      status: normalizeParticipantStatus(p.status),
    }));

  const n = base.length;
  const participants: LoopParticipant[] = base.map((p, idx) => {
    const next = base[(idx + 1) % n];
    const prev = base[(idx - 1 + n) % n];
    return {
      ...p,
      givesToUserId: next?.userId ?? p.userId,
      receivesFromUserId: prev?.userId ?? p.userId,
      receivingListing: prev?.offeringListing ?? p.offeringListing,
    };
  });

  return {
    id: row.id,
    title: row.title,
    category: (row.category ?? 'other') as CategoryId,
    totalParticipants: row.max_participants ?? participants.length,
    participants,
    status: normalizeLoopStatus(row.status),
    createdAt: row.created_at,
    completedAt: normalizeLoopStatus(row.status) === 'completed' ? row.updated_at : undefined,
  };
}

/**
 * Döngüye konacak ilan gerçekten çağıranın mı ve yayında mı?
 *
 * Kural DB'de de zorunlu (trg_enforce_loop_participant_listing, migration
 * 20260828000000) — burada da bakılıyor ki kullanıcı ham bir Postgres hatası
 * yerine ne olduğunu anlatan bir mesaj görsün. Eskiden hiçbir kontrol yoktu:
 * `loop_participants_insert_own` politikası yalnızca "satırdaki user_id
 * benim" diyordu, `offering_listing_id` hiç doğrulanmıyordu; yani başkasının
 * ilanı döngüye kendi teklifin gibi konabiliyordu.
 */
async function assertOwnActiveListing(userId: string, listingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('listings')
    .select('owner_id, status')
    .eq('id', listingId)
    .maybeSingle();

  if (error || !data) {
    console.error('Döngüye eklenecek ilan bulunamadı:', error);
    return false;
  }

  if (data.owner_id !== userId) {
    console.error('Döngüye yalnızca kendi ilanını koyabilirsin.');
    return false;
  }

  if (data.status !== 'active') {
    console.error(`Yalnızca yayında olan bir ilan döngüye konabilir (mevcut durum: ${data.status}).`);
    return false;
  }

  return true;
}

export const loopService = {
  async getLoops(): Promise<Loop[]> {
    const { data, error } = await supabase
      .from('loops')
      .select(LOOP_SELECT)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Döngüler getirilemedi:', error);
      return [];
    }

    return hydrateLoops((data ?? []) as unknown as LoopRow[]);
  },

  async getLoopById(id: string): Promise<Loop | undefined> {
    const { data, error } = await supabase
      .from('loops')
      .select(LOOP_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('Döngü getirilemedi:', error);
      return undefined;
    }

    const [loop] = await hydrateLoops([data as unknown as LoopRow]);
    return loop;
  },

  /**
   * Yeni bir döngü açar ve kurucuyu ilk katılımcı olarak ekler.
   * NOT: Bu metodu çağıran bir UI şu an yok (LoopsPage.tsx sadece mevcut
   * döngüleri listeliyor) — gelecekteki "döngü oluştur" akışı için hazır
   * tutuluyor. Bkz. swaloop-devam-plani.md §10.
   */
  async createLoop(
    creatorId: string,
    listingId: string,
    title: string,
    category: CategoryId,
    maxParticipants: number = 3,
    description?: string
  ): Promise<Loop | undefined> {
    if (!(await assertOwnActiveListing(creatorId, listingId))) return undefined;

    const loopInsert: TablesInsert<'loops'> = {
      creator_id: creatorId,
      title,
      category,
      description: description ?? null,
      max_participants: maxParticipants,
      status: 'matching',
    };

    const { data: loopRow, error: loopError } = await supabase
      .from('loops')
      .insert(loopInsert)
      .select()
      .single();

    if (loopError || !loopRow) {
      console.error('Döngü oluşturulamadı:', loopError);
      return undefined;
    }

    const participantInsert: TablesInsert<'loop_participants'> = {
      loop_id: loopRow.id,
      user_id: creatorId,
      offering_listing_id: listingId,
      role: 'creator',
      status: 'pending',
    };

    const { error: participantError } = await supabase
      .from('loop_participants')
      .insert(participantInsert);

    if (participantError) {
      console.error('Döngü katılımcısı eklenemedi:', participantError);
      // Kurucusu olmayan bir döngü satırı yetim kalır ve listede sonsuza
      // kadar "0 katılımcı" olarak görünürdü; geri alınıyor.
      await supabase.from('loops').delete().eq('id', loopRow.id);
      return undefined;
    }

    return this.getLoopById(loopRow.id);
  },

  /**
   * Bir kullanıcıyı, seçtiği ilanla birlikte var olan bir döngüye katar.
   * Döngü dolarsa (katılımcı sayısı max_participants'a ulaşırsa) durumu
   * otomatik olarak 'locked'e çevirir.
   */
  async joinLoop(loopId: string, userId: string, listingId: string): Promise<Loop | undefined> {
    if (!(await assertOwnActiveListing(userId, listingId))) return undefined;

    // Katılmadan önce döngünün gerçekten katılıma açık ve dolu olmadığı
    // kontrol ediliyor. Eskiden hiçbir kontrol yoktu: kilitlenmiş, tamamlanmış
    // ya da iptal edilmiş bir döngüye de katılınabiliyor, kapasitesi dolu bir
    // döngü sınırsız büyüyebiliyordu (max_participants yalnızca katıldıktan
    // SONRA, kilitleme kararı için okunuyordu).
    const { data: loopRow, error: loopError } = await supabase
      .from('loops')
      .select('status, max_participants')
      .eq('id', loopId)
      .maybeSingle();

    if (loopError || !loopRow) {
      console.error('Döngü bulunamadı:', loopError);
      return undefined;
    }

    if (loopRow.status !== 'matching') {
      console.error('Bu döngü artık katılıma açık değil:', loopRow.status);
      return undefined;
    }

    const { count: currentCount } = await supabase
      .from('loop_participants')
      .select('id', { count: 'exact', head: true })
      .eq('loop_id', loopId);

    if (loopRow.max_participants && (currentCount ?? 0) >= loopRow.max_participants) {
      console.error('Bu döngü dolu.');
      return undefined;
    }

    const participantInsert: TablesInsert<'loop_participants'> = {
      loop_id: loopId,
      user_id: userId,
      offering_listing_id: listingId,
      role: 'member',
      status: 'pending',
    };

    const { error: insertError } = await supabase
      .from('loop_participants')
      .insert(participantInsert);

    if (insertError) {
      console.error('Döngüye katılınamadı:', insertError);
      return undefined;
    }

    const { count } = await supabase
      .from('loop_participants')
      .select('id', { count: 'exact', head: true })
      .eq('loop_id', loopId);

    if (loopRow.max_participants && (count ?? 0) >= loopRow.max_participants) {
      const lockUpdate: TablesUpdate<'loops'> = { status: 'locked' };
      await supabase.from('loops').update(lockUpdate).eq('id', loopId);
    }

    return this.getLoopById(loopId);
  },

  async confirmParticipantStep(loopId: string, userId: string): Promise<Loop | undefined> {
    const participantUpdate: TablesUpdate<'loop_participants'> = { status: 'confirmed' };

    const { error: updateError } = await supabase
      .from('loop_participants')
      .update(participantUpdate)
      .eq('loop_id', loopId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Döngü adımı onaylanamadı:', updateError);
      return undefined;
    }

    const { data: participantRows, error: fetchError } = await supabase
      .from('loop_participants')
      .select('status')
      .eq('loop_id', loopId);

    if (fetchError) {
      console.error('Döngü katılımcıları getirilemedi:', fetchError);
    } else {
      const allConfirmed = (participantRows ?? []).every((p) =>
        ['confirmed', 'delivered', 'completed'].includes(p.status)
      );

      if (allConfirmed) {
        const loopUpdate: TablesUpdate<'loops'> = { status: 'in_delivery' };
        await supabase.from('loops').update(loopUpdate).eq('id', loopId);
      }
    }

    return this.getLoopById(loopId);
  },

  async completeLoop(loopId: string): Promise<Loop | undefined> {
    const loopUpdate: TablesUpdate<'loops'> = { status: 'completed' };
    const { error: loopError } = await supabase.from('loops').update(loopUpdate).eq('id', loopId);

    if (loopError) {
      console.error('Döngü tamamlanamadı:', loopError);
      return undefined;
    }

    const participantUpdate: TablesUpdate<'loop_participants'> = { status: 'completed' };
    await supabase.from('loop_participants').update(participantUpdate).eq('loop_id', loopId);

    return this.getLoopById(loopId);
  },
};
