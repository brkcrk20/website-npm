import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Repeat, HeartHandshake, ArrowRight } from 'lucide-react';
import { SwaloopLogo } from '../../components/common/SwaloopLogo';

export const AboutSwaloopPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-canvas pb-28 text-ink">
      <div className="max-w-md md:max-w-2xl mx-auto px-4 pt-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-surface border border-line text-ink-soft hover:bg-canvas transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <SwaloopLogo size="sm" />
        </div>

        {/* Hero Concept */}
        <div className="bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-950 text-white rounded-3xl p-6 shadow-md space-y-3">
          <span className="text-[11px] font-bold text-emerald-200 tracking-wider uppercase">
            Satma. Takas Et. Yeniden Kullan.
          </span>
          <h1 className="text-xl font-black text-white leading-tight">
            Paranın Hiç Geçmediği Sosyal Takas Ekosistemi
          </h1>
          <p className="text-xs text-emerald-100/90 leading-relaxed">
            Swaloop, evlerde atıl bekleyen kaliteli eşyaları doğrudan ihtiyacı olan başka bir kullanıcıyla, tamamen ücretsiz bir şekilde buluşturmak için tasarlandı.
          </p>
        </div>

        {/* 4 Pillars of Swaloop */}
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-ink uppercase tracking-wider">Temel İlkelerimiz</h2>

          <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-brand-dark" />
              <h3 className="text-sm font-bold text-ink">1. Kesinlikle Para Yok</h3>
            </div>
            {/* Bu metin ürünün en sert kuralını çiğniyordu (md. 3/47/116/125:
                "değeri", eşdeğerlik hesabı, fiyat dili yasak): "Eşyalar
                birbirlerinin DEĞERİNİ karşılar… FİYAT SPEKÜLASYONU olmadan
                ADİL takas". Swaloop'ta iki eşyanın denk olup olmadığı
                hesaplanmaz; iki tarafın ihtiyacının karşılanıp
                karşılanmadığına iki taraf karar verir. */}
            <p className="text-xs text-ink-soft leading-relaxed">
              Platformda hiçbir para transferi yoktur. Kimse bir eşyanın ne ettiğini hesaplamaz:
              takasın olup olmayacağına, ihtiyacının karşılanıp karşılanmadığına bakarak iki taraf
              birlikte karar verir.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <Repeat className="w-5 h-5 text-brand-dark" />
              <h3 className="text-sm font-bold text-ink">2. Çoklu Döngü Takasları</h3>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              İki kişinin ürünleri doğrudan uyuşmasa bile, döngü sistemi 3 veya daha fazla kullanıcıyı dairesel olarak (A→B→C→A) eşleştirir.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-line space-y-1.5 shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-ink" />
              <h3 className="text-sm font-bold text-ink">3. Güvenli Takas & Buluşma Noktaları</h3>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              6 adımlı kilit sistemiyle ürünler güvenceye alınır. Metro çıkışları, AVM'ler ve kamuya açık güvenli noktalarda teslimat önerilir.
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <button
          type="button"
          onClick={() => navigate('/kesfet')}
          className="w-full py-3.5 bg-brand hover:bg-brand-dark text-on-brand rounded-2xl font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Hemen Takasa Başla</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
