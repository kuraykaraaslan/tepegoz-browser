# Plan — ext-agent'i Claude Chrome Seviyesine Yaklastirma

**Durum:** Faz 1 ve Faz 2 tamamlandi; Faz 3 Task Productization tamamlandi.
**Tarih:** 2026-07-06
**Kapsam:** `extensions/ext-agent`, agent runtime, browser/tab tools, desktop host baglantilari ve
ilgili dokumantasyon.

Bu planin amaci `extensions/ext-agent` yuzeyini Claude Chrome benzeri cok adimli, cok sekmeli ve
guvenilir bir tarayici ajani haline getirmek. Arastirma notu olarak
[`docs/new/claude-versus.md`](../docs/new/claude-versus.md) kullanildi; uygulama onceligi ise guncel
TypeScript sozlesmeleri, ADR'ler ve mevcut kod gercekligi uzerinden verildi.

## Kayitli kararlar

- Mevcut sistem yalnizca prototip degil: plan onayi, autonomy seviyeleri, tab-group bazli konusma
  bellegi, replay timeline, token gorunurlugu, CAPTCHA/2FA handoff, Event Journal, CDP/a11y
  etkilesimi, `ToolGateway`/`PolicyKernel`, MCP client ve dosya sandbox araci zaten var.
- Bu yuzden ana bosluk "tum bu ozellikleri eklemek" degil; run lifecycle, recovery, tabId scoped
  browser tools, action verification, screenshot/vision fallback ve eval/acceptance setlerini
  guvenilir hale getirmek.
- Uygulama kucuk ve commitlenebilir dilimlerle ilerleyecek. Her dilim kendi test/typecheck/lint
  dogrulamasindan gececek.
- Bu plandan devam eden her uygulama diliminde **iki yer birlikte guncellenecek**:
  1. Bu dosyadaki ilgili checkbox/durum satiri.
  2. Asil faz dosyalari: `phases/README.md` ve is hangi faza denk geliyorsa o faz dosyasi
     (`phase-1a`, `phase-1b`, `phase-6` vb.).
  Plan ve fazlar ayrismayacak; commit atmadan once tamamlanan isler iki tarafta da isaretlenecek.

## Faz Durumu

| Faz | Durum | Not |
|-----|-------|-----|
| 1. Agent Reliability | Tamamlandi | Run izolasyonu, state machine/checkpoint, hata siniflandirmasi, recovery ve eval testleri tamamlandi. |
| 2. Browser Reliability | Tamamlandi | TabId scoped browser tools, sayfa dogrulama, screenshot/fullPage visual fallback, action recovery, fixtures ve download/upload/clipboard brokerlari tamamlandi. |
| 3. Task Productization | Tamamlandi | Task domain/persistence/scheduler, background runner, `tepegoz://tasks`, task tools ve preapproved policy entegrasyonu tamamlandi. |
| 4. Tool Ecosystem | Baslamadi | Web search/fetch, servis adaptorleri ve MCP/policy genisletmeleri. |
| 5. Acceptance/Eval | Baslamadi | Claude benzeri is senaryolari icin otomatik kabul setleri. |

## Faz 1 — Agent Reliability

- [x] `ToolGateway.runWithHandlers` eklendi; HITL/audit handler context'i run bazinda izole edildi.
- [x] `agent-runtime`, tool cagrilarini scoped handler context'iyle calistiriyor.
- [x] Main process tarafinda run controller kaydi eklendi; `cancelAgent` gercek calisan run'i iptal
  edebiliyor.
- [x] Gecici tek aktif run korumasi eklendi; mevcut UI/host sinirlari netlesene kadar paralel run
  cakismalari engelleniyor.
- [x] Panel, event stream baslamadan reddedilen `runAgent` hatalarini ayni turn icinde yerel `error`
  event'i olarak gosteriyor.
- [x] Panel hata fallback metinleri EN/TR i18n sozluklerine eklendi.
- [x] Run state machine'i acik durum gecisleriyle toparla: requested, planning, awaiting plan,
  executing, paused, done, error, cancelled.
- [x] Resume/checkpoint tasarla: son basarili adim, sayfa/tab snapshot referansi ve kullanici karari
  birlikte saklanmali.
- [x] Hata siniflandirmasi ekle: transient, policy denied, page changed, selector stale, navigation
  timeout, auth/handoff, model malformed.
- [x] Retry/recovery stratejisi ekle: selector stale ise yeniden snapshot, navigation timeout ise
  validate/read fallback, model malformed ise bounded repair.
