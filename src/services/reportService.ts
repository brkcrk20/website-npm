import { supabase } from '../lib/supabase';
import type { TablesInsert } from '../types/supabase';

// ─────────────────────────────────────────────────────────────────────────
// ŞİKAYET (rapor md. 106)
//
// `reports` tablosu ve admin tarafı (adminService) baştan beri vardı ama
// KULLANICI TARAFI hiç yazmıyordu: ilan detayındaki "Şikayet Et" formu ve
// DisputePage yalnızca bir toast gösterip kapanıyordu — şikayet hiçbir yere
// ulaşmıyordu (bkz. rapor.txt §2 "buton var, arkasında veri yok").
//
// Neden kümesi DB CHECK constraint'i ile aynı olmalı
// (20260819090000_create_admin_tables.sql).
// ─────────────────────────────────────────────────────────────────────────

export type ReportReason =
  | 'fraud'
  | 'inappropriate'
  | 'no_response'
  | 'broken_item'
  | 'fake_account'
  | 'other';

export type ReportTargetType = 'user' | 'listing' | 'trade' | 'message';

export const REPORT_REASONS: Array<{ id: ReportReason; label: string }> = [
  { id: 'fraud', label: 'Dolandırıcılık şüphesi / para talebi' },
  { id: 'fake_account', label: 'Sahte ilan veya sahte hesap' },
  { id: 'inappropriate', label: 'Uygunsuz içerik veya taciz' },
  { id: 'broken_item', label: 'Ürün ilanda anlatıldığı gibi değil' },
  { id: 'no_response', label: 'Karşı taraf yanıt vermiyor' },
  { id: 'other', label: 'Başka bir sorun' },
];

export const reportService = {
  async createReport(data: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    targetTitle?: string;
    reason: ReportReason;
    description?: string;
    evidenceImages?: string[];
  }): Promise<boolean> {
    const payload: TablesInsert<'reports'> = {
      reporter_id: data.reporterId,
      target_type: data.targetType,
      target_id: data.targetId,
      target_title: data.targetTitle ?? null,
      reason: data.reason,
      description: data.description?.trim() || null,
      evidence_images: data.evidenceImages ?? [],
    };

    const { error } = await supabase.from('reports').insert(payload);

    if (error) {
      console.error('Şikayet gönderilemedi:', error);
      return false;
    }

    return true;
  },
};
