# screenshots — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tarayıcı görsel geri-dönüşü için Electron'suz screenshot alan paketi: herkese açık screenshot tiplerini, yalnızca ana süreçte kullanılan zod şemalarını, model-güvenli metadata sarmalamasını ve `browser_get_screenshot` Capability Plane tool kaydını sahiplenir; somut `webContents.capturePage` adapter'ı masaüstü uygulamasına aittir.

## Kesinlikle olmalı
- [ ] Herkese açık screenshot tiplerini (public types) sahiplenip dışa aktarmalı
- [ ] Yalnızca ana süreçte kullanılacak zod şemalarını (main-only) barındırmalı
- [ ] Model-güvenli (model-safe) metadata sarmalaması sağlamalı — modele ham görüntü yerine metadata dönmeli
- [ ] `browser_get_screenshot` Capability Plane tool kaydını (registration) yapmalı
- [ ] `browser_get_screenshot` tool'unu Capability Plane sözleşmesine ve `{domain}_{verb}_{noun}` adlandırmasına uygun tanımlamalı
- [ ] Electron'a bağımlı olmamalı (Electron-free kalmalı)
- [ ] Somut `webContents.capturePage` adapter'ını içermemeli — o masaüstü uygulamasına ait
- [ ] Public tipler ile main-only şemaları ayrı yüzeyler olarak sunmalı (preload-güvenli ayrım)
- [ ] Tarayıcı görsel geri-dönüşü (visual fallback) senaryosu için bir alan (domain) paketi olarak durmalı

## Olsa iyi olur
- [ ] Screenshot metadata'sını (boyut, format, zaman, kaynak URL vb.) tipli biçimde tanımlamalı
- [ ] `browser_get_screenshot` argümanlarını zod ile trust-boundary'de doğrulamalı
- [ ] Capture adapter'ını enjeksiyonla alıp domain mantığından ayıran bir arayüz sunmalı
- [ ] Modele dönen çıktının görüntü byte'ları değil, güvenli özet/metadata olduğunu garanti etmeli
- [ ] Şemaları `@tepegoz/shared-types` sözleşmelerinden türetmeli, kopyalamamalı
- [ ] Screenshot alımının hangi sekme/WebContents üzerinde yapılacağını parametreyle belirtebilmeli
- [ ] Metadata görüntünün nasıl saklandığına (ör. `cas://` blob referansı) dair alan taşıyabilmeli

## Çok niş
- [ ] Capture adapter'ı yoksa/başarısızsa tool kaydı net bir hata döndürmeli
- [ ] Çok büyük ekran görüntülerinde metadata sarmalaması boyut sınırı uygulamalı
- [ ] Aynı tool'un iki kez kaydına karşı korunmalı (idempotent registration)
- [ ] Farklı görüntü formatları (PNG/JPEG) için metadata tutarlı olmalı
- [ ] Hassas içerik içeren sayfalarda screenshot alınmasının politika ile engellenebilmesine izin vermeli
- [ ] Görünür alan (viewport) ile tam sayfa yakalama ayrımını modelleyebilmeli
- [ ] Adapter zaman aşımına uğradığında tool çağrısı asılı kalmamalı