- [x] Eval harness ekle: runtime kararlarini mock host ile deterministik test eden senaryolar.

## Faz 2 — Browser Reliability

- [x] Sekme araclari genisletildi: `tab_create_item`, `tab_get_item`, `tab_update_item`,
  `tab_delete_item`.
- [x] `tab_create_item` varsayilan olarak arka planda sekme aciyor ve active durumunu donduruyor.
- [x] Desktop TabHost, sekme aktive etme/kapatma/arka planda olusturma aksiyonlarini destekliyor.
- [x] BrowserHost aktif-sekme odakli API'den tab-aware API'ye tasindi:
  `navigate`, `readPage`, `snapshotElements`, `clickElement`, `fillElement`, `pressKey`,
  `scrollPage`.
- [x] `browser_*` tool semalari opsiyonel `tabId` kabul ediyor.
- [x] Desktop browser host hedef `WebContents`'i `tabId` ile cozuyor; arka plan sekme aksiyonlarinda
  gorunur human-input adapter'ina bagimli kalmiyor.
- [x] CDP element ref map'leri `WebContents` bazinda ayrildi; bir sekmenin snapshot'i diger sekmenin
  ref'lerini gecersiz kilmiyor.
- [x] Agent runtime, `tabId` iceren tool cagrilarinda hedef URL'yi `tabUrl(tabId)` ile alip policy
  context'ine isliyor.
- [x] `browser_validate_page` eklendi: load bekleme, sayfa okuma ve opsiyonel metin dogrulama yapiyor.
- [x] Planner/reactor prompt'lari navigasyon ve sayfa aksiyonlari sonrasi dogrulama yapacak sekilde
  guncellendi.
- [x] Screenshot/vision fallback ekle: `@tepegoz/screenshots` ve `browser_get_screenshot` hedef
  sekmeden viewport veya bounded fullPage PNG alip modele kontrollu, untrusted visual context olarak aktarir.
- [x] Download/upload/clipboard araclarini policy-gated sekilde ekle.
  - [x] Slice 1: `@tepegoz/downloads` ve `@tepegoz/clipboard` domain paketleri, IPC/preload
    kontratlari, preferences alanlari ve phase/layer kurallari eklendi.
  - [x] Slice 2: DownloadService + quarantine + Electron `will-download` adapter + SQLite projection +
    redacted Event Journal audit eklendi.
  - [x] Slice 3: `@tepegoz/downloads-ui`, `tepegoz://downloads`, main-menu action ve download settings.
  - [x] Slice 4: ClipboardService + generic WebPermissionBroker; notification akisi korunarak clipboard
    read/write site izinleri eklendi.
  - [x] Slice 5: `download_*` / `clipboard_*` capability tools + HITL/idempotency entegrasyonu.
  - [x] Upload Slice 1: `@tepegoz/uploads` domain paketi, zod schemas, `upload_*` tool registration,
    IPC contract kanallari ve layer kurali eklendi.
  - [x] Upload Slice 2: UploadService + CDP file input binding + file sandbox preflight + redacted audit.
  - [x] Upload Slice 3: `tepegoz://uploads` UI, preload/IPC wiring, menu/navigation ve phase/docs tamamlama.
  - [x] Combined transfer activity: toolbar indicator + tek popup icinde recent download/upload listesi.
- [x] Action recovery ekle: click/fill sonrasi beklenen degisim yoksa `changed=false` + recovery hint ile
  yeniden element snapshot ve alternatif selector denemesi promptlanir.
- [x] Form ve tablo senaryolari icin fixtures ekle.

## Faz 3 — Task Productization

- [x] Saved tasks modeli: kullanicinin tekrarli gorevleri isim, prompt, izin kapsami ve hedef tab/site
  ile kaydetmesi.
  - [x] Slice 1 foundation: `@tepegoz/tasks` public types, reducers/selectors, zod schemas, layer kuralı
    ve Capability Plane descriptorlari eklendi.
  - [x] Slice 5 UI/IPC: `tasks:*` IPC/preload bridge, `@tepegoz/tasks-ui`, `tepegoz://tasks` internal
    page ve Agent panelden disabled task draft kaydetme affordance'i eklendi.
  - [x] Slice 6 tools: `task_*` Capability Plane tools desktop `TaskService` host'una baglandi.
- [x] Artifacts modeli: ajan ciktilarini panelde indirilebilir/yeniden kullanilabilir nesneler olarak
  tutma.
  - [x] Slice 2 projection: `task_runs`, `task_artifacts` ve `task_trigger_state` SQLite tabloları ile
    `TaskStore` eklendi.
