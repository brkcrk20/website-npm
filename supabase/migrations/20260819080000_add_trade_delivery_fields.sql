-- Rapor 1.3 fix: teklif oluşturulurken seçilen teslimat yöntemi/detayları
-- hiçbir yere kaydedilmiyordu.
--
-- Önceki durum: `deliveryMethod` / `deliveryDetails` (MakeOfferPage) sadece
-- `createTradeOffer` çağrısına parametre olarak geçiyordu ama kod bunu hiçbir
-- INSERT'e yazmıyordu (bkz. tradeService.ts'teki eski NOT yorumu). Bu bilgi
-- DB'de yalnızca `trades` tablosunda tutuluyor, `trades` satırı da ancak
-- teklif KABUL EDİLDİĞİNDE (acceptOffer) oluşuyor — yani teklif anında
-- seçilen tercih, kabul anına kadar tutulacak hiçbir yeri yoktu ve sessizce
-- kayboluyordu. TradeDetailPage bu yüzden `deliveryDetails.locationName` /
-- `.scheduledDate` için hep sabit placeholder metinler gösteriyordu.
--
-- Çözüm: teklif oluşturma anında seçilen tercih `trade_offers`'a yazılır;
-- teklif kabul edildiğinde bu değerler `trades` satırına taşınır (bkz.
-- tradeService.ts değişiklikleri). `trades` tablosunda `delivery_method` ve
-- `delivery_notes` zaten vardı; `delivery_scheduled_at` ve
-- `delivery_location_name` burada ekleniyor ki TradeDetailPage'in okuduğu
-- alanlarla birebir eşleşsin.

alter table public.trade_offers
  add column if not exists delivery_method text,
  add column if not exists delivery_scheduled_at timestamptz,
  add column if not exists delivery_location_name text,
  add column if not exists delivery_notes text;

alter table public.trade_offers
  drop constraint if exists trade_offers_delivery_method_check;

alter table public.trade_offers
  add constraint trade_offers_delivery_method_check
  check (delivery_method is null or delivery_method in ('in_person', 'cargo', 'safe_point'));

alter table public.trades
  add column if not exists delivery_scheduled_at timestamptz,
  add column if not exists delivery_location_name text;

alter table public.trades
  drop constraint if exists trades_delivery_method_check;

alter table public.trades
  add constraint trades_delivery_method_check
  check (delivery_method is null or delivery_method in ('in_person', 'cargo', 'safe_point'));
