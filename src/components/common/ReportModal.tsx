import React, { useState } from 'react';
import { REPORT_REASONS, ReportTargetType, reportService } from '../../services/reportService';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, X } from 'lucide-react';

interface ReportModalProps {
  targetType: ReportTargetType;
  targetId: string;
  title: string;
  onClose: () => void;
}

/** Şikayet formu — gönderilen şikayet `reports` tablosuna gerçekten yazılır. */
export const ReportModal: React.FC<ReportModalProps> = ({
  targetType,
  targetId,
  title,
  onClose,
}) => {
  const { showToast } = useApp();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!reason) return;

    setIsSending(true);
    const ok = await reportService.submitReport({
      targetType,
      targetId,
      reason,
      description: description.trim() || undefined,
    });
    setIsSending(false);

    if (!ok) {
      showToast('Gönderilemedi', 'Şikayetin kaydedilemedi, lütfen tekrar dene.', 'error');
      return;
    }

    showToast('Şikayetin alındı', 'Ekibimiz en kısa sürede inceleyecek.', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 rounded-3xl p-5 border border-stone-200 dark:border-stone-800 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            Şikayet et
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">{title}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs font-medium outline-hidden focus:border-emerald-600"
          >
            <option value="">Şikayet nedeni seç</option>
            {REPORT_REASONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Kısaca ne olduğunu anlat (isteğe bağlı)"
            className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-xs outline-hidden focus:border-emerald-600 resize-none"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-semibold cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!reason || isSending}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              {isSending ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