- [x] Scheduler: kullanici onayli, sinirli ve gorunur zamanlanmis gorevler.
  - [x] Trigger contract: `manual`, `interval`, `pageChange`, disabled `external` placeholder ve
    preapproved-write policy modeli tanimlandi.
  - [x] Slice 3 service: desktop `TaskService`, interval scheduler, page-change baseline/diff, queue
    coalescing, notifications ve redacted Event Journal audit eklendi.
- [x] Templates: Faz 3 V1'de template kutuphanesi yerine Agent panelden "Save as task" draft akisi
  tamamlandi; hazir arastirma/form/tablo/fiyat template seti Faz 5 acceptance/eval senaryolarina devredildi.
- [x] Run dashboard: calisan/biten/hata alan gorevleri ve replay linklerini tek yerde gosterme.
  - [x] Slice 4 launcher: panel run ve task run ortak agent-run lock kullaniyor; scheduled/background
    task run'lari renderer sender olmadan AgentService'e baglanabiliyor.
  - [x] Slice 5 dashboard: saved task listesi, run-now, enable/disable, run history ve artifact listesi
    renderer state push ile guncelleniyor.
  - [x] Slice 6 policy: background task run'lari state-changing tool HITL'ini yalnizca saved task'in
    exact origin + preapproved write tool policy'si icindeyse otomatik onayliyor; aksi halde paused/notify.

## Faz 4 — Tool Ecosystem

- [ ] Web search/fetch araclarini mevcut `ToolGateway` ve `PolicyKernel` uzerinden yayinla.
- [ ] Servis adaptorleri icin izin modeli: Gmail/Drive/Docs benzeri hesap baglantilari her zaman
  acik izin ve audit event'i uretmeli.
- [ ] MCP araclarini kategori, risk ve arguman semasi ile panelde gorunur kil.
- [ ] Tool sonuc sozlesmelerini normalize et: ok/error, summary, artifact refs, page refs.

## Faz 5 — Acceptance/Eval

- [ ] Kabul senaryosu: "Bu sayfadaki basliklari cikar ve ozetle."
- [ ] Kabul senaryosu: "Uc sekmede kaynak ac, ortak bulgulari tablo yap."
- [ ] Kabul senaryosu: "Formu verilen bilgilerle doldur, gondermeden once dur."
- [ ] Kabul senaryosu: "Sayfa degisti/tiklama tutmadi; kendini toparlayip tekrar dene."
- [ ] Kabul senaryosu: "CAPTCHA/2FA gorunce otomatik cozme, handoff ver."
- [ ] Metrikler: task success rate, recovery success rate, approval latency, tool error rate,
  navigation validation failure rate, token usage.

## Dogrulama Kaydi

- [x] `pnpm --filter @tepegoz/capability-plane test`
- [x] `pnpm --filter @tepegoz/capability-plane typecheck`
- [x] `pnpm --filter @tepegoz/capability-plane lint`
- [x] `pnpm --filter @tepegoz/agent-runtime test`
- [x] `pnpm --filter @tepegoz/agent-runtime typecheck`
- [x] `pnpm --filter @tepegoz/agent-runtime lint`
- [x] `pnpm --filter @tepegoz/orchestrator test`
- [x] `pnpm --filter @tepegoz/orchestrator typecheck`
- [x] `pnpm --filter @tepegoz/orchestrator lint`
- [x] `pnpm --filter @tepegoz/browser-tools test`
- [x] `pnpm --filter @tepegoz/browser-tools typecheck`
- [x] `pnpm --filter @tepegoz/browser-tools lint`
- [x] `pnpm --filter @tepegoz/tab-engine test`
- [x] `pnpm --filter @tepegoz/tab-engine typecheck`
- [x] `pnpm --filter @tepegoz/tab-engine lint`
- [x] `pnpm --filter @tepegoz/desktop typecheck`
- [x] `pnpm --filter @tepegoz/desktop lint`
- [x] `pnpm --filter @tepegoz/ext-agent typecheck`
- [x] `pnpm --filter @tepegoz/ext-agent test`
- [x] `pnpm --filter @tepegoz/ext-agent lint`

## Yapilan Commitler

