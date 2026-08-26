# Plan — `tepegoz://` sistem sayfalarının `protocol.handle` ile gerçek sayfa olarak sunulması

**Durum:** Kabul edildi ve **Faz 0/1/2 tamamlandı** — [express-settings.md](express-settings.md) Ek A'nın
büyütülmüş hâli; Express soket yolu **reddedildi**. `tepegoz://settings` artık gerçek bir
`WebContentsView`'de çalışıyor; sağ tık context-menu'sü fire ediyor (e2e ile doğrulandı). Diğer iç
sayfalar (`extensions`/`history`/…) henüz taşınmadı — Faz 3, bkz. §4.
**Tarih:** 2026-08-26 (plan, Faz 0, Faz 1 blocker keşfi ve çözümü, Faz 2 — hepsi aynı gün)

## Çözülen blocker: subresource istekleri bu scheme'e hiç ulaşmıyor (2026-08-26)

Faz 1'de settings sayfasını gerçek `WebContentsView`'e bağlarken keşfedildi: `tepegoz://settings`'e
top-level NAVIGATION (`loadURL`) başarılı oluyor — handler çalışıyor, `index.html` dönüyor — ama sayfa
yüklendikten SONRA, aynı dokümanın kendi `<script src>`/`<link href>` etiketlerinin tetiklediği
SUBRESOURCE istekleri **handler'a hiç ulaşmadan** Electron'un kendi içinde başarısız oluyordu:

```
TypeError: Cannot convert argument to a ByteString because the character at index 86 has a value of
65533 which is greater than 255.
    at webidl.converters.ByteString (node:internal/deps/undici/undici:5229:17)
    ...
    at new Headers (node:internal/deps/undici/undici:11364:36)
    at AsyncFunction.<anonymous> (node:electron/js2c/browser_init:2:65690)
```

**Kök neden izolasyonu** (izole minimal Electron repro'ları + gerçek koddan bisect ile): NAVIGATION
isteği her zaman çalışıyor; SADECE subresource istekleri, SADECE
`session.fromPartition(APP_PARTITION).webRequest.onHeadersReceived` (security.ts'in CSP hook'u) AYNI
partition'da kayıtlıyken başarısız oluyor — handler'a (`console.log` ile doğrulandı) hiç girmeden. Ekarte
edilenler: CSP içeriği, `corsEnabled`, header sayısı, response boyutu (2MB'a kadar hem ASCII hem
multi-byte-UTF-8 içerikle test edildi), eşzamanlı istekler, load/attach sırası, gerçek preload script,
gerçek partition adı, WebContentsView-vs-window — hiçbiri tek başına ne sebep oluyor ne de düzeltiyor.
Bu, Electron 43.4.1'in `protocol.handle` + isimlendirilmiş (named) session + webRequest hook
kombinasyonunda gerçek bir hata gibi görünüyor.

**Çözüm — subresource isteğini tamamen ortadan kaldırmak:** `internal-pages/protocol.ts` artık
`index.html`'in referans verdiği `<script>`/`<link>`/favicon'u OKUYUP doğrudan TEK HTML yanıtının içine
inline ediyor — böylece tarayıcı bu scheme'e ASLA ikinci bir (subresource) istek atmıyor. CSP, inline
script/style'ı `'unsafe-inline'` yerine **içerik hash'i** (`'sha256-…'`) ile allowlist'liyor — bu,
uygulamanın kendi derlediği/gönderdiği içerik, keyfi bir inline script değil. Favicon `data:` URI olarak
inline ediliyor (o da bir subresource isteği olurdu). Sonuç build-time'da bir kere hesaplanıp
process ömrü boyunca cache'leniyor. Detaylar `protocol.ts`'teki `registerInternalPagesProtocol` ve
`buildInlinedSettingsPage` doc comment'lerinde.

**Bilinen kalıntı risk:** Bu çözüm yalnızca settings sayfasının KENDİ ana bundle'ını + CSS'ini + favicon'unu
kapsıyor. Eğer settings UI'ı ileride (React.lazy ile) dinamik `import()` yapan bir alt-özellik kazanırsa,
ya da harici bir font/görsel dosyasına `url(...)` ile referans verirse, O istek de AYNI subresource-dispatch
hatasına çarpar. Bugünkü settings UI'ı hiçbir lazy-import/harici-font kullanmıyor (131571 karakterlik
render edilmiş içerik e2e ile doğrulandı), bu yüzden şu an için sorun değil — ama Faz 3'te başka bir
sayfa taşınırken bu kısıtlama (**"tüm doküman kendi kendine yetmeli, hiçbir subresource'a güvenilemez"**)
göz önünde bulundurulmalı.

