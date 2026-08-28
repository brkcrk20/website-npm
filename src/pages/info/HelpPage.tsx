import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Eye,
  MessageSquare,
  Flag,
  Ban,
  ChevronDown,
  BadgeAlert,
} from 'lucide-react';

// YARDIM & GÜVENLİK
//
// Bu sayfa neden var: Ayarlar ekranındaki "Yardım & Destek" satırı
// `/yardim` adresine gidiyordu ama App.tsx'te böyle bir rota YOKTU.
// Tanımsız her adres `*` kuralıyla /kesfet'e yönleniyor; yani kullanıcı
// yardıma tıklayınca sessizce ana sayfaya atılıyordu. Hata bile
// görmüyordu.
//
// İçeriği "boş bir yer tutucu" olarak değil bilinçli olarak yazdım:
// takas, birbirini tanımayan iki kişinin buluşmasıdır. Güvenlik
// kurallarının nerede yazdığı, takas uygulamasında yardım sayfasının
// asıl işidir (md. 34: korkutmadan, net).

const SAFETY_RULES = [
  {
    icon: MapPin,
    title: 'Buluşmayı herkese açık bir yerde yap',
    detail:
      'Kafe, alışveriş merkezi, metro çıkışı gibi kalabalık ve aydınlık yerleri seç. Ev adresini paylaşmak zorunda değilsin.',
  },
  {
    icon: Eye,
    title: 'Ürünü teslim etmeden önce gör',
    detail:
      'Karşındaki ürünü elinle kontrol et: çalışıyor mu, açıklamada yazan aksesuarlar yanında mı, hasar var mı. İkiniz de aynı anda teslim edin.',
  },
  {
    icon: MessageSquare,
    title: 'Konuşmayı Swaloop içinde tut',
    detail:
      'Sohbeti uygulama dışına taşımanı isteyen kişilere temkinli yaklaş. Bir sorun çıkarsa yalnızca uygulama içindeki yazışma kayıt altındadır.',
  },
  {
    icon: BadgeAlert,
    title: 'Para isteyen kimseye itibar etme',
    detail:
      'Swaloop takaslarında para gönderilmez. Kapora, kargo ücreti, "farkı yatır" gibi bir talep gelirse takası durdur ve bildir.',
  },
];

const FAQ = [
  {
    q: 'Swaloop nasıl çalışır?',
    a: 'Elindeki eşyayı ilan olarak eklersin, aradığın şeyi ihtiyaç olarak yazarsın. Sistem bu ikisini başka kullanıcıların ilan ve ihtiyaçlarıyla eşleştirir. Uyan bir ilan bulunca teklif gönderirsin; karşı taraf kabul eder, karşı teklif verir ya da reddeder.',
  },
  {
    q: 'Takasta para geçiyor mu?',
    a: 'Hayır. Swaloop’ta hiçbir aşamada para, komisyon ya da ücret yoktur. Karşılıklı olarak eşyalar el değiştirir; başka bir şey talep eden bir kullanıcıyla karşılaşırsan bildir.',
  },
  {
    q: 'Karşı teklif ne demek?',
    a: 'Gelen bir teklifi olduğu gibi kabul etmek ya da reddetmek zorunda değilsin. "Karşı Teklif" ile takasın iki tarafını da değiştirip geri gönderebilirsin — üçüncü yol budur.',
  },
  {
    q: 'İlanım ne kadar yayında kalır?',
    a: 'Her ilan 30 gün yayında kalır. Süresi dolmadan üç gün önce sana hatırlatma gelir. Süre dolduğunda ilan silinmez, "süresi doldu" durumuna geçer ve İlanlarım ekranından tek dokunuşla yenileyebilirsin.',
  },
  {
    q: 'Güven puanı nasıl hesaplanır?',
    a: 'Aldığın değerlendirmelerin ortalamasından (%70) ve takaslarını iptal etmeden tamamlama oranından (%30). Hiç değerlendirilmediysen puanın olmaz — profilinde "Yeni üye" yazar. Bu bir eksiklik değil, karşı tarafa dürüst bir bilgidir.',
  },
  {
    q: 'Takastan vazgeçebilir miyim?',
    a: 'Evet. Teklif henüz kabul edilmediyse geri çekebilirsin; takas başladıysa bir neden seçerek iptal edebilirsin. İptal edilen takasta ilanlar otomatik olarak yeniden yayına döner.',
  },
  {
    q: 'Birini engellersem ne olur?',
    a: 'Engellediğin kişi sana mesaj ya da teklif gönderemez, ilanları keşfette görünmez. Engellediğini yalnızca sen görürsün; karşı tarafa bildirilmez.',
  },
];

export const HelpPage: React.FC = () => {
  const navigate = useNavigate();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Geri"
            className="w-11 h-11 -ml-2 rounded-xl flex items-center justify-center text-ink-soft hover:bg-surface transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg text-ink">Yardım & Güvenlik</h1>
        </div>

        <section>
          <h2 className="sw-label">Güvenli takasın dört kuralı</h2>
          <ul className="space-y-2">
            {SAFETY_RULES.map((rule) => {
              const Icon = rule.icon;

              return (
                <li key={rule.title} className="sw-card p-4 flex gap-3">
                  <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand-dark flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{rule.title}</p>
                    <p className="text-xs text-ink-soft leading-relaxed mt-0.5">{rule.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="sw-label">Sık sorulanlar</h2>
          <div className="sw-card divide-y divide-line overflow-hidden">
            {FAQ.map((item, index) => {
              const open = openIndex === index;

              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : index)}
                    aria-expanded={open}
                    className="w-full min-h-[52px] px-4 py-3 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-medium text-ink flex-1">{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {open && (
                    <p className="px-4 pb-3.5 -mt-0.5 text-xs text-ink-soft leading-relaxed">
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="sw-label">Bir sorun mu var?</h2>
          <div className="sw-card divide-y divide-line overflow-hidden">
            <button
              type="button"
              onClick={() => navigate('/dispute')}
              className="w-full min-h-[52px] px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
            >
              <Flag className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Şikayet oluştur</span>
                <span className="block text-xs text-ink-soft">
                  Ürün açıklamaya uymadı, teslimat gerçekleşmedi, uygunsuz davranış…
                </span>
              </span>
            </button>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <Ban className="w-4 h-4 text-ink-soft shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Kullanıcı engelleme</span>
                <span className="block text-xs text-ink-soft">
                  Engellemek istediğin kişinin profiline gidip sağ üstteki engelle simgesini kullan.
                </span>
              </span>
            </div>
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink-faint pb-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          Swaloop takaslarında para gönderilmez.
        </p>
      </div>
    </div>
  );
};
