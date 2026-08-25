import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// ENGELLEME (rapor md. 106)
//
// Şikayet altyapısı (`reports`) vardı ama engelleme hiç yoktu. Engelleme
// sadece arayüz filtresi değildir: DB tarafında da engellenen kişi mesaj
// gönderemez, teklif veremez ve karşılıklı bildirim üretilmez
// (bkz. migration 20260820200000).
//
// Gizlilik kararı: kimin kimi engellediği yalnızca engelleyen tarafından
// görülebilir (RLS). Karşı taraf engellendiğini bir ekranda görmez —
// aksi hâlde engelleme, taciz için yeni bir sinyale dönüşür.
// ─────────────────────────────────────────────────────────────────────────

// Engel listesi neredeyse hiç değişmez ama keşif akışında her sorguda
// gerekiyor; oturum içi basit bir önbellek tutuluyor. block/unblock
// çağrıları önbelleği düşürür.
let cache: { userId: string; ids: string[] } | null = null;

export const blockService = {
  invalidateCache(): void {
    cache = null;
  },

  /**
   * Oturumdaki kullanıcının engellediği id'ler (önbellekli). Kimse giriş
   * yapmamışsa boş dizi döner — keşif akışı misafir kullanıcıda da çalışır.
   */
  async getBlockedIdsForCurrentUser(): Promise<string[]> {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;

    if (!userId) return [];
    if (cache && cache.userId === userId) return cache.ids;

    const ids = await this.getBlockedUserIds(userId);
    cache = { userId, ids };

    return ids;
  },

  /** Mevcut kullanıcının engellediği kullanıcı id'leri. */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    if (!userId || userId.length < 30) return [];

    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId);

    if (error) {
      console.error('Engel listesi alınamadı:', error);
      return [];
    }

    return (data ?? []).map((row) => row.blocked_id);
  },

  async isBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', userId)
      .eq('blocked_id', targetUserId)
      .maybeSingle();

    if (error) {
      console.error('Engel durumu okunamadı:', error);
      return false;
    }

    return !!data;
  },

  async blockUser(userId: string, targetUserId: string, reason?: string): Promise<boolean> {
    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: userId,
      blocked_id: targetUserId,
      reason: reason ?? null,
    });

    if (error) {
      console.error('Kullanıcı engellenemedi:', error);
      return false;
    }

    cache = null;

    return true;
  },

  async unblockUser(userId: string, targetUserId: string): Promise<boolean> {
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', targetUserId);

    if (error) {
      console.error('Engel kaldırılamadı:', error);
      return false;
    }

    cache = null;

    return true;
  },
};
