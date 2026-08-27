# Plan — `tepegoz://` sistem sayfalarının `protocol.handle` ile gerçek sayfa olarak sunulması

**Durum:** Kabul edildi ve **Faz 0/1/2/3 tamamlandı** — [express-settings.md](express-settings.md) Ek A'nın
büyütülmüş hâli; Express soket yolu **reddedildi**. `tepegoz://settings`, `extensions`, `history`,
`downloads`, `uploads`, `bookmarks` artık hepsi gerçek `WebContentsView`'lerde çalışıyor; settings için
sağ tık context-menu'sü fire ediyor (e2e ile doğrulandı), diğer beşi gerçek içerik render ettiği
doğrulandı. `tepegoz://tasks` taşınmadı — hiçbir UI onu render etmiyor (ölü route, Tasks ürün
yeniden tasarımına kadar).
**Tarih:** 2026-08-26 (plan, Faz 0, Faz 1 blocker keşfi ve çözümü, Faz 2, Faz 3 — hepsi aynı gün);
2026-08-27/28'de main'e merge sonrası keşfedilen iki gerçek regresyon düzeltildi (aşağıya bkz.).

## Merge sonrası keşfedilen iki regresyon (2026-08-27/28, main'e merge edildikten hemen sonra)

Manuel dumandan (`pnpm dev`) gelen bir ekran görüntüsü: `tepegoz://settings` içine TAM `<App/>` chrome'u
(kendi sekme çubuğu, omnibox'ı, boş yeni sekmesiyle) mount oluyordu — "webview içinde tarayıcı açılıyor".
Kök neden ZİNCİRLEME iki farklı şeydi, ilki benim (agent'ın) kendi doğrulama sürecimin hatası, ikincisi
gerçek bir kod regresyonuydu:

1. **Stale build (kod hatası değil, doğrulama süreci hatası).** Merge öncesi main'deki flake'i izole
   etmek için `git checkout main` yapıp ORADA bir production build çalıştırdım — bu, `out/renderer`'ı
   feature'dan ÖNCEKİ (hostname-dispatch'siz) bundle ile ezdi. Sonra `feat/tepegoz-protocol-pages`'i
   fast-forward merge edip push ettim ama YENİDEN build ETMEDİM — kaynak kod güncel, disk'teki derlenmiş
   çıktı değildi. `internal-pages/protocol.ts`'in `cachedInlinedPage`'i bu eski `index.html`'i okuyup
   process ömrü boyunca cache'ledi → `main.tsx`'in hostname dispatch'i hiç YOKTU o bundle'da → varsayılan
   `<App/>` mount oldu. **Düzeltme:** `pnpm exec turbo run build --filter=@tepegoz/desktop --force`.
   **Ders:** bir "regresyon kontrolü" için başka bir branch'e geçip build almak, geri dönüldüğünde mutlaka
   yeniden build gerektirir — kaynak ile disk çıktısı sessizce ayrışabilir.

2. **Gerçek regresyon: `isTrustedAppUrl` `tepegoz://` şemasını hiç tanımıyordu.** Stale build düzeltilince
   sayfa artık doğru yüzeyi (`SettingsPageSurface`) mount ediyordu ama sonsuza kadar kendi
   "…" yükleme fallback'inde takılı kalıyordu. Kök neden:
   `packages/navigation/src/trusted-origin.ts`'teki `isTrustedAppUrl` — IPC sender allow-list'inin
   (`ipc-helpers.ts#assertTrustedSender`) tek geçit noktası — sadece `file://` (chrome doc) ve
   dev'de `http://localhost` biliyordu; Faz 2/3 hiçbir noktada bu fonksiyona `tepegoz://` desteği
   EKLEMEMİşTİ. Sonuç: `tepegoz://settings`'ten yapılan HER `getPreferences()` /
   `getCredentialsStatus()` çağrısı 403 "untrusted sender" ile reddediliyordu, surface'in
   `.then(..., () => {/* bridge unavailable */})` yutucu catch'i bunu sessizce yutuyordu, `prefs`/`status`
   hiçbir zaman null'dan çıkmıyordu. **Aynı sınıf regresyon, TAŞINAN
   ALTI SAYFANIN HEPSİNDE** (extensions/history/downloads/uploads/bookmarks) — sadece settings'e
   özgü değildi.
   **Düzeltme:** `TrustedOriginOptions`'a `internalPageHosts?: readonly string[]` eklendi (paket
   Electron-free kaldı — desktop adapter'ı enjekte ediyor); yeni bir `tepegoz:` dalı,
   hostname allow-list'te ise `isPackaged`'dan BAĞIMSIZ olarak güveniyor (bu bir dev-server kaçış
   kapısı değil — `tepegoz:` sadece bu uygulamanın kayıt edebildiği bir şema).
   Aynı altı-sayfa host listesi (`internal-pages/protocol.ts`'in servis ettiği liste ile
   AYNI kaynak) artık `internal-pages/real-page-hosts.ts` adlı BAĞIMSIZ bir leaf modüle
   çıkarıldı — `protocol.ts` doğrudan içermiyordu çünkü
   `window.ts` → `lib/trusted-origin.ts` → `internal-pages/protocol.ts` → `window.ts`
   çevrimini kapatırdı (protocol.ts zaten `window.ts`'ten `APP_PARTITION` alıyor,
   `window.ts` zaten `lib/trusted-origin.ts`'ten `isTrustedAppUrl` alıyor).

   **İkinci, daha düşük öncelikli ama gerçek bir bulgu, aynı taramada:**
   `security.ts#installSecurity`'nin `session.fromPartition(APP_PARTITION).webRequest.onHeadersReceived`
   hook'u — chrome için yazılmış, `tepegoz://` sayfalarından ÖNCE var olan bir
   hook — AYNI partition'daki HER yanıtın `Content-Security-Policy` başlığını,
   `protocol.ts`'in kendi hash-bazlı CSP'siyle DEğİŞTİRMEDEN, koşulsuz
   üzerine yazıyordu. Dev'de zararsız görünüyordu ("dev" chromeCsp zaten
   `'unsafe-inline'` ekliyor, inline script yine çalışıyor) ama PAKETLENMİŞ
   (packaged) bir build'de `chromeCsp(false)`'ın ne hash'i ne `unsafe-inline`'ı var — inline
   script'i tamamen ENGELLERDİ (boş sayfa, hiçbir React mount olmadan). **Düzeltme:**
   hook artık `details.url`'in `tepegoz://` ile başladığı durumda hiçbir
   şey yapmadan (`callback({})`) protocol.ts'in kendi başlığını dokunulmadan
   bırakıyor.

   **Test boşluğu, aynı taramada kapatıldı:** hem `e2e/tepegoz-settings-page.spec.ts`
   hem `e2e/tepegoz-internal-pages.spec.ts`, `document.body.innerText.length > 0` kontrolü
   kullanıyordu — bu, gerçek içerik ile SONSUZA KADAR takılı kalan "…" yükleme
   fallback'ini AYIRT EDEMEZ (ikisi de boş olmayan innerText üretir), bu yüzden bu regresyon
   Faz 3'ün kendi e2e suite'i YEŞİLKEN merge oldu. Her iki spec'e artık sayfanın
   kendi bağlamı içinden `window.tepegoz.getPreferences()`'in GERÇEKTEN resolve
   ettiğini doğrulayan açık bir kontrol eklendi — bu, tam olarak bu hata sınıfını
   yakalayan doğrudan bir regresyon testi.

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
script'i `'unsafe-inline'` yerine **içerik hash'i** (`'sha256-…'`) ile allowlist'liyor — bu, uygulamanın
kendi derlediği/gönderdiği içerik, keyfi bir inline script değil (style için `'unsafe-inline'` — aşağıya
bkz.). Favicon `data:` URI olarak inline ediliyor (o da bir subresource isteği olurdu). Sonuç build-time'da
bir kere hesaplanıp process ömrü boyunca cache'leniyor. Detaylar `protocol.ts`'teki
`registerInternalPagesProtocol` ve `buildInlinedAppPage` doc comment'lerinde.

### İkinci blocker: naif inline etme sayfayı sessizce bozuyordu (aynı gün, ayrı bulundu)

İlk "inline et" çözümü GEÇTİ gibi göründü (`innerText.length > 0` e2e testi yeşildi) ama gerçekte İKİ AYRI
hatayla sessizce bozuktu — ikisi de sadece 1.9MB'lık GERÇEK bundle'ı sunma sistemi bir kere test edildiğinde
ortaya çıktı (`document.scripts.length` kontrolü ve CSP-ihlali console-message kontrolü ile):

1. **`String.prototype.replace(search, stringReplacement)`'in `$&` özel pattern'i.** Minifiye React kodu
   kendi key-escaping regex'inde tam olarak `"$&/"` string'ini içeriyor. `html.replace(tag, \`<script>${js}</script>\`)`
   çağrısında replacement STRING'i `js`'i İÇERİYORDU, ve `js` içindeki `$&` JS motoru tarafından "orijinal
   eşleşen metni buraya koy" olarak yorumlanıyor — yani ORİJİNAL `<script src=…></script>` tag'i sessizce
   inline edilmiş içeriğin ORTASINA geri enjekte ediliyordu. Sonuç: `document.scripts.length === 3`
   (beklenen: 1) — tek script tag'i üçe bölünmüştü. Bunu, üretilen HTML'i doğrudan bir pencereye yükleyip
   `document.scripts`'i inceleyerek DOĞRUDAN kanıtladım (izole repro). **Düzeltme:** `replace()` yerine
   index-bazlı splice (`spliceReplace` — `$`-pattern dilini tamamen atlıyor).
2. **HTML tokenizer'ının `<!--`/`<script`/`</script` tanıması, JS/CSS anlamından bağımsız, SAF METİN
   seviyesinde çalışıyor.** Bundle'da React'in kendi kaynağından gelen, kazara TEK bir escape'siz
   `"<script><\/script>"` probe string'i var (kapanış kısmı zaten backslash ile escape'liydi ama açılış
   `<script>` DEĞİLDİ). **Düzeltme:** `escapeForInlineTag` — inline edilecek her içerikte `<!--`/`<script`/
   `</script`'i (case-insensitive) `<` sonrasına backslash ekleyerek escape ediyor; JS/CSS SEMANTİĞİNİ
   DEĞİŞTİRMİYOR (string/comment içinde `\s`/`\/`/`\!` zaten kendisine eşit) ama HTML parser'ın erken
   kapatmasını engelliyor.

