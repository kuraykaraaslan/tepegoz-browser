# history-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Presentational leaf: `tepegoz://history` yöneticisi — arama kutusu + newest-first, lazily-paginated ziyaret listesi; her giriş kaldırılabilir, "Clear all" aksiyonu var.

## Kesinlikle olmalı
- [ ] `HistoryPage` bir arama kutusu + ziyaret edilen sayfalar listesi render etmeli
- [ ] Liste newest-first (en yeni önce) sıralanmalı
- [ ] Liste lazily-paginated olmalı — bir kerede 50 öğe yüklemeli
- [ ] `IntersectionObserver` sentinel'i kullanıcı kaydırdıkça sonraki sayfayı yüklemeli
- [ ] Her history girişi tek tek kaldırılabilir olmalı (`remove(url)`)
- [ ] "Clear all" aksiyonu tüm geçmişi temizlemeli (`clear()`)
- [ ] Kendi arama/liste/pagination state'ini yönetmeli
- [ ] Veri kaynağı (`list(query, offset)`, `remove(url)`, `clear()`) host tarafından enjekte edilmeli
- [ ] Electron bridge'ine hiçbir bağımlılığı olmamalı
- [ ] `HistoryItem` minimal giriş şeklini (`url`, `title`, `ts`) dışa aktarmalı; host'lar daha zengin girişleri geçebilsin
- [ ] `HistoryPageProps` enjekte veri kaynağı sözleşmesini dışa aktarmalı
- [ ] Kendi i18n sözlüğünü (`historyDict`) `useT` ile kullanmalı
- [ ] `historyDict`/`HistoryStrings`'i dışa aktarmalı
- [ ] Arama sorgusunu `list(query, offset)` çağrısına geçirmeli

## Olsa iyi olur
- [ ] Arama sorgusu değiştiğinde pagination'ı sıfırdan başlatmalı
- [ ] Sonuç boşken anlamlı bir boş durum göstermeli
- [ ] Bir öğe kaldırıldığında listeyi tam yeniden yüklemeden güncellemeli
- [ ] "Clear all" için kullanıcıdan onay/geri-alınamaz uyarısı göstermeli
- [ ] `ts` zaman damgasını yerelleştirilmiş, okunur biçimde göstermeli
- [ ] Kaydırma sırasında yükleme göstergesi sunmalı
- [ ] Son sayfaya ulaşıldığında (50'den az dönerse) daha fazla istek yapmamalı
- [ ] en/tr sözlük anahtarları birebir eşleşmeli

## Çok niş
- [ ] Aynı URL'nin birden çok ziyareti listede öngörülebilir biçimde ele alınmalı
- [ ] Çok uzun başlık/URL satır düzenini bozmadan kırpılmalı
- [ ] `IntersectionObserver` desteklenmeyen ortamda makul biçimde bozulmamalı (veya fallback)
- [ ] Hızlı ardışık kaydırmada çift sayfa isteğini önlemeli
- [ ] `list` reddederse (hata) kullanıcıya durum bildirmeli, sonsuz spinner'da kalmamalı
