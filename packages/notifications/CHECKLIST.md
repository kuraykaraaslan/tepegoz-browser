# notifications — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Headless bildirim-merkezi çekirdeği: bellek-içi `NotificationStore` modeli + gelen bildirimler için güven-sınırı şema/factory'si; veri modeli ve enum'lar `@tepegoz/shared-types`'ta, zod şeması bu paketin canonical dizilerden kurduğu katman — framework-agnostik ve Electron-free.

## Kesinlikle olmalı
- [ ] Bellek-içi NotificationStore modelini sağlamalı
- [ ] Store en yeni-önce (newest-first) bir ring buffer olmalı, kapasite 200
- [ ] add(item) yeni öğeyi eklemeli
- [ ] add(item) aynı dedupeKey'i paylaşan önceki öğeyi değiştirmeli (replace)
- [ ] dismiss(id) ile tek bir bildirimi kaldırmalı
- [ ] dismissAll() ile tüm bildirimleri kaldırmalı
- [ ] markRead(id) ile tek bildirimi okundu işaretlemeli
- [ ] markAllRead() ile tüm bildirimleri okundu işaretlemeli
- [ ] list() defensive copy (savunmacı kopya) döndürmeli
- [ ] unreadCount() okunmamış sayısını döndürmeli
- [ ] state() renderer'a dönük `{ items, unread }` anlık görüntüsünü döndürmeli
- [ ] subscribe(listener) bir unsubscribe fn döndürmeli
- [ ] subscribe abone olurken listener'ı tetiklememeli
- [ ] reset() test seam'i olarak öğeleri ve listener'ları temizlemeli
- [ ] NotificationInputSchema ile bir kaynaktan gelen bildirimi güven sınırında doğrulamalı (agent event, onaylı site, sistem)
- [ ] NotificationDraft pre-parse şekli (channels opsiyonel), NotificationInput post-parse şekli (channels her zaman var) olmalı
- [ ] channels verilmediğinde `['center']` varsayılanına düşmeli
- [ ] toNotification(input, id, now) doğrulanmış girdi + host-atanan id + saat ile bir AppNotification kurmalı (saf factory)
- [ ] NotificationActionSchema ile tek bir eyleme geçilebilir butonu (sınırlı type + opsiyonel hedef URL) doğrulamalı
- [ ] zod şemasını shared-types'taki canonical dizilerden (NotificationKind, NotificationChannel, …) türetmeli
- [ ] Framework-agnostik ve Electron-free olmalı — singleton'u ve IPC'yi main-process NotificationHost'a bırakmalı
- [ ] AppNotification / NotificationAction / NotificationActionType / NotificationChannel / NotificationKind / NotificationSource / NotificationState tiplerini shared-types'tan re-export etmeli

## Olsa iyi olur
- [ ] 200 sınırı aşıldığında en eski bildirimi düşürmeli
- [ ] dedupeKey ile tekilleştirme sırasında öğenin ring'deki konumunu tutarlı yönetmeli
- [ ] state() değişiklikten sonra abonelere yeni snapshot yayınlamalı
- [ ] list() döndürdüğü kopyanın dışarıdan değiştirilmesi iç durumu bozmamalı
- [ ] NotificationDraft → NotificationInput dönüşümünde channels dışında alanları olduğu gibi taşımalı
- [ ] Veri modelinin zod-free kalması sayesinde preload-güvenli IPC kontratının aynı tipleri yeniden kullanabilmesi

## Çok niş
- [ ] Geçersiz NotificationActionSchema type'ı gelen bir eylem butonunu reddetmeli, bildirimi sessizce bozmamalı
- [ ] Aynı dedupeKey ile hızlı ardışık add çağrılarında yalnızca tek öğe kalmalı
- [ ] subscribe listener'ı içinde store mutasyonu yapıldığında yeniden giriş (reentrancy) güvenli olmalı
- [ ] reset() sonrası eski unsubscribe fn'lerin çağrılması hata vermemeli
- [ ] now saati geriye giden değerlerde bile newest-first sıralama tutarlı kalmalı
- [ ] channels'a bilinmeyen bir kanal geldiğinde şema bunu reddetmeli
