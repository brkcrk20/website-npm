import { Category, CategoryId, ListingCondition } from '../types';

// Ürün kondisyonu etiketleri. Tek kaynak: hem ilan oluşturma hem ilan
// düzenleme aynı listeyi kullanır — iki yerde ayrı ayrı yazılırsa biri
// güncellenip diğeri unutulduğunda aynı ilan iki ekranda farklı görünür.
export const CONDITION_OPTIONS: {
  id: ListingCondition;
  title: string;
  desc: string;
}[] = [
  { id: 'zero', title: 'Sıfır', desc: 'Kutusu açılmamış, kullanılmamış' },
  { id: 'like_new', title: 'Sıfır Gibi', desc: 'Kusursuz, çiziksiz durumda' },
  { id: 'very_good', title: 'Çok İyi', desc: 'Çok az kullanılmış, temiz' },
  { id: 'good', title: 'İyi', desc: 'Normal kullanım izleri mevcut' },
  { id: 'acceptable', title: 'Makul', desc: 'Çalışır durumda, yıpranmış' },
];

export const CONDITION_LABELS = Object.fromEntries(
  CONDITION_OPTIONS.map((c) => [c.id, c.title])
) as Record<ListingCondition, string>;

// NOT: Bu liste artık canlı Supabase `categories` tablosuyla birebir
// eşleşiyor (id = DB slug, name = Türkçe görünen isim). Detaylar için
// src/types/index.ts'teki CategoryId açıklamasına bakın.
export const CATEGORIES: Category[] = [
  {
    id: 'electronics',
    name: 'Elektronik',
    iconName: 'Laptop',
    color: '#059669', // emerald
    itemCount: 428,
  },
  {
    id: 'sports',
    name: 'Spor & Outdoor',
    iconName: 'Bike',
    color: '#d97706', // amber
    itemCount: 312,
  },
  {
    id: 'home-living',
    name: 'Ev & Yaşam',
    iconName: 'Home',
    color: '#047857',
    itemCount: 520,
  },
  {
    id: 'fashion',
    name: 'Giyim & Moda',
    iconName: 'Shirt',
    color: '#b45309',
    itemCount: 684,
  },
  {
    id: 'hobby',
    name: 'Hobi & Oyun',
    iconName: 'Gamepad2',
    color: '#10b981',
    itemCount: 260,
  },
  {
    id: 'books',
    name: 'Kitap',
    iconName: 'BookOpen',
    color: '#059669',
    itemCount: 260,
  },
  {
    id: 'music',
    name: 'Müzik',
    iconName: 'Music',
    color: '#0d9488',
    itemCount: 135,
  },
  {
    id: 'photography',
    name: 'Fotoğraf',
    iconName: 'Camera',
    color: '#7c3aed',
    itemCount: 98,
  },
  {
    id: 'collectibles',
    name: 'Koleksiyon',
    iconName: 'Sparkles',
    color: '#db2777',
    itemCount: 121,
  },
  {
    id: 'other',
    name: 'Diğer',
    iconName: 'Package',
    color: '#78716c',
    itemCount: 96,
  },
];

export const SAFE_MEETING_POINTS = [
  {
    id: 'smp-1',
    city: 'İstanbul',
    district: 'Kadıköy',
    name: 'Kadıköy İskelesi Güvenli Takas Alanı',
    address: 'Kadıköy Rıhtım Meydanı Zabıta Yanı, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 22:00',
    lat: 40.9904,
    lng: 29.0254,
  },
  {
    id: 'smp-2',
    city: 'İstanbul',
    district: 'Beşiktaş',
    name: 'Beşiktaş Meydan Takas Noktası',
    address: 'Beşiktaş İskelesi Önü Güvenli Toplanma Noktası, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 23:00',
    lat: 41.0422,
    lng: 29.0067,
  },
  {
    id: 'smp-3',
    city: 'İstanbul',
    district: 'Şişli',
    name: 'Cevahir AVM Girişi Danışma Yanı',
    address: 'Büyükdere Cad. No:22 Şişli, İstanbul',
    hasCamera: true,
    hasSecurity: true,
    hours: '10:00 - 22:00',
    lat: 41.0632,
    lng: 28.9930,
  },
  {
    id: 'smp-4',
    city: 'Ankara',
    district: 'Çankaya',
    name: 'Kızılay Metro Çıkışı Güvenli Nokta',
    address: 'Kızılay Meydanı Güven Park Yanı, Ankara',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 21:00',
    lat: 39.9208,
    lng: 32.8541,
  },
  {
    id: 'smp-5',
    city: 'İzmir',
    district: 'Konak',
    name: 'Alsancak İskelesi Takas İstasyonu',
    address: 'Alsancak Vapur İskelesi Girişi, İzmir',
    hasCamera: true,
    hasSecurity: true,
    hours: '08:00 - 22:00',
    lat: 38.4382,
    lng: 27.1413,
  },
];
