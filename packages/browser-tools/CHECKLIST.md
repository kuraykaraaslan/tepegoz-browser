# browser-tools — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Agent'ın kullandığı built-in `browser_*` yetenek tanımlarını (sayfa oku, gez, snapshot, tıkla/doldur/tuşla/kaydır) capability-plane'e kaydeden, Electron'suz perception katmanını da barındıran paket.

## Kesinlikle olmalı
- [ ] `registerBrowserTools({ host })` her `browser_*` aracını `CapabilityRegistry`'ye kaydedebilmeli
- [ ] Araçlar yalnızca ToolGateway PEP üzerinden çağrılabilmeli; doğrudan erişim olmamalı
- [ ] `browser_*` araçları `source: 'builtin'` always-on yetenek olarak kaydedilmeli (Agent uzantısına scoped olmamalı)
- [ ] Paket Electron'dan bağımsız olmalı; her somut tarayıcı işlemi `BrowserHost` arayüzü üzerinden enjekte edilmeli
- [ ] `BrowserHost` sözleşmesi `navigate(url, tabId?)` sağlamalı
- [ ] `BrowserHost` `readPage(tabId?)` sağlamalı
- [ ] `BrowserHost` `waitForLoad(tabId?, timeoutMs?)` sağlamalı
- [ ] `BrowserHost` `snapshotElements(tabId?)` sağlamalı
- [ ] `BrowserHost` `clickElement(ref, tabId?)` sağlamalı
- [ ] `BrowserHost` `fillElement(ref, text, tabId?)` sağlamalı
- [ ] `BrowserHost` `pressKey(key, tabId?)` sağlamalı
- [ ] `BrowserHost` `scrollPage(direction, amount?, tabId?)` sağlamalı
- [ ] `tabId` atlanınca aktif sekme davranışı korunmalı; verilince işlem o tarayıcı sekmesine scoped olmalı
- [ ] `ref`'ler aynı sekmede bir sonraki `snapshotElements()` çağrısına kadar geçerli kalmalı
- [ ] `buildPageSnapshot` url/title/sanitize-edilmiş-metin anlık görüntüsü üretmeli
- [ ] `buildElementsSnapshot` sanitize edilmiş, etkileşilebilir eleman listesi üretmeli (`finalizeElements` üzerine)
- [ ] Perception saf olmalı, Electron içermemeli ve tool kayıtlarının yanında yaşamalı
- [ ] Snapshot tiered DOM-first olmalı, vision yalnızca fallback (ADR-0008)
- [ ] Model'e verilen sayfa metni sanitize edilmiş olmalı
- [ ] Araç adları `{domain}_{verb}_{noun}` kuralına uymalı (`browser_` ön ekli)
- [ ] Uygulama `registerBrowserTools`'u başlangıçta bir kez çağırabilmeli
- [ ] `browser_validate_page` `waitForLoad` + `readPage` ile hafif post-action doğrulama yapmalı

## Olsa iyi olur
- [ ] Tab tools (`tab_*`) bu pakette bulunmamalı — `@tepegoz/tab-engine`'e ait
- [ ] Journal tool (`journal_search_events`) bu pakette bulunmamalı — `@tepegoz/journal-tools`'a ait
- [ ] `BrowserHost` mock'lanarak araçlar Electron runtime'ı olmadan test edilebilmeli
- [ ] `scrollPage` hem yön hem miktar parametresini desteklemeli
- [ ] Snapshot'lar büyük sayfalarda model context'ine sığacak makul boyutta kalmalı
- [ ] `readPage` başlık ve URL'i her zaman döndürmeli
- [ ] Aynı `BrowserHost` birden çok sekme için kullanılabilmeli
- [ ] Paket `apps/desktop`'tan çıkarılmış olmalı (`docs/package-map.md`)
- [ ] `PageSnapshot` / `ElementsSnapshot` tipleri dışa aktarılmalı

## Çok niş
- [ ] Legacy Agent-extension-scoped kayıt yolundan builtin'e geçiş sorunsuz olmalı
- [ ] Vision fallback yalnızca DOM snapshot yetersiz kaldığında devreye girmeli
- [ ] Eski bir `ref` yeni snapshot'tan sonra kullanılırsa net hata dönmeli
- [ ] `waitForLoad` timeout aşımında kontrollü şekilde dönmeli
- [ ] `pressKey` özel tuşları (Enter, Tab, ok tuşları) desteklemeli
- [ ] Geçersiz `tabId` verilince güvenli, açıklayıcı hata dönmeli
