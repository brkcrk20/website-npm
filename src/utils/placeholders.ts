// ─────────────────────────────────────────────────────────────────────────
// YER TUTUCU GÖRSELLER
//
// Uygulama, verisi olmayan her yerde Unsplash'ten sabit fotoğraflar
// kullanıyordu:
//
//   * Avatarı olmayan HERKES aynı yabancının yüzüyle görünüyordu
//     (photo-1534528741775…). Takas, karşındakinin kim olduğuna
//     bakarak verilen bir karar; herkesin aynı gerçek insan fotoğrafıyla
//     görünmesi bu kararı bozar.
//   * Fotoğrafsız ilan, alakasız bir stok fotoğrafla listeleniyordu.
//
// İkisi de artık yerel, nötr SVG. Ağ isteği yok (data URI), gerçek bir
// kişiye ya da ürüne ait değil, koyu/açık temada da okunur.
// ─────────────────────────────────────────────────────────────────────────

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/** Avatarı olmayan kullanıcı için nötr silüet. */
export const DEFAULT_AVATAR = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
    <rect width="96" height="96" rx="48" fill="#e6e9e6"/>
    <circle cx="48" cy="38" r="16" fill="#b3bcb6"/>
    <path d="M16 92c0-17.7 14.3-32 32-32s32 14.3 32 32z" fill="#b3bcb6"/>
  </svg>
`);

/** Fotoğrafı olmayan ilan için nötr görsel. */
export const DEFAULT_LISTING_IMAGE = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
    <rect width="400" height="300" fill="#f0f2f0"/>
    <rect x="150" y="112" width="100" height="76" rx="8" fill="none" stroke="#b3bcb6" stroke-width="6"/>
    <circle cx="176" cy="138" r="9" fill="#b3bcb6"/>
    <path d="M156 182l30-30 22 22 16-14 26 26z" fill="#b3bcb6"/>
  </svg>
`);
