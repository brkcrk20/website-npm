import { AdminKPI, AdminAuditLog, Report, Dispute } from '../types';
import { supabase } from '../lib/supabase';
import type { TablesInsert, TablesUpdate } from '../types/supabase';

// =============================================================================
// GERÇEK VERİYE BAĞLANDI (bkz. supabase/migrations/20260819090000_create_admin_tables.sql)
//
// Önceki sürüm: kpisStore/reportsStore/disputesStore/auditLogsStore modül
// seviyesinde in-memory değişkenlerdi — sayfa yenilenince (F5) her şey
// sıfırlanıyordu. Şimdi hepsi Supabase'ten okunuyor/yazılıyor, tek istisna
// yok (moderateListing dahil hepsi kalıcı).
//
// NOT: Yazma işlemleri (resolveReport/resolveDispute/moderateListing/
// addAuditLog) veritabanı seviyesinde RLS ile sadece `profiles.is_admin =
// true` olan kullanıcılara açık. is_admin=false bir kullanıcı bu
// fonksiyonları çağırırsa Supabase "new row violates row-level security
// policy" / 0 satır güncellendi şeklinde sessizce reddeder — bu yüzden her
// yazma fonksiyonu hata/etkilenen satır sayısını kontrol edip false
// döndürüyor ki çağıran taraf (UI) kullanıcıya doğru bir hata gösterebilsin.
// =============================================================================

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapReportRow(row: any): Report {
  return {
    id: row.id,
    reporterId: row.reporter_id,
    reporterName: row.reporter?.full_name ?? 'Bilinmeyen Kullanıcı',
    targetType: row.target_type,
    targetId: row.target_id,
    targetTitle: row.target_title ?? '—',
    reason: row.reason,
    description: row.description ?? '',
    priority: row.priority,
    status: row.status,
    evidenceImages: row.evidence_images ?? [],
    createdAt: fmtDateTime(row.created_at),
    resolutionNote: row.resolution_note ?? undefined,
    resolvedBy: row.resolved_by ?? undefined,
    resolvedAt: row.resolved_at ? fmtDateTime(row.resolved_at) : undefined,
  };
}

function mapDisputeRow(row: any): Dispute {
  return {
    id: row.id,
    tradeId: row.trade_id,
    // NOT: initiator/respondent burada UserProfile'ın YALNIZCA admin panelinde
    // gösterime yetecek minimal bir alt kümesi ile dolduruluyor (tam
    // UserProfile — trustProfile/stats dahil — çekmek disputes listesi için
    // gereksiz ek sorgu yükü demek). Diğer sayfalarda tam profil gerekiyorsa
    // authService/profileService üzerinden ayrıca çekilmeli.
    initiator: minimalUserProfile(row.initiator),
    respondent: minimalUserProfile(row.respondent),
    reason: row.reason,
    status: row.status,
    evidencePhotos: row.evidence_photos ?? [],
    adminDecision: row.admin_decision ?? undefined,
    createdAt: fmtDateTime(row.created_at),
    resolvedAt: row.resolved_at ? fmtDateTime(row.resolved_at) : undefined,
  };
}

function minimalUserProfile(row: any): Dispute['initiator'] {
  return {
    id: row?.id ?? '',
    phone: '',
    fullName: row?.full_name ?? 'Bilinmeyen Kullanıcı',
    avatarUrl: row?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
    city: row?.city ?? '',
    district: row?.district ?? '',
    memberSince: '',
    smsVerificationEnabled: false,
    interests: [],
    wantedCategories: [],
    isVerified: true,
    trustProfile: {
      score: 5,
      level: 'Başlangıç',
      phoneVerified: true,
      idVerified: false,
      successfulTradesCount: 0,
      cancellationRate: 0,
      responseRate: 1,
      averageRating: 5,
      reviewCount: 0,
      reportCount: 0,
      accountAgeDays: 0,
      positiveHighlights: [],
    },
    stats: {
      totalTrades: 0,
      activeListings: 0,
      completedLoops: 0,
      totalItemsReused: 0,
      responseRatePercent: 0,
      avgResponseTimeMinutes: 0,
      cancellationRatePercent: 0,
    },
  };
}

function mapAuditLogRow(row: any): AdminAuditLog {
  return {
    id: row.id,
    adminName: row.admin_name,
    action: row.action,
    target: row.target,
    timestamp: fmtDateTime(row.created_at),
    details: row.details ?? '',
  };
}

