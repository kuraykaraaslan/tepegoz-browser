# navigation — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Omnibox ile main-process navigasyon guard'ının paylaştığı saf TS URL mantığı: tarama görünümüne yüklenen her şey için şema allow-list'i, `tepegoz://` iç-sayfa yönlendirmesi ve IPC gönderen allow-list'inde kullanılan güvenilir-origin kontrolü — zero-dep ve Electron-free.

## Kesinlikle olmalı
- [ ] isWebUrl(url) yalnızca http(s):// URL'ler için true dönmeli — bir tarama görünümüne yüklenebilecek tek şema kümesi
- [ ] isWebUrl saf (yan etkisiz) olmalı
- [ ] internalPageUrl(input, internalUrls) input bir iç sayfayı adresliyorsa canonical `tepegoz://…` URL'i, değilse null dönmeli
- [ ] internalPageUrl trailing slash'ı hoş görmeli
- [ ] internalUrls kümesi çağıran tarafından verilmeli — hardcode edilmemeli
- [ ] toNavigationUrl var olan bir http(s) URL'i olduğu gibi geçirmeli
- [ ] toNavigationUrl çıplak host/host:port için http(s):// çıkarımı yapmalı (localhost→http, diğerleri→https)
- [ ] toNavigationUrl güvenli host/arama olmayan her girdiyi web aramasına düşürmeli
- [ ] file: / javascript: / data: gibi tehlikeli şemalar yazılıp yapıştırıldığında olduğu gibi yüklemek yerine aramaya düşmeli
- [ ] toNavigationUrl programatik loadURL yolu için gerçek guard olmalı (will-navigate'in kapsamadığı yol)
- [ ] buildSearch verilmediğinde varsayılan DuckDuckGo aramasına düşmeli
- [ ] isTrustedAppUrl yalnızca app'in kendi içeriği için true dönmeli
- [ ] isTrustedAppUrl file:// için her zaman true dönmeli
- [ ] isTrustedAppUrl allow-list'teki `tepegoz://` iç-sayfa host'u için (herhangi bir build) true dönmeli
- [ ] isTrustedAppUrl localhost dev sunucusu için yalnızca opts.isPackaged === false iken true dönmeli
- [ ] isTrustedAppUrl tam URL host eşleşmesi kullanmalı (string prefix değil) — `http://localhost.evil.com` reddedilmeli
- [ ] Zero-dep ve Electron-free olmalı — isPackaged ve iç-sayfa kümesi ince adaptörlerle enjekte alınmalı
- [ ] Her yükleme giriş noktası tarafından yeniden kullanılabilir ve birim-test edilebilir kalmalı

## Olsa iyi olur
- [ ] internalPageUrl birden çok eşdeğer girdi biçimini (host, host/, tam URL) aynı canonical sonuca indirgemeli
- [ ] toNavigationUrl localhost:port'u http'ye, diğer host:port'u https'e ayırmalı
- [ ] buildSearch enjekte edilerek varsayılan arama motoru değiştirilebilmeli
- [ ] isWebUrl / isTrustedAppUrl aynı URL için omnibox ve nav guard'da tutarlı sonuç vermeli
- [ ] fallbackUrl parametresi ile boş/çözümsüz girdide bilinen bir hedefe düşebilmeli

## Çok niş
- [ ] `http://localhost.evil.com` gibi prefix-spoof host'lar exact host eşleşmesiyle reddedilmeli
- [ ] IDN/punycode host'lar URL host karşılaştırmasında tutarlı ele alınmalı
- [ ] `tepegoz://` şeması ama allow-list dışı host isTrustedAppUrl'de false dönmeli
- [ ] Paketlenmiş build'de localhost dev sunucusu asla trusted sayılmamalı
- [ ] `javascript:` URL'i omnibox'a yapıştırıldığında koda dönüşmeden aramaya gitmeli
- [ ] Boşluk içeren / şemasız çok-kelimeli girdi doğrudan aramaya yönlenmeli