**Kapsam:** `tepegoz://settings` (tamamlandı) ve zamanla diğer iç sayfalar (`extensions`, `history`, `downloads`,
`uploads`, `bookmarks`, `tasks`) içeriğinin, chrome penceresine gömülü React overlay yerine,
`protocol.registerSchemesAsPrivileged` + `protocol.handle('tepegoz', …)` ile **gerçek bir sayfa**
olarak, **dinleyen bir TCP soketi açmadan** sunulması.

## 1. Motivasyon ve karar gerekçesi

İç sayfalar (`tepegoz://…`) şu an gerçek bir Electron protokolü değil — main process'teki tab-store'da
`kind: 'internal'` etiketli bir kayıt ve chrome renderer'ın "hangi React bileşenini göstereyim" diye
string eşleştirdiği bir konvansiyon
([App-content.tsx:107-268](../../apps/desktop/src/renderer/src/App-content.tsx#L107-L268)). Bu yüzden
**hiçbir `WebContentsView`'e sahip değiller**
([tabs-window-closing.ts:144-149](../../apps/desktop/src/main/tabs-window-closing.ts#L144-L149): "a web
tab always owns a `WebContentsView` from creation… so 'no view entry' ⟺ internal") ve dolayısıyla gerçek
sayfa semantiği yok: sağ tık `context-menu` event'i fire etmiyor
([page-context-menu.ts](../../apps/desktop/src/main/menus/page-context-menu.ts)), Ctrl+F/view-source
native olarak çalışmıyor.

Bu proje daha önce [express-settings.md](express-settings.md) adıyla bir Express+loopback-HTTP çözümü
taslak hâlinde yazılmıştı; o belge **onaylanmadı** ve kendi Ek A'sında soketsiz alternatifi zaten kayda
geçirmişti: *"Express's final hardened form in this plan functionally converges on this design; Appendix
A gets there with fewer moving parts."* 2026-08-26 tarihli karar: **Ek A yolu seçildi**, Express
taslağı `tracks/README.md`'de "Not approved" olarak kalmaya devam ediyor (referans/tarihçe amaçlı,
uygulanmayacak).

Karar gerekçesi (Chrome'un kendi `chrome://` mimarisiyle karşılaştırma): Chrome, `chrome://` sayfalarını
asla HTTP/TCP üzerinden sunmaz — `chrome://` Blink `SchemeRegistry`'sine "standard + secure + WebUI"
olarak kayıtlı, kaynaklar derlenmiş `.pak` bundle'larından ya da `content::WebUIDataSource`'tan bellekte
üretiliyor, `URLLoaderFactory` isteği ağ yığınına hiç sokmadan yakalıyor. `protocol.handle` bunun
Electron'daki en yakın karşılığı: soket yok, DNS rebinding imkânsız, port çakışması/URL-maskeleme sorunu
yok.

## 2. Yeni risk yüzeyi (küçük ama sıfır değil)

Soket olmadığı için Express taslağının T1-T8 tehdit tablosunun büyük kısmı **uygulanabilir bile değil**
(LAN erişimi, DNS rebinding, port tahmini — hepsi bir dinleyen socket varsayıyor). Kalan, gerçek riskler:

| # | Risk | Karşı önlem |
|---|---|---|
| R1 | `protocol.handle` içinde host/path'ten path traversal (`tepegoz://settings/../../secrets`) | Handler yalnızca sabit bir allowlist'ten (host → kaynak haritası) okur; gelen path'i asla doğrudan dosya sistemine geçirmez |
| R2 | Bundled JS/HTML'e enjekte edilebilecek bir XSS, `secure:true` ayrıcalıklı origin'den `window.tepegoz` bridge'ine erişip privileged IPC tetikler | Sıkı CSP (`script-src 'self'`, inline yok, eval yok) + bu sayfalara verilecek preload'un varolan chrome preload'ından **daha dar** bir kapsamla sınırlanması (aşağıya bkz. §4) |
| R3 | **Playwright `_electron` window-discovery precedent.** `chrome-url.ts:9-19`'da kayıtlı: `app://chrome/index.html` gibi özel bir scheme ana chrome penceresi için denenmiş ve **geri alınmış**, çünkü Playwright `firstWindow()` non-standart scheme'deki pencereleri göremiyor. | **DOĞRULANDI, sorun değil** — `tepegoz://` sadece bir `WebContentsView`'in içeriği; üstteki `BrowserWindow` `file://`/dev-server'dan yüklenmeye devam ediyor. Faz 0'da e2e ile kanıtlandı (`smoke.spec.ts` dahil tüm suite yeşil), Faz 2 sonrası tekrar doğrulandı. |
| R4 | `tepegoz://` sayfası içinde de agent'ın "internal tab'ların `webContents`'i yok" varsayımı kırılır ([tabs-window-nav.ts:185-190](../../apps/desktop/src/main/tabs-window-nav.ts#L185-L190) `activeWebContents()`, [tabs-window-closing.ts:144-151](../../apps/desktop/src/main/tabs-window-closing.ts#L144-L151) `viewlessActiveTabId()`) — screenshot/perception/devtools-gate/agent-newtab-replace mantığının hepsi bu invaryanta bağlı. | **ÇÖZÜLDÜ, bedelsiz.** `tabs-internal-page-view.ts`'in view'ları `WindowTabsBase.views`'tan AYRI bir map'te tutuluyor — yukarıdaki invaryantların hiçbiri değiştirilmedi. Tear-off/adopt (`tabs-window-moves.ts`) de bu ayrı map'i taşıyacak şekilde genişletildi (`DetachedTab.internalPageView`), aksi hâlde bir settings tab'ı başka pencereye sürüklemek onu kalıcı olarak boşaltırdı — bu gerçek gap test edilirken bulundu ve kapatıldı. |

## 3. Mimari

```
main process (module scope, whenReady'den ÖNCE)
└─ protocol.registerSchemesAsPrivileged([
     { scheme: 'tepegoz', privileges: { standard: true, secure: true, supportFetchAPI: true,
                                          corsEnabled: false, stream: true } },
   ])

main process (whenReady içinde, installSecurity() yanına)
└─ internal-pages/protocol.ts
     ├─ registerInternalPagesProtocol()   → protocol.handle('tepegoz', handler)
     ├─ handler: host → allowlist'li kaynak haritası (path traversal yok, sabit route seti)
     ├─ her yanıta CSP + X-Content-Type-Options + Referrer-Policy header'ları (chromeCsp'nin
     │  bir varyantı — security.ts'teki chromeCsp mantığı yeniden kullanılır, kopyalanmaz)
     └─ bilinmeyen host / route → 404, path traversal denemesi → 400

renderer / WebContentsView (Faz 2 — bu plan henüz TabManager'a dokunmuyor)
└─ tepegoz://settings  → gerçek WebContentsView → context-menu event fire eder
```

- **Yeni dosya:** `apps/desktop/src/main/internal-pages/protocol.ts` — scheme kaydı + handler.
  `apps/desktop`'ta kalıyor (Electron-native glue), bir `@tepegoz/*` paketine çıkarılmaya değecek kadar
  büyürse sonraki iş kalemi.
- **CSP kaynağı:** `security.ts`'teki `chromeCsp` fonksiyonu yeniden kullanılacak/parametreleştirilecek
  — iki yerde aynı politikanın kopyasını tutmak (ADR-0010 ruhuna aykırı, tek kaynak ilkesi).
- **Şema kaynağı:** Bu iş kaleminde henüz yeni bir DTO/route yok (sadece statik HTML/asset servisi);
  Faz 2'de `/api/*` benzeri bir şey **eklenmeyecek** — mevcut typed IPC/contextBridge yolu kullanılmaya
  devam edecek (Express taslağının M10'u burada bedava: secret hiçbir zaman bu handler'dan geçmiyor).

## 4. İş kalemleri (sırayla)

**Faz 0 — İzole kanıt (TAMAMLANDI, commit `9f11b24`):**
1. [x] `protocol.registerSchemesAsPrivileged` kaydı (module scope, `app.whenReady()`'den önce).
2. [x] `internal-pages/protocol.ts`: `protocol.handle('tepegoz', …)` handler'ı.
3. [x] Birim testler.
4. [x] **Playwright doğrulaması (R3):** `smoke.spec.ts` dahil tüm e2e suite'i yeni scheme kaydıyla
   birlikte geçti — `firstWindow()` etkilenmedi.

**Faz 1 — Gerçek sayfa servisi (TAMAMLANDI, blocker keşfedildi VE çözüldü aynı gün):**
5. [x] `SettingsPageSurface.tsx`: ayrı bir Vite build hedefi YERİNE mevcut renderer bundle'ının
   `?surface=`'a benzer bir `tepegoz:` hostname dispatch'i (`main.tsx`) — sıfır ek build karmaşıklığı.
6. [x] `internal-pages/protocol.ts`: subresource-dispatch blocker'ı kök nedenine kadar izole edildi ve
   inline-document çözümüyle aşıldı (yukarıdaki bölüm).

**Faz 2 — TabManager entegrasyonu (TAMAMLANDI):**
7. [x] `openInternalPage`'in settings için gerçek bir `WebContentsView` oluşturması
   (`tabs-internal-page-view.ts`, `REAL_PAGE_BASE_URLS = [INTERNAL_SETTINGS_URL]`);
   `viewlessActiveTabId()`/`activeWebContents()`/screenshot/devtools-gate/discard/tear-off-adopt hiçbiri
   değiştirilmedi — internal-page-view AYRI bir map'te (R4 böylece bedelsiz çözüldü).
8. [x] `page-context-menu.ts`'in bu view için tetiklendiği e2e ile doğrulandı (asıl kabul kriteri) —
   `e2e/tepegoz-settings-page.spec.ts`.
9. [x] i18n: `SettingsPageSurface.tsx` mevcut `useT`/`I18nProvider`'ı aynen kullanıyor, hiçbir yeniden
   yazım gerekmedi (Express taslağının §7'sinde öngörüldüğü gibi).

**Faz 3+ — Diğer iç sayfalar (henüz başlanmadı):** `extensions`/`history`/`downloads`/`uploads`/
`bookmarks`/`tasks` aynı kalıpla (inline-document deseni dahil), talep/öncelik sırasına göre, her biri
kendi PR'ı. **Uyarı:** Faz 1'in "bilinen kalıntı risk" notuna bakın — herhangi bir dinamik import/harici
font kullanan bir sayfa taşınmadan önce o kısıtlama yeniden değerlendirilmeli.

## 5. Test / doğrulama

- **Birim:** `protocol.test.ts` (11 test) — handler host/path allowlist, inline edilen script/style/icon
  içeriğinin gerçekten gömülü olduğu, CSP hash'lerinin doğruluğu, cache davranışı, favicon-okuma
  başarısızlığının zarifçe düşmesi.
- **E2E:** `e2e/tepegoz-settings-page.spec.ts` — `tepegoz://settings` gerçek içerik render ediyor
  (`innerText.length > 0`) VE sağ tık → `page-context-menu` popup'ı açılıyor. Tam suite (31 test)
  regresyonsuz geçti (1 önceden var olan, alakasız flake hariç).
- `pnpm exec turbo run typecheck lint test build` + `pnpm e2e` — hepsi yeşil.

## 6. Rollback

Tek nokta: `tabs-internal-page-view.ts`'teki `REAL_PAGE_BASE_URLS`'i boşaltmak, `App-content.tsx`'e
`SettingsPage` React overlay branch'ini geri koymak (git history'de mevcut). `internal-pages/protocol.ts`
ve `tabs-internal-page-view.ts`'in geri kalanı kullanılmadan zararsız kalır.

## 7. Açık sorular

- Faz 3'te `settings` dışındaki sayfalar aynı PR'da mı, yoksa her biri ayrı mı taşınacak? (Öneri: ayrı —
  her biri kendi review yüzeyi.)
- `packages/settings-ui` (şu an `apps/desktop`'ta `SettingsLayout`/`settingsDict` kaynağı olarak zaten
  kullanılıyor — "unused" değil) ile `SettingsPage.tsx`/`SettingsPageSurface.tsx` arasındaki mevcut
  bölünme korunuyor; Faz 3'te başka bir sayfa taşınırken benzer bir "Surface" host bileşeni deseni
  tekrarlanabilir.

---

## İlişki: [express-settings.md](express-settings.md)

O belge **geçersiz kılınmadı, uygulanmayacak** olarak işaretli kalıyor. Bu belge onun Ek A'sının resmî,
uygulamaya alınan devamıdır. `tracks/README.md` bu ilişkiyi yansıtacak şekilde güncellendi.
