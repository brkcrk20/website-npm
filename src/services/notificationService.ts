import { NotificationItem, NotificationType } from '../types';
import { supabase } from '../lib/supabase';
import { reportServiceError } from '../lib/serviceError';

// ─────────────────────────────────────────────────────────────────────────
// BİLDİRİM SERVİSİ (rapor md. 44-45)
//
// Bildirimler bugüne kadar `INITIAL_NOTIFICATIONS` adlı sabit bir mock
// listeydi; gerçek olaylardan hiç tetiklenmiyordu (bkz. rapor.txt §2).
// Artık `public.notifications` tablosunu okuyoruz; satırları DB trigger'ları
// üretiyor (migration 20260820100000):
//   yeni teklif · karşı teklif · kabul/ret/süre doldu · takas durumu ·
//   yeni mesaj · "aradığın bir ürün eklendi"
//
// Bildirim ÜRETİMİ bilinçli olarak istemcide değil DB'de: teklif hangi
// ekrandan gönderilirse gönderilsin bildirim garanti oluşur ve kullanıcı
// başkasına sahte bildirim yazamaz (notifications tablosunda INSERT
// politikası yok).
// ─────────────────────────────────────────────────────────────────────────

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;

  return new Date(iso).toLocaleDateString('tr-TR');
}

export function mapNotification(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    linkUrl: row.link_url ?? '',
    isRead: row.is_read,
    createdAt: formatRelativeTime(row.created_at),
  };
}

export const notificationService = {
  async getUserNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
    if (!userId || userId.length < 30) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      reportServiceError('Bildirimler alınamadı:', error);
      return [];
    }

    return (data as unknown as NotificationRow[]).map(mapNotification);
  },

  async markAsRead(notificationId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) {
      reportServiceError('Bildirim okundu işaretlenemedi:', error);
      return false;
    }

    return true;
  },

  async markAllAsRead(userId: string): Promise<boolean> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      reportServiceError('Bildirimler okundu işaretlenemedi:', error);
      return false;
    }

    return true;
  },
};
