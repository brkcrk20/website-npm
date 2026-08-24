import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Package,
  Search,
  Heart,
  History,
  ShieldCheck,
  Award,
  Leaf,
  Settings,
  Share2,
  Edit3,
  Star,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { listingService } from '../../services/listingService';
import { tradeService } from '../../services/tradeService';
import { needService } from '../../services/needService';

// 15. PROFİL
//
// Profilde olması gerekenler (md. 83): fotoğraf, isim, güven skoru, üyelik
// süresi, tamamlanan takas, aktif ilan, aradıkları, ilanları,
// değerlendirmeler. Olmaması gerekenler (md. 84): CO₂ grafikleri, puan
// tabloları, 20 rozet, karmaşık istatistikler — bunlar alt sayfalarda.

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [listingCount, setListingCount] = useState(0);
  const [needCount, setNeedCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    listingService.getUserListings(currentUser.id).then((items) => {
      setListingCount(items.filter((l) => l.status === 'active').length);
    });
    tradeService.getReviewsForUser(currentUser.id).then((items) => setReviewCount(items.length));
    needService
      .getUserNeeds(currentUser.id)
      .then((items) => setNeedCount(items.filter((n) => n.status === 'active').length));
  }, [currentUser.id]);

  const trust = currentUser.trustProfile;

  const menu = [
    { icon: Package, label: 'İlanlarım', value: `${listingCount}`, path: '/ilanlarim' },
    { icon: Search, label: 'Aradıklarım', value: `${needCount}`, path: '/aradiklarim' },
    { icon: Heart, label: 'Favorilerim', path: '/favoriler' },
    { icon: History, label: 'Takas Geçmişim', path: '/takaslarim' },
    { icon: ShieldCheck, label: 'Güven Puanım', value: trust.score.toFixed(1), path: '/guven-puani' },
    { icon: Award, label: 'Rozetlerim', path: '/rozetlerim' },
    { icon: Leaf, label: 'Çevresel Etkim', path: '/etkim' },
    { icon: Settings, label: 'Ayarlar', path: '/ayarlar' },
  ];

  return (
    <div className="sw-screen">
      <div className="sw-container pt-4 space-y-4">
        {/* Kullanıcı kartı */}
        <div className="sw-card p-5">
          <div className="flex items-start gap-4">
            <img
              src={currentUser.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg text-ink truncate">{currentUser.fullName}</h1>
              <p className="text-xs text-ink-soft truncate">
                {[currentUser.district, currentUser.city].filter(Boolean).join(', ') ||
                  'Konum belirtilmedi'}
              </p>
              <p className="flex items-center gap-1 text-xs font-semibold text-ink mt-1.5">
                <Star className="w-3.5 h-3.5 text-star fill-star" />
                {trust.score.toFixed(1)}
                <span className="font-normal text-ink-soft">güven puanı</span>
              </p>
            </div>
          </div>

          {currentUser.bio && (
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">{currentUser.bio}</p>
          )}

          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-ink">{trust.successfulTradesCount}</p>
              <p className="text-[11px] text-ink-soft">Tamamlanan</p>
            </div>
            <div className="text-center border-x border-line">
              <p className="text-lg font-semibold text-ink">{listingCount}</p>
              <p className="text-[11px] text-ink-soft">Aktif ilan</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-ink">{reviewCount}</p>
              <p className="text-[11px] text-ink-soft">Değerlendirme</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => navigate('/profil/duzenle')}
              className="sw-btn sw-btn-ghost flex-1"
            >
              <Edit3 className="w-4 h-4" />
              Profili düzenle
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.origin + `/profil/${currentUser.id}`);
                showToast('Profil bağlantısı kopyalandı', undefined, 'success');
              }}
              aria-label="Profili paylaş"
              className="sw-btn sw-btn-ghost w-12 px-0"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Menü */}
        <div className="sw-card divide-y divide-line overflow-hidden">
          {menu.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-canvas transition-colors cursor-pointer"
              >
                <Icon className="w-4 h-4 text-ink-soft shrink-0" />
                <span className="text-sm font-medium text-ink flex-1">{item.label}</span>
                {item.value && (
                  <span className="text-xs font-semibold text-ink-soft">{item.value}</span>
                )}
                <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
              </button>
            );
          })}
        </div>

        {currentUser.isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="sw-btn sw-btn-ghost sw-btn-block"
          >
            Yönetim paneli
          </button>
        )}
      </div>
    </div>
  );
};
