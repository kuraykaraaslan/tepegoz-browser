# Tepegöz vs Playwright MCP — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Playwright MCP** (Microsoft, Apache-2.0; `@playwright/mcp`
> `v0.0.80`; Playwright üzerine kurulu bir **Model Context Protocol sunucusu** — herhangi bir MCP
> istemcisine tarayıcı otomasyonu araçları verir) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya
> döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/playwright-mcp` deposunun (`README.md` — 1620 satır, tüm araç referansı + yapılandırma
> tablosu dâhil, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `config.d.ts`, `index.d.ts`, `server.json`,
> `package.json`, `cli.js`, `index.js`, `tests/{capabilities,core,click,library,cli}.spec.ts`,
> `tests/fixtures.ts`) okunmasından çıkarıldı. Not: çekirdek kaynak kod artık **Playwright monorepo**'suna
> taşınmış (`packages/playwright-core/src/tools/mcp` + `.../tools/backend`); bu checkout yalnızca yayımlanan
> paket kabuğunu, üretilen tam araç referansını ve testleri içeriyor — araç aileleri, yetenek (capability)
> modeli, "vision" opt-in'i ve tarayıcı yaşam döngüsü bunlardan birebir çıkarıldı.
>
> Tepegöz tarafı: `phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|
mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`,
> `docs/adr/*` aynı oturumda okundu.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`phases/tracks/README.md`'deki
> "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı haliyle
> korunan bir kayıttır.
>
> **İlgili:** [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md) —
> rakip-parite track'lerinin şablonu. Playwright MCP için ayrı bir `playwright-mcp-agent-parity.md` track'i
> henüz yok; bu belge, `prompts/rival-agent-parity-track.md`'nin üreteceği track'in girdisidir.
>
> **Kategori uyarısı.** Bunlar **farklı kategoriler**. Playwright MCP bir **MCP sunucusudur**: bir modeli,
> ajan döngüsü, sistem-prompt'u, sağlayıcı soyutlaması, izin/politika motoru ya da otonomi modeli **yoktur**.
> İstemci (Claude Desktop, VS Code, Cursor, Windsurf, Goose vb.) kendi modelini getirir ve **her şeye o
> karar verir**; sunucu yalnızca "araç çağrıldı → Playwright ile çalıştır → sonuç + üretilen Playwright kodu
>
> - yeni erişilebilirlik anlık görüntüsü döndür" yapan durum-bilgili bir köprüdür. Tepegöz ise MCP
>   _istemcisi_ olan, kendi ajan döngüsü + model-öncesi güvenlik çekirdeği olan tam bir tarayıcıdır — yani
>   **ADR-0018 ile bilerek olmamayı seçtiği şeyin ta kendisi Playwright MCP'dir**. Bu belge önce bu asimetriyi
>   söyler; sonra yalnızca **örtüşen eksenlerde** (araç/aksiyon repertuvarı, DOM/erişilebilirlik-vs-vision
>   algısı, MCP yönü, tarayıcı yaşam döngüsü, deterministik/codegen otomasyon, ölçüm) iş-iş kıyaslar.
>   Ajan döngüsü / otonomi / politika / hesap verebilirlik tamamen Tepegöz'e özgüdür ve
>   "[Örtüşmeyen alanlar](#örtüşmeyen-alanlar)" başlığında ayrılır.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | Playwright MCP                                                                                                                                                                                   | Tepegöz                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Playwright üzerine bir **MCP sunucusu** (`stdio` + HTTP/SSE); herhangi bir MCP istemcisine tarayıcı araçları verir                                                                               | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — Microsoft, `v0.0.80`, npm'de, geniş istemci desteği; çekirdek Playwright monorepo'sunda, üç tarayıcı motorunda test ediliyor                                                       | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil; sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | TypeScript; ince paket kabuğu + Playwright monorepo'sundaki çekirdek; "yeni bağımlılık için çok yüksek eşik" kültürü                                                                             | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her güven sınırında                                          |
| Felsefe     | "LLM'ler yapılandırılmış erişilebilirlik anlık görüntüsüyle sayfayla etkileşsin; ekran görüntüsü/vision modeli gerekmesin. **Bu bir güvenlik sınırı değildir** — gerçek yetkilendirme istemcide" | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Bir modele/istemciye ham, deterministik tarayıcı araçları sunmak (test yazımı, keşif otomasyonu, kendini-iyileştiren testler, uzun-koşu otonom akışlar için istemci tarafında)                   | Web'de çok-adımlı görev yürütmek: gezinme, form doldurma, çıkarım; **denetlenmiş** oturum-açık site otomasyonu                                      |

Yani: **olgun, dar-kapsamlı, gerçekten kullanılan bir araç sunucusu** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir tarayıcı ajanı**. Playwright MCP'nin sağladığı şey "araçlar + tarayıcı durumu"dur; modeli,
kararı ve döngüyü istemci getirir. Tepegöz'ün sağladığı şey "araçlar + **model-öncesi karar** + döngü + kanıt

- tarayıcının kendisi"dir. Ortak yüzey yalnızca araç repertuvarı ve algı biçimidir; geri kalan her eksende
  karşılaştırma "bir tarafın hiç sahip olmadığı (ve olmayı amaçlamadığı) katman"dır.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Model / sağlayıcı desteği — örtüşmüyor

Playwright MCP'nin **hiç modeli yok**. Sağlayıcı soyutlaması, model kataloğu, token muhasebesi, sistem-prompt
yok. `--codegen typescript|python|java|csharp|none` yalnızca her aksiyon için **üretilen Playwright kodunun
dilini** seçer — bir model parametresi değil. Modeli istemci getirir.

Tepegöz: **8 sağlayıcı** (`anthropic`, `openai`, `gemini`, `kimi`, `nova`, `deepseek`, `xai`, `groq`) +
`local` (node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u **GBNF gramerle** zorlayan). Tek
`CanonRequest`/`CanonResponse` şeması; `ModelRouter` (`plan`/`exec`/`classify` → tier + yerel/bulut);
`TokenLedger`; her `ModelGateway.complete()` çağrısı **`maxTokens` + `timeoutMs` zorunlu**; DPAPI'li BYO-key
kasası. **Ama** yalnız Anthropic resmi SDK, OpenAI ham REST, birkaç sağlayıcı stub.

**Kim daha iyi:** Soru anlamsız — bu katman Playwright MCP'de tasarım gereği yok; tamamen Tepegöz'e özgü.

### Algı — ikisi de erişilebilirlik/DOM-önce; farklar incelikte

Playwright MCP: `browser_snapshot` (erişilebilirlik ağacı, `[ref=eN]` kimlikleri; ekran görüntüsünden iyi
olduğu araç açıklamasında yazılı), `browser_find` (anlık görüntü içinde metin/regex arama → yol + birkaç
satır bağlam, tüm ağacı almadan), `--snapshot-mode full|none`, `--snapshot-boxes` (viewport-göreli sınır
kutusu), `depth` limiti, `filename` ile dosyaya yaz. `browser_take_screenshot` var ama açıklaması net:
_"ekran görüntüsüne göre aksiyon YAPAMAZSIN; aksiyon için `browser_snapshot` kullan"_. `console_messages` /
`network_requests` / `network_request` sayfa gözlemi verir. Shadow DOM ve iframe'i Playwright locator motoru
zaten deldiği için ayrı araç yok. PDF: `--caps=pdf` yalnızca PDF **üretir** (`browser_pdf_save`), PDF
**okuma** yok.

"Vision modu" = `--caps=vision` (eski `--vision`). Sadece **6 koordinat-tabanlı fare primitifi** ekler
(`browser_mouse_click_xy` / `move_xy` / `drag_xy` / `down` / `up` / `wheel`). Bir vision **modeli** eklemez,
ekran görüntüsünü sunucu işlemez — istemci modeli görsel-ayarlıysa x/y ile aksiyon alabilsin diye. Varsayılan
algı yine erişilebilirlik anlık görüntüsüdür; saf-vision akışı için `--snapshot-mode none`.

Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision** (token kesmek için),
`aria-labelledby`/`label[for]` çözümü, `browser_get_article`. `@tepegoz/tool-executor` gizli/zero-width/bidi/
homoglyph enjeksiyon vektörlerini ayrı bir pakette temizler. Vision **yalnızca eskalasyon** (ADR-0008/S10)
ama **atıl (inert) sevk ediliyor** — bir bayrak kapalı olduğu için değil, **kablosu takılmadığı için**:
Reactor'ın `captureVision` geri-çağrısı opsiyoneldir ve onu üretimde geçen bir çağıran yok (yalnız
testler geçiyor).

**Kim daha iyi:** Felsefe aynı (erişilebilirlik-önce, vision opsiyonel). Playwright MCP bugün daha çok
sayfa-tipini kanıtlı biçimde okuyor (`snapshot-mode`/`find`/`boxes`/`depth` olgun, gerçek kullanımda).
Tepegöz'ün token-kesme tasarımı (diff/elision) daha agresif ama ölçülmemiş; sanitizer paketi Playwright
MCP'de yok — injection-sertleştirme ekseninde Tepegöz.

### Aksiyon repertuvarı — burada gerçekten örtüşüyorlar

Playwright MCP: **~70 araç, 8 yetenek ailesi.** Varsayılan (cap'siz, `capabilities.spec.ts`'te birebir
listeli) **24 araç**:

- gezinme: `browser_navigate`, `browser_navigate_back`
- etkileşim: `browser_click`, `browser_hover`, `browser_drag`, `browser_drop`, `browser_type`,
  `browser_fill_form`, `browser_select_option`, `browser_press_key`, `browser_file_upload`,
  `browser_handle_dialog`
- algı: `browser_snapshot`, `browser_find`, `browser_take_screenshot`, `browser_console_messages`,
  `browser_network_requests`, `browser_network_request`
- bekleme/pencere: `browser_wait_for`, `browser_resize`
- sekme: `browser_tabs` (**tek araç**, `action = list|new|close|select`)
- yaşam döngüsü: `browser_close`
- **kod yürütme**: `browser_evaluate` (sayfada arbitrary JS) + `browser_run_code_unsafe` (Playwright sunucu
  sürecinde arbitrary JS — araç açıklamasının kendi ifadesiyle _"RCE-eşdeğeri"_)

Opt-in aileler (`--caps=...`): **storage** (17 — cookie/localStorage/sessionStorage için tekil
get/set/delete/list/clear + `storage_state` kaydet/geri-yükle), **network** (4 — `route`/`unroute`/
`route_list` istek mock'lama + `network_state_set` çevrimdışı simülasyonu), **devtools** (13 —
`highlight`/`hide_highlight`/`annotate` + `start/stop_tracing` + `start/stop_video` + `video_chapter`/
`video_show_actions`/`video_hide_actions` + `start/stop_recording` + `resume` adım-adım hata ayıklama),
**testing** (5 — `verify_element_visible`/`verify_text_visible`/`verify_list_visible`/`verify_value` +
`generate_locator`), **vision** (6 — yukarıdaki x/y fare), **pdf** (1), **config** (1 —
`browser_get_config`).

Tepegöz: **~30 araç**, hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*` (spawn + `egress_blocked` dâhil), `web_*`
(search/get_page/send_form), **`file_*`** (tam sandbox'lı dosya sistemi — bir ajan sandbox'ı), `clipboard_*`,
`download_*`/`upload_*`, `journal_search_events`, `task_*`, `extension_*`. **`execute_js` / terminal /
kod-editleme YOK** (ADR-0026: izole-dünya sandbox ölçümle çürütüldü → salt-okunur; ADR-0029: DevTools
kullanıcı-only, asla ajan aracı). Ayrıca **model-free deterministik şerit**: `@tepegoz/macro-engine` (iMacros
halefi, kontrol akışı + oto-bekleme) + `@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren seçicili,
`evaluateAssertion` success-oracle'lı tekrar-oynatma) + `@tepegoz/human-input` (insan-benzeri fare eğrileri/
jitter).

**Kim daha iyi:** Ham nicelik ve kapsama **Playwright MCP** (storage CRUD, network mock, trace/video, x/y
fare, PDF üretimi, kod yürütme — hepsi bugün var). Disiplin **Tepegöz** (her araç istisnasız zod →
PolicyKernel → HITL → audit hattından, danger-class'lı). Playwright MCP'nin `run_code_unsafe`/`evaluate`'i
Tepegöz'ün bilerek reddettiği şey. "Daha iyi" amaca bağlı: test/otomasyon geliştirme için Playwright MCP,
denetlenmiş oturum-açık site otomasyonu için Tepegöz'ün hattı.

### Ajan döngüsü / orkestrasyon — tamamen Tepegöz

Playwright MCP'de **ajan döngüsü yok.** Sunucu dur-bekle çalışır: istemci bir araç çağırır, sunucu Playwright
ile yürütür, sonucu (+ üretilen Playwright kodu + yeni anlık görüntü) döndürür. Plan yok, adım sayacı yok,
döngü dedektörü yok, replan yok, "devam et / yeniden dene / dur" kararı yok, döngü-içi context sıkıştırma
yok — hepsi istemci modelinin işi. README'nin ifadesiyle sunucunun tek "kalıcılık" katkısı tarayıcı
context'inin çağrılar arası yaşamasıdır.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor** (tipli `Decision`:
`continue`/`retry`/`replan`/`stop`). `CompletionEvidence`, navigation-grounding, vision-trigger, cache-window
(lag-2 breakpoint), tipli working-state. İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe.
**Ama** aynı anda **tek çalışma** (ADR-0013); paralel / dayanıklı checkpoint-resume roadmap'te, sevk
edilmedi.

**Kim daha iyi:** Örtüşmüyor. Playwright MCP bu katmana **bilerek** sahip değil (karar istemcinin).
Tepegöz'ün var ve yapı olarak açık (her karar bir şema) ama serileştirilmiş ve henüz kanıtsız.

### Otonomi / izin / onay modeli — tamamen Tepegöz

Playwright MCP'de **sunucu tarafı politika motoru yok.** Etkileşim araçlarındaki `element` parametresi
_"etkileşim izni almak için kullanılan insan-okunur eleman açıklaması"_ olarak tanımlı — yani istemcinin bir
insana gösterip onaylatması için bir **ipucu**; sunucu kendisi bir kapı tutmaz. README ve `SECURITY.md`
açıkça: _"Playwright MCP bir güvenlik sınırı **değildir**."_ Sağladığı kaba kontroller ve kendi verdiği
uyarılar:

- `--allowed-origins` / `--blocked-origins`: tarayıcı istek filtresi — _"güvenlik sınırı olarak hizmet
  **etmez** ve yönlendirmeleri (redirect) etkilemez"_
- `--allow-unrestricted-file-access` (varsayılan kapalı; dosya erişimi workspace kök(ler)ine hapsedilir,
  `file://` navigasyonu bloklu) — _"güvenli bir sınır değil; kasıtlı bir denemeyle kolayca aşılır, gerçek
  güvenlik için istemci-seviyesi izinlere güvenin"_
- `secrets` (tool-yanıtındaki düz metinde sır maskeleme) — _"bir kolaylık, güvenlik özelliği değil"_
- `--block-service-workers`, `--grant-permissions` (tarayıcı context'ine geolocation/clipboard vb.),
  `--isolated`, `--caps` ile yüzey azaltma

Danger-class / taint / biyometrik / hassas-site kavramı yok; tüm gerçek yetkilendirme MCP istemcisine
devredilmiştir (ve bu dürüstçe söylenir).

Tepegöz: model-öncesi deterministik **PolicyKernel** (ADR-0006): danger class (`read`/`state_changing`/
`destructive`/`financial`) + taint + hedef site → `allow`/`deny`/`ask` + makine-okunur reason code +
biyometrik (Windows Hello). `isSensitiveSite` (banka/kripto/sağlık/kamu/parola yöneticisi) = **her otonomi
seviyesinde sert `deny`**; otonomi yalnız kernel'in sorduğu prompt'u atlayabilir, `deny`'ı bozamaz.
`TaintTracker` provenance; `EgressFirewall` (`inspectEgress` + Shannon entropi ile sızıntı/yüksek-entropi
blob tespiti); `detectHandoff` (captcha/2FA → insana devir). Otonomi `ask`/`act`/`auto` (+ rezerve
`dangerous`); ticaret çift-onay; scope grant.

**Kim daha iyi:** **Tepegöz** — belirgin ve kategorik. Playwright MCP bu sorumluluğu açıkça istemciye
bırakıyor.

### Doğrulanmış sonuç / "yalan başarı" savunması

Playwright MCP: `--caps=testing` → `browser_verify_element_visible` / `verify_text_visible` /
`verify_list_visible` / `verify_value` + `generate_locator`. Bunlar istemci modelinin **çağırmayı seçtiği**
test-assertion araçlarıdır; bir tamamlama-kapısı değil. Sunucu "görev bitti mi / iddia sayfayla çelişiyor
mu" diye bir yargı üretmez. `browser_wait_for` (metin göründü/kayboldu) ve `browser_handle_dialog` yardımcı
olur ama zorlayıcı değildir.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme**: model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz; "Saved!" yazan ama 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı; recipe-compiler'ın
`evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi yakalar. **Ama** bu batarya
measurement-owed.

**Kim daha iyi:** **Tepegöz** — mekanizma farklı bir sınıf (zorlayıcı kapı vs opsiyonel assertion aracı);
ölçüm borçlu olsa da.

### Prompt-injection & güvenilmez içerik

Playwright MCP: mimari savunma **minimal ve bilinçli** — "güvenlik sınırı değil". Anlık görüntü / console /
network çıktısı istemciye ham döner; sunucuda untrusted-content sarma, homoglyph/bidi/zero-width sanitizer,
egress denetimi yok. Kaba kontroller yukarıda (origin listeleri redirect'i kapsamıyor, dosya hapsi "güvenli
sınır değil", `secrets` "güvenlik özelliği değil"). Adversaryal injection korpusu / ASR ölçümü yok — bu
sunucunun işi değil, istemci sorumlu.

Tepegöz: **model-öncesi deterministik Policy Kernel** kararın kendisini injection'dan bağımsız kılar (danger
class + taint + site → deny/ask, argüman değerini görmeden). `@tepegoz/tool-executor` homoglyph/bidi/
zero-width vektörlerini ayrı pakette temizler ve `wrapUntrustedContent` ile sarar. `EgressFirewall` çıkışta
entropi/sızıntı denetler. `TaintTracker` provenance. **Ama** claim-grade ASR bataryası measurement-owed
(S6).

**Kim daha iyi:** **Tepegöz** mimaride kat kat önde (pre-model kernel + sanitizer paketi + egress); Playwright
MCP bu ekseni tasarım gereği istemciye devrediyor. Bugün yayımlanmış ASR sayısı **ikisinde de yok**.

### Hesap verebilirlik / denetlenebilirlik

Playwright MCP: her araç yanıtında **üretilen Playwright kodu** (`code:` alanı; dili `--codegen` ile seçilir),
`--save-session` (oturumu output dizinine yaz), devtools cap'te trace (`start/stop_tracing`), video
(`start/stop_video`, chapter, action overlay'leri) ve kullanıcı-aksiyonu kaydı (`start/stop_recording` →
Playwright kodu). Tekrar-üretilebilirlik ve hata-ayıklama için sağlam; ama **kriptografik değil**, imzasız,
hash-zinciri yok.

Tepegöz: **Notary** (ADR-0030) — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** +
bağımsız `tepegoz-verify` CLI. **Ama** paket yazılmış ve testli olduğu halde uygulamaya **hiç
bağlanmamış**: `@tepegoz/notary`'yi kendi paketi dışında import eden yer yok, `apps/desktop` onu tanımıyor,
ve ADR-0030 bunu kendisi kaydediyor — yani **bugün hiçbir çalışma makbuz üretmiyor**. Sevk edilen taraf:
event-sourced journal.

**Kim daha iyi:** **Mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilirlik tasarımının
Playwright MCP'de eşi yok (ve olması amaçlanmıyor). **Bugün Playwright MCP** — "her aksiyonun Playwright
kodu" + trace/video imzasız ama gerçekten üretiliyor ve MCP'siz tekrar koşturulabiliyor; Tepegöz'ün
kriptografik tarafından bugün çıkan bir şey yok.

### Kimlik bilgisi / sır işleme

Playwright MCP: `secrets` (config veya `--secrets` dotenv dosyası) → tool-yanıtlarındaki eşleşen düz metni
maskeler; kendi dokümantasyonu _"kolaylık, güvenlik özelliği değil; tool'a giren/çıkan bilgiyi istemcide
mutlaka inceleyin"_ diyor. `--storage-state` / `--user-data-dir` ile oturum-açık durum taşınır (gerçek
credential'lar orada). Ayrı bir credential-field tespiti / broker yok.

Tepegöz: **Credential Broker** — ajanda sırrın gireceği bir şekil yok; OS-auth kapısı olana dek her dolgu
reddedilir (**atıl sevk**) + `strictGuard` "hardened reading".

**Kim daha iyi:** Kavramsal olarak **Tepegöz** (sır ajana hiç ulaşmıyor), ama **atıl**. İkisi de "tam" değil:
biri açıkça kolaylık, diğeri henüz bağlanmamış.

### Deterministik / model-free otomasyon & codegen

Playwright MCP: her aksiyon için Playwright kodu üretir; `browser_start_recording` / `stop_recording` manuel
akışı Playwright koduna çevirir; `--init-script` (her sayfaya JS) / `--init-page` (Playwright `page`
nesnesinde TS) ile başlangıç durumu kurulur. Yani "model-free replay" = ürettiği Playwright script'ini
doğrudan Playwright ile koşmak (MCP'siz). Sunucunun kendi imzalı / self-healing / success-oracle'lı recipe
motoru yok.

Tepegöz: `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, `evaluateAssertion` oracle'lı, seçici
iyileştirme).

**Kim daha iyi:** Kabaca eşit, farklı biçim — Playwright MCP "kaydı Playwright koduna dök, sonra kendin
koştur" (olgun, Playwright ekosistemine dayanıyor, bugün çalışıyor); Tepegöz uygulama-içi imzalı/oracle'lı
replay şeridi (ölçülmemiş).

### Tarayıcı yaşam döngüsü & izolasyon

Playwright MCP: **kalıcı profil** (varsayılan, workspace-hash'li dizin — projeler otomatik ayrı profil),
**`--isolated`** (bellekte; opsiyonel `--storage-state` ile başlangıç durumu), **`--extension`** (gerçek
Chrome/Edge'e "Playwright Extension" + CDP ile bağlan — oturum-açık sekmelerini ve durumunu kullan),
`--cdp-endpoint` / `--remote-endpoint`, `--device` / `--mobile` emülasyonu, üç motor (`chromium` / `firefox`
/ `webkit` + `msedge` kanalı). Profil başına **tek tarayıcı örneği**; `sharedBrowserContext` ile birden çok
HTTP istemcisi aynı context'i paylaşabilir. Transport: `stdio` (varsayılan) + HTTP/SSE (`--port`). Resmi
Docker imajı (headless chromium).

Tepegöz: tam Electron tarayıcı, out-of-process CDP, kendi sekme/pencere modeli, tek `createWindow()`
fabrikası, typed `contextBridge`, renderer-untrusted. Çok-profil izolasyonu ayrı bir track
(`phases/tracks/multi-profile-isolation.md`, henüz sevk edilmemiş).

**Kim daha iyi:** **Playwright MCP** dağıtım esnekliğinde (isolated/extension/cdp/docker, stdio + HTTP, üç
motor). **Tepegöz** kontrol derinliği ve renderer izolasyonunda (native tarayıcı olmanın avantajı).

### MCP — yönler zıt (asıl eksen)

Playwright MCP: **MCP sunucusudur.** Herhangi bir MCP istemcisine tarayıcı araçları verir. İstemci yok, model
yok, ajan yok — hepsi karşı taraf. Tepegöz'ün **ADR-0018 ile olmamayı seçtiği** şey tam olarak budur.

Tepegöz: **MCP istemcisidir** (ADR-0018, `@tepegoz/mcp-client`). Dış MCP sunucularının araçları Capability
Registry'ye girer ve **aynı PEP'ten** geçer; `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`),
`dangerClassFor` (bilinmeyen annotation → en kısıtlı sınıf, fail-safe). MCP **sunucu** yüzeyi **yok**
(Phase 1b DoD maddesi, tamamlanmamış).

**Kim daha iyi:** Örtüşmüyor — zıt yönler. İstenen "modelime/istemcime tarayıcı ver" ise Playwright MCP tam
da o; istenen "tarayıcım dış araçları güvenli tüketsin" ise Tepegöz'ün yönü. Tepegöz bir gün sunucu yüzeyi
eklerse doğrudan rakip olur; **bugün değiller**.

### Ölçüm / dürüstlük kültürü

Playwright MCP: Playwright'ın test disiplini — MCP araç-listesi snapshot testi (`capabilities.spec.ts`
varsayılan 24 aracı birebir sabitler), `core`/`click`/`library`/`cli` spec'leri, üç tarayıcıda hermetik
testler, `--caps` davranış testleri, "testler harici servise bağlı olmasın" kuralı. Bu bir **sunucunun
doğruluk testidir**; ajan-yetenek / adversaryal ASR / ground-truth eval değil (öyle olması da gerekmez).

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge ikincil,
judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel anayasa (Wilson CI,
aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı iddiası
**reddedilebilir**, ön-kayıtlı H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada
olmadığı için var — her S-fazı 🟠, hiçbiri ✅ değil.

**Kim daha iyi:** Farklı şeyleri ölçüyorlar. Playwright MCP sunucu-doğruluğunu sağlam ölçüyor; Tepegöz
ajan-yeteneğini ölçmek için araştırma-sınıfı bir çerçeve kurmuş ama **sayılar henüz yok**.

---

## Örtüşmeyen alanlar

**Yalnızca Playwright MCP'de var (Tepegöz'de karşılığı yok):**

- **MCP sunucu yüzeyi** — herhangi bir MCP istemcisine (Claude Desktop, VS Code, Cursor, Windsurf, Goose,
  Grok, Junie…) tarayıcı araçları sunma; `stdio` **ve** HTTP/SSE transport; resmi Docker imajı.
- `browser_evaluate` (sayfada arbitrary JS) + `browser_run_code_unsafe` (Playwright sürecinde "RCE-eşdeğeri"
  arbitrary JS).
- Tam **storage CRUD** araçları (cookie / localStorage / sessionStorage için tekil get/set/delete/list/clear
  - `storage_state` kaydet/geri-yükle).
- **Network mock'lama / routing** (`browser_route` / `unroute` / `route_list`) + çevrimdışı simülasyonu
  (`browser_network_state_set`).
- **Test-assertion** araçları (`browser_verify_*`) + `browser_generate_locator` (test için locator üretimi).
- **Trace / video / recording** araçları (Playwright trace, video chapter/overlay, kullanıcı-aksiyonu →
  Playwright kodu) + adım-adım `browser_resume` hata ayıklama.
- Her aksiyon için **üretilen Playwright kodu** (codegen: `typescript` / `python` / `java` / `csharp`) —
  MCP'siz tekrar koşturulabilir çıktı.
- `--extension` ile gerçek Chrome/Edge'e bağlanma; `--device` / `--mobile` emülasyonu; **üç tarayıcı motoru**
  (Chromium / Firefox / WebKit) tek arayüzden.
- `--init-script` / `--init-page` ile her sayfaya kod enjeksiyonu.

**Yalnızca Tepegöz'de var (Playwright MCP'de karşılığı yok, ve amaçlanmıyor):**

- Bir **LLM / ajan katmanının tamamı**: 8 sağlayıcı + `local`, `ModelRouter`, `TokenLedger`, tek `Canon*`
  şeması, GBNF JSON gramer zorlaması, zorunlu per-çağrı bütçe alanları.
- **Ajan döngüsü**: Planner→Executor→Reactor, tipli `Decision`, completion-evidence, navigation-grounding,
  cache-window (lag-2 breakpoint).
- **Model-öncesi deterministik PolicyKernel** (danger class + taint + site → deny/ask, argümanı görmeden) +
  hassas-site kategorik sert deny + biyometrik yüksek-risk kapısı.
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance +
  `detectHandoff` (captcha/2FA → insana devir).
- **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız
  `tepegoz-verify` CLI — _paket yazılmış ve testli, ama `apps/desktop`'a bağlanmamış; bugün makbuz
  üretmiyor (ADR-0030)_ — + event-sourced journal.
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme + tuzak
  fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **İki-aşama fail-safe HITL** + kademeli otonomi (`ask`/`act`/`auto`) + ticaret çift-onay + scope grant.
- **Tek ToolGateway PEP** (built-in / MCP / extension ayrımsız) + `tool-executor` homoglyph/bidi/zero-width
  sanitizer + `wrapUntrustedContent`.
- **Model-free şerit**: `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, success-oracle) +
  `human-input` (bot-tespiti karşıtı fare eğrileri).
- **Asistan UX** (Agent Console: Chat/Do/Make/Tasks, plan önizleme, kaydırılabilir replay timeline, kanıt
  rozetleri, çalışırken steer, pause/resume, arka-plana devam + tepsi), **bellek** (S9 advisory, zehir
  filtresi, karantina — **atıl**), **skill** = saklı prompt şablonu, **`task_*`** kayıtlı görevler.
- **Türkçe birinci sınıf**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H görev şartı, Phase 11
  e-Devlet / KVKK / kamu adaptör güven modeli, Türk şirket.
- **`web_*`** araçları (SSRF-güvenli sitemap reader, içerik guard), tam sandbox'lı **`file_*`** ajan dosya
  sistemi, **`reader`** (makale çıkarımı, tipli bloklar).
- Araştırma-sınıfı **`agent-eval`** harness'ı + istatistiksel anayasa + anti-debt / PROSE-LEDGER +
  reddedilebilir kuzey-yıldızı iddiası.
- **Native tarayıcı** olmak: kendi sekme/pencere modeli, `tepegoz://` iç sayfaları, `ext-translate` /
  `ext-typo` / `ext-macros` / `ext-tasks` / `ext-adblock` eklentileri.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | Playwright MCP                                                                                         | Tepegöz                                                                                                                                                           | Kim daha iyi + neden                                                                                                                                                             |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi / birincil iş**          | MCP sunucusu: istemciye/modele tarayıcı araçları verir                                                 | Tarayıcı ajanı + güvenlik-önce native tarayıcı                                                                                                                    | **Örtüşmüyor** — farklı problemler; "kim iyi" ancak alt-eksenlerde anlamlı                                                                                                       |
| 2   | **LLM / sağlayıcı katmanı**                | Yok — istemci kendi modelini getirir                                                                   | 8 sağlayıcı + `local`, router, ledger, Canon şema, GBNF                                                                                                           | **Örtüşmüyor** — tamamen Tepegöz'e özgü katman                                                                                                                                   |
| 3   | **Ajan döngüsü / orkestrasyon**            | Yok — istemci modeli her adıma karar verir                                                             | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL                                                                                                          | **Tepegöz'e özgü** (ama kanıtsız); Playwright MCP bunu tasarımla istemciye bırakıyor                                                                                             |
| 4   | **Algı felsefesi**                         | Erişilebilirlik anlık görüntüsü-önce; vision opt-in (yalnız x/y fare, model değil)                     | DOM/a11y-önce; vision yalnız eskalasyon (atıl)                                                                                                                    | **Berabere felsefede**; Playwright MCP bugün olgun ve kullanımda                                                                                                                 |
| 5   | **Algı araç olgunluğu**                    | `snapshot-mode`/`find`/`boxes`/`depth`, screenshot, console/network; PDF sadece üretim, PDF okuma yok  | diff/dedupe/elision + `get_article` + sanitizer; PDF/shadow yok                                                                                                   | **Playwright MCP bugün** — daha çok sayfa-tipini kanıtlı okuyor                                                                                                                  |
| 6   | **Güvenilmez içerik sertleştirme**         | Yok — çıktı ham döner; "güvenlik sınırı değil"                                                         | `tool-executor` homoglyph/bidi/zero-width sanitizer + `wrapUntrustedContent` + `EgressFirewall`                                                                   | **Tepegöz** — net                                                                                                                                                                |
| 7   | **Aksiyon repertuvarı genişliği**          | ~70 araç / 8 aile (storage CRUD, network mock, trace/video, x/y fare, PDF, kod-exec)                   | ~30 araç tek PEP'ten (+ `web_*`/`file_*`/`task_*`)                                                                                                                | **Playwright MCP** — nicelik ve kapsama                                                                                                                                          |
| 8   | **Araç çağırma disiplini**                 | İstemciye devredilmiş; `element` param = insana-göster ipucu; sunucu kapı tutmaz                       | **Tek PEP**: zod→PolicyKernel→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                    | **Tepegöz** — her araç istisnasız aynı deterministik hattan                                                                                                                      |
| 9   | **Model-öncesi güvenlik kararı**           | Yok — "güvenlik sınırı değil"; origin listeleri redirect'i kapsamaz, dosya hapsi "güvenli sınır değil" | Deterministik PolicyKernel: danger-class + taint + site, argümanı görmez; hassas-site kategorik deny; biyometrik                                                  | **Tepegöz** — belirgin mimari fark                                                                                                                                               |
| 10  | **Kod yürütme**                            | `browser_evaluate` (sayfa JS) + `browser_run_code_unsafe` ("RCE-eşdeğeri")                             | Yok — ADR-0026 (salt-okunur code-exec), ADR-0029 (DevTools kullanıcı-only)                                                                                        | **Amaç ayrımı** — Playwright MCP için yetenek, Tepegöz için bilinçli red                                                                                                         |
| 11  | **Doğrulanmış sonuç / yalan-başarı**       | `verify_*` opsiyonel assertion araçları (istemci çağırmayı seçer)                                      | `CompletionEvidence` kapısı + tuzak fixture + Checked/Contradicted rozetleri + origin kapısı                                                                      | **Tepegöz** — farklı sınıf mekanizma (ölçüm borçlu)                                                                                                                              |
| 12  | **Prompt-injection savunması (mimari)**    | Minimal ve bilinçli — istemciye devredilmiş; kaba origin/dosya kontrolleri                             | Pre-model kernel + sanitizer paketi + `EgressFirewall` entropi + taint provenance                                                                                 | **Tepegöz** — kat kat derin                                                                                                                                                      |
| 13  | **Prompt-injection (kanıt bugün)**         | Sunucu bu ekseni istemciye devrediyor; ASR yok                                                         | Redteam/korpus var ama claim-grade ASR measurement-owed                                                                                                           | **Berabere-zayıf** — ikisinde de yayımlanmış ASR sayısı yok                                                                                                                      |
| 14  | **Hesap verebilirlik / denetlenebilirlik** | Her aksiyonun Playwright kodu + `save-session` + trace/video/recording (imzasız)                       | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + Replay Receipt + bağımsız `tepegoz-verify` — **yazılmış ama uygulamaya bağlanmamış**; sevk edilen: journal | **Mimaride Tepegöz** (kriptografik, Playwright MCP'de eşi yok). **Bugün Playwright MCP** — imzasız ama gerçekten üretilen, tekrar-koşturulabilir çıktı; Notary bir şey üretmiyor |
| 15  | **Kimlik bilgisi / sır işleme**            | `secrets` = tool-yanıtında düz-metin maskeleme ("güvenlik özelliği değil")                             | Credential Broker: sırrın gireceği şekil yok, OS-auth'a dek reddeder — **atıl**                                                                                   | **Kavramsal Tepegöz**; ikisi de "tam" değil (biri kolaylık, biri atıl)                                                                                                           |
| 16  | **Deterministik / model-free otomasyon**   | Aksiyon→Playwright kodu + recording→kod + `init-script`                                                | `macro-engine` + `recipe-compiler` (imzalı, success-oracle)                                                                                                       | **Kabaca eşit, farklı biçim**; Playwright MCP bugün çalışıyor + Playwright ekosistemi                                                                                            |
| 17  | **MCP yönü**                               | **Sunucu** — istemciye araç verir                                                                      | **İstemci** (ADR-0018) — dış araçları tek PEP altında tüketir; sunucu yüzeyi yok                                                                                  | **Zıt yönler — örtüşmüyor**; istenen yöne göre biri                                                                                                                              |
| 18  | **Tarayıcı yaşam döngüsü / dağıtım**       | persistent / isolated / extension / cdp, device/mobile, stdio+HTTP, Docker, 3 motor                    | Native Electron, kendi pencere fabrikası, renderer-untrusted; çok-profil ayrı track                                                                               | **Playwright MCP** dağıtım esnekliğinde; **Tepegöz** kontrol derinliği ve izolasyonda                                                                                            |
| 19  | **Çok-oturum / eşzamanlılık**              | Profil başına tek örnek; `sharedBrowserContext` ile çok HTTP istemcisi aynı context'i paylaşır         | Tek eşzamanlı run (ADR-0013)                                                                                                                                      | **Berabere-sınırlı** — ikisi de gerçek paralel izole oturum vermiyor                                                                                                             |
| 20  | **Çevrimdışı / egemenlik**                 | `network_state_set offline` simülasyonu; RAG yok, yerel model yok                                      | `local-inference` seam + GGUF katalog (sha256) + GBNF; RAG yok, S12 atıl                                                                                          | **Berabere-zayıf**; Tepegöz'ün yerel-model seam'i var, Playwright MCP'nin hiç yok (gereği de yok)                                                                                |
| 21  | **Asistan UX / bellek / skill**            | Yok — sunucu, UI yok                                                                                   | Agent Console + replay timeline + steer; S9 bellek (atıl); skill = prompt şablonu                                                                                 | **Tepegöz** — ama Playwright MCP'de olması beklenmez                                                                                                                             |
| 22  | **Türkçe / bölgesel derinlik**             | Yok — geliştirici aracı, İngilizce                                                                     | Parity-zorunlu EN+TR i18n, TR-web H2H şartı, Phase 11 kamu/e-Devlet                                                                                               | **Tepegöz**                                                                                                                                                                      |
| 23  | **Ölçüm / dürüstlük kültürü**              | Sunucu-doğruluğu test suite (araç-listesi snapshot, 3 motor, `--caps` davranışı)                       | Ground-truth `agent-eval` + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                         | **Farklı hedef** — Playwright MCP sunucusunu sağlam test ediyor; Tepegöz ajan-yeteneği için çerçeve kurmuş, sayılar yok                                                          |
| 24  | **"Bugün çalışıyor mu"**                   | Evet — `v0.0.80`, Microsoft, npm, geniş istemci desteği, Playwright monorepo'sunda test ediliyor       | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                      | **Playwright MCP** — kesin (kendi kategorisinde)                                                                                                                                 |

---

## Sonuç

**Bunlar farklı kategoriler.** Playwright MCP bir MCP sunucusudur: bir modele/istemciye ham, deterministik,
çok-motorlu tarayıcı araçları verir — ve modeli, ajan döngüsünü, kararı, otonomiyi ve politikayı **bilerek**
istemciye bırakır. "Ajan olarak kim daha iyi" sorusu bu yüzden yanlış sorudur: Playwright MCP'de ajan yok;
o katman istemcide (Claude Desktop, Cursor, VS Code…). Playwright MCP'nin kendi işinde — bir modele tarayıcı
verme işinde — olgun, Microsoft destekli, geniş kabul görmüş, ~70 araçlı, üç tarayıcı motorlu ve esnek
dağıtımlı (stdio + HTTP, isolated / extension / cdp / Docker) olduğu açık.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz önde — çünkü Tepegöz tam da Playwright MCP'nin
olmamayı seçtiği şey:** model-öncesi deterministik Policy Kernel (danger class + taint + site → deny/ask,
argümanı görmeden), hassas-site kategorik deny + biyometrik, `EgressFirewall` entropi denetimi, taint
provenance, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify`, kanıt-atıflı tamamlama + yalan-başarı
savunması, tek ToolGateway PEP, `tool-executor` homoglyph/bidi/zero-width sanitizer, model-free imzalı
macro/recipe şeridi, ve Türkçe/kamu derinliği. Bunların hiçbiri Playwright MCP'de yok ve olması da
amaçlanmıyor — README ve `SECURITY.md` açıkça _"bir güvenlik sınırı değildir"_ diyor.

Dürüst özet: **Playwright MCP bugün iş gören, olgun bir araç sunucusudur (kendi kategorisinde); Tepegöz'ün
ajanı henüz kanıtlanmadı** — her S-fazı 🟠 measurement-owed, vision/credential-broker/memory atıl sevk,
Notary hiç bağlanmamış, aynı anda tek run, sağlayıcıların bir kısmı stub, site adaptörü yok.
Modeline/istemcine ham, esnek,
çok-motorlu, kod-yürütmeli tarayıcı araçları verip kararı modele bırakmak istiyorsan → Playwright MCP. Tez
"kararı modele bırakmayan, model-öncesi deterministik bir çekirdekten geçen, ne yaptığının kriptografik
kanıtı olan, Türkçe bir _tarayıcı ajanı_" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta. Bir gün Tepegöz Phase 1b
ile bir MCP **sunucu** yüzeyi eklerse iki proje aynı eksende — "modele tarayıcı verme" ekseninde — doğrudan
karşılaşır; bugün karşılaşmıyorlar.
