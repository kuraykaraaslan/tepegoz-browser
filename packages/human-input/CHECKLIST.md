# human-input — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> CDP tabanlı otomasyon için insan benzeri fare/klavye/scroll hareketi üreten adapter (`HumanInputAdapter`) ve saf matematik yardımcıları.

## Kesinlikle olmalı
- [ ] `HumanInputAdapter` ham bir CDP `send` fonksiyonunu sarmalamalı
- [ ] `moveTo` fare yolunu Catmull-Rom eğrisiyle üretmeli
- [ ] Yol boyunca hızı eased (ivmeli/yavaşlamalı) uygulamalı
- [ ] Fare hareket olaylarında gerçek `movementX`/`movementY` deltaları vermeli
- [ ] `click` tuş tutma süresini Gaussian jitter ile değiştirmeli
- [ ] `pressKey` tuş hold ve flight sürelerini Gaussian jitter ile değiştirmeli
- [ ] `scroll` üç fazlı ease-out / overshoot / spring-back profili uygulamalı
- [ ] `insertText` yeteneğini sağlamalı
- [ ] Tüm olayları enjekte edilen `CdpSend` üzerinden göndermeli
- [ ] `CdpSend` tipi `(method, params) => Promise<unknown>` olmalı (`wc.debugger.sendCommand` ile uyumlu)
- [ ] `KeySpec` tanımını (`key` / `code` / `keyCode` / opsiyonel `text`) dışa vermeli
- [ ] Matematik katmanı DOM / Node / Electron içermemeli
- [ ] Sıfır bağımlılık (zero deps) olmalı
- [ ] `gaussianJitter`, `easeInOut`, `easeOut`, `easeIn`, `catmullRom` saf yardımcılarını dışa vermeli

## Olsa iyi olur
- [ ] `gaussianJitter` Box-Muller örneklemesini ±3σ'ya clamp etmeli
- [ ] Matematik yardımcıları CDP adapter'dan bağımsız kullanılabilmeli
- [ ] `onCursorMove` hook'u ile UI geri bildirimi (ör. `CursorOverlay`) desteklemeli
- [ ] `onAction` hook'u ile eylem geri bildirimi sağlamalı
- [ ] `shouldYield()` ile gerçek kullanıcı girişi simüle hareketi ortasında kesebilmeli
- [ ] Amaç trust forge etmek değil, hareket profilini insana benzetmek olmalı
- [ ] `main/agent/cdp-driver.ts` ve `main/macro/macro-cdp.ts` tarafından tüketilebilmeli

## Çok niş
- [ ] `shouldYield()` tetiklendiğinde imleç son ulaşılan noktada bırakılmalı
- [ ] Catmull-Rom ilk/son segmentte taşma yapmadan interpole etmeli
- [ ] Çok kısa mesafeli `moveTo` çağrılarında da en az birkaç ara adım üretmeli
- [ ] `scroll` overshoot miktarı hedef mesafeyle orantılı olmalı
- [ ] `insertText` ile `pressKey` arasındaki ayrım korunmalı (yapıştırma vs tuş tuş yazma)
- [ ] Gönderilen CDP olayları `isTrusted: true` kanalı üzerinden gitmeli (sentetik DOM olayı değil)
