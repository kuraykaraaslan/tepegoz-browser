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

## Faz Durumu

| Faz | Durum | Not |
|-----|-------|-----|
| 1. Agent Reliability | Devam ediyor | Run izolasyonu ve baslangic hata gorunurlugu tamamlandi; recovery/eval kaldi. |
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
- [ ] Run state machine'i acik durum gecisleriyle toparla: requested, planning, awaiting plan,
  executing, paused, done, error, cancelled.
- [ ] Resume/checkpoint tasarla: son basarili adim, sayfa/tab snapshot referansi ve kullanici karari
  birlikte saklanmali.
- [ ] Hata siniflandirmasi ekle: transient, policy denied, page changed, selector stale, navigation
  timeout, auth/handoff, model malformed.
- [ ] Retry/recovery stratejisi ekle: selector stale ise yeniden snapshot, navigation timeout ise
  validate/read fallback, model malformed ise bounded repair.
- [ ] Eval harness ekle: runtime kararlarini mock host ile deterministik test eden senaryolar.

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

## Siradaki En Mantikli Dilim

Bu noktadan sonra uygulanacak ilk dilim **Agent Reliability / hata siniflandirmasi + recovery** olmali.
Sebep: tabId scoped tools ve page validation artik var; ajan bir aksiyon basarisiz oldugunda bunu
siniflandirip toparlanmayi deneyemezse Claude seviyesinde "sureci yonetme" hissi eksik kalir.

Onerilen ilk is:

- [ ] `AgentRuntimeErrorKind` veya benzeri kucuk bir hata taksonomisi ekle.
- [ ] Browser tool hatalarini bu taksonomiye map et.
- [ ] Reactor prompt'una "dogrulama basarisizsa once snapshot/readPage ile toparlan" kurali ekle.
- [ ] Unit test: stale element / navigation timeout / policy denied ayrimi.

Bu dosya kaydedildikten sonra is burada durduruldu.
