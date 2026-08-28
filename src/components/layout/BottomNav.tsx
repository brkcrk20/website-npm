import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Plus, MessageSquare, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// ALT NAVİGASYON
//
// Eski sıra: Ana Sayfa | Keşfet | + | Mesajlar | Profil
//
// İki sorunu vardı:
//
// 1. **Takaslarım alt menüde YOKTU.** Ürünün ölçtüğü tek şey tamamlanan
//    takas sayısı (tasarım dokümanı §8) ama takasın tamamlandığı ekrana
//    ancak Profil → "Takas Geçmişim" üzerinden, iki dokunuşla ve yanlış
//    bir etiketle ulaşılıyordu ("geçmiş" değil, çoğu zaman DEVAM EDEN
//    takaslar orada).
//
// 2. **Aradıklarım alt menüde yoktu.** Oysa ürünün temel birimi ürün
//    değil ihtiyaç (§1): "Elimde var × İhtiyacım var × Başkasında var".
//    İhtiyaç, profilin içine gömülü bir alt sayfa olamaz.
//
// Yeni sıra, kullanıcının takası tamamlamak için gerçekten kullandığı
// dört yüzey + ilan verme:
//
//     Ana Sayfa | Aradıklarım | + İlan Ver | Takaslarım | Mesajlar
//
// Profil buradan çıkıp üst bardaki avatara taşındı (Header.tsx) — hem
// yaygın bir kalıp hem de gündelik kullanımda en az dokunulan yer.
// "Keşfet" sekmesi de çıktı: ana ekranın en üstünde zaten arama çubuğu ve
// kategori çipleri var, yani arama tek dokunuş uzakta; ayrıca "Ana Sayfa"
// zaten /kesfet'e, "Keşfet" ise /arama'ya gidiyordu — etiketlerle rotalar
// çaprazlanmıştı.

const HIDDEN_PREFIXES = [
  '/onboarding',
  '/kayit',
  '/dogrulama',
  '/giris',
  '/profil-olustur',
  '/admin',
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Rozetler gerçek sayıları gösterir: okunmamış MESAJ ve yanıt bekleyen
  // GELEN TEKLİF. (Mesaj rozeti eskiden okunmamış bildirim sayısını
  // gösteriyordu — yeni teklif gelince mesaj sekmesi kabarıyor ama
  // sohbette yeni mesaj çıkmıyordu.)
  const { unreadMessageCount, pendingOfferCount } = useApp();

  const hidden =
    location.pathname === '/' ||
    HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  if (hidden) return null;

  const items = [
    {
      id: 'home',
      label: 'Ana Sayfa',
      icon: Home,
      path: '/kesfet',
      isActive: (p: string) =>
        p === '/kesfet' ||
        p.startsWith('/ilan/') ||
        p.startsWith('/arama') ||
        p.startsWith('/kategoriler') ||
        p.startsWith('/harita'),
    },
    {
      id: 'needs',
      label: 'Aradıklarım',
      icon: Search,
      path: '/aradiklarim',
      isActive: (p: string) => p.startsWith('/aradiklarim'),
    },
    {
      id: 'create',
      label: 'İlan Ver',
      icon: Plus,
      path: '/ilan-ver',
      isCenter: true,
      isActive: (p: string) => p === '/ilan-ver',
    },
    {
      id: 'trades',
      label: 'Takaslarım',
      icon: ArrowLeftRight,
      path: '/takaslarim',
      badge: pendingOfferCount,
      isActive: (p: string) =>
        p.startsWith('/takaslarim') ||
        p.startsWith('/takas-') ||
        p.startsWith('/teklif') ||
        p.startsWith('/karsi-teklif'),
    },
    {
      id: 'messages',
      label: 'Mesajlar',
      icon: MessageSquare,
      path: '/mesajlar',
      badge: unreadMessageCount,
      isActive: (p: string) => p.startsWith('/mesaj'),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface border-t border-line">
      <div
        className="sw-container flex items-stretch justify-between"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(location.pathname);

          if (item.isCenter) {
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                aria-label={item.label}
                className="flex-1 flex items-center justify-center py-2 cursor-pointer"
              >
                <span className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center shadow-sm">
                  <Icon className="w-6 h-6" />
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] cursor-pointer transition-colors ${
                active ? 'text-brand' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={active ? 2.4 : 2} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold flex items-center justify-center">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              {/* Aktif sekme rengin yanında kalın metinle de belirtiliyor:
                  renk tek başına durum taşımamalı (md. 98). */}
              <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
