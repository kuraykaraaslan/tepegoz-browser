# Plan — Dahili Express ile Ayar Sayfalarının Sunulması

**Durum:** Öneri (implementasyon öncesi onay bekliyor)
**Tarih:** 2026-07-06
**Kapsam:** `tepegoz://settings` (ve isteğe bağlı diğer iç sayfalar) içeriğinin, güvenilir chrome
React render'ı yerine, **loopback'e bağlı, gizli-token korumalı** dahili bir HTTP (Express)
sunucusundan gerçek sayfa olarak sunulması.

## 1. Motivasyon

İç sayfalar (`tepegoz://…`) şu an gerçek bir Electron protokolü değil; chrome renderer'ın "hangi
React bileşenini göstereyim" diye eşleştirdiği bir string kuralı. Bu yüzden bu sayfaların **gerçek
sayfa semantiği yok**: main process'in `WebContentsView` `context-menu` event'i fire etmiyor
(bkz. [page-context-menu.ts:11-13](../apps/desktop/src/main/menus/page-context-menu.ts#L11-L13)),
dolayısıyla sağ tık menüsü çalışmıyor. Ctrl+F, view-source gibi native davranışlar da yok.

Amaç: ayar sayfalarını gerçek bir `WebContentsView`'e yüklenen sayfalara dönüştürerek native sayfa
davranışlarını kazanmak.

> **Mimari uyarı (kayda geçirildi).** Express, projenin bağlayıcı kurallarına (`renderer is
> untrusted; typed contextBridge only`, security-by-design, local-first) yeni bir HTTP trust
> boundary ve dinleyen bir TCP soketi ekler. Aşağıdaki sertleştirme önlemlerinin **tamamı birlikte**
> uygulanmadıkça bu yaklaşım bir güvenlik regresyonudur. Daha düşük saldırı yüzeyli alternatif
> (`protocol.handle('tepegoz', …)`, soketsiz) Ek A'da kayıtlıdır ve context-menu sorununu bedavaya
> çözer. Bu plan, Express yolu bilinçli tercih edildiği için yazılmıştır.

## 2. Tehdit modeli

| # | Tehdit | Vektör | Karşı önlem |
|---|--------|--------|-------------|
| T1 | LAN'daki başka makine sunucuya erişir | `0.0.0.0` bind | M1 loopback-only bind |
| T2 | Kötü niyetli web sitesi kurbanın tarayıcısından istek attırır | DNS rebinding (`Host: evil.com` → 127.0.0.1) | M3 Host allowlist + M4 Origin doğrulama |
| T3 | Yerel başka bir uygulama/sayfa `fetch('http://127.0.0.1:port')` yapar | Localhost erişilebilir | M5 per-session gizli token |
| T4 | Cross-origin form/GET ile mutasyon (CSRF) | `<form action=127.0.0.1>` | M6 custom-header token (preflight zorlar) + M4 |
| T5 | Ayar sayfasında XSS → token/ayar sızması | Enjeksiyon | M7 sıkı CSP + M9 sanitizasyon |
| T6 | Güvenilmez body ile bozuk/kötü ayar yazımı | HTTP gövdesi | M8 her mutasyonda zod `safeParse` |
| T7 | Secret'ların (safeStorage) HTTP'den okunması/yazılması | Ayrıcalık yükseltme | M10 secret'lar HTTP yolundan asla geçmez |
| T8 | Port tahmini / kalıcı dinleme | Sabit port, sızıntı | M2 ephemeral port + M11 yaşam döngüsü |

## 3. Güvenlik önlemleri (hepsi zorunlu)

- **M1 — Loopback-only bind.** `server.listen(port, '127.0.0.1')`. Asla `0.0.0.0` / `::`.
- **M2 — Ephemeral random port.** `listen(0)` ile OS atasın; hardcode yok. Portu yalnızca main'de
  bellekte tut; log'lama.
- **M3 — Host header allowlist.** Middleware, `Host` header'ı tam olarak `127.0.0.1:<port>`
  (veya `localhost:<port>`) değilse `403` döner. DNS-rebinding saldırıları attacker hostname'iyle gelir.
- **M4 — Origin/Referer doğrulama.** `Origin` yoksa (same-document GET) veya tam olarak sunucunun
  kendi origin'i (`http://127.0.0.1:<port>`) ise geçir; aksi halde `403`. Origin yansıtma yok.
- **M5 — Per-session gizli token (capability).** App açılışında main'de `crypto.randomBytes(32)`
  ile üret. Bellekte tut, asla disk/log. Her istekte zorunlu.
- **M6 — Token'ı custom header'da taşı.** `X-Tepegoz-Token: <token>`. Custom header, basit
  cross-origin isteklerin set edemeyeceği bir alandır → CORS preflight'ı zorlar; preflight'ı
  reddederiz (M4). Cookie kullanılmaz (CSRF yüzeyini kapatır). Token, yüklenen sayfaya güvenli
  kanaldan (aşağıda M14) enjekte edilir.
- **M7 — Sıkı CSP.** Served her yanıt: `Content-Security-Policy: default-src 'self'; script-src
  'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. Inline
  script yok (gerekirse nonce). Ek olarak `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`.
- **M8 — HTTP sınırında zod `safeParse`.** Her mutasyon gövdesi güvenilmezdir; `@tepegoz/shared-types`
  şemasıyla parse edilir (IPC sınırındaki kuralın aynısı). Geçersizse `400`, `AppError` mapping'i.
- **M9 — Katı CORS.** `Access-Control-Allow-Origin: *` yasak. Sadece kendi origin; başka origin'e
  preflight `403`. `Access-Control-Allow-Credentials` kullanılmaz.
- **M10 — Secret'lar HTTP'den geçmez.** `safeStorage`'a dokunan ayarlar (API anahtarları vb.) HTTP
  endpoint'ine hiç açılmaz; bunlar mevcut ayrıcalıklı IPC yolundan (`@tepegoz/desktop-ipc`) yürür.
  HTTP sunucusu yalnızca secret-olmayan tercihleri sunar/yazar.
- **M11 — Yaşam döngüsü uygulamaya bağlı.** Sunucu `app.whenReady` içinde açılır, `before-quit` /
  `window-all-closed` ile `server.close()`. Ayar sekmesi kapanınca kapatmak opsiyonel optimizasyon.
- **M12 — Method + route allowlist.** Yalnızca beklenen `GET`/`POST` rotaları; diğer her şey `404`.
  Path traversal'a karşı static serve yerine allowlist'li elle yönlendirme.
- **M13 — Rate limiting.** Basit in-memory sayaç ile brute-force/gürültü sınırlama (token zaten
  32-byte, ama savunmada derinlik).
- **M14 — Token enjeksiyonu güvenli kanaldan.** Ayar sayfası WebContentsView'e yüklenirken token,
  URL query yerine tercihen preload üzerinden (yalnızca `http://127.0.0.1:<port>` origin'ine expose
  edilen tipli contextBridge kanalı) verilir; böylece token `webContents.getURL()`/geçmiş/log'a
  düşmez.

## 4. Mimari

```
main process
├─ settings-server.ts        (Express app; M1–M13 middleware zinciri)
│    ├─ auth middleware      (M3 Host, M4 Origin, M5/M6 token, M9 CORS)
│    ├─ GET  /               → paketlenmiş settings HTML (M7 CSP header)
│    ├─ GET  /assets/*       → allowlist'li static (M12)
│    ├─ GET  /api/prefs      → PreferenceStore snapshot (secret-hariç, M10)
│    └─ POST /api/prefs      → zod safeParse (M8) → PreferenceStore
├─ index.ts                  (whenReady → settingsServer.start(); before-quit → stop())
└─ window/preload            (M14 token bridge, sadece 127.0.0.1 origin'e)

renderer / WebContentsView
└─ http://127.0.0.1:<port>/  (ayar sayfası — gerçek WebContentsView → context-menu event fire eder)
```

- **Yeni paket/dosya:** `apps/desktop/src/main/settings-server/` (Express app + middleware +
  route'lar). Alternatif: `packages/settings-server` (yeniden kullanılabilir, i18n dict'i kendi
  `src/i18n/`'inde — ADR-0016).
- **Ayar UI'ı:** Mevcut `SettingsPage.tsx`'in yüklenebilir HTML entry'sine taşınması (Vite'ta ayrı
  bir entry / build hedefi). Secret-hariç tercih okuma/yazma `/api/prefs` üzerinden.
- **Şema kaynağı:** Yalnızca `@tepegoz/shared-types` (tercih DTO'ları `Pick`/`Omit` ile türetilir —
  inline yapısal kopya yok).

## 5. İş kalemleri (sırayla)

1. **Sunucu iskeleti.** `settings-server.ts`: Express app, `listen(0, '127.0.0.1')`, atanan portu
   döndür. Yaşam döngüsü hook'ları `index.ts`'e (`installSecurity()` yanına).
2. **Auth middleware zinciri (M3–M6, M9).** Sıra: Host → Origin/CORS → token. Her red `403`,
   gövdesiz. Birim testleri: rebinding (`Host: evil.com`), eksik/yanlış token, cross-origin
   preflight, doğru istek.
3. **Token üretimi + M14 bridge.** `randomBytes(32)`; preload'da 127.0.0.1 origin'e tipli expose.
4. **CSP + güvenlik header'ları (M7).** Tüm yanıtlarda; testle doğrula.
5. **`GET /` + static allowlist (M12).** Paketlenmiş HTML/asset servisi; path traversal testi.
6. **`GET /api/prefs`.** `PreferenceStore` snapshot, secret alanları **çıkararak** (M10).
7. **`POST /api/prefs` (M8).** zod `safeParse` → `PreferenceStore`; geçersiz gövde `400`;
   `AppError` mapping.
8. **Rate limit (M13)** + method/route allowlist (M12).
9. **Ayar UI entry'si.** `SettingsPage`'i yüklenebilir HTML'e taşı; `/api/prefs` fetch'lerinde
   token header'ı ekle.
10. **`tepegoz://settings` yönlendirmesi.** `navigateActive`/`openInternalPage`
    ([tabs.ts:468-473](../apps/desktop/src/main/tabs.ts#L468-L473)) settings için chrome-render yerine
    `http://127.0.0.1:<port>/` yükleyecek şekilde güncellenir. Adres çubuğu yine `tepegoz://settings`
    gösterir (URL maskeleme — kullanıcıya loopback IP'si sızmaz).
11. **Yaşam döngüsü kapanışı (M11).** `before-quit`/`window-all-closed` → `server.close()`.
12. **Localizasyon.** Yeni kullanıcı-facing string yok; varsa paket kendi dict'ini taşır (ADR-0016).

## 6. Test / doğrulama

- **Birim:** middleware red senaryoları (T1–T4, T6), `safeParse` reddi, secret-hariç snapshot (M10).
- **E2E (Playwright `_electron`):** `tepegoz://settings` aç → sağ tık → context menu **görünür**
  (asıl kabul kriteri); tercih değiştir → persist doğrula.
- **Güvenlik smoke:** harici origin'den `fetch('http://127.0.0.1:<port>/api/prefs')` **403**;
  yanlış Host header **403**; token'sız istek **403**.
- `pnpm exec turbo run typecheck lint test build` + `pnpm e2e`.

## 7. Rollback

Sunucu başlatma tek noktada (`index.ts`). Feature flag / tercih ile `tepegoz://settings` eski
chrome-render yoluna geri döndürülebilir; sunucu başlatılmazsa iç sayfa string-eşleştirme davranışı
korunur.

## 8. Açık sorular

- URL maskeleme: adres çubuğu `tepegoz://settings` gösterirken sayfa `127.0.0.1:<port>`'tan
  yükleniyor — bu ayrım kullanıcıya nasıl tutarlı sunulacak? (Phishing çağrışımından kaçınmak için.)
- Diğer iç sayfalar (extensions/history/bookmarks) da mı taşınacak, yoksa yalnızca settings mi?
- Port her açılışta değişecek → bookmark/geçmişte sabit `tepegoz://` kanonik kalmalı (loopback URL
  asla persist edilmemeli).

---

## Ek A — Alternatif: `protocol.handle('tepegoz', …)` (soketsiz, önerilen)

Aynı hedefi (gerçek sayfa + context menu) **dinleyen TCP soketi olmadan** sağlar:

```ts
protocol.registerSchemesAsPrivileged([
  { scheme: 'tepegoz', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
// whenReady sonrası:
protocol.handle('tepegoz', (req) => serveBundledPage(new URL(req.url).host));
```

- Context-menu **bedava** çalışır (gerçek WebContentsView → mevcut `page-context-menu.ts` devreye girer).
- Sıfır soket → DNS-rebinding imkânsız, firewall istemi yok, port çakışması yok, URL maskeleme sorunu yok.
- Yanıt main'de üretilir; `secure: true` origin ayrıcalıklı ve bundle'dan gelir.
- Trade-off: ayar UI'ı yine yüklenebilir HTML'e taşınmalı (bu plandaki İş 9 ile aynı iş).

Express'in bu plandaki sertleştirme setinin nihai hâli fonksiyonel olarak bu tasarıma yakınsar;
Ek A onu daha az hareketli parçayla sağlar. Karar Express yönündeyse bu plan geçerlidir.
