import { supabase } from '../lib/supabase';
import { NotificationItem } from '../types';

/**
 * Bildirimler.
 *
 * Önceden bu liste `mockData.INITIAL_NOTIFICATIONS` içindeki üç sabit
 * satırdı — kullanıcının gerçek durumuyla hiçbir ilgisi yoktu. Artık
 * bildirimler her açılışta canlı veriden türetiliyor:
 *
 *   • sana gelen ve hâlâ yanıtlanmamış takas teklifleri,
 *   • senin gönderdiğin tekliflerin kabul/red edilmesi,
 *   • okunmamış mesajlar.
 *
 * DB'de ayrı bir `notifications` tablosu yok; "okundu" bilgisi cihazda
 * (localStorage) tutuluyor. Bu bilinçli bir tercih: bildirim satırlarını
 * kalıcı olarak saklamak, üretilebilir bir veriyi ikinci kez yazmak
 * anlamına gelirdi ve tekliflerle senkron kalması gerekirdi.
 */

const READ_STORAGE_KEY = 'swaloop_read_notifications';

function readIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function persistReadIds(ids: Set<string>) {
  try {
    // Liste sonsuza kadar büyümesin: en son 200 kayıt yeter.
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Depolama kapalıysa bildirimler sadece okunmamış görünür; kritik değil.
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;

  return new Date(iso).toLocaleDateString('tr-TR');
}

export const notificationService = {
  markAsRead(id: string) {
    const ids = readIds();
    ids.add(id);
    persistReadIds(ids);
  },

  markAllAsRead(items: NotificationItem[]) {
    const ids = readIds();
    items.forEach((item) => ids.add(item.id));
    persistReadIds(ids);
  },

  async getNotifications(userId: string): Promise<NotificationItem[]> {
    if (!userId) return [];

    const [incomingResult, outgoingResult, conversationsResult] = await Promise.all([
      supabase
        .from('trade_offers')
        .select('id, created_at, status, sender:profiles!trade_offers_sender_id_fkey(full_name, avatar_url)')
        .eq('receiver_id', userId)
        .in('status', ['offer_sent', 'counter_offered'])
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('trade_offers')
        .select('id, updated_at, status, receiver:profiles!trade_offers_receiver_id_fkey(full_name, avatar_url)')
        .eq('sender_id', userId)
        .in('status', ['accepted', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('conversations')
        .select('id')
        .or(`participant_one_id.eq.${userId},participant_two_id.eq.${userId}`),
    ]);

    const items: NotificationItem[] = [];

    for (const row of (incomingResult.data ?? []) as any[]) {
      items.push({
        id: `offer-in-${row.id}`,
        userId,
        type: 'trade_offer',
        title: 'Yeni takas teklifi',
        message: `${row.sender?.full_name ?? 'Bir kullanıcı'} sana takas teklifi gönderdi.`,
        linkUrl: `/teklif/${row.id}`,
        isRead: false,
        createdAt: row.created_at,
        thumbnail: row.sender?.avatar_url ?? undefined,
      });
    }

    for (const row of (outgoingResult.data ?? []) as any[]) {
      const accepted = row.status === 'accepted';
      items.push({
        id: `offer-out-${row.id}-${row.status}`,
        userId,
        type: 'trade_status',
        title: accepted ? 'Teklifin kabul edildi 🎉' : 'Teklifin reddedildi',
        message: accepted
          ? `${row.receiver?.full_name ?? 'Karşı taraf'} teklifini kabul etti. Teslimatı planlayabilirsin.`
          : `${row.receiver?.full_name ?? 'Karşı taraf'} teklifini reddetti. Başka bir teklif deneyebilirsin.`,
        linkUrl: `/teklif/${row.id}`,
        isRead: false,
        createdAt: row.updated_at,
        thumbnail: row.receiver?.avatar_url ?? undefined,
      });
    }

    const conversationIds = (conversationsResult.data ?? []).map((c: any) => c.id);

    if (conversationIds.length) {
      const { data: messageRows } = await supabase
        .from('messages')
        .select('id, conversation_id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name, avatar_url)')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);

      for (const row of (messageRows ?? []) as any[]) {
        items.push({
          id: `message-${row.id}`,
          userId,
          type: 'message',
          title: `${row.sender?.full_name ?? 'Yeni mesaj'}`,
          message: row.content,
          linkUrl: `/mesajlar/${row.conversation_id}`,
          isRead: false,
          createdAt: row.created_at,
          thumbnail: row.sender?.avatar_url ?? undefined,
        });
      }
    }

    const read = readIds();

    return items
      .map((item) => ({ ...item, isRead: read.has(item.id) }))
      // Önce okunmamışlar, her grup kendi içinde en yeniden eskiye.
      .sort((a, b) => {
        if (a.isRead !== b.isRead) return Number(a.isRead) - Number(b.isRead);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .map((item) => ({ ...item, createdAt: relativeTime(item.createdAt) }));
  },
};
