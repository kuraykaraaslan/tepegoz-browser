# Plan — `tepegoz://` sistem sayfalarının `protocol.handle` ile gerçek sayfa olarak sunulması

**Durum:** Kabul edildi, uygulanıyor (2026-08-26) — [express-settings.md](express-settings.md) Ek A'nın
büyütülmüş hâli; Express soket yolu **reddedildi**.
**Tarih:** 2026-08-26
**Kapsam:** `tepegoz://settings` (ve zamanla diğer iç sayfalar: `extensions`, `history`, `downloads`,
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
| R3 | **Playwright `_electron` window-discovery precedent.** `chrome-url.ts:9-19`'da kayıtlı: `app://chrome/index.html` gibi özel bir scheme ana chrome penceresi için denenmiş ve **geri alınmış**, çünkü Playwright `firstWindow()` non-standart scheme'deki pencereleri göremiyor. Buradaki fark: `tepegoz://` sadece bir **`WebContentsView`'in içeriği** olacak, üstteki `BrowserWindow` yine `file://`/dev-server'dan yükleniyor olacak — yani `firstWindow()` etkilenmemeli. Ama bu **doğrulanmadan** varsayım olarak bırakılamaz. | **İş kalemi 0** (aşağıda) tam olarak bunu izole şekilde kanıtlamak için var — TabManager'a dokunmadan önce. |
| R4 | `tepegoz://` sayfası içinde de agent'ın "internal tab'ların `webContents`'i yok" varsayımı kırılır ([tabs-window-nav.ts:185-190](../../apps/desktop/src/main/tabs-window-nav.ts#L185-L190) `activeWebContents()`, [tabs-window-closing.ts:144-151](../../apps/desktop/src/main/tabs-window-closing.ts#L144-L151) `viewlessActiveTabId()`) — screenshot/perception/devtools-gate/agent-newtab-replace mantığının hepsi bu invaryanta bağlı. | Bu değişiklik **TabManager'a dokunan** ayrı, kendi başına gözden geçirilecek bir iş kalemi (§5 Faz 2) — aynı PR'da Faz 0/1 ile birleştirilmeyecek. |

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

**Faz 0 — İzole kanıt (bu oturumda uygulanıyor, TabManager'a DOKUNMUYOR):**
1. `protocol.registerSchemesAsPrivileged` kaydı (module scope, `app.whenReady()`'den önce).
2. `internal-pages/protocol.ts`: `protocol.handle('tepegoz', …)` — sabit bir host→HTML allowlist'i
   (başlangıçta tek bir statik "smoke test" sayfası), path traversal reddi, CSP header'ları.
3. Birim testler: bilinen host → 200 + doğru CSP header; bilinmeyen host → 404; `../` içeren path → 400/reddedilir.
4. **Playwright doğrulaması (R3):** mevcut e2e harness'ında, `tepegoz://` içeriğini bir `WebContentsView`
   içine yükleyen izole bir manuel/otomatik kontrol — `firstWindow()`'ın hâlâ çözüldüğünü kanıtlar.
   Bu adım geçmeden Faz 2'ye geçilmez.

**Faz 1 — Ayar sayfası pilot build (ayrı PR):**
5. `SettingsPage.tsx`'in (veya `packages/settings-ui`'ın) yüklenebilir bağımsız bir HTML/JS bundle'ına
   taşınması (ayrı bir Vite build hedefi) — Express taslağının 9. iş kalemiyle aynı iş, sadece hedef URL
   `http://127.0.0.1:<port>/` değil `tepegoz://settings`.
6. `internal-pages/protocol.ts`'in allowlist'ine gerçek settings bundle'ı eklenmesi.

**Faz 2 — TabManager entegrasyonu (ayrı PR, kendi review'ı):**
7. `openInternalPage`/`navigateActive`'in settings için gerçek bir `WebContentsView` oluşturması
   (`tepegoz://settings` yükleyerek), `viewlessActiveTabId()`/`activeWebContents()`/screenshot/devtools-gate
   çağrı noktalarının bu değişiklikle uyumlu hâle getirilmesi — R4'ün tam kapsamı.
8. `page-context-menu.ts`'in artık bu view için de tetiklendiğinin doğrulanması (asıl kabul kriteri).
9. i18n: mevcut `defineDict`/`pick` çekirdeği zaten React-bağımsız; bundle'ın kendi entry'sinde
   `useT`/`I18nProvider` React tarafı aynen kullanılabilir (Express taslağının §7'sinde tespit edilen
   uyumluluk burada da geçerli — herhangi bir yeniden yazım gerekmiyor).

**Faz 3+ — Diğer iç sayfalar:** `extensions`/`history`/`downloads`/`uploads`/`bookmarks`/`tasks` aynı
kalıpla, talep/öncelik sırasına göre, her biri kendi PR'ı.

## 5. Test / doğrulama

- **Birim (Faz 0):** handler route allowlist, path-traversal reddi, CSP header varlığı.
- **E2E (Faz 0 doğrulama, Faz 2 kabul kriteri):** Playwright `_electron` `firstWindow()` hâlâ çözülüyor;
  Faz 2 sonrası `tepegoz://settings` açık sağ tık → context menu **görünür**.
- `pnpm exec turbo run typecheck lint test build` her fazın sonunda.

## 6. Rollback

Faz 0 hiçbir mevcut davranışı değiştirmiyor (yeni, kullanılmayan bir protokol kaydı + izole test sayfası)
— rollback'i `internal-pages/protocol.ts`'i silmek kadar basit. Faz 2 rollback'i: `openInternalPage`
settings için eski chrome-overlay yoluna geri döner (feature flag ya da basit revert).

## 7. Açık sorular

- Faz 2'de `settings` dışındaki sayfalar aynı PR'da mı, yoksa her biri ayrı mı taşınacak? (Öneri: ayrı —
  her biri kendi review yüzeyi.)
- `packages/settings-ui` (şu an `apps/desktop`'ta kullanılmayan, `coming-soon-card`/`settings-layout`
  içeren bir iskelet) Faz 1'in hedefi mi, yoksa mevcut `SettingsPage.tsx` mi taşınacak? Karar Faz 1
  başında verilecek.

---

## İlişki: [express-settings.md](express-settings.md)

O belge **geçersiz kılınmadı, uygulanmayacak** olarak işaretli kalıyor. Bu belge onun Ek A'sının resmî,
uygulamaya alınan devamıdır. `tracks/README.md` bu ilişkiyi yansıtacak şekilde güncellendi.