- [x] `655ed50 Improve agent run reliability and tab controls`
- [x] `970b50d Scope browser agent tools to tabs`
- [x] `a1f6b07 Add browser page validation tool`
- [x] `285eee5 Mark agent roadmap phase progress`
- [x] `3aaa286 Surface agent startup failures in panel`
- [x] `6b9f626 Complete agent reliability phase`
- [x] `b6e3083 Add download and clipboard foundations`
- [x] `21224b2 Wire quarantined browser downloads`
- [x] `67b0555 Add downloads page and settings`
- [x] `3ed3a0e Centralize clipboard permissions`
- [x] `d000098 Register download and clipboard tools`
- [x] `a2937cc Add upload broker domain foundations`
- [x] `cf752c0 Wire upload broker service`
- [x] `d1684d6 Add uploads page and navigation`
- [x] `4dce586 Add combined transfer activity popup`
- [x] `84352e6 Add browser screenshot fallback package`
- [x] `cfaea44 Add task productization domain`
- [x] `9652a81 Add task persistence projections`
- [x] `8ae3adb Add desktop task scheduler service`
- [x] `793d5ec Add background task agent runner`

## Siradaki En Mantikli Dilim

Faz 2 Browser Reliability tamamlandi. Siradaki mantikli dilim Phase 3 Task Productization veya Phase 5
Acceptance/Eval kabul setlerini genisletmek; Phase 2c klasik browser essentials icinde kalan user-facing
find/print/PDF/reader/translate/screenshot-CAS isleri ayri urun yuzeyi olarak duruyor.

Download/clipboard icin kalan siradaki is:

- [x] DownloadService'i Electron `will-download` ile bagla.
- [x] Karantina path/store + hash + unknown SafeBrowsing verdict akisini uygula.
- [x] Download IPC handlerlari ve Event Journal audit eventlerini ekle.
- [x] Ardindan downloads UI/settings ve clipboard broker dilimine gec.
- [x] Siradaki: ClipboardService + generic WebPermissionBroker dilimine gec.
- [x] Siradaki: `download_*` / `clipboard_*` capability tools + HITL entegrasyonu.

Download/clipboard/upload track icin kod dilimleri tamamlandi. Kalan transfer guvenligi isi: gercek
SafeBrowsing provider/ADR ve manual UAT.

Upload broker icin aktif siradaki isler:

- [x] `@tepegoz/uploads` domain paketi + `upload_*` tool descriptorlari.
- [x] Desktop IPC zod-free contract ve main-only schema re-export.
- [x] UploadService, CDP `DOM.setFileInputFiles`, file sandbox preflight ve Event Journal audit.
- [x] Uploads UI/internal page/preload wiring.
- [x] Combined transfer activity toolbar indicator/popup.
- [x] Browser screenshot package + visual fallback: `@tepegoz/screenshots`, `browser_get_screenshot`,
      viewport/fullPage host adapter, action-recovery promptlari ve reactor fixtures.

Faz 3 Task Productization icin aktif siradaki isler:

- [x] Slice 1: `@tepegoz/tasks` package + schemas + `task_*` tool descriptorlari.
- [x] Slice 2: persistence migration + `TaskStore`, run/artifact projections, trigger state.
- [x] Slice 3: desktop `TaskService`, interval/page-change scheduler, queue/coalescing.
- [x] Slice 4: renderer-sender bagimsiz `AgentRunLauncher`.
- [x] Slice 5: IPC/preload + `@tepegoz/tasks-ui` + `tepegoz://tasks`.
- [x] Slice 6: task capability host + preapproved policy entegrasyonu.

## Ek Dogrulama Kaydi - Download/Clipboard Track

