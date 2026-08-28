// ─────────────────────────────────────────────────────────────────────────
// SERVİS HATASI BİLDİRİMİ
//
// Sorun: servis katmanında 120 ayrı `console.error` var ve hepsi
// kullanıcıya GÖRÜNMEZ. Fonksiyonların çoğu hatada `[]` ya da `undefined`
// dönüyor, sayfaların 35'inden 33'ünde tek bir `catch` yok. Sonuç:
//
//   * Ağ koptuğunda / RLS reddettiğinde / migration eksik olduğunda
//     ekranda "Henüz ilan yok", "Henüz mesajın yok" yazıyor.
//   * Kullanıcı bunu BOŞLUK sanıyor, bir sorun olduğunu anlamıyor;
//     tekrar denemesi gerektiğini de bilmiyor.
//   * En kötüsü: `supabase/README.md`'deki uygulanmamış migration'lar
//     yüzünden bazı RPC'ler hiç yokken bile arayüz sessizce "veri yok"
//     diyor.
//
// 35 sayfayı tek tek hata durumuyla donatmak doğru nihai çözüm; bu dosya
// ise o iş yapılana kadar sessizliği bitiriyor: servis hatası artık tek
// bir yerden bildiriliyor, AppContext dinleyip kullanıcıya kısılmış bir
// uyarı gösteriyor. Konsol davranışı aynı kalıyor.
// ─────────────────────────────────────────────────────────────────────────

type Listener = (context: string, error: unknown) => void;

const listeners = new Set<Listener>();

/** Servis hatalarını dinler; aboneliği sonlandıran fonksiyonu döner. */
export function onServiceError(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * `console.error` yerine kullanılır: aynı şeyi loglar, ek olarak
 * dinleyicilere haber verir.
 *
 * @param context Kullanıcıya gösterilebilecek kısa Türkçe açıklama
 *                ("İlanlar alınamadı" gibi).
 */
export function reportServiceError(context: string, error?: unknown): void {
  console.error(context, error);

  for (const listener of listeners) {
    try {
      listener(context, error);
    } catch {
      // Dinleyicideki bir hata, hatayı bildirmeyi engellememeli.
    }
  }
}
