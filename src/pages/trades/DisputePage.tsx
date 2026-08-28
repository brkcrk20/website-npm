import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { tradeService } from '../../services/tradeService';
import { reportService, REPORT_REASONS, ReportReason } from '../../services/reportService';
import { uploadListingImages } from '../../services/listingService';
import { TradeOffer } from '../../types';
import { ArrowLeft, AlertTriangle, ShieldAlert, Camera, UploadCloud, CheckCircle2 } from 'lucide-react';

export const DisputePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tradeId = searchParams.get('tradeId');
  // Şikayet iki bağlamdan açılabilir: bir takas için ya da doğrudan bir
  // kullanıcı için (profil ekranındaki bayrak butonu).
  const targetUserId = searchParams.get('targetUserId');
  const { currentUser, showToast } = useApp();

  const [trade, setTrade] = useState<TradeOffer | undefined>(undefined);

  useEffect(() => {
    if (!tradeId) return;
    tradeService.getTradeById(tradeId).then(setTrade);
  }, [tradeId]);

  const [reason, setReason] = useState<ReportReason>('broken_item');
  const [description, setDescription] = useState('');
  // Kanıt fotoğrafları artık gerçekten yükleniyor. Önceden "Ekle" butonu
  // sabit bir stok görseli listeye ekliyordu (rapor.txt §2: "buton var,
  // arkasında veri yok").
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (!files.length) return;

    setIsUploading(true);
    // Kanıtlar, kullanıcının kendi klasöründe ilan görselleriyle aynı
    // bucket'a yükleniyor — ayrı bir bucket + politika seti açmamak için.
    const uploaded = await uploadListingImages(currentUser.id, files.slice(0, 3));
    setIsUploading(false);

    const urls = uploaded.filter((url): url is string => !!url);

    if (!urls.length) {
      showToast('Fotoğraf yüklenemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    setPhotos((prev) => [...prev, ...urls].slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      showToast('Lütfen karşılaştığınız sorunu açıklayınız.', undefined, 'error');
      return;
    }

    const targetId = targetUserId ?? tradeId;

    if (!targetId) {
      showToast('Şikayet hedefi bulunamadı', 'Bu sayfaya takas veya kullanıcı bağlantısı üzerinden gelin.', 'error');
      return;
    }

    setIsSubmitting(true);
    const ok = await reportService.createReport({
      reporterId: currentUser.id,
      targetType: targetUserId ? 'user' : 'trade',
      targetId,
      targetTitle: targetUserId
        ? 'Kullanıcı şikayeti'
        : trade
        ? `${trade.offeredListings[0]?.title ?? ''} ↔ ${trade.requestedListings[0]?.title ?? ''}`
        : 'Takas şikayeti',
      reason,
      description,
      evidenceImages: photos,
    });
    setIsSubmitting(false);

    if (!ok) {
      showToast('Şikayet gönderilemedi', 'Lütfen tekrar dene.', 'error');
      return;
    }

    setIsSubmitted(true);
    showToast('Sorun bildirimi alındı', 'Moderasyon ekibi inceleyip dönüş yapacak.', 'info');
  };

  return (
    <div className="min-h-screen bg-canvas pb-24 text-ink">
      <div className="max-w-md md:max-w-xl mx-auto px-4 pt-3 space-y-4">
        {/* Top Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-surface border border-line text-ink-soft hover:bg-canvas transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold text-ink">Sorun Bildir & İnceleme Talebi</h1>
            <p className="text-xs text-ink-soft">Güvenli takas hakem heyeti desteği</p>
          </div>
        </div>

        {isSubmitted ? (
          <div className="bg-surface rounded-3xl border border-line p-6 text-center space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-brand-soft text-brand-dark flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-base font-bold text-ink">Talebiniz Alındı</h2>
            <p className="text-xs text-ink-soft leading-relaxed">
              Takas süreciniz incelemeye alınmıştır. Her iki tarafın beyanları ve fotoğraflar incelenerek admin heyeti tarafından karar verilecektir.
            </p>
            <button
              type="button"
              onClick={() => navigate('/takaslarim')}
              className="w-full py-3 bg-brand text-white rounded-xl text-xs font-bold shadow-xs hover:bg-brand-dark transition-colors"
            >
              Takaslarıma Dön
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Info notice */}
            <div className="p-3.5 rounded-2xl bg-danger-soft border border-danger-line text-danger flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold block mb-0.5">Güvenli Takas Koruma Protokolü</span>
                <span>
                  Ürün tarif edildiği gibi değilse, eksik parça varsa veya teslimat gerçekleşmediyse bu formu doldurabilirsiniz.
                </span>
              </div>
            </div>

            {/* Form inputs */}
            <div className="bg-surface rounded-2xl border border-line p-4 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">Sorun Kategorisi</label>
                {/* Nedenler DB'deki CHECK constraint kümesiyle aynı
                    (reportService.REPORT_REASONS). Önceki listedeki
                    değerler ('not_as_described', 'missing_parts'…) DB
                    tarafında hiç kabul edilmiyordu — zaten hiçbir yere
                    yazılmadığı için fark edilmemişti. */}
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand"
                >
                  {REPORT_REASONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">Detaylı Açıklama</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Yaşadığınız durumu, eksikleri veya hasarları detaylıca anlatınız..."
                  className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-xs outline-hidden focus:border-brand resize-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">Kanıt Fotoğrafları</label>
                <div className="flex items-center gap-2">
                  {photos.map((url, idx) => (
                    <div key={idx} className="w-16 h-16 rounded-xl overflow-hidden border border-line relative">
                      <img src={url} alt="Kanıt" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAddPhotos}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading || photos.length >= 5}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-line hover:border-brand disabled:opacity-50 flex flex-col items-center justify-center text-ink-faint hover:text-brand-dark transition-colors cursor-pointer"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[9px] font-bold mt-1">
                      {isUploading ? '…' : 'Ekle'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-danger hover:bg-danger disabled:bg-line text-white rounded-2xl font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              {isSubmitting ? 'Gönderiliyor…' : 'İnceleme Talebini Gönder'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
