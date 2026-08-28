# notifications-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tarayıcının bildirim yüzeyleri: bildirim merkezi paneli, sağ-alt toast yığını ve Web Notification izin-onay istemi — köprüden bağımsız, kendi i18n sözlüğünü taşıyan sunum katmanı.

## Kesinlikle olmalı
- [ ] `NotificationCenter` bir `AppNotification` listesini panel olarak render edebilmeli
- [ ] Her satırda tekil "kapat" (dismiss) eylemi sunabilmeli
- [ ] Her satırda tekil "okundu işaretle" eylemi sunabilmeli
- [ ] Panel başlığında toplu "hepsini okundu işaretle" eylemi olmalı
- [ ] Panel başlığında toplu "hepsini temizle" eylemi olmalı
- [ ] Okunmamış bildirimleri görsel olarak vurgulayabilmeli
- [ ] Liste içinde Up/Down/Home/End klavye gezinmesini desteklemeli
- [ ] `ToastStack` sağ-altta geçici toast'ları yığın halinde gösterebilmeli
- [ ] Toast'lar kendiliğinden (auto-dismiss) kaybolabilmeli
- [ ] Toast'lar `AlertBanner` stiliyle görünmeli
- [ ] Toast yığını `onDismiss(id)` ile tekil kapatmayı desteklemeli
- [ ] `NotificationPermissionPrompt` bir sitenin Web Notification izin isteği için onay gövdesi sunmalı
- [ ] İzin istemi, isteği yapan `origin`'i göstermeli
- [ ] İzin istemi `onDecision(allow, remember)` geri çağırması ile karar döndürmeli
- [ ] İzin istemi kendi modal'ını açmamalı; host'un `Modal`'ı içinde render edilmeye uygun olmalı
- [ ] `KIND_VISUALS` her bildirim `kind`'ı için ikon/kapsayıcı stilini tanımlamalı
- [ ] `KIND_VISUALS` üç yüzeyin üçünde de ortak kullanılmalı
- [ ] Kendi i18n sözlüğünü `useT(notificationsUiDict)` ile taşımalı
- [ ] Hiçbir kullanıcıya görünür metni sabit kodlamamalı
- [ ] Elektron köprüsüne bağımlı olmamalı; tüm eylemler callback olarak enjekte edilmeli
- [ ] Veri modelini (`AppNotification`, `NotificationAction`) `@tepegoz/shared-types`'tan almalı, kendi içinde yeniden tanımlamamalı
- [ ] Göreli zaman gösterimi için `formatTime` enjekte edilebilmeli
- [ ] `NotificationAction` girişlerini tıklanabilir eylem düğmeleri olarak render edebilmeli

## Olsa iyi olur
- [ ] Bildirim yokken boş durum (empty state) göstermeli
- [ ] Panel başlığında okunmamış sayacı gösterebilmeli
- [ ] Toast yığını görünür toast sayısını sınırlayıp taşmayı yönetebilmeli
- [ ] Toast üzerine gelince (hover) auto-dismiss sayacını duraklatabilmeli
- [ ] Odaklı satırda Enter/Space ile eylemi tetikleyebilmeli
- [ ] Bir satır kaldırıldığında odağı komşu satıra taşıyabilmeli
- [ ] İzin isteminde "hatırla" (remember) onay kutusu sunmalı
- [ ] Toast giriş/çıkışında animasyon uygulayabilmeli
- [ ] Bildirimleri türe veya tarihe göre gruplayabilmeli
- [ ] Merkez satırlarında `KIND_VISUALS`'tan gelen türe özgü vurgu rengini kullanabilmeli

## Çok niş
- [ ] `prefers-reduced-motion` altında toast animasyonlarını sadeleştirebilmeli
- [ ] Panel ve toast yığını için RTL yerleşimini desteklemeli
- [ ] Çok uzun bildirim gövdesini kırpıp "genişlet" ile açabilmeli
- [ ] Yeni toast geldiğinde ekran okuyucu için canlı bölge (live region) duyurusu yapabilmeli
- [ ] Çok sayıda bildirimde listeyi performans-güvenli (sanallaştırılmış) tutabilmeli
- [ ] Hızlı ardışık aynı toast'ları tekilleştirebilmeli
