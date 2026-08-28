-- =============================================================================
-- EKSİK YABANCI ANAHTAR İNDEKSLERİ
--
-- Postgres, PRIMARY KEY ve UNIQUE için indeks açar; YABANCI ANAHTAR için
-- AÇMAZ. Bu yüzden bir FK kolonu üzerinden giden her sorgu ve `on delete
-- cascade` silmesi tam tarama yapıyor.
--
-- `20260827000000` ikisini eklemişti (`trade_offer_items(offer_id)`,
-- `favorites(user_id)`); geri kalanı açıkta kaldı. Aşağıdakiler
-- rastgele değil: her biri koddaki GERÇEK bir sorguya ya da bir cascade
-- silmesine karşılık geliyor.
--
-- Kapsam dışı bırakılanlar: `loops`, `loop_participants`, `community_posts`,
-- `post_likes`. Bu özelliklerin ekranları üründen çıkarıldı (App.tsx'teki
-- not), yani sorgulanmıyorlar; tablolar FAZ 3 için duruyor. Ekranlar geri
-- geldiğinde indeksleri de o zaman eklenir.
--
-- `if not exists` ile idempotent: canlıda bir kısmı elle açılmış olsa bile
-- tekrar çalıştırılabilir.
-- =============================================================================


-- ── En sıcak yol: ilan görselleri ───────────────────────────────────────
-- `listing_images` neredeyse HER ekranda embed ediliyor (listingService,
-- needService, tradeService aynı embed'i kullanıyor) ve PostgREST bunu
-- `where listing_id = any($1)` olarak çeviriyor. İndeks olmadan her keşif
-- sayfası yüklemesi bir seq scan. `sort_order` ikinci kolon, çünkü okuma
-- yolu görselleri ona göre sıralıyor (kapak fotoğrafı = ilk sıra).
create index if not exists listing_images_listing_idx
  on public.listing_images (listing_id, sort_order);


-- ── Takas listeleri ve güven sayacı ─────────────────────────────────────
-- `getUserIncomingTrades` / `getUserOutgoingTrades` bu iki kolonu
-- filtreliyor; `recalc_trust_score()` (20260905000000) de tamamlanan ve
-- iptal edilen takasları buradan sayıyor.
create index if not exists trades_sender_idx on public.trades (sender_id);
create index if not exists trades_receiver_idx on public.trades (receiver_id);

-- `delete_listing()` ilanın herhangi bir teklifte geçip geçmediğine,
-- `accept_trade_offer()` de teklifteki ilanların durumuna bu kolon
-- üzerinden bakıyor.
create index if not exists trade_offer_items_listing_idx
  on public.trade_offer_items (listing_id);

-- Karşı teklif zinciri (`createCounterOffer` → `parent_offer_id`).
create index if not exists trade_offers_parent_idx
  on public.trade_offers (parent_offer_id);

-- Takasın zaman çizelgesi ve yönetici aktivite akışı.
create index if not exists trade_events_trade_idx
  on public.trade_events (trade_id, created_at);


-- ── Kategori süzgeci ────────────────────────────────────────────────────
-- `searchListings` ve kategori sayfaları `.eq('category_id', …)` atıyor.
create index if not exists listings_category_idx
  on public.listings (category_id);


-- ── Favoriler ───────────────────────────────────────────────────────────
-- `sync_listing_favorite_count()` ve ilan silinirken çalışan cascade.
create index if not exists favorites_listing_idx
  on public.favorites (listing_id);


-- ── Bildirimler ─────────────────────────────────────────────────────────
-- Dördü de cascade tarafında: ilan, teklif, ihtiyaç ya da sohbet
-- silindiğinde ona bağlı bildirimler taranıyor.
create index if not exists notifications_listing_idx
  on public.notifications (listing_id);
create index if not exists notifications_offer_idx
  on public.notifications (offer_id);
create index if not exists notifications_need_idx
  on public.notifications (need_id);
create index if not exists notifications_conversation_idx
  on public.notifications (conversation_id);


-- ── Güven geçmişi ───────────────────────────────────────────────────────
-- Kullanıcının güven olayları zaman sırasıyla okunuyor; diğer ikisi
-- cascade tarafında.
create index if not exists trust_events_user_idx
  on public.trust_events (user_id, created_at desc);
create index if not exists trust_events_review_idx
  on public.trust_events (review_id);
create index if not exists trust_events_trade_idx
  on public.trust_events (trade_id);


-- ── Değerlendirmeler ────────────────────────────────────────────────────
-- "Bu takası değerlendirdim mi?" kontrolü ve profildeki değerlendirme
-- listesi.
create index if not exists reviews_reviewer_idx
  on public.reviews (reviewer_id);


-- ── Sohbet ──────────────────────────────────────────────────────────────
-- `getConversations` üç embed'i de bu kolonlar üzerinden çözüyor.
create index if not exists conversations_last_message_idx
  on public.conversations (last_message_id);
create index if not exists conversations_related_listing_idx
  on public.conversations (related_listing_id);
create index if not exists messages_trade_offer_idx
  on public.messages (trade_offer_id);


-- ── Moderasyon ──────────────────────────────────────────────────────────
-- Yönetici paneli şikayet ve anlaşmazlıkları kişiye göre listeliyor.
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists disputes_initiator_idx on public.disputes (initiator_id);
create index if not exists disputes_respondent_idx on public.disputes (respondent_id);