**Bu ikisi BİRBİRİNDEN BAĞIMSIZ** — biri düzelmeden diğeri sayfayı çalışır hale getirmiyordu. Yakalanma
şekli önemli: `e2e/tepegoz-internal-pages.spec.ts`'e eklenen CSP-violation kontrolü (her sayfayı
`console-message` collector ile reload edip CSP ihlali mesajı olup olmadığını kontrol ediyor) — SADECE
`innerText.length > 0` kontrolü bu iki hatayı YAKALAYAMADI, çünkü sayfa YİNE DE bir miktar render
edebiliyordu (React'in kendisi kısmen çalışıyordu). Birim testlerine de bu iki senaryonun küçültülmüş
(minimal) tekrarı eklendi (`protocol.test.ts` — "safe embedding of real-world bundle content").

**Bilinen kalıntı risk (hâlâ geçerli, izlenmeli):** Bu çözüm yalnızca TEK BİR paylaşılan bundle + CSS +
favicon'u kapsıyor — her host (`settings`/`extensions`/`history`/`downloads`/`uploads`/`bookmarks`)
AYNI inline edilmiş dokümanı alıyor, `main.tsx` hangi Surface'ın mount edileceğine
`location.hostname`'den çalışma zamanında karar veriyor (bkz. `protocol.ts`'teki `REAL_PAGE_HOSTS`).
Eğer bu paylaşılan bundle ileride (React.lazy ile) dinamik `import()` yapan bir alt-özellik kazanırsa, ya
da harici bir font/görsel dosyasına `url(...)` ile referans verirse, O istek de AYNI
subresource-dispatch hatasına çarpar. Doğrulama: build çıktısında GÖRÜNEN `history-page-*.js` gibi ayrı
chunk'lar (bkz. build log) hep VARDI — bunlar `extensions/registry.ts`'nin lazy extension-page
surface'ları için, benim `HistoryPageSurface.tsx` gibi STATIC import kullanan Surface'larımla ilgisi yok
(hepsi ana `index-*.js` chunk'ına gömülü, doğrulandı). Ama Faz 3+'ta (extensions dahil) her yeni
sayfa/özellik eklenirken bu kısıtlama (**"tüm doküman kendi kendine yetmeli, hiçbir subresource'a
güvenilemez"**) göz önünde bulundurulmalı — özellikle Extensions sayfası ileride lazy-load'lu üçüncü
taraf uzantı ikonları/paneli kazanırsa.

**Kapsam:** `tepegoz://settings`/`extensions`/`history`/`downloads`/`uploads`/`bookmarks` (hepsi
tamamlandı) içeriğinin, chrome penceresine gömülü React overlay yerine,
`protocol.registerSchemesAsPrivileged` + `protocol.handle('tepegoz', …)` ile **gerçek bir sayfa**
olarak, **dinleyen bir TCP soketi açmadan** sunulması. `tasks` kapsam dışı (ölü route).

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

## 3. Mimari (gerçekleşen hâli)

```
main process (module scope, whenReady'den ÖNCE)
└─ protocol.registerSchemesAsPrivileged([
     { scheme: 'tepegoz', privileges: { standard: true, secure: true, supportFetchAPI: true,
                                          corsEnabled: true } },
   ])

main process (whenReady içinde, installSecurity() yanına)
└─ internal-pages/protocol.ts
     ├─ registerInternalPagesProtocol() → session.fromPartition(APP_PARTITION).protocol.handle(...)
     │  (ÜSTTEKİ protocol.handle DEĞİL — o session.defaultSession'a bağlanır, bkz. doc comment)
     ├─ handler: host ∈ REAL_PAGE_HOSTS ve path === '/' ise → TEK inline edilmiş doküman (cache'li)
     ├─ her yanıta CSP (script/style-src 'sha256-…') + X-Content-Type-Options + Referrer-Policy
     └─ bilinmeyen host / path → 404

renderer / WebContentsView (Faz 2/3 — tabs-internal-page-view.ts)
└─ tepegoz://{settings,extensions,history,downloads,uploads,bookmarks}
     → gerçek WebContentsView → main.tsx hostname'e göre doğru *PageSurface'ı mount eder
     → context-menu event fire eder (settings için e2e ile doğrulandı)
```

- **Yeni dosya:** `apps/desktop/src/main/internal-pages/protocol.ts` — scheme kaydı + handler.
  `apps/desktop`'ta kalıyor (Electron-native glue), bir `@tepegoz/*` paketine çıkarılmaya değecek kadar
  büyürse sonraki iş kalemi.
- **CSP kaynağı:** `security.ts`'teki `chromeCsp`'den AYRI, kendi `internalPageCsp()` fonksiyonu —
  hash-bazlı script/style-src üretmesi gerektiği için chromeCsp'nin parametrik hâle getirilmesi yerine
  ayrı tutuldu (ikisi de aynı "no unsafe-inline/eval, sıkı default-src" felsefesini paylaşıyor).
- **Şema kaynağı:** Yeni bir DTO/route yok (statik, inline edilmiş HTML servisi); mevcut typed
  IPC/contextBridge yolu kullanılmaya devam ediyor (Express taslağının M10'u burada bedava: secret
  hiçbir zaman bu handler'dan geçmiyor).

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

**Faz 3 — Diğer iç sayfalar (TAMAMLANDI, aynı gün):**
10. [x] `internal-pages/protocol.ts`: `REAL_PAGE_HOSTS`'a `extensions`/`history`/`downloads`/`uploads`/
    `bookmarks` eklendi — hepsi AYNI inline edilmiş bundle'ı paylaşıyor (yeni build karmaşıklığı yok).
11. [x] Her sayfa için kendi `*PageSurface.tsx`'i (`ExtensionsPageSurface`/`HistoryPageSurface`/
    `DownloadsPageSurface`/`UploadsPageSurface`/`BookmarksPageSurface`) — `SettingsPageSurface.tsx`'in
    deseni tekrarlandı: preload bridge'e doğrudan bağlı, prop-threading yok. Ortak locale+theme
    bootstrap'i `app-surface-locale.ts`'e çıkarıldı (5 kopya yerine 1 hook).
12. [x] `tabs-internal-page-view.ts`: `REAL_PAGE_BASE_URLS`'e beş URL eklendi.
13. [x] `App-content.tsx`: 5 React overlay branch'i kaldırıldı; artık sadece new-tab + extension `page`
    surface'ları render ediyor. Bu overlay'lere ÖZEL veri bağlamaları
    (`downloadList`/`uploadList`/`historyList`/`getBookmarkTree`/`bookmarksVersion` vb.)
    `App-content-model.ts`/`app-omnibox-history.ts`/`app-bookmarks.ts`'ten de temizlendi — hâlâ BAŞKA
    bir yerde kullanılanlar (`onBookmarkMove`, bar/omnibox'un kendi bağlamaları) korundu.
14. [x] `e2e/tepegoz-internal-pages.spec.ts`: beş sayfanın hepsi gerçek içerik render ediyor
    (`innerText.length > 0`) — tek testte tümü.

**Faz 3'te bilinçli olarak bırakılan tek küçük davranış farkı:** Extensions sayfasından bir uzantıyı
kapatmak artık O uzantının chrome'daki AÇIK sidebar panelini/popup'ını OTOMATİK kapatmıyor (eskiden
`App.tsx#onToggleExtension` aynı dokümanda olduğu için yapabiliyordu; artık ayrı bir doküman, chrome'un
panel state'ine erişemiyor). Uzantı yine de devre dışı kalıyor — sadece zaten açık bir panel, kullanıcı
onunla bir sonraki etkileşimine kadar açık kalabilir. `ExtensionsPageSurface.tsx`'in doc comment'inde
kayıtlı.

**`tepegoz://tasks` taşınmadı:** Hiçbir renderer kodu şu an bu URL'i render etmiyor (`@tepegoz/tasks-ui`
sadece main-process URL sabitlerinde referans veriliyor) — taşınacak bir UI yok, Tasks ürün
yeniden tasarımı beklemede.

## 5. Test / doğrulama

- **Birim:** `protocol.test.ts` (21 test) — handler host/path allowlist (6 host için), inline edilen
  script/style/icon içeriğinin gerçekten gömülü olduğu, CSP hash'lerinin doğruluğu, cache'in farklı
  host'lar arasında PAYLAŞILDIĞI, favicon-okuma başarısızlığının zarifçe düşmesi — VE "safe embedding of
  real-world bundle content" başlığı altında yukarıdaki iki gerçek hatanın minimal tekrarları (`"$&"`
  içeren içerik orijinal tag'i geri enjekte etmiyor; escape'siz `<script>` içeren içerik doğru şekilde
  escape'leniyor ve tek script tag'i üçe bölünmüyor).
- **E2E:** `e2e/tepegoz-settings-page.spec.ts` — settings gerçek içerik render ediyor VE sağ tık →
  `page-context-menu` popup'ı açılıyor. `e2e/tepegoz-internal-pages.spec.ts` — diğer beş sayfanın hepsi
  gerçek içerik render ediyor VE reload sonrası sıfır CSP-ihlali console-message'ı var (bu kontrol,
  GERÇEK bundle'a karşı yukarıdaki iki hatayı asıl yakalayan kontroldür — `innerText.length > 0` tek
  başına yeterli değildi). Tam suite regresyonsuz geçti (önceden var olan, alakasız flake'ler hariç —
  `platform-defaults.spec.ts` kamera izni testi, `ime-turkish-text.spec.ts` bir kez gözlendi ve
  izolasyonda geçtiği doğrulandı → makine kaynak baskısı flake'i, kod ile ilgisi yok).
- `pnpm exec turbo run typecheck lint test build` + `pnpm e2e` — hepsi yeşil.

## 6. Rollback

Sayfa bazında: `tabs-internal-page-view.ts`'teki `REAL_PAGE_BASE_URLS`'ten ilgili URL'i çıkarmak,
`App-content.tsx`'e o sayfanın React overlay branch'ini geri koymak (git history'de mevcut,
`fe0aec4`'ten önceki hâl settings için, sonraki commit diğer beşi için). `internal-pages/protocol.ts`'in
`REAL_PAGE_HOSTS`'undan host'u çıkarmak tamamlayıcı adım — geri kalan altyapı kullanılmadan zararsız
kalır.

## 7. Açık sorular

- `tepegoz://tasks` için bir UI yazılıp bu deseni kullanacak mı, yoksa Tasks ürün yeniden tasarımı
  tamamen farklı bir yön mü alacak? Karar o iş başladığında verilecek.
- Faz 3'ün "bilinen kalıntı risk" notu (yukarıda) — Extensions sayfası ileride üçüncü taraf uzantı
  desteği kazanırsa (lazy-load'lu ikon/panel), bu kısıtlama o zaman yeniden değerlendirilmeli.
- `packages/settings-ui` (`SettingsLayout`/`settingsDict` kaynağı olarak kullanılıyor) ile
  `SettingsPage.tsx`/`SettingsPageSurface.tsx` arasındaki bölünme deseni, Faz 3'te
  `ExtensionsPage.tsx`/`ExtensionsPageSurface.tsx` gibi diğer sayfalarda da tekrarlandı — tutarlı.

---

## İlişki: [express-settings.md](express-settings.md)

O belge **geçersiz kılınmadı, uygulanmayacak** olarak işaretli kalıyor. Bu belge onun Ek A'sının resmî,
uygulamaya alınan devamıdır. `tracks/README.md` bu ilişkiyi yansıtacak şekilde güncellendi.
