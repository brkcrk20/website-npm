import { supabase } from '../lib/supabase';

/**
 * Şikayet gönderimi.
 *
 * "Bu ilanı şikayet et" formu daha önce hiçbir yere yazmıyor, sadece
 * "şikayetiniz alındı" mesajı gösteriyordu. Artık `public.reports`
 * tablosuna gerçekten kaydediliyor (bkz. migration
 * 20260824091000_swap_core_improvements.sql).
 */

export type ReportTargetType = 'listing' | 'user' | 'trade';

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'cash_demand', label: 'Nakit para talep etti (yasak)' },
  { value: 'misleading', label: 'Yanıltıcı ürün veya sahte bilgi' },
  { value: 'inappropriate', label: 'Uygunsuz içerik veya fotoğraf' },
  { value: 'no_show', label: 'Buluşmaya gelmedi / ürünü göndermedi' },
  { value: 'damaged', label: 'Ürün açıklamadan farklı / hasarlı geldi' },
  { value: 'other', label: 'Diğer' },
];

export const reportService = {
  async submitReport(input: {
    targetType: ReportTargetType;
    targetId: string;
    reason: string;
    description?: string;
  }): Promise<boolean> {
    const { data: sessionData } = await supabase.auth.getSession();
    const reporterId = sessionData.session?.user?.id;

    if (!reporterId) {
      console.warn('Şikayet göndermek için giriş gerekli.');
      return false;
    }

    const { error } = await supabase.from('reports').insert({
      reporter_id: reporterId,
      target_type: input.targetType,
      target_id: input.targetId,
      reason: input.reason,
      description: input.description ?? null,
    });

    if (error) {
      console.error('Şikayet kaydedilemedi:', error);
      return false;
    }

    return true;
  },
};
