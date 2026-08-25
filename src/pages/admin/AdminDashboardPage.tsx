import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { adminService } from '../../services/adminService';
import { AdminKPI, AdminAuditLog, Report, Dispute } from '../../types';
import {
  Users,
  Repeat,
  ShieldAlert,
  BarChart3,
  Layers,
  MessageSquare,
  FileText,
  Calendar,
  Sparkles,
  Settings,
  Bell,
  CheckCircle,
  XCircle,
  Eye,
  ArrowLeft,
  ShieldCheck,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Package,
  Loader2,
  ScrollText,
} from 'lucide-react';

type Activity = { id: string; user: string; action: string; time: string; badge: string };
type CategorySlice = { name: string; count: number; percent: number };

const reasonLabels: Record<Report['reason'], string> = {
  fraud: 'Dolandırıcılık',
  inappropriate: 'Uygunsuz İçerik',
  no_response: 'Yanıt Alınamıyor',
  broken_item: 'Bozuk/Hasarlı Ürün',
  fake_account: 'Sahte Hesap',
  other: 'Diğer',
};

const priorityStyles: Record<Report['priority'], string> = {
  low: 'bg-slate-800 text-slate-300 border-slate-700',
  normal: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
  high: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  critical: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
};

const categoryBarColors = [
  'bg-emerald-500',
  'bg-teal-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-rose-400',
  'bg-stone-500',
  'bg-violet-500',
];