- [x] `pnpm --filter @tepegoz/downloads test`
- [x] `pnpm --filter @tepegoz/downloads typecheck`
- [x] `pnpm --filter @tepegoz/downloads lint`
- [x] `pnpm --filter @tepegoz/clipboard test`
- [x] `pnpm --filter @tepegoz/clipboard typecheck`
- [x] `pnpm --filter @tepegoz/clipboard lint`
- [x] `pnpm --filter @tepegoz/desktop-ipc typecheck`
- [x] `pnpm --filter @tepegoz/preferences typecheck`
- [x] `pnpm --filter @tepegoz/persistence typecheck`
- [x] `pnpm --filter @tepegoz/persistence lint`
- [x] `pnpm --filter @tepegoz/desktop typecheck`
- [x] `pnpm --filter @tepegoz/desktop lint`
- [x] `pnpm --filter @tepegoz/downloads-ui test`
- [x] `pnpm --filter @tepegoz/downloads-ui typecheck`
- [x] `pnpm --filter @tepegoz/downloads-ui lint`
- [x] `pnpm --filter @tepegoz/settings-ui test`
- [x] `pnpm --filter @tepegoz/settings-ui typecheck`
- [x] `pnpm --filter @tepegoz/navigation test`
- [x] `pnpm --filter @tepegoz/notifications-ui test`
- [x] `pnpm --filter @tepegoz/notifications-ui typecheck`
- [x] Slice 5 tekrar dogrulamalari: `pnpm --filter @tepegoz/downloads test/typecheck/lint`
- [x] Slice 5 tekrar dogrulamalari: `pnpm --filter @tepegoz/clipboard test/typecheck/lint`
- [x] Slice 5 tekrar dogrulamalari: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Slice 5 tekrar dogrulamalari: `pnpm --filter @tepegoz/desktop-ipc typecheck`
- [x] Upload Slice 1: `pnpm --filter @tepegoz/uploads test/typecheck/lint`
- [x] Upload Slice 1: `pnpm --filter @tepegoz/desktop-ipc typecheck/lint`
- [x] Upload Slice 2: `pnpm --filter @tepegoz/tool-executor test/typecheck/lint`
- [x] Upload Slice 2: `pnpm --filter @tepegoz/browser-tools test/typecheck/lint`
- [x] Upload Slice 2: `pnpm --filter @tepegoz/shared-types test/typecheck`
- [x] Upload Slice 2: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/uploads-ui test/typecheck/lint`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/browser-tools test/typecheck/lint`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/navigation test`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/ui typecheck`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/desktop-ipc typecheck`
- [x] Upload Slice 3: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Combined transfer activity: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Combined transfer activity: `pnpm --filter @tepegoz/ui typecheck`
- [x] Screenshot fallback: `pnpm --filter @tepegoz/screenshots test/typecheck/lint`
- [x] Screenshot fallback: `pnpm --filter @tepegoz/browser-tools test/typecheck/lint`
- [x] Screenshot fallback: `pnpm --filter @tepegoz/orchestrator test/typecheck/lint`
- [x] Screenshot fallback: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Screenshot fallback: `git diff --check`
- [x] Task Slice 1: `pnpm --filter @tepegoz/tasks test/typecheck/lint`
- [x] Task Slice 2: `pnpm --filter @tepegoz/persistence typecheck/lint`
- [x] Task Slice 2: `pnpm --filter @tepegoz/shared-types test/typecheck/lint`
- [ ] Task Slice 2: `pnpm --filter @tepegoz/persistence test` — blocked by local native ABI mismatch:
  `better-sqlite3.node` was compiled for NODE_MODULE_VERSION 130; current Node requires 127.
- [x] Task Slice 3: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Task Slice 3: `pnpm --filter @tepegoz/tasks test/typecheck/lint`
- [x] Task Slice 4: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Task Slice 5: `pnpm --filter @tepegoz/tasks-ui test/typecheck/lint`
- [x] Task Slice 5: `pnpm --filter @tepegoz/desktop-ipc typecheck/lint`
- [x] Task Slice 5: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Task Slice 5: `pnpm --filter @tepegoz/ext-agent typecheck/lint`
- [x] Task Slice 5: `pnpm --filter @tepegoz/ui typecheck/lint`
- [x] Task Slice 5: `git diff --check`
- [ ] Task Slice 5: source-scoped `depcruise packages apps/desktop/src` — blocked by existing repo-wide
  `not-to-dev-dep` / generated `out/` / menu cycle debt; new `tasks-ui-is-a-leaf` rule was added.
- [x] Task Slice 6: `pnpm --filter @tepegoz/capability-plane test/typecheck/lint`
- [x] Task Slice 6: `pnpm --filter @tepegoz/tasks test/typecheck/lint`
- [x] Task Slice 6: `pnpm --filter @tepegoz/desktop typecheck/lint`
- [x] Upload Slice 3: `git diff --check`
- [ ] Upload Slice 3: `pnpm depcruise` — blocked by stale generated desktop output:
  `apps/desktop/out/main/node-B4hO7KOT.js` references a missing file during dependency extraction.
- [ ] Upload Slice 3: source-scoped `depcruise packages apps/desktop/src` — blocked by existing repo-wide
  `not-to-dev-dep` / menu cycle debt; includes the same React peer/dev classification already present in
  other UI leaf packages.
- [ ] `pnpm --filter @tepegoz/persistence test` — blocked by local native ABI mismatch:
  `better-sqlite3.node` was compiled for NODE_MODULE_VERSION 130; current Node requires 127.

Bu dosya bundan sonra da her committe asil faz dosyalariyla birlikte guncellenecek.
