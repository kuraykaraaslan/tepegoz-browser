# Plan — ext-agent'i Claude Chrome Seviyesine Yaklastirma

**Durum:** Uygulama basladi, bu noktada durduruldu.
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
| 2. Browser Reliability | Devam ediyor | TabId scoped browser tools ve sayfa dogrulama tamamlandi; vision/download/upload/clipboard kaldi. |
| 3. Task Productization | Baslamadi | Saved tasks, artifacts, scheduler, templates ve dashboard. |
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
- [ ] Screenshot/vision fallback ekle: metin/a11y yetersiz kalinca hedef sekmeden goruntu alip modele
  kontrollu baglam olarak aktar.
- [ ] Download/upload/clipboard araclarini policy-gated sekilde ekle.
- [ ] Action recovery ekle: click/fill sonrasi beklenen degisim yoksa yeniden snapshot ve alternatif
  selector denemesi.
- [ ] Form ve tablo senaryolari icin fixtures ekle.

## Faz 3 — Task Productization

- [ ] Saved tasks modeli: kullanicinin tekrarli gorevleri isim, prompt, izin kapsami ve hedef tab/site
  ile kaydetmesi.
- [ ] Artifacts modeli: ajan ciktilarini panelde indirilebilir/yeniden kullanilabilir nesneler olarak
  tutma.
- [ ] Scheduler: kullanici onayli, sinirli ve gorunur zamanlanmis gorevler.
- [ ] Templates: arastirma, form doldurma, tablo cikarimi, fiyat karsilastirma gibi baslangic
  sablonlari.
- [ ] Run dashboard: calisan/biten/hata alan gorevleri ve replay linklerini tek yerde gosterme.

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

## Siradaki En Mantikli Dilim

Bu noktadan sonra uygulanacak ilk dilim **Browser Reliability / screenshot-vision fallback** olmali.
Sebep: Faz 1 artik stale selector, timeout, page changed ve malformed model durumlarini siniflandirip
toparlanma talimati uretiyor. DOM/a11y + `browser_validate_page` yetersiz kaldiginda bir sonraki eksik
parca hedef sekmeden kontrollu screenshot alip modele goruntu baglami verebilmek.

Onerilen ilk is:

- [ ] `BrowserHost.captureScreenshot(tabId?)` seam'i ekle.
- [ ] `browser_get_screenshot` veya vision-only fallback tool'u policy-gated sekilde ekle.
- [ ] Reactor recovery yolunda DOM/a11y yetersizse screenshot aracini oner.
- [ ] Unit test: DOM bos / action dogrulanamadi / screenshot fallback sirasi.

Bu dosya kaydedildikten sonra is burada durduruldu.