export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [activeSidebarItem, setActiveSidebarItem] = useState<string>('overview');

  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<AdminKPI | null>(null);
  const [categoryDistribution, setCategoryDistribution] = useState<CategorySlice[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const isAdmin = !!currentUser?.isAdmin;

  const sidebarMenuItems = [
    { id: 'overview', label: 'Genel Bakış', icon: BarChart3 },
    { id: 'reports', label: 'Raporlar', icon: ShieldAlert, badge: kpis?.pendingReports ?? undefined },
    { id: 'disputes', label: 'Anlaşmazlıklar', icon: ShieldCheck, badge: disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length || undefined },
    { id: 'audit', label: 'Denetim Kaydı', icon: ScrollText },
    { id: 'users', label: 'Kullanıcılar', icon: Users },
    { id: 'listings', label: 'İlanlar', icon: Package },
    { id: 'trades', label: 'Takaslar', icon: Repeat },
    { id: 'loops', label: "Loop'lar", icon: Layers },
    { id: 'messages', label: 'Mesajlar', icon: MessageSquare },
    { id: 'events', label: 'Etkinlikler', icon: Calendar },
    { id: 'community', label: 'Topluluk', icon: Users },
    { id: 'content', label: 'İçerikler', icon: FileText },
    { id: 'notifications', label: 'Bildirimler', icon: Bell },
    { id: 'settings', label: 'Ayarlar', icon: Settings },
  ];

  async function loadDashboard() {
    setLoading(true);
    const [kpiData, catData, activityData, reportData, disputeData, auditData] = await Promise.all([
      adminService.getKPIs(),
      adminService.getCategoryDistribution(),
      adminService.getRecentActivity(6),
      adminService.getReports(),
      adminService.getDisputes(),
      adminService.getAuditLogs(),
    ]);

    setKpis(kpiData);
    setCategoryDistribution(catData);
    setRecentActivities(activityData);
    setReports(reportData);
    setDisputes(disputeData);
    setAuditLogs(auditData);
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) {
      loadDashboard();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleResolveReport(report: Report, status: Report['status']) {
    const note = noteDrafts[report.id]?.trim() || (status === 'dismissed' ? 'Rapor asılsız bulundu.' : 'İnceleme sonucunda gerekli işlem yapıldı.');
    setBusyId(report.id);
    const ok = await adminService.resolveReport(report.id, note, status);
    setBusyId(null);

    if (ok) {
      showToast('Rapor Güncellendi', `#${report.id.slice(0, 8)} kalıcı olarak işaretlendi.`, 'success');
      loadDashboard();
    } else {
      showToast('İşlem Başarısız', 'Rapor güncellenemedi. Admin yetkiniz olmayabilir.', 'error');
    }
  }

  async function handleResolveDispute(dispute: Dispute, status: Dispute['status']) {
    const decision = noteDrafts[dispute.id]?.trim() || 'Yönetici kararıyla sonuçlandırıldı.';
    setBusyId(dispute.id);
    const ok = await adminService.resolveDispute(dispute.id, decision, status);
    setBusyId(null);

    if (ok) {
      showToast('Anlaşmazlık Sonuçlandırıldı', `#${dispute.id.slice(0, 8)} kalıcı olarak kapatıldı.`, 'success');
      loadDashboard();
    } else {
      showToast('İşlem Başarısız', 'Dispute güncellenemedi. Admin yetkiniz olmayabilir.', 'error');
    }
  }

  // ── Admin olmayan bir kullanıcı /admin'e URL ile doğrudan gelirse ────────
  // (rapor.txt §3: route koruması hiç yoktu). Veri hiç çekilmiyor (RLS zaten
  // engelleyecekti) ve kullanıcı net bir "yetkin yok" ekranı görüyor.
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4 p-8 rounded-3xl bg-[#1e293b]/90 border border-slate-700/70">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-black text-white">Yönetici Yetkiniz Yok</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Bu sayfa yalnızca <code className="text-slate-300">profiles.is_admin = true</code> olan
            hesaplarla görüntülenebilir. Bu bir hesap yetkisiyse Supabase Studio üzerinden
            ayarlanmalıdır.
          </p>
          <button
            type="button"
            onClick={() => navigate('/kesfet')}
            className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </div>
    );
  }

  const kpiCards = kpis
    ? [
        { id: 'total_users', title: 'Toplam Kullanıcı', value: kpis.totalUsers.toLocaleString('tr-TR'), change: kpis.userGrowthPercent, icon: Users },
        { id: 'active_users', title: 'Aktif Kullanıcı (30g)', value: kpis.activeUsers.toLocaleString('tr-TR'), change: null, icon: Activity },
        { id: 'completed_trades', title: 'Tamamlanan Takas', value: kpis.completedTrades.toLocaleString('tr-TR'), change: kpis.tradeGrowthPercent, icon: Repeat },
        { id: 'active_loops', title: 'Aktif Loop', value: kpis.activeLoops.toLocaleString('tr-TR'), change: null, icon: Layers },
        { id: 'pending_reports', title: 'Bekleyen Rapor', value: kpis.pendingReports.toLocaleString('tr-TR'), change: null, icon: ShieldAlert },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col md:flex-row pb-24 md:pb-0">
      <aside className="w-full md:w-64 bg-[#0b1120] border-r border-slate-800/80 flex flex-col shrink-0">
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50 animate-pulse" />
              <span className="text-base font-black text-white tracking-wider uppercase font-display">
                Swaloop
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest block mt-0.5">
              Admin & Moderasyon
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/kesfet')}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs flex items-center gap-1 transition-colors"
            title="Kullanıcı Görünümüne Dön"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
          {sidebarMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSidebarItem === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSidebarItem(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-700/30 text-emerald-300 border border-emerald-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {!!item.badge && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => navigate('/kesfet')}
            className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Kullanıcı Moduna Geç</span>
            <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div>
            <h1 className="text-xl font-black text-white font-display">Yönetim & Canlı Metrikler</h1>
            <p className="text-xs text-slate-400">Canlı platform takas trafiği ve güvenlik denetimi</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-emerald-400" />}
              {loading ? 'Yükleniyor…' : 'Canlı Veri (Supabase)'}
            </span>
          </div>
        </div>

        {activeSidebarItem === 'overview' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {loading && !kpis
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-[#1e293b]/80 border border-slate-700/70 h-24 animate-pulse" />
                  ))
                : kpiCards.map((kpi) => {
                    const Icon = kpi.icon;
                    const isPositive = kpi.change === null ? null : kpi.change >= 0;
                    return (
                      <div
                        key={kpi.id}
                        className="p-4 rounded-2xl bg-[#1e293b]/80 border border-slate-700/70 shadow-xs space-y-2 hover:border-emerald-500/50 transition-colors"
                      >
                        <div className="flex items-center justify-between text-slate-400 text-xs">
                          <span className="truncate text-[11px] font-medium">{kpi.title}</span>
                          <Icon className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="text-xl font-black text-white tracking-tight">{kpi.value}</div>
                        {isPositive !== null && (
                          <div className="flex items-center gap-1 text-[11px] font-bold">
                            {isPositive ? (
                              <span className="text-emerald-400 flex items-center gap-0.5">
                                <ArrowUpRight className="w-3 h-3" />
                                {kpi.change}%
                              </span>
                            ) : (
                              <span className="text-rose-400 flex items-center gap-0.5">
                                <ArrowDownRight className="w-3 h-3" />
                                {kpi.change}%
                              </span>
                            )}
                            <span className="text-slate-400 text-[10px] font-normal">geçen aya göre</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 p-5 rounded-3xl bg-[#1e293b]/90 border border-slate-700/70 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Canlı Platform Hareketleri</span>
                  </h3>
                  <span className="text-[11px] text-emerald-400 font-bold">trade_events</span>
                </div>

                {recentActivities.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    {loading ? 'Yükleniyor…' : 'Henüz kayıtlı bir takas olayı yok.'}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {recentActivities.map((act) => (
                      <div key={act.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs font-bold text-slate-200 block">{act.user}</span>
                          <span className="text-xs text-slate-400">{act.action}</span>
                          <span className="text-[10px] text-slate-500 block mt-0.5">{act.time}</span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 text-emerald-300 text-[10px] font-bold border border-emerald-800/80 whitespace-nowrap">
                          {act.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-3xl bg-[#1e293b]/90 border border-slate-700/70 space-y-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Kategorilere Göre İlanlar</h3>
                  <span className="text-xs text-slate-400">Aktif ilan dağılımı (gerçek zamanlı)</span>
                </div>

                {categoryDistribution.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    {loading ? 'Yükleniyor…' : 'Aktif ilan bulunmuyor.'}
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {categoryDistribution.map((cat, i) => (
                      <div key={cat.name} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300">{cat.name}</span>
                          <span className="text-emerald-400 font-bold">%{cat.percent}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${categoryBarColors[i % categoryBarColors.length]} rounded-full`}
                            style={{ width: `${cat.percent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-700/60">
                  Toplam {kpis?.totalListings.toLocaleString('tr-TR') ?? '—'} aktif takas ilanı analiz edildi
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-200 leading-relaxed flex items-center gap-2">
              <TrendingUp className="w-4 h-4 shrink-0" />
              Bu panel artık sayfa yenilendiğinde sıfırlanmıyor — tüm veriler Supabase'ten canlı okunuyor.
            </div>
          </>
        )}

        {activeSidebarItem === 'reports' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Raporlar ({reports.length})
            </h2>
            {reports.length === 0 ? (
              <EmptyState loading={loading} text="Henüz kimse bir şey raporlamadı." />
            ) : (
              reports.map((report) => (
                <div key={report.id} className="p-4 rounded-2xl bg-[#1e293b]/90 border border-slate-700/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-white">{report.targetTitle}</span>
                      <span className="text-[11px] text-slate-400 block">
                        {report.reporterName} tarafından bildirildi · {report.createdAt}
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${priorityStyles[report.priority]}`}>
                      {reasonLabels[report.reason]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{report.description || 'Açıklama girilmemiş.'}</p>

                  {report.status === 'resolved' || report.status === 'dismissed' ? (
                    <div className="text-[11px] text-slate-400 bg-slate-800/60 rounded-lg p-2.5">
                      <strong className="text-slate-300">Sonuç ({report.status === 'resolved' ? 'Çözüldü' : 'Reddedildi'}):</strong>{' '}
                      {report.resolutionNote}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Çözüm notu (opsiyonel)"
                        value={noteDrafts[report.id] ?? ''}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [report.id]: e.target.value }))}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() => handleResolveReport(report, 'resolved')}
                        className="px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Çözüldü
                      </button>
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() => handleResolveReport(report, 'dismissed')}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reddet
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeSidebarItem === 'disputes' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-400" /> Anlaşmazlıklar ({disputes.length})
            </h2>
            {disputes.length === 0 ? (
              <EmptyState loading={loading} text="Açık bir anlaşmazlık yok." />
            ) : (
              disputes.map((dispute) => (
                <div key={dispute.id} className="p-4 rounded-2xl bg-[#1e293b]/90 border border-slate-700/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {dispute.initiator.fullName} ⇄ {dispute.respondent.fullName}
                    </span>
                    <span className="text-[10px] text-slate-400">{dispute.createdAt}</span>
                  </div>
                  <p className="text-xs text-slate-300">{dispute.reason}</p>

                  {dispute.status.startsWith('resolved') || dispute.status === 'dismissed' ? (
                    <div className="text-[11px] text-slate-400 bg-slate-800/60 rounded-lg p-2.5">
                      <strong className="text-slate-300">Karar:</strong> {dispute.adminDecision}
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Yönetici kararı"
                        value={noteDrafts[dispute.id] ?? ''}
                        onChange={(e) => setNoteDrafts((d) => ({ ...d, [dispute.id]: e.target.value }))}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        disabled={busyId === dispute.id}
                        onClick={() => handleResolveDispute(dispute, 'resolved_return')}
                        className="px-3 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                      >
                        İade Kararı
                      </button>
                      <button
                        type="button"
                        disabled={busyId === dispute.id}
                        onClick={() => handleResolveDispute(dispute, 'resolved_cancel')}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-50"
                      >
                        Takası İptal Et
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeSidebarItem === 'audit' && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-slate-300" /> Denetim Kaydı ({auditLogs.length})
            </h2>
            {auditLogs.length === 0 ? (
              <EmptyState loading={loading} text="Henüz hiçbir admin işlemi yapılmadı." />
            ) : (
              <div className="rounded-2xl border border-slate-700/70 overflow-hidden">
                <div className="divide-y divide-slate-800">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3.5 bg-[#1e293b]/90 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div>
                        <span className="text-xs font-bold text-slate-200">{log.action}</span>
                        <span className="text-[11px] text-slate-400 block">{log.target}</span>
                        <span className="text-[11px] text-slate-500 block">{log.details}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">{log.adminName}</span>
                        <span className="text-[10px] text-slate-500 block">{log.timestamp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!['overview', 'reports', 'disputes', 'audit'].includes(activeSidebarItem) && (
          <div className="p-8 rounded-3xl bg-[#1e293b]/60 border border-dashed border-slate-700 text-center space-y-2">
            <Eye className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs text-slate-400">
              Bu bölüm henüz gerçek veriye bağlanmadı — kapsam, bu değişiklikte özellikle
              KPI/Raporlar/Anlaşmazlıklar/Denetim Kaydı ile sınırlı tutuldu.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

function EmptyState({ loading, text }: { loading: boolean; text: string }) {
  return (
    <div className="p-8 rounded-2xl bg-[#1e293b]/60 border border-dashed border-slate-700 text-center">
      {loading ? (
        <Loader2 className="w-5 h-5 text-slate-500 mx-auto animate-spin" />
      ) : (
        <p className="text-xs text-slate-500">{text}</p>
      )}
    </div>
  );
}
