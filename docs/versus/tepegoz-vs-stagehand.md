# Tepegöz vs Stagehand — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Stagehand** (Browserbase'in yayında olan, MIT lisanslı,
> TypeScript + Python + Go **tarayıcı-ajan SDK'sı**, v4.0.2) arasında, iş-iş kimin neyi daha iyi yaptığını
> tabloya döken derinlemesine bir karşılaştırma. Stagehand bir son-kullanıcı ürünü değil, geliştiricinin
> kendi ajanını üstüne kurduğu bir kütüphane; genelde Browserbase bulutuyla (barındırılan tarayıcı, Model
> Gateway, sunucu-taraflı önbellek) birlikte kullanılır.
>
> **Yöntem.** `.junk/stagehand` deposunun (`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
> `package.json` + `pnpm-workspace.yaml`, `packages/sdk-ts/src/{stagehand,page,batch,webmcp,rpcClient}.ts`,
> `packages/extension/{inference,prompt,runtime}.ts` + `services/{actService,extractService,observeService,
cacheService}.ts` + `understudy/a11y/snapshot/{a11yTree,domTree,capture}.ts` + `llm/{LLMProvider,LLMClient,
gatewayClient,clientLlmClient}.ts` + `understudy/domainPolicy.ts`, `packages/protocol/{schemas,
schema-registry}.ts`, `packages/integrations/core/src/{facade/{tools,contract},harness/{redact,index}}.ts`
>
> - `packages/integrations/README.md`, `packages/integrations/claude-agent-sdk/src/session.ts`,
>   `packages/docs/v4/**` (`basics/{act,observe,extract,webmcp}`, `configuration/models`,
>   `best-practices/{caching,cost-optimization}`, `migrations/{v3,browser-use}`, `first-steps/introduction`),
>   `packages/sdk-ts/examples/*`, `rules/`) ve bu reponun AI yüzeyinin (`phases/ai-agent/` S0–S12,
>   `packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|tool-executor|local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|
credential-vault|human-input|agent-eval`, `extensions/ext-agent`, `docs/adr/*`) aynı oturumda
>   okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`phases/tracks/README.md`'deki
> "orijinal dilinde tutulur" kaydıyla ve [`tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md) belgesiyle aynı
> gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** [`phases/tracks/rival-agent-parity-track.md`](../../prompts/rival-agent-parity-track.md)
> ve örüntü olarak [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md).
> Stagehand'e özgü bir parity track'i henüz yazılmadı (bu belge onun girdisi).
>
> **Kategori uyarısı.** Bu **kütüphane vs. ürün** kıyaslamasıdır. Stagehand bir _SDK_: `act` / `observe` /
> `extract` doğal-dil ilkelleri + Playwright-şekilli bir tarayıcı sürücüsü + WebMCP + toplu (batch) komut
> verir; ajan döngüsünü, izin/onay modelini, hesap-verebilirlik katmanını ve asistan arayüzünü **bilerek
> içermez** — bunları geliştirici ya da geliştiricinin seçtiği ajan çatısı (Claude Agent SDK, Codex, CrewAI,
> LangChain Deep Agents, Mastra, Vercel AI SDK …) kurar. Tepegöz bir _son-kullanıcı tarayıcı ajanı_: aynı
> algı/aksiyon ilkellerini taşır ama model-öncesi deterministik Policy Kernel'i, iki-aşamalı HITL'i,
> kriptografik denetimi ve Agent Console'u ürünün içinde sevk eder. Bu belge önce bu asimetriyi söyler,
> sonra **örtüşen eksenlerde** (sağlayıcı desteği/mimarisi, algı ekonomisi, aksiyon repertuvarı,
> döngü/orkestrasyon, deterministik tekrar-oynatma & önbellek, self-heal, MCP, ölçüm) iş-iş kıyaslar.
> Örtüşmeyenler ayrıca `## Örtüşmeyen alanlar` başlığında dürüstçe ayrılır.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | Stagehand                                                                                                                                                                                                   | Tepegöz                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | TS + Python + Go **tarayıcı-ajan SDK'sı** (v4.0.2); mevcut kodun içine `import` edilir, bir Chrome eklentisi olarak (`stagehand-extension`, MV3 service worker, CDP ile bağlanır) tarayıcının yanında koşar | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — npm/PyPI/Go, Browserbase üretiminde, gerçek kullanıcılar, katkıcılar, Discord, `evals` liderlik tablosu; 128 KB CHANGELOG                                                                     | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil; sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Strict TS/Python/Go, pnpm + turbo monorepo, protokol-şema (JSON-RPC + zod) disiplini, ast-grep parity kuralları; çekirdek mantık `packages/extension`'da, SDK ince bir RPC istemcisi                        | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her güven sınırında                                          |
| Felsefe     | "Ajanlar için tarayıcı SDK'sı" — güvenilirlik, hız, determinizm, gözlemlenebilirlik; **ajanı sen inşa et**, biz sürücüyü veririz; token verimli hibrit erişilebilirlik ağacı önceliği                       | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Geliştiriciye üretim-sınıfı, çok-dilli bir tarayıcı sürücüsü + üç model-destekli ilkel vermek; kontrol akışı çağıranın                                                                                      | Web'de çok-adımlı görev yürütmek: gezinme, form doldurma, çıkarım; güvenli oturum-açık site otomasyonu, uçtan uca ürün                              |

Yani: **olgun, çok-dilli, yayında bir SDK (ajan iskeletini sana bırakan)** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir native-tarayıcı ajanı (iskeleti ürünün içinde taşıyan)**. Kıyas yalnızca örtüşen
teknik eksenlerde (algı, sağlayıcı, aksiyon ilkelleri, deterministik tekrar, önbellek, self-heal, MCP,
ölçüm) anlamlı; "ajan olma" işini Stagehand kasıtlı olarak dışarıya devrediyor.

---

## Derinlemesine: iş iş kim ne yapıyor

### `agent()` — Stagehand v4'te KALDIRILDI

v3'te `stagehand.agent()` vardı: `act`/`extract`/`observe`'u bir döngüye saran yerleşik orkestratör, artı
`agent({ mode: "cua" })` ile bir computer-use (CUA) modu. v4 migration belgesi net: _"`agent()` gitti.
v4'te bire-bir yerini alan hiçbir şey yok."_ Yerine iki yol öneriliyor: (a) **code mode** — bir kodlama
asistanı bir Stagehand betiği yazar, sen betiği koşarsın (per-adım inference yok); (b) **tool calling** —
döngüyü sen sahiplenirsin, modele üç geniş araç yerine tüm Stagehand yüzeyini araç olarak verirsin.
`prompt.ts` içinde `buildOperatorSystemPrompt` / `buildCuaDefaultSystemPrompt` gibi kalıntı fonksiyonlar
var ama SDK'da bunları çağıran bir ajan yüzeyi yok. Tepegöz'ün **Planner → Executor → Reactor** döngüsü
(tipli `Decision`: continue/retry/replan/stop, completion-evidence, navigation-grounding, cache-window)
gerçekten bağlı bir iskelet ama **tek eşzamanlı run** (ADR-0013), checkpoint-resume sevk edilmedi ve
**henüz kanıtlanmadı**. **Kim daha iyi:** örtüşmüyor — Stagehand bilerek ajan döngüsü sunmuyor; Tepegöz'ün
döngüsü var ama ölçüsüz. Mimari döngü _tasarımı_ Tepegöz'de (tipli kararlar); _çalışan uzun-koşu_ ikisinde
de yok.

### Stagehand'in ajan yüzeyine en yakın şey: 3-araçlı facade + harness'ler

`packages/integrations` bir **facade** tanımlıyor: tek kalıcı tarayıcı üstünde **tam üç araç** — `run` (JS
iş akışı ya da snapshot ID'leriyle toplu aksiyon), `snapshot` (erişilebilirlik ağacı + ID hidratasyonu),
`screenshot` — hem stdio **MCP sunucusu** hem in-process yerel araç olarak sunuluyor. Sistem prompt'u
(`FACADE_AGENT_INSTRUCTIONS`) tek yerde tanımlı ve dış çatılar tarafından tüketiliyor: Claude Agent SDK,
Codex SDK, CrewAI, LangChain Deep Agents, Mastra, Vercel AI SDK, Pi, Eve, fx. Yani Stagehand "ajan olma"yı
açıkça bu çatılara devrediyor; izin/onay o katmanda (ör. Claude Agent SDK'nın `canUseTool` /
`permissionMode`). Tepegöz'ün `ext-agent`'i tam tersi: plan önizleme, kademeli otonomi, risk banner,
replay timeline, kanıt rozetleri, steer, pause/resume, çift-onay — hepsi üründe. **Kim daha iyi:** dağıtım
esnekliğinde Stagehand (herhangi bir harness'e tak); bütünleşik, tutarlı ajan deneyiminde Tepegöz.

### Model / sağlayıcı desteği — Stagehand ergonomide, Tepegöz yüzey genişliğinde

Stagehand: Vercel **AI SDK** üzerinde **5 birinci-sınıf sağlayıcı** — `openai`, `anthropic`, `google`,
`groq`, `cerebras` (`LLMProvider.ts`); model adı hep `sağlayıcı/model`, `create()`'te bilinen ID
listesine karşı doğrulanır. Artı **Browserbase Model Gateway**: `model`'i hiç verme → sunucu her
`act`/`extract`/`observe` çağrısında model seçer (oto-yönlendirme); ya da `model`'i anahtarsız ver →
Gateway'e sabitlenir (Gateway'de OpenAI/Anthropic/Google listeleniyor). Artı **BYO-LLM callback**
(`model: { generate }`) — sağlayıcı-nötr istek/yanıt, senin sürecinde koşar; Bedrock, Azure, Cohere,
kendi-barındırdığın ve yerel modeller için **tek yol**. Yerleşik yerel çıkarım, GGUF kataloğu yok.
Tepegöz: **8 sağlayıcı** (`anthropic`, `openai`, `gemini`, `kimi`, `nova`, `deepseek`, `xai`, `groq`) +
`local` (node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u **GBNF gramerle** zorlayan). Hepsi tek
`CanonRequest`/`CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify) → tier +
yerel/bulut; her `ModelGateway.complete()` çağrısı **`maxTokens` + `timeoutMs` zorunlu**; `TokenLedger`;
DPAPI'li BYO-key kasası. **Ama** yalnız Anthropic resmi SDK, OpenAI ham REST, bazı sağlayıcılar stub;
sıfır-kurulum bulut yok. **Kim daha iyi:** "kredi kartsız başla + per-çağrı oto-yönlendirme + çok-dil"
ekseninde **Stagehand** (Gateway gerçek bir kolaylık). Tipli tek-şema + zorunlu bütçe alanları + GBNF +
yerel çıkarım ekseninde **Tepegöz** — ama yüzeyi dar ve kısmen stub.

### Algı (sayfayı okuma) — ikisi de DOM/a11y-önce; Stagehand'inki bugün ölçülü

Stagehand: CDP `Accessibility.getFullAXTree` ile kare-başı erişilebilirlik ağacı, budama, `[kare-backendNodeId]`
kimlikli metin ağacı + `xpathMap`; her karenin (OOPIF + **kapalı shadow DOM** dahil) ağacı varsayılan
olarak birleştiriliyor. `page.snapshot()` → `formattedTree` + `xpathMap`. `act` iki-aşamalı aksiyonda
`diffCombinedTrees` ile yalnız değişen ağacı gönderiyor. Ekran görüntüsü **opsiyonel** ve yalnız
`extract({ screenshot: true })` bir viewport görüntüsü gönderiyor; `act`/`observe` salt-metin. Token
verimliliği projenin açıkça bir numaralı önceliği ("hibrit erişilebilirlik ağacı budaması"). PDF okuma
aracı yok. Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision**,
`aria-labelledby`/`label[for]` çözümü, `browser_get_article`; `@tepegoz/tool-executor` gizli/zero-width/
bidi/homoglyph enjeksiyon vektörlerini ayrı bir pakette temizliyor. Vision **yalnız eskalasyon**
(ADR-0008/S10) — ve bugün **atıl, çünkü hiç bağlanmamış**: Reactor'ın `captureVision` geri-çağrısı
opsiyonel ve üretimde onu geçen bir çağıran yok (yalnız testler geçiyor). **Kim daha iyi:** yaklaşım neredeyse
aynı; **bugün Stagehand** (aynı mekanizma yayında, `evals` ile ölçülü, kapalı shadow DOM piercing sevk
edilmiş). Tepegöz'ün sanitizer paketi + article çıkarımı mimari artı ama algı-v2 measurement-owed.

### Aksiyon repertuvarı — Stagehand Playwright yüzeyi, Tepegöz denetimli araç seti

Stagehand: model-destekli aksiyon yöntemleri (`SupportedUnderstudyAction`) — click, doubleClick, fill,
type, press, hover, scrollTo, nextChunk/prevChunk, selectOptionFromDropdown, dragAndDrop. Artı **tam
Playwright-şekilli sayfa/locator API'si**: goto/reload/goBack/goForward, screenshot, waitForSelector/
LoadState/Timeout, cookies, setInputFiles (dosya yükleme), clipboard, keyPress, ham x/y click/scroll/type,
dragAndDrop; `locator()` CSS/XPath/`text=` ile kapalı shadow DOM ve `>>` ile iframe delme. **WebMCP**
(`page.tools()`) — _sayfanın kendi_ ilan ettiği araçları keşfet + çağır (Chromium `--enable-features=
WebMCPTesting` gerektirir). `experimentalBatch` — serileştirilmiş bir JS callback'i sayfada Playwright-
uyumlu bir facade'a karşı koşturur. CAPTCHA çözücü yok, medya indirme aracı yok, terminal yok.
Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP: lookup → idempotency → zod → PolicyKernel →
HITL → execute → audit). `browser_*`, `tab_*` (spawn + egress_blocked), `web_*` (search/get_page/send_form),
**`file_*`** (tam sandbox'lı dosya sistemi), `clipboard_*`, `download_*`/`upload_*`, `journal_search_events`,
`task_*`, `extension_*`. Ayrıca **model-free deterministik şerit**: `macro-engine` (iMacros halefi, kontrol
akışı + oto-bekleme) + `recipe-compiler` (imzalı, kendini iyileştiren seçicili replay). `@tepegoz/human-input`
insan-benzeri fare eğrileri/jitter. **Kim daha iyi:** ham genişlik + Playwright tanıdıklığı + WebMCP +
çok-dil ekseninde **Stagehand**. Her aksiyonun istisnasız aynı deterministik izin+audit hattından geçmesi

- model-free macro/recipe şeridi + insan-benzeri girdi ekseninde **Tepegöz**.

### Ajan döngüsü / orkestrasyon — Stagehand'de yok, Tepegöz'de var ama serileştirilmiş

Stagehand'in "döngüsü" ilkellerin içindedir: `act` = plan inference → deterministik aksiyon → (twoStep
ise) snapshot-diff → ikinci inference → ikinci aksiyon; artı **self-heal** (seçici kırılırsa bir kez
snapshot alıp elemanı yeniden çıkarıp tekrar dene). `extract` = çıkarım inference + bir "metadata/
completed" inference (parçalı çıkarımda sayfalama için). Çok-adımlı akış = senin kodun. Tepegöz:
Planner→Executor→Reactor, tipli `Decision`, iki-aşamalı HITL (plan önizleme + araç-başı), her ikisi
fail-safe; `CompletionEvidence`, navigation-grounding, cache-window (lag-2 breakpoint). **Ama tek
eşzamanlı run**; paralel/dayanıklı checkpoint-resume roadmap'te, sevk edilmedi. **Kim daha iyi:** mimari
döngü _tasarımı_ **Tepegöz** (her karar bir şema); _"çalışıyor mu"_ ekseninde ikisinin de kanıtı zayıf —
Stagehand döngüyü çağırana bıraktığı için "kanıt" harness'e ait, Tepegöz'ünki measurement-owed.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

Stagehand: neredeyse yok. `extract`'in metadata çağrısı yalnız parça-sayfalaması için "completed" bool'u
üretir. Completion-evidence yok, tuzak fixture yok, kanıt rozeti yok, mutasyon-öncesi origin yeniden
doğrulama yok. Önbelleğe alınmış `act` tekrarı self-heal kapalı koşar ve seçici kırılırsa full inference'a
düşer — kadarı bu. Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme** (model, sayfanın
çürüttüğü bir iddiayı `done`'a konuşturamaz), "Saved!" yazan ama 5xx dönen tuzak fixture'lar, UI'da
**Checked / Unconfirmed / Contradicted** rozetleri, mutasyon-öncesi deterministik origin kapısı,
recipe-compiler'ın `evaluateAssertion` success oracle'ı. Kuzey-yıldızı koşulu #3: _"fabricated-success ≈
0."_ **Kim daha iyi:** **Tepegöz** — belirgin mimari fark; ama ölçüm borçlu (S4 🟠).

### Prompt-injection & güvenilmez içerik savunması — Stagehand'de esasen yok

Stagehand: SDK'da homoglyph/bidi/zero-width sanitizer yok, `wrapUntrustedContent` yok, taint izleme yok,
egress denetimi yok. "Güvenilmez veri, talimat değil" çerçevesi yalnız bazı _integrations_ dokümanının
düzyazısında. `harness/redact.ts` yalnız **hata mesajlarından** sır (API anahtarı, bearer) redakte eder.
`variables` (`%ad%`) sır değerini modelden uzak tutar — yerelde, aksiyondan hemen önce ikame edilir — ama
önbellek açıksa cache servisine gider (doküman: kimlik bilgili çağrılarda `cache`'i kapat). `domainPolicy.ts`
CDP Fetch katmanında allowedDomains/blockedDomains (host allow/block listesi) + Browserbase `blockAds`/
proxy; README'nin "network-level security" ifadesi bu. Per-araç izin kapısı, danger sınıflandırması, HITL
yok — bunları geliştirici/harness kurar. Tepegöz: **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006):
danger class + taint + hedef site → allow/deny/ask + makine-okunur reason code + biyometrik; hassas-site
kilidi **her otonomi seviyesinde sert deny**. **EgressFirewall** (`inspectEgress`, Shannon entropi).
`TaintTracker` provenance. `@tepegoz/tool-executor` sanitizer paketi + `wrapUntrustedContent`. `detectHandoff`
(captcha/2FA). **Ama** claim-grade ASR bataryası measurement-owed (S6). **Kim daha iyi:** **Tepegöz** —
Stagehand bu eksende bilerek oynamıyor (kütüphane); mimari katman farkı büyük, kanıt ikisinde de eksik.

### Hesap verebilirlik / denetlenebilirlik — Tepegöz kriptografik, Stagehand satıcı-barındırmalı

Stagehand: OpenTelemetry (OTel) span'ları, `stagehand.metrics()` token kullanımı, Browserbase session
replay panosu + kayıt + ağ ayrıntısı (sunucu-taraflı, barındırılan), `logging: { level, format, onLog }`.
Kriptografik imza yok, replay receipt yok, hash-zinciri yok, bağımsız doğrulayıcı yok; gözlemlenebilirlik
satıcıya (Browserbase) bağlı. Tepegöz: sevk edilmiş olan **event-sourced journal**; ayrıca **Notary** —
hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify`
CLI — yazılı ve testli, **ama `apps/desktop`'a bağlanmamış**: `@tepegoz/notary` uygulamada hiçbir yerden
import edilmiyor, yani **bugün hiçbir çalışma receipt üretmiyor** (ADR-0030 bunu kaydediyor).
**Kim daha iyi:** **mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir tasarım;
Stagehand'de eşi yok. **Bugün Stagehand**: OTel + session replay _çalışıyor_, Tepegöz'ün Notary'si
(Phase 7) hâlâ bağlanmayı bekliyor.

### Kimlik bilgisi / sır işleme — kavramsal olarak Tepegöz, ama atıl

Stagehand: `variables` — modelin yalnız adı görmesi, değerin yerelde ikamesi; sırlar için log'u ve (cache
açıksa) `cache`'i kapat. OS-auth kapısı yok, kasa yok, "sır ajana hiç ulaşmaz" mimarisi yok — değer senin
sürecinde ve aksiyon argümanına ikame ediliyor. Tepegöz: **Credential Broker** — ajanda sırrın gireceği
bir şekil yok; OS-auth kapısı olana dek her dolgu reddedilir (**atıl sevk**) + `credential-vault` (BYO-key,
DPAPI/safeStorage) + strictGuard "hardened reading". **Kim daha iyi:** kavramsal **Tepegöz** (sır ajana
hiç ulaşmıyor) ama **atıl** — **bugün pratikte Stagehand'in `variables`'ı çalışıyor** (mütevazı ama
sevk edilmiş).

### Çevrimdışı / egemenlik — ikisi de zayıf, Stagehand daha da

Stagehand: SDK kendi env değişkenlerini okumaz; Model Gateway + önbellek **Browserbase bulutu** gerektirir.
Yerel tarayıcı çalışır ama o zaman Gateway/önbellek yok. Yerel model yalnız BYO callback ile. RAG yok,
gömülü çevrimdışı bilgi yok, tarayıcı-içi WebGPU yok. Tepegöz: `local-inference` seam'i + sha256'lı model
kataloğu + "basit adımlar cihazda" maliyet-tasarrufu düğmesi. Phase 8 / S12: **çoğu inşa edilmemiş**, S12
indirilmiş ağırlıklara takılı, sahiplik tablosu BOŞ; çevrimdışı RAG yok. **Kim daha iyi:** **Tepegöz** kıl
payı (en azından bir yerel çıkarım seam'i + GGUF katalog var); ama ikisi de "tam çevrimdışı ajan"dan uzak.

### Asistan UX — Stagehand'de yok (kütüphane), Tepegöz'de ürün

Stagehand: arayüz yok. UX = taktığın harness (Claude Code, Codex, …) ya da kendi kodun. Browserbase'in
web'de canlı-görünüm / session-replay panosu var. Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan
önizleme (adım seç), kademeli otonomi + amber risk banner, effort ön-ayarları, kaydırılabilir replay
timeline, kanıt rozetleri, çalışırken **steer**, pause/resume, arka-plana devam + tepsi, sekme-grubu-başı
oturum, sohbet geçmişi + arama, composer ekleri, ticaret çift-onay, scope-grant, Human Handoff Controller.
**Kim daha iyi:** örtüşmüyor — Stagehand UX sunmuyor; Tepegöz'ün sevk edilmiş bir ajan arayüzü var (ama
"measurement-owed").

### Bellek & skill'ler — ikisinde de yerleşik yok

Stagehand: bellek yok, skill kütüphanesi yok, workflow kaydedici yok, teacher mode yok. En yakını:
gözlenen bir aksiyonu kaydedip tekrar oynatmak (`observe()` → `act(action)`, inference'sız) + sunucu-taraflı
aksiyon önbelleği (talimat + sayfa içeriği + opsiyonlarla anahtarlanır, N özdeş sonuçtan sonra servis eder).
Tepegöz: S9 — alan-başı **advisory bellek** + yazma-tarafı zehir filtresi + sil-değil-karantina +
görev-çiti dışında yalnız-tavsiye recall (ADR-0027, **atıl sevk**); skill kütüphanesi = **saklı prompt
şablonları** (seçince kutuyu doldurur, **çalıştırmaz** — bilerek muhafazakâr); ayrıca deterministik
recipe/macro şeridi. **Kim daha iyi:** pratik "kaydet-ve-tekrarla" ekseninde **Stagehand** bugün (sunucu
önbelleği + observe/act replay çalışıyor); mimari (zehir filtresi, imzalı recipe oracle) **Tepegöz** ama
atıl/measurement-owed.

### Deterministik tekrar-oynatma & self-heal — ikisi de var, farklı olgunlukta

Stagehand: `act(Action)` (observe'un döndürdüğü aksiyonu geç) inference'sız deterministik replay;
sunucu-taraflı önbellek talimat/sayfa/opsiyon anahtarıyla (model config anahtara **dahil değil**);
`selfHeal` — seçici kırılırsa yeniden snapshot + yeniden çıkarım + tek tekrar; "site değişince Stagehand
fark eder ve aksiyonun nasıl olduğunu tazeler." Tepegöz: `recipe-compiler` — model-free imzalı replay +
`evaluateAssertion` success oracle + seçici iyileştirme; `macro-engine` — kontrol akışı + oto-bekleme.
**Kim daha iyi:** **bugün Stagehand** (selfHeal + sunucu önbelleği yayında, ölçülü); **mimaride Tepegöz**
(imzalı + oracle'lı + kontrol akışlı) ama recipe/macro S-fazları measurement-owed.

### MCP — ters yönler

Stagehand: esasen **MCP sunucusu** — `integrations/core` bir `stagehand-facade` stdio MCP sunucusu (3
araç) sevk ediyor ki dış ajanlar (Claude Code, Codex, CrewAI, …) tek kalıcı bir Stagehand tarayıcısını
sürebilsin. `@modelcontextprotocol/sdk` katalog bağımlılığı + codemode MCP host iskelesi. WebMCP
(`page.tools()`) _sayfa-ilanlı_ araçlar — ayrı bir kavram. SDK, Tepegöz'ün yaptığı gibi keyfi dış MCP
sunucularının bir istemcisi değil. Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP sunucularının araçları
Capability Registry'ye girer ve **aynı PEP'ten** geçer; `McpSupervisor`, `dangerClassFor` (bilinmeyen
annotation → en kısıtlı sınıf). MCP **sunucu** yüzeyi yok (Phase 1b, yapılmamış). **Kim daha iyi:** farklı
yönler — Stagehand "tarayıcıyı ajanlara aç" ekseninde sevk edilmiş bir özellikle önde; Tepegöz "dış
araçları tek deterministik kernel + audit'ten geçir" ekseninde önde.

### Site adaptörleri — ikisinde de yok

Stagehand: site adaptörü yok. `domainPolicy` (host allow/block) + Browserbase `blockAds`. Tepegöz: agent
için site-adaptör sistemi **yok**. Phase 2 "adapters" daha çok içerik/reklam engelleme + Safe Browsing
(ADR-0043). Hassas-site yalnızca _kategori_ (kilit için). **Kim daha iyi:** berabere — ikisinin de
sahibinden/trendyol gibi gerçek adaptörleri yok.

### Türkçe / bölgesel — Tepegöz

Stagehand: yalnız İngilizce doküman, i18n yok, bölgesel özellik yok (çok-dil derken TS/Python/Go kastediliyor,
insan dili değil). Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle
taşır (ADR-0016), `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036). Şirket Türk (roltek.com.tr). **Kim daha iyi:** **Tepegöz**
— net.

### Ölçüm / dürüstlük kültürü — farklı türde disiplin

Stagehand: `stagehand.dev/evals` — `act`/`extract`/`observe` için model karşılaştırma liderlik tablosu;
`packages/evals` (Braintrust entegrasyonu, trajectory group'lar, rubric cache). Sağlam mühendislik CI'ı
(ast-grep parity kuralları, şema strictness, oxlint). Migration belgeleri dürüst ("agent() yok, döngü
senin", "önbellek best-effort", "variables yine de cache'e gider"). **Ama** bu _ürün/SDK-sınıfı_ eval
(hangi model ilkellerde daha iyi) — adversaryal ASR / ground-truth güvenlik eval'i yok, çünkü ölçülecek
bir güvenlik katmanı yok; threat-model belgesi yok. Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek
sayfa, **ground-truth-önce** skorlama, LLM-judge ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı
donmuş fixture registry'leri, istatistiksel anayasa (Wilson CI, aile agregaları, iddia için N≥10),
**anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı iddiası **reddedilebilir** (`bridgeClaim` 25 insan
etiketinin altında `publishable:false`), ön-kayıtlı H2H protokolü. **Kim daha iyi:** Stagehand'inki
_bugün çalışan, yayımlanmış_ bir model-seçim eval'i; Tepegöz'ünki _araştırma-sınıfı_ bir ajan-yetenek +
güvenlik disiplini — ama madalyonun öbür yüzü, bu disiplin kısmen yetenek henüz orada olmadığı için var
(her S-fazı 🟠).

> Not: Tepegöz'ün roadmap'i `browser-use`/`nanobrowser` ailesini _"tekniği çal, asla benimseme"_ diye
> listeliyor. Stagehand aynı problemin **kütüphane tarafından** benzer bir "otonom ajan reddi" kararı
> verdi: `docs/v4/migrations/browser-use.mdx` açıkça _"Agent yok; adımları sen yaz"_ diyor. Yani iki proje
> de aynı "tek-cümle-görev + otonom döngü" yaklaşımından bilinçli olarak uzaklaşmış — Stagehand ilkelleri
> geliştiriciye bırakarak, Tepegöz deterministik bir kernel + tipli Reactor arkasına alarak.

---

## Örtüşmeyen alanlar

**Yalnızca Stagehand'de var (Tepegöz'de karşılığı yok):**

- **Çok-dilli SDK**: aynı yüzey TS + Python + Go; mevcut kodun içine `import` edilir.
- **Playwright-uyumlu tarayıcı sürücüsü**: `page.locator()` (CSS/XPath/`text=`), kapalı shadow DOM +
  OOPIF delme, `>>` iframe hop, tam `page`/`locator`/`context` API'si; test/otomasyon dünyasından tanıdık.
- **Browserbase Model Gateway**: `model` verme → sunucu per-çağrı model seçer; market-fiyatı, markup yok,
  sağlayıcı hesabı gerekmez.
- **Sunucu-taraflı yönetilen önbellek**: kurulum yok, dosya yok; talimat+sayfa+opsiyon anahtarı, eşik.
- **WebMCP** (`page.tools()`): sayfanın kendi ilan ettiği araçları keşfet + çağır (sevk edilmiş, deneysel
  Chromium bayrağı arkasında).
- **3-araçlı facade + harness ekosistemi**: tek kalıcı tarayıcıyı stdio MCP sunucusu ya da yerel araç
  olarak 9 dış ajan çatısına açan tekil sözleşme.
- **`experimentalBatch`**: serileştirilmiş JS callback'i sayfada Playwright-facade'a karşı tek turda koşturma.
- **OTel + Browserbase session replay**: sevk edilmiş (satıcı-barındırmalı) gözlemlenebilirlik hattı.
- **`code mode`** akışı: bir kodlama asistanının per-adım inference'sız, diff'lenebilir bir betik üretmesi.

**Yalnızca Tepegöz'de var (Stagehand'de karşılığı yok):**

- **Native tarayıcı** + out-of-process CDP + kendi sekme/pencere fabrikası + `@tepegoz/human-input`
  insan-benzeri girdi profili.
- **Model-öncesi deterministik Policy Kernel** (danger class + taint + site → deny/ask, argümanı görmeden)
  - hassas-site kategorik sert deny + biyometrik yüksek-risk kapısı.
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance +
  `detectHandoff` (captcha/2FA → insana devir).
- **Notary** (Phase 7): hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** +
  bağımsız `tepegoz-verify` CLI — paket yazılı ve testli, ama `apps/desktop`'a **bağlanmamış**; bugün
  hiçbir çalışma receipt üretmiyor.
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme + tuzak
  fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **Tek `ToolGateway` PEP**: built-in/MCP/extension aracı ayrımsız → zod → PolicyKernel → HITL → execute →
  audit.
- **İki-aşamalı HITL** + kademeli otonomi (`ask`/`act`/`auto`) + tam **Agent Console** UX (plan önizleme,
  replay timeline, steer, çift-onay, scope-grant).
- **MCP istemcisi**: dış MCP araçları aynı deterministik kernel + audit'ten geçer.
- **Credential Broker**: sırrın ajana ulaşacağı bir şekil yok (OS-auth olana dek reddet).
- **8 sağlayıcı + `local`** (GBNF gramer-zorlamalı JSON) + zorunlu per-çağrı `maxTokens`+`timeoutMs` +
  `TokenLedger`.
- **Türkçe/kamu derinliği**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H şartı, Phase 11
  e-Devlet/KVKK güven modeli, Türk şirket.
- **Araştırma-sınıfı `agent-eval`** + istatistiksel anayasa + anti-debt / PROSE-LEDGER + reddedilebilir
  kuzey-yıldızı iddiası.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                        | Stagehand                                                                                       | Tepegöz                                                                                                                                                                                                    | Kim daha iyi + neden                                                                                                              |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi**                          | Tarayıcı-ajan **SDK'sı** (kütüphane); ajan döngüsü/izin/UX çağırana ait                         | Tam **tarayıcı ajanı** ürünü; döngü/izin/UX ürünün içinde                                                                                                                                                  | **Örtüşmüyor** — "kim iyi" ancak alt-eksenlerde anlamlı                                                                           |
| 2   | **Dağıtım / form**                           | `import` + Chrome eklentisi + (opsiyonel) Browserbase bulutu; mevcut koda sıfır-göç             | Tam Electron tarayıcı; kurulum + tarayıcı değişimi gerek, henüz yayında değil                                                                                                                              | **Bugün Stagehand** (erişim, çok-dil, olgunluk). Yapısal olarak Tepegöz (kontrol derinliği)                                       |
| 3   | **Sağlayıcı genişliği + sıfır-kurulum**      | 5 birinci-sınıf + **Model Gateway** (anahtarsız, per-çağrı oto-yönlendirme) + BYO callback      | 8 sağlayıcı (bazıları stub) + `local`; sıfır-kurulum bulut yok                                                                                                                                             | **Stagehand** — Gateway gerçek bir kolaylık; yüzey daha ergonomik                                                                 |
| 4   | **Sağlayıcı mimarisi**                       | AI SDK normalizasyonu, `provider/model` doğrulaması                                             | Tek `Canon*` şeması, capability→tier router, zorunlu `maxTokens`+`timeoutMs`, GBNF, DPAPI kasa                                                                                                             | **Tepegöz** — daha tipli, tek kaynak, bütçesiz çağrı imkânsız                                                                     |
| 5   | **Yerel / çevrimdışı çıkarım**               | Yalnız BYO callback ile; yerleşik yerel motor / GGUF yok                                        | `local-inference` (node-llama-cpp) + sha256'lı GGUF katalog + GBNF JSON zorlaması                                                                                                                          | **Tepegöz** — sevk edilmiş bir yerel seam; ama S12 measurement-owed                                                               |
| 6   | **Sayfa algısı (bugün)**                     | Hibrit a11y ağacı, kare birleştirme, kapalı shadow DOM + OOPIF, `xpathMap`, diff                | DOM/a11y + diff/elision + article + sanitizer; vision atıl                                                                                                                                                 | **Stagehand** — aynı yaklaşım, bugün yayında ve ölçülü, kapalı shadow DOM piercing sevk edilmiş                                   |
| 7   | **Algı ekonomisi (token)**                   | Hibrit ağaç budaması (projenin 1 numaralı önceliği) + twoStep diff + salt-metin `act`/`observe` | Değişen-only diff + unchanged elision + sanitizer paketi                                                                                                                                                   | **Berabere** — mekanizma benzer; Stagehand'inki ölçülü, Tepegöz'ünki tasarım                                                      |
| 8   | **Aksiyon repertuvarı genişliği**            | ~10 model-destekli yöntem + tam Playwright `page`/`locator` yüzeyi + WebMCP + batch             | ~30 araç + tam dosya-sistemi + clipboard + download/upload + journal + task                                                                                                                                | **Stagehand** — Playwright yüzeyi + WebMCP + çok-dil pratik kapsama                                                               |
| 9   | **Araç çağırma disiplini**                   | İzin yok; her şey doğrudan çalışır (harness kurar)                                              | **Tek PEP**: zod→PolicyKernel→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                                                             | **Tepegöz** — her araç istisnasız aynı deterministik hattan                                                                       |
| 10  | **Deterministik (model-free) otomasyon**     | `act(Action)` replay + sunucu önbelleği + `selfHeal` (tek tekrar)                               | `macro-engine` (kontrol akışı) + `recipe-compiler` (imzalı, `evaluateAssertion` oracle)                                                                                                                    | **Bugün Stagehand** (selfHeal + önbellek yayında); **mimaride Tepegöz** (imzalı + oracle'lı)                                      |
| 11  | **Ajan döngüsü / orkestrasyon**              | Yerleşik yok (v4'te `agent()` kaldırıldı); döngü çağırana ait                                   | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL; **tek eşzamanlı run**, resume yok                                                                                                                | **Tepegöz** mimari tasarımda; "çalışıyor mu" ikisinde de kanıtsız                                                                 |
| 12  | **Computer-use (CUA) modu**                  | v3'te vardı, **v4'te kaldırıldı**, "eşdeğeri yok"                                               | Yok (vision atıl, ADR-0008 yalnız-eskalasyon)                                                                                                                                                              | **Berabere-yok** — ikisi de bugün CUA sunmuyor                                                                                    |
| 13  | **Doğrulanmış sonuç / yalan-başarı**         | Yalnız `extract` parça-sayfalaması için "completed" bool'u                                      | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + rozetler + origin kapısı                                                                                                                | **Tepegöz** — belirgin fark; mekanizma bile Stagehand'inkini aşıyor (ölçüm borçlu)                                                |
| 14  | **Prompt-injection savunması (mimari)**      | Esasen yok (harness'e bırakılmış); yalnız hata-mesajı redaksiyonu + domain policy               | Model-ÖNCESİ Policy Kernel + EgressFirewall + taint provenance + biyometrik + sanitizer paketi                                                                                                             | **Tepegöz** — Stagehand bu eksende bilerek oynamıyor                                                                              |
| 15  | **Prompt-injection (kanıt bugün)**           | Yayımlanmış ASR / adversaryal korpus yok                                                        | Redteam + injection-corpus var ama claim-grade ASR bataryası measurement-owed                                                                                                                              | **Berabere-zayıf** — ikisinin de bugün yayımlanmış ASR sayısı yok                                                                 |
| 16  | **Hesap verebilirlik / denetlenebilirlik**   | OTel span'ları + `metrics()` + Browserbase session replay (satıcı-barındırmalı)                 | Sevk edilmiş: event-sourced journal. **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + `tepegoz-verify` CLI) yazılı/testli ama **bağlanmamış** — bugün receipt üretmiyor | **Tepegöz** mimaride (kriptografik, satıcıdan bağımsız); **Stagehand bugün** (OTel + replay yayında, Notary ise henüz bağlanmadı) |
| 17  | **Kimlik bilgisi / sır işleme**              | `variables` (ad modele, değer yerelde ikame); cache/log'u kapat                                 | Credential Broker (sırrın gireceği şekil yok) + `credential-vault` (**atıl**)                                                                                                                              | **Kavramsal Tepegöz** (sır ajana ulaşmıyor) ama **atıl** — **bugün pratikte Stagehand** çalışıyor                                 |
| 18  | **Çevrimdışı / egemenlik**                   | Gateway + önbellek Browserbase bulutu gerektirir; yerelde bunlar yok; RAG yok                   | `local-inference` seam + model kataloğu + maliyet-tasarrufu düğmesi; RAG yok                                                                                                                               | **Tepegöz** kıl payı (bir yerel seam var); ikisi de tam çevrimdışı ajandan uzak                                                   |
| 19  | **Asistan UX**                               | Yok (kütüphane); UX taktığın harness'e ait                                                      | Agent Console: plan önizleme, kademeli otonomi, risk banner, replay timeline, steer, çift-onay                                                                                                             | **Örtüşmüyor** — Stagehand UX sunmuyor; Tepegöz'ün sevk edilmiş bir arayüzü var                                                   |
| 20  | **Bellek & skill'ler**                       | Yerleşik yok; en yakını observe/act replay + sunucu önbelleği                                   | S9 advisory bellek + zehir filtresi + karantina (**atıl**); skill = yalnız prompt şablonu; recipe/macro                                                                                                    | **Stagehand** pratik "kaydet-tekrarla"da bugün; **Tepegöz** mimaride (ama atıl)                                                   |
| 21  | **MCP**                                      | **Sunucu**: 3-araçlı facade → 9 dış ajan çatısı tarayıcıyı sürer; WebMCP (sayfa-ilanlı)         | **İstemci**: dış MCP araçları tek PEP + audit altından geçer; sunucu yüzeyi yok                                                                                                                            | **Farklı yönler** — Stagehand "tarayıcıyı ajanlara aç"da sevk edilmiş; Tepegöz mimari temizlikte                                  |
| 22  | **Self-heal / site-değişimine dayanıklılık** | `selfHeal` (yeniden snapshot + yeniden çıkarım + tek tekrar) + önbellek stale-fallback          | `recipe-compiler` seçici iyileştirme + `macro-engine` oto-bekleme                                                                                                                                          | **Bugün Stagehand** (yayında, ölçülü); **mimaride Tepegöz** (imzalı + oracle) ama measurement-owed                                |
| 23  | **Site adaptörleri**                         | Yok (yalnız domain allow/block + blockAds)                                                      | Yok (Phase 2 daha çok adblock + Safe Browsing)                                                                                                                                                             | **Berabere** — ikisinde de gerçek site adaptörü yok                                                                               |
| 24  | **Türkçe / bölgesel derinlik**               | Yok (çok-dil = TS/Python/Go, insan dili değil)                                                  | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli                                                                                                                     | **Tepegöz** — net                                                                                                                 |
| 25  | **Ölçüm / dürüstlük kültürü**                | `evals` model liderlik tablosu + Braintrust + sağlam CI; ASR/ground-truth güvenlik eval'i yok   | Ground-truth eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                                  | **Tepegöz** — araştırma-sınıfı disiplin (ama bu, yeteneğin henüz orada olmadığının da işareti)                                    |
| 26  | **Çok-dil / gömülebilirlik**                 | TS + Python + Go, aynı yüzey; mevcut koda `import`                                              | Yalnız TS/Electron; gömülebilir bir SDK değil                                                                                                                                                              | **Stagehand** — net                                                                                                               |
| 27  | **"Bugün çalışıyor mu"**                     | Evet — v4.0.2, npm/PyPI/Go, Browserbase üretimi, gerçek kullanıcılar                            | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                               | **Stagehand** — kesin (kendi kategorisinde)                                                                                       |

---

## Sonuç

**Bunlar farklı türde şeyler.** Stagehand geliştiricinin kendi tarayıcı-ajanını üstüne kurduğu bir SDK;
Tepegöz web'de görev yürüten güvenlik-önce bir son-kullanıcı tarayıcı ajanı. "Hangisi daha iyi" sorusu
bütün olarak yanlış sorudur: Stagehand'de model-öncesi Policy Kernel, EgressFirewall, Notary replay-receipt,
kanıt-atıflı tamamlama, iki-aşamalı HITL ya da bir Agent Console yok — bunlar **kasıtlı olarak** geliştiriciye
ya da seçtiği ajan çatısına bırakılmış. Tepegöz'de çok-dilli SDK, Playwright-uyumlu sürücü, Model Gateway,
sunucu-taraflı önbellek, WebMCP ya da OTel + session replay hattı yok.

**Bugün, genişlik ve "çalışıyor" ekseninde Stagehand önde:** yayımlanmış çok-dilli (TS/Python/Go) bir SDK,
gerçek ürünlerin üstüne kurduğu olgun bir tarayıcı sürücüsü, Model Gateway ile kredi-kartsız başlangıç ve
per-çağrı model yönlendirmesi, sunucu-taraflı yönetilen önbellek, sevk edilmiş self-heal, kapalı shadow
DOM + OOPIF delen deterministik `locator()`, WebMCP, ve 3-araçlı facade'ı bir MCP sunucusu olarak dokuz dış
ajan çatısına açan bir entegrasyon ekosistemi. Örtüşen teknik eksenlerin çoğunda (algı ekonomisi, sağlayıcı
ergonomisi, deterministik tekrar-oynatma, önbellek, self-heal, gözlemlenebilirlik hattı) Stagehand ya
bugün önde ya da eşit.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz önde** — ama bu, Stagehand'in _oynamayı
seçmediği_ bir sahada: model-öncesi deterministik Policy Kernel, `EgressFirewall` entropi denetimi, taint
provenance, biyometrik yüksek-risk kapıları, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify`
(Stagehand'de eşi yok — ama Notary paketi yazılı/testli olsa da uygulamaya bağlanmadığı için bugün
hiçbir çalışma receipt üretmiyor), kanıt-atıflı tamamlama + yalan-başarı savunması, tek `ToolGateway` PEP,
model-free imzalı macro/recipe şeridi, MCP-istemcisi tarafında her dış aracın aynı kernel + audit'ten
geçmesi, zorunlu per-çağrı bütçe alanları, araştırma-sınıfı `agent-eval` + anti-debt kültürü, ve
Türkçe/kamu derinliği.

Dürüst özet: **Stagehand bugün iş gören, olgun bir SDK (kendi kategorisinde); Tepegöz'ün ajanı henüz
kanıtlanmadı** — her S-fazı 🟠 measurement-owed, üç yetenek (vision, credential-broker, memory) atıl sevk,
aynı anda tek run, sağlayıcıların bir kısmı stub, site adaptörü yok. İki proje de "tek-cümle-görev + otonom
döngü" (browser-use/nanobrowser) yaklaşımından bilinçli uzaklaşmış: Stagehand ilkelleri geliştiriciye
bırakarak, Tepegöz deterministik bir kernel + tipli Reactor arkasına alarak. Kendi tarayıcı-ajanını inşa
eden bir geliştiriciysen ve döngüyü, politikayı, onayı kendin sahiplenmek istiyorsan → **Stagehand**. Tez
"oturum-açık banka oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, model-öncesi
deterministik bir çekirdekten geçen, kutudan çıktığı gibi Türkçe bir _son-kullanıcı_ tarayıcı ajanı" ise →
o Tepegöz'ün oyunu, hâlâ tezgâhta.