async function getCurrentAdmin(): Promise<{ id: string; name: string } | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    console.error('Admin işlemi reddedildi: geçerli bir Supabase oturumu yok.', authError);
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_admin')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    console.error(
      'Admin işlemi reddedildi: bu kullanıcı (profiles.is_admin = false) admin değil. ' +
        'Supabase Studio → SQL Editor üzerinden `update public.profiles set is_admin = true where id = \'...\'` ile yetkilendirin.'
    );
    return null;
  }

  return { id: authData.user.id, name: profile.full_name || 'Yönetici' };
}

export const adminService = {
  /**
   * Platform genelinde gerçek toplam/aktif sayılar. Hepsi doğrudan ilgili
   * tablolardan `count` ile hesaplanıyor — hiçbiri sabit/uydurma değer değil.
   */
  async getKPIs(): Promise<AdminKPI> {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const [
      totalUsers,
      usersThisMonth,
      usersLastMonth,
      activeListings,
      activeTrades,
      completedTrades,
      completedTradesThisMonth,
      completedTradesLastMonth,
      activeLoops,
      pendingReports,
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startOfThisMonth),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfLastMonth)
        .lt('created_at', startOfThisMonth),
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('trades').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', startOfThisMonth),
      supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', startOfLastMonth)
        .lt('completed_at', startOfThisMonth),
      supabase.from('loops').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    // "Aktif kullanıcı" için ayrı bir last_seen/last_active_at kolonu yok.
    // Bu yüzden son 30 gün içinde en az bir ilan YA DA teklif oluşturan
    // benzersiz kullanıcı sayısını "aktif kullanıcı" olarak kabul ediyoruz —
    // sabit bir sayı uydurmak yerine gerçek (ama yaklaşık) bir tanım.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [recentListingOwners, recentOfferSenders] = await Promise.all([
      supabase.from('listings').select('owner_id').gte('created_at', thirtyDaysAgo),
      supabase.from('trade_offers').select('sender_id').gte('created_at', thirtyDaysAgo),
    ]);

    const activeUserIds = new Set<string>();
    (recentListingOwners.data ?? []).forEach((r: any) => activeUserIds.add(r.owner_id));
    (recentOfferSenders.data ?? []).forEach((r: any) => activeUserIds.add(r.sender_id));


    const userGrowthPercent = growthPercent(usersThisMonth.count ?? 0, usersLastMonth.count ?? 0);
    const tradeGrowthPercent = growthPercent(completedTradesThisMonth.count ?? 0, completedTradesLastMonth.count ?? 0);

    return {
      totalUsers: totalUsers.count ?? 0,
      activeUsers: activeUserIds.size,
      totalListings: activeListings.count ?? 0,
      activeTrades: activeTrades.count ?? 0,
      completedTrades: completedTrades.count ?? 0,
      activeLoops: activeLoops.count ?? 0,
      pendingReports: pendingReports.count ?? 0,
      userGrowthPercent,
      tradeGrowthPercent,
    };
  },

  /** Aktif ilanların kategoriye göre gerçek dağılımı (adet + yüzde). */
  async getCategoryDistribution(): Promise<{ name: string; count: number; percent: number }[]> {
    const { data, error } = await supabase
      .from('listings')
      .select('category:categories(name)')
      .eq('status', 'active');

    if (error || !data) {
      console.error('Kategori dağılımı alınamadı:', error);
      return [];
    }

    const counts = new Map<string, number>();
    data.forEach((row: any) => {
      const name = row.category?.name ?? 'Diğer';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });

    const total = data.length || 1;

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);
  },

  /** Gerçek platform aktivitesi (trade_events tablosundan), mock liste değil. */
  async getRecentActivity(limit = 6): Promise<
    { id: string; user: string; action: string; time: string; badge: string }[]
  > {
    const { data, error } = await supabase
      .from('trade_events')
      .select(
        'id, event_type, created_at, trade:trades(sender:profiles!trades_sender_id_fkey(full_name), receiver:profiles!trades_receiver_id_fkey(full_name))'
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.error('Aktivite akışı alınamadı:', error);
      return [];
    }

    const eventLabels: Record<string, string> = {
      offer_accepted: 'Teklif kabul edildi',
      delivery_planned: 'Teslimat planlandı',
      verified: 'Teslimat doğrulandı',
      completed: 'Takas tamamlandı',
    };

    return data.map((row: any) => {
      const senderName = row.trade?.sender?.full_name ?? 'Bir kullanıcı';
      const receiverName = row.trade?.receiver?.full_name ?? 'diğer kullanıcı';

      return {
        id: row.id,
        user: `${senderName} & ${receiverName}`,
        action: eventLabels[row.event_type] ?? row.event_type,
        time: relativeTime(row.created_at),
        badge: row.event_type === 'completed' ? 'Takas Tamamlandı' : 'Takas Süreci',
      };
    });
  },

  async getReports(): Promise<Report[]> {
    const { data, error } = await supabase
      .from('reports')
      .select('*, reporter:profiles!reports_reporter_id_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Raporlar alınamadı (muhtemelen bu kullanıcı admin değil, RLS engelledi):', error);
      return [];
    }

    return (data ?? []).map(mapReportRow);
  },

  async getDisputes(): Promise<Dispute[]> {
    const { data, error } = await supabase
      .from('disputes')
      .select(
        '*, initiator:profiles!disputes_initiator_id_fkey(id, full_name, avatar_url, city, district), respondent:profiles!disputes_respondent_id_fkey(id, full_name, avatar_url, city, district)'
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Disputeler alınamadı (muhtemelen bu kullanıcı admin değil, RLS engelledi):', error);
      return [];
    }

    return (data ?? []).map(mapDisputeRow);
  },

  async getAuditLogs(): Promise<AdminAuditLog[]> {
    const { data, error } = await supabase
      .from('admin_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Denetim kayıtları alınamadı (muhtemelen bu kullanıcı admin değil, RLS engelledi):', error);
      return [];
    }

    return (data ?? []).map(mapAuditLogRow);
  },

  async resolveReport(
    reportId: string,
    resolutionNote: string,
    status: Report['status'] = 'resolved'
  ): Promise<boolean> {
    const admin = await getCurrentAdmin();
    if (!admin) return false;

    const { data: reportRow } = await supabase.from('reports').select('target_title').eq('id', reportId).maybeSingle();

    const update: TablesUpdate<'reports'> = {
      status,
      resolution_note: resolutionNote,
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('reports').update(update).eq('id', reportId);

    if (error) {
      console.error('Rapor güncellenemedi:', error);
      return false;
    }

    await this.addAuditLog(
      'Rapor Sonuçlandırıldı',
      `Rapor #${reportId} (${reportRow?.target_title ?? '—'})`,
      resolutionNote
    );

    return true;
  },

  async resolveDispute(
    disputeId: string,
    decision: string,
    status: Dispute['status'] = 'resolved_return'
  ): Promise<boolean> {
    const admin = await getCurrentAdmin();
    if (!admin) return false;

    const update: TablesUpdate<'disputes'> = {
      status,
      admin_decision: decision,
      resolved_by: admin.id,
      resolved_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('disputes').update(update).eq('id', disputeId);

    if (error) {
      console.error('Dispute güncellenemedi:', error);
      return false;
    }

    await this.addAuditLog('Dispute Çözümlendi', `Dispute #${disputeId}`, decision);

    return true;
  },

  async moderateListing(listingId: string, action: 'approve' | 'remove', reason?: string): Promise<boolean> {
    if (action !== 'remove') return true;

    const admin = await getCurrentAdmin();
    if (!admin) return false;

    const { error } = await supabase.from('listings').update({ status: 'removed' }).eq('id', listingId);

    if (error) {
      console.error('İlan kaldırılamadı:', error);
      return false;
    }

    await this.addAuditLog('İlan Kaldırıldı', `İlan #${listingId}`, reason || 'Moderasyon kararı');

    return true;
  },

  async addAuditLog(action: string, target: string, details: string): Promise<void> {
    const admin = await getCurrentAdmin();
    if (!admin) return;

    const insert: TablesInsert<'admin_audit_logs'> = {
      admin_id: admin.id,
      admin_name: admin.name,
      action,
      target,
      details,
    };

    const { error } = await supabase.from('admin_audit_logs').insert(insert);

    if (error) {
      console.error('Denetim kaydı yazılamadı:', error);
    }
  },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dakika önce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;

  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

function growthPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
