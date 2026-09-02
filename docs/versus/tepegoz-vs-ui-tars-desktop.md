# Tepegöz vs UI-TARS Desktop — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **UI-TARS Desktop** (ByteDance'in Apache-2.0 lisanslı,
> yayında olan masaüstü GUI-ajanı; `UI-TARS` görüntü-dil modeli tarafından sürülür) — ve onunla aynı
> depoda yaşayan **Agent TARS** (genel çok-kipli ajan yığını, CLI + Web UI) — arasında, iş-iş kimin
> neyi daha iyi yaptığını tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/ui-tars-desktop` deposunun (`README.md` / `README.zh-CN.md`, `docs/{sdk,quick-start,
setting,preset,deployment}.md`, `rfcs/`, `apps/ui-tars/src/main/{services/runAgent,agent/operator,
agent/prompts,ipcRoutes/permission,services/utio,store/types}`, `packages/ui-tars/{sdk/src/GUIAgent,
sdk/src/constants,action-parser/src/actionParser,operators/browser-operator/src/browser-operator,
shared/src/constants}`, `multimodal/{tarko/agent/src/agent/**, tarko/model-provider/src/**,
tarko/llm-client/src/models, agent-tars/core/src/{agent-tars,prompt,environments/local/**}}`,
> `packages/agent-infra/{browser-use,mcp-http-server,mcp-servers}`) ve bu reponun AI yüzeyinin
> (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input|agent-eval`, `extensions/ext-agent`,
> `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili.** UI-TARS Desktop'a özel bir parity track'i **henüz yok**; üretilirse `prompts/rival-agent-parity-track.md`
> bu belgeyi girdi alır. Yapı ve dil için referans: [`docs/others/tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md)
> ve [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md).
>
> **Kategori uyarısı.** Bu depo iki ayrı ürün taşıyor ve ikisi de Tepegöz'le tam olarak aynı kategoride
> değil. **UI-TARS Desktop** bir _GUI / bilgisayar-kullanımı ajanı_: ekran görüntüsü alır, bir
> görüntü-dil modeli (VLM) bir sonraki aksiyonu **piksel koordinatı** olarak tahmin eder, uygulama
> gerçek fareyi/klavyeyi sürer — hedefi yalnız tarayıcı değil, **tüm işletim sistemi** (VS Code, ayarlar,
> herhangi bir masaüstü uygulaması). **Agent TARS** bir _genel çok-kipli ajan_: terminal + kod (Python)
>
> - tarayıcı + MCP araçlarını bir Linux sandbox'ında birleştirir. Tepegöz ise _güvenlik-önce native bir
>   tarayıcı + tarayıcı ajanı_: DOM/a11y-önce algı (ADR-0008; vision yalnız eskalasyon), model-öncesi
>   deterministik Policy Kernel, kanıta-atıflı imzalı tamamlama. Head-to-head yalnızca **tarayıcı
>   görevleri** ekseninde anlamlı; orada da asıl kontrast **vision-koordinat paradigması vs Tepegöz'ün
>   DOM/a11y-önce yaklaşımı**. Bilgisayar-geneli GUI kontrolü ve "modeli kendimiz eğitiyoruz" açısı
>   "Örtüşmeyen alanlar"da ayrı tutuldu.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | UI-TARS Desktop (+ Agent TARS)                                                                                                                                            | Tepegöz                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | UI-TARS Desktop: Electron **masaüstü uygulaması**, UI-TARS VLM ile bilgisayarı/tarayıcıyı sürer. Agent TARS: `@agent-tars/cli` + Web UI, terminal/kod/tarayıcı/MCP ajanı  | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — GitHub Releases, Homebrew cask, ByteDance destekli, arXiv makalesi (2501.12326), HF'de yayımlı model ağırlıkları. Agent TARS CLI `v0.3.0` (2025-11), "Beta" | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | TypeScript, pnpm + turbo, iki iç-içe monorepo (`apps/` + `multimodal/`), "Tarko" ajan çatısı; `@ui-tars/sdk` çapraz-platform SDK                                          | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her sınırda                                                  |
| Felsefe     | "Native GUI ajanı" — modelin kendisi (UI-TARS) üründür; SDK/operatör ince, model kalın. Pratik, otomasyonu **onaysız** yürütür                                            | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Ekran görüntüsünden koordinat tahmin edip **herhangi bir GUI'yi** sürmek (bilgisayar veya tarayıcı); Agent TARS'ta ayrıca kod/terminal/araştırma                          | Web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu                                        |

Yani: **yayında, model-merkezli, bilgisayar-geneli çalışan bir GUI ajanı** (ve yanında geniş bir çok-kipli
ajan) vs. **erken, mimari ağırlıklı, güvenlik-önce bir native-tarayıcı ajanı**. Bugünkü "işi yapıyor mu"
ile "doğru inşa edilmiş mi" farklı eksenler; UI-TARS tarafında ayrıca "bunu bir masaüstünde koşturmak
istiyor musun" sorusu var.

---

## Derinlemesine: iş iş kim ne yapıyor

### Algı paradigması (sayfayı/ekranı okuma) — merkezî kontrast

UI-TARS Desktop: **saf vision + koordinat.** Her döngüde ekran görüntüsü alınır, base64 olarak son 5 kare
VLM'e verilir, model `Thought: … / Action: click(start_box='[x1,y1,x2,y2]')` üretir; `action-parser`
normalize kutuları (0–1000 faktör, v1.5'te smart-resize) fiziksel piksele çevirir; operatör fareyi o
noktaya sürer. **DOM'a hiç bakmaz** — tarayıcı operatöründe bile "tıklanabilir öğeleri highlight'la, sonra
screenshot al" yapılır, yani yine görüntü. Erişilebilirlik ağacı, `ref_id`, metin çıkarımı yok. Agent
TARS'ın `dom` ve `hybrid` modları `browser_get_markdown` + CDP tabanlı DOM araçları ekler; `visual-grounding`
modu yine UI-TARS koordinat kontrolü (`browser_vision_control`).

Tepegöz: **DOM/a11y-önce (ADR-0008).** Kimlik-kararlı ref'ler + diff/dedupe/elision (token kesmek için),
`aria-labelledby`/`label[for]` çözümü, `browser_get_article`. `@tepegoz/tool-executor` gizli/zero-width/
bidi/homoglyph enjeksiyon vektörlerini ayrı pakette temizliyor. Vision **yalnız eskalasyon** — ve bugün
**atıl, çünkü hiç bağlanmamış**: Reactor'ın `captureVision` geri-çağrısı opsiyonel (`reactor-types.ts`)
ve üretimde onu geçen bir çağıran yok (yalnız testler geçiyor), yani eskalasyon hiç tetiklenmiyor.
Set-of-marks + bütçeli küçültme tasarlanmış ama ölçülmemiş.

**Kim daha iyi:** Paradigma tercihi. Vision-koordinat **daha genel** (DOM'u olmayan native uygulamalar,
canvas, gömülü içerik, PDF görüntüsü hepsi aynı) ve DOM çürümesine dayanıklı; ama **token-pahalı, yavaş
(her adım bir görüntü çıkarımı), yoğun DOM'da daha az hassas, viewport dışını görmez**. Tepegöz'ün
yaklaşımı temiz DOM'da daha ucuz/hızlı/kesin ve vision'ı yedeğe koyuyor — **ama bu bir tasarım iddiası,
kanıtlanmadı** ve vision katmanı atıl. UI-TARS bunu bir modele bağlamış ve o model gerçekten var; Tepegöz
henüz göstermedi.

### Model / sağlayıcı desteği — Agent TARS geniş, UI-TARS Desktop tek aile

UI-TARS Desktop: sağlayıcı = **bir OpenAI-uyumlu VLM endpoint'i** (`baseURL`+`apiKey`+`model`). Ayar
enum'u pratikte tek model ailesi: "Hugging Face for UI-TARS-1.0/1.5", "VolcEngine Ark for Doubao-1.5-UI-TARS",
"VolcEngine Ark for Doubao-1.5-thinking-vision-pro" + ücretsiz uzak proxy. İsteğe bağlı "Use Responses API".
Yani "kendi UI-TARS uyumlu VLM'ini getir" — çok-sağlayıcı bir yönlendirici değil.

Agent TARS: `@tarko/model-provider` → `@tarko/llm-client` taban işleyicileri: **openai, anthropic, gemini,
mistral, groq, perplexity, openrouter, openai-compatible, azure-openai** (+ ai21 işleyicisi) — üst-düzey
genişletilmişler: **ollama, lm-studio, volcengine, deepseek**. Toplam ~13–14 adlandırılmış sağlayıcı, çoğu
OpenAI-uyumlu arayüze normalize, bazıları native (anthropic/gemini/azure/openrouter). Resmî `openai` SDK'sı
kullanılıyor.

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u GBNF gramerle zorlayan). Hepsi tek `CanonRequest/
CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify) tier+yerel/bulut'a eşliyor;
DPAPI'li BYO-key kasası. Ama yalnız Anthropic gerçek SDK kullanıyor, birkaç sağlayıcı stub, sıfır-kurulum
bulut yok.

**Kim daha iyi:** Ham genişlikte **Agent TARS** (13–14 vs 8). Sağlayıcı **mimarisinde** Tepegöz (tek
`Canon*` şeması + capability→tier router + GBNF zorlaması daha temiz ve tipli). UI-TARS Desktop'un kendi
sağlayıcı hikâyesi kasten dar — çünkü ürün modele bağlı.

### Aksiyon repertuvarı — UI-TARS küçük ve tek-tip, Tepegöz geniş ama disiplinli

UI-TARS Desktop: **~10 GUI aksiyonu** — `click`, `left_double`, `right_single`, `drag`, `hotkey`, `type`,
`scroll`, `wait`, `finished`, `call_user`; tarayıcı operatörü `navigate` / `navigate_back` / `press` /
`release` ekler. Hepsi koordinat-tabanlı; sekme yönetimi, dosya sistemi, indirme, pano yok (bunlar Agent
TARS'ta MCP araçları olarak var). Agent TARS `hybrid` modunda DOM tarafı ~13 araç ekler (`browser_click`,
`browser_form_input_fill`, `browser_get_markdown`, `browser_tab_list`, `browser_evaluate`, …) + filesystem

- shell + arama.

Tepegöz: **~30 araç ama hepsi tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*` (spawn + egress_blocked dahil), `web_*`
(search/get_page/send_form), **`file_*`** (tam sandbox'lı dosya sistemi), `clipboard_*`, `download_*`,
`journal_search_events`, `task_*`. **`execute_js`/terminal/kod-editleme YOK** (ADR-0026 izole-dünya
ölçümle çürütüldü; ADR-0029 DevTools kullanıcı-only). Ayrıca **model-free deterministik şerit**:
`@tepegoz/macro-engine` + `@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren seçicili replay) +
`@tepegoz/human-input` (Catmull-Rom fare eğrileri, Gaussian jitter).

**Kim daha iyi:** Ham kapsama **Agent TARS** (shell + Python + kod editörü + MCP ile bir "bilgisayar
ajanı" repertuvarı). Araç **çağırma disiplininde** açık ara **Tepegöz** — UI-TARS/Agent TARS'ta hiçbir
araç bir politika kapısından geçmiyor, doğrudan çalıştırılıyor.

### Ajan döngüsü / orkestrasyon

UI-TARS Desktop: tek `GUIAgent.run()` `while(true)` döngüsü. Her tur: screenshot → VLM → parse → operatör
execute. `maxLoopCount` varsayılan 100 (aralık 25–200), son 5 görüntü kayan pencere (`MAX_IMAGE_LENGTH=5`),
`async-retry` (model 5, screenshot 5, execute 1), `MAX_SNAPSHOT_ERR_CNT=10`, `loopIntervalInMs` bekleme.
`pause()/resume()/stop()` + `AbortSignal`. **Döngü dedektörü yok** (yalnız max-loop + snapshot-hata
sayacı); metin sıkıştırma / context kondensasyonu yok — sadece görüntü penceresi kırpılıyor.

Agent TARS (Tarko): olay-akışı güdümlü `LoopExecutor` → `LLMProcessor` → `ToolProcessor`; `maxIterations`,
üç tool-call motoru (**Native / PromptEngineering / StructuredOutputs**), `MessageHistory` görüntü sayısını
`maxImagesCount` ile sınırlıyor, `onEachAgentLoopEnd` / `onBeforeLoopTermination` kancaları (üst-düzey
ajan devamı engelleyebilir). `omni-tars` bunları "composable" bir ajanda (code + gui + mcp) birleştiriyor.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`). İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi
de fail-safe. Native tool-calling anthropic/openai/gemini'de; streaming sınırı ADR-0025.
`CompletionEvidence`, navigation-grounding, cache-window (lag-2 breakpoint). Ama **aynı anda tek çalışma**
(ADR-0013); paralel/dayanıklı checkpoint-resume roadmap'te, sevk edilmedi.

**Kim daha iyi:** Savaş-testi ve dayanıklılıkta **UI-TARS/Agent TARS** (yayında, uzun run'lar, retry
matrisi, olay-akışı görselleştirici). Yapısal açıklık ve tipli karar modelinde **Tepegöz** — ama
serileştirilmiş ve kanıtsız.

### Mod sistemi / multi-agent

UI-TARS Desktop: operatör seçimi (LocalComputer / LocalBrowser / RemoteComputer / RemoteBrowser) +
`VlmMode` (Chat/Agent). Multi-agent yok. Agent TARS: **üç tarayıcı-kontrol stratejisi** (`dom` /
`visual-grounding` / `hybrid`) ve `omni-tars` composable ajan (kod + GUI + MCP eklentileri, birleşik
tool-call motoru).

Tepegöz: tek orkestratör hattı, çoklu **otonomi** seviyesi (`ask`/`act`/`auto`) + effort ön-ayarları
(low…max). Multi-agent yok; Agent Console'da palet (Chat/Do/Make/Tasks).

**Kim daha iyi:** Tarayıcı-kontrol **stratejisi seçilebilirliğinde** Agent TARS (`hybrid` gerçekten
faydalı bir fikir). Otonomi **seviyelendirmesinde** Tepegöz.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

UI-TARS Desktop: `finished()` / `finished(content=…)` aksiyonu modelin kendi kararı; sayfa/ekran
durumunun iddiayı çürütüp çürütmediğine dair deterministik bir kontrol **yok**. `call_user()` benzer
şekilde yalnız model "takıldım" derse tetikleniyor. Agent TARS: son mesaj araç-çağrısı içermiyorsa
"final answer" kabul ediliyor; `onBeforeLoopTermination` kancası var ama içerik-kanıt oracle'ı değil.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme**: model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz; "Saved!" yazan ama 5xx dönen tuzak fixture'lar; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı; recipe-compiler'ın
`evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi yakalıyor. Kuzey-yıldızı
koşulu #3: _"fabricated-success ≈ 0"_.

**Kim daha iyi:** **Tepegöz** — mekanizma düzeyinde belirgin fark. Ölçüm hâlâ borçlu, ama UI-TARS
tarafında bu kategoride yapı neredeyse hiç yok.

### Prompt-injection savunması

UI-TARS Desktop: **hiç yok.** Ekran görüntüsünün kendisi güvenilmez içeriktir; sarma, ayrıştırma,
sanitizasyon, sistem-prompt sözleşmesi yok. Sistem prompt'u ~15 satır ("You are a GUI agent… Output
Format… Action Space…"). Agent TARS: koddaki "sanitize" yalnız log redaksiyonu (run-options); enjeksiyon
korpusu / origin kapısı / çıkış denetimi yok. Sistem prompt'u yalnız _tavsiye_ veriyor ("suggest user to
take over for sensitive operations").

Tepegöz: **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006): danger class + taint + hedef site →
allow/deny/ask + makine-okunur reason code + biyometrik (Windows Hello). Hassas-site kilidi (banka/kripto/
sağlık/kamu/parola yöneticisi) = **her otonomi seviyesinde sert deny**. **EgressFirewall** (`inspectEgress`,
Shannon entropisi — sızıntı/yüksek-entropi blob tespiti). `TaintTracker` provenance. `detectHandoff`
(captcha/2FA). Advisory critic (kernel-sonrası, engelleyemez).

**Kim daha iyi:** **Tepegöz** — hem mimari hem niyet düzeyinde. UI-TARS/Agent TARS bu ekseni boş
bırakmış; bir bilgisayar-kullanımı ajanı için bu ciddi bir açık.

### İzin / onay / otonomi modeli

UI-TARS Desktop: **onay yok.** Talimatı ver, ajan gerçek fareyi/klavyeyi sürmeye başlar. Tek kapı:
macOS'ta OS-seviyesi Accessibility + Screen Recording izinleri (Windows/Linux'ta o bile yok —
`{ screenCapture: true, accessibility: true }` sabit dönüyor). Kullanıcı kontrolü = pause/stop
düğmeleri + modelin kendi `call_user()`'ı. Agent TARS sandbox prompt'u: "onay isteyen komutlardan kaçın,
`-y`/`-f` kullan".

Tepegöz: `@tepegoz/agent-runtime` **iki-aşamalı HITL** (plan önizleme + araç-başı), her ikisi fail-safe
(yanıt yok = deny). Kademeli otonomi (`ask`/`act`/`auto`) + amber risk banner; ticaret çift-onay; scope
grant; Human Handoff Controller (CAPTCHA/2FA'yı çözmez, kullanıcıya verir). Otonomi yalnız kernel'in
sorduğu prompt'u atlayabilir, **deny'ı bozamaz**.

**Kim daha iyi:** **Tepegöz** — kesin. UI-TARS Desktop'ta bilinçli olarak "sadece çalıştır" var; bu bazı
kullanıcılar için özellik, ama güvenlik ekseninde savunma yok.

### Hesap verebilirlik / denetlenebilirlik

UI-TARS Desktop: HTML rapor dışa-aktarımı ("Export as HTML" / Share) + isteğe bağlı **UTIO** telemetri
endpoint'i (`appLaunched`, `sendInstruction` — ham talimatı gönderir, `shareReport`) + rapor depolama
sunucusu. İmza yok, zincir yok. Agent TARS: olay-akışı + `message-history-dumper` + Event Stream Viewer
(debug). `@tarko/agent-snapshot` bir **test** çatısı, kullanıcı checkpoint'i değil.

Tepegöz: sevk edilmiş olan **event-sourced journal**. **Notary** (ADR-0030) — hash-zinciri + Ed25519
imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify` CLI — yazılı ve testli,
**ama `apps/desktop`'a bağlanmamış**: `@tepegoz/notary` uygulamada hiçbir yerden import edilmiyor, yani
**bugün hiçbir çalışma receipt üretmiyor** (ADR-0030 bunu kendisi kaydediyor).

**Kim daha iyi:** **mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir tasarım;
UI-TARS tarafında eşi yok (ve UTIO tersine, ham talimatı bir sunucuya yollayan bir telemetri kanalı).
**Bugünkü sevk edilmiş kayıt** ekseninde ise fark iddia edildiği kadar büyük değil: Tepegöz'de de bugün
çalışan tek şey yerel journal; imzalı receipt hattı bağlanmayı bekliyor.

### Kimlik bilgisi / sır işleme

UI-TARS Desktop: özel bir mekanizma yok. Model ekranda parola alanı görürse `type()` ile doldurabilir;
redaksiyon, credential-field tespiti, sır-broker yok. VLM API anahtarı ayar deposunda tutuluyor.

Tepegöz: **Credential Broker** — ajanda sırrın gireceği bir _şekil_ yok; OS-auth kapısı olana dek her
dolgu reddedilir (**atıl sevk**). `credential-vault` BYO-key, DPAPI/safeStorage. EgressFirewall sır
sızıntısını çıkışta denetliyor.

**Kim daha iyi:** Kavramsal olarak **Tepegöz** (sır ajana hiç ulaşmıyor) — ama katman **atıl**, yani
bugün pratikte ikisi de bu işi "çözmüş" sayılmaz; UI-TARS hiç denemiyor, Tepegöz deniyor ama açmamış.

### Checkpoint / geri-alma

UI-TARS Desktop: yok. Agent TARS: yok (snapshot = test). Tepegöz: **Notary** imzalı checkpoint + Replay
Receipt — ama paket uygulamaya **bağlanmadığı için bugün hiçbir checkpoint üretilmiyor**; ayrıca
recipe-compiler model-free replay. Dayanıklı checkpoint-resume (run ortasında kaldığı yerden) **henüz
sevk edilmedi**.

**Kim daha iyi:** **Tepegöz** (mimaride) — ama "run'u kaldığı yerden sürdür" ikisinde de yok.

### Çevrimdışı / yerel model / egemenlik

UI-TARS Desktop: "fully local processing" iddiası = VLM endpoint'ini yerelde (vLLM/HF/Ollama, OpenAI-uyumlu
olduğu sürece) çalıştırırsan ekran görüntüleri dışarı çıkmaz. Ama **gömülü çıkarım motoru veya model
kataloğu yok** — UI-TARS-7B'yi kendin deploy edersin. RAG yok. Agent TARS: ollama/lm-studio sağlayıcıları

- Linux sandbox; RAG yok.

Tepegöz: `@tepegoz/local-inference` (node-llama-cpp `LlamaEngine`, `responseFormat:'json'`'da GBNF) +
`@tepegoz/model-catalog` (ZORUNLU sha256, resumable indirme) + maliyet-tasarrufu düğmesi. Phase 8 / S12
**çoğu inşa edilmemiş**, S12 indirilmiş ağırlıklara takılı.

**Kim daha iyi:** Yerel VLM'i _bugün_ koşturabilme pratiğinde **UI-TARS** (model gerçek, deploy yolu
belgelenmiş). Gömülü yerel-çıkarım **altyapısında** Tepegöz daha ileri (motor + sha256'lı katalog) ama
kullanıcıya sunulan uçtan uca akış eksik. Çevrimdışı RAG ikisinde de yok.

### MCP — yön

UI-TARS Desktop uygulaması: MCP merkezî değil (yakın zamanda eklenen `mcp-http-server` genel bir
HTTP+SSE MCP sunucu çatısı, `127.0.0.1` varsayılanına çekildi). Asıl MCP hikâyesi **Agent TARS**'ta:
çekirdek `MCPAgent` üzerine kurulu, **in-process MCP sunucuları** (browser / filesystem / commands) +
kullanıcının `mcpServers` ile monte ettiği **dış MCP sunucuları**. Yani Agent TARS bir MCP **istemcisi/
host'u**; ayrıca `@agent-infra/mcp-server-*` paketleriyle sunucu da yayınlıyor (iki yönlü).

Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP sunucularının araçları Capability Plane'e girer ve
**aynı PEP'ten** geçer. `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen
annotation → en kısıtlı sınıf). MCP **server** yüzeyi yok (Phase 1b, yapılmamış).

**Kim daha iyi:** Ham MCP entegrasyonu ve olgunluğunda **Agent TARS** (kernel MCP üzerine kurulu, hem
istemci hem sunucu). Mimari **temizlikte** Tepegöz (dış MCP araçları da istisnasız politika kapısından
geçiyor).

### Deterministik (model-free) otomasyon

UI-TARS Desktop / Agent TARS: yok — her adım modele gider. "Preset"ler yalnız ayar paketi (model config),
kayıtlı iş akışı değil. Tepegöz: `@tepegoz/macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme) +
`@tepegoz/recipe-compiler` (imzalı, oracle'lı, kendini iyileştiren seçicili tekrar-oynatma) +
`@tepegoz/tasks` (kayıtlı görev, interval/page-change/external tetikleyici).

**Kim daha iyi:** **Tepegöz** — net. Rakipte model-siz bir yorumlayıcı hiç yok.

### Asistan UX

UI-TARS Desktop: sohbet + ekran-işaretleyici (SoM overlay), tıklama pozisyonu marker'ı, "water flow"
görsel efekti, pause/stop, `call_user` diyaloğu, HTML rapor paylaşımı. Uygulama arayüzünün kendisi
**yalnız İngilizce/Çince** (i18n katkıya açık deniyor). Agent TARS: Web UI + CLI, Event Stream Viewer,
çalışma-zamanı ayarları + tool-call zamanlama istatistikleri, çok-araç streaming.

Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme (adım seç), kademeli otonomi + amber
risk banner, effort ön-ayarları, **kaydırılabilir replay timeline**, kanıt rozetleri, çalışırken **steer**,
pause/resume, arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi + arama, composer ekleri,
ticaret çift-onay, scope-grant. Streaming ADR-0025 ile bağlı ama "measurement-owed".

**Kim daha iyi:** Kararlı, sevk edilmiş cila ve görsel geri-bildirimde (SoM overlay, water-flow) bugün
**UI-TARS/Agent TARS**. Rıza-granülerliği, plan önizleme ve replay timeline'da **Tepegöz** (ama kanıtsız).

### Site adaptörleri

UI-TARS Desktop / Agent TARS: **yok** (yalnız yerel tarayıcı arama motoru seçimi: Google/Bing/Baidu;
prompt'ta "google yerine baidu kullan" gibi model-notları). Tepegöz: agent için site-adaptör sistemi
**yok**; Phase 2 "adapters" daha çok içerik/reklam engelleme + Safe Browsing (ADR-0043); hassas-site
yalnızca _kategori_.

**Kim daha iyi:** Berabere — ikisinde de gerçek site adaptörü yok. (Karşılaştırma: WebBrain'de 58+.)

### Türkçe / bölgesel

UI-TARS Desktop: uygulama i18n'i yok (EN/ZH); VLM "language" ayarı yalnız `Thought` çıktısının dilini
(en/zh) etkiliyor — Türkçe seçeneği bile yok. Bölgesel bir şey yok. Agent TARS: aynı.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır (ADR-0016),
`ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11 "regional-trust-kamu"
(e-Devlet, KVKK, ADR-0036). Şirket Türk (roltek.com.tr).

**Kim daha iyi:** **Tepegöz** — kıyas kabul etmez (rakip tarafında Türkçe hiç yok).

### Ölçüm / dürüstlük kültürü

UI-TARS: model tarafında **akademik benchmark disiplini güçlü** (UI-TARS makalesi, OSWorld/AndroidWorld
vb. sonuçlar, HF'de ağırlıklar). Uygulama/ajan çatısı tarafında ayrı bir eval harness veya "iddia
reddedilebilirliği" kültürü belgede görünmüyor; `agent-snapshot` regresyon testi için.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı iddiası
**reddedilebilir**, ön-kayıtlı H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz
orada olmadığı için var — her S-fazı 🟠, hiçbiri ✅ değil.

**Kim daha iyi:** Model-yeteneğinin _kamuya açık kanıtında_ **UI-TARS** (yayımlı ağırlıklar + hakemli
makale + benchmark tabloları — Tepegöz'ün gösterecek hiçbir şeyi yok). Ajan-katmanı ölçüm **altyapısı ve
dürüstlük kültüründe** Tepegöz (araştırma-sınıfı harness) — ama bu, yeteneğin henüz olmadığının da
işareti.

> Not: `packages/agent-infra/browser-use` README'si açıkça **browser-use** ve **nanobrowser**'a
> (ve puppeteer'a) teşekkür ediyor — Agent TARS'ın DOM-tarafı tarayıcı araçları bu aileden teknik
> referans almış. Tepegöz'ün roadmap'i bu aileyi _"tekniği çal, asla benimseme"_ diye listeliyor;
> yani iki proje aynı literatürü okumuş, farklı yol seçmiş. (UI-TARS Desktop'un kendi çekirdeği —
> vision-koordinat — bu aileden bağımsız.)

---

## Örtüşmeyen alanlar

**Yalnız UI-TARS Desktop / Agent TARS'ta olan:**

- **Bilgisayar-geneli GUI kontrolü** — nut-js operatörüyle herhangi bir masaüstü uygulamasını (VS Code,
  sistem ayarları, oyunlar) sürer; Tepegöz yalnız kendi tarayıcısının içinde çalışır.
- **VLM eğitimi / araştırma açısı** — UI-TARS modelinin _kendisi_ ByteDance'in ürünü; hakemli makale,
  HF'de yayımlı ağırlıklar (UI-TARS-1.5-7B), ModelScope koleksiyonu, sürüm sürüm model iyileştirme
  (1.0 → 1.5 → Doubao-1.5). Tepegöz model eğitmiyor.
- **Ücretsiz uzak operatörler** — tıkla-çalıştır Remote Computer / Remote Browser (kısmen sonlandırılıyor).
- **Çapraz-platform masaüstü** — Windows + macOS uygulaması (+ Midscene ile tarayıcıda).
- **Terminal + Python + kod-editörü sandbox'ı** (Agent TARS / omni-tars) — `ExecuteBash`, `JupyterCI`,
  `StrReplaceEditor`, web sitesi deploy; Tepegöz'de `execute_js`/terminal bilinçli olarak YOK (ADR-0026).
- **Çok-bölümlü araştırma raporu yazımı** — Agent TARS sistem prompt'u binlerce kelimelik `.md`/`.html`
  deliverable üretmeye ayarlı.
- **`@ui-tars/sdk`** — üçüncü tarafların kendi operatörlerini (mobil, ADB, browserbase) yazıp GUI ajanı
  kurabildiği çapraz-platform SDK.

**Yalnız Tepegöz'de olan:**

- Tam **native tarayıcı** (kendi sekme modeli, pencere fabrikası, out-of-process CDP, internal pages).
- **Model-öncesi deterministik Policy Kernel** + **EgressFirewall** (Shannon entropi) + **TaintTracker**
  provenance + hassas-site sert-deny + biyometrik yüksek-risk kapısı.
- **Notary** — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız
  `tepegoz-verify` CLI; paket yazılı ve testli ama `apps/desktop`'a **bağlanmamış** — bugün hiçbir
  çalışma receipt üretmiyor.
- **Credential Broker** (sırrın ajana ulaşmadığı tasarım) + `credential-vault` (DPAPI/safeStorage).
- **Model-free deterministik şerit** — `macro-engine` + `recipe-compiler` (imzalı, oracle'lı) +
  `tasks` (tetikleyicili kayıtlı görevler) + `human-input` (bot-tespiti karşıtı fare eğrileri).
- **İki-aşamalı HITL**, evidence badges (Checked/Unconfirmed/Contradicted), replay timeline, steer.
- **Türkçe birinci sınıf** + Phase 11 kamu/e-Devlet/KVKK güven modeli.
- **Ground-truth-önce eval harness** + istatistiksel anayasa + reddedilebilir kuzey-yıldızı iddiası.
- **`@tepegoz/reader`**, `web_*` SSRF-güvenli araçlar, tool-executor enjeksiyon-vektörü sanitizasyonu.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | UI-TARS Desktop (+ Agent TARS)                                                                       | Tepegöz                                                                                                                                                                                                     | Kim daha iyi + neden                                                                                                                                                   |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                         | Masaüstü uygulaması (Win/Mac) + CLI; gerçek fareyi/OS'i sürer, tarayıcıyla sınırlı değil             | Tam tarayıcı — kendi sekme/pencere modeli, out-of-process CDP; ama tarayıcı değiştirmen gerek + yayında değil                                                                                               | **Bugün UI-TARS** (kurulup çalışıyor, bilgisayar-geneli). **Origin-izolasyonu** ekseninde yapısal olarak Tepegöz                                                       |
| 2   | **"Bugün çalışıyor mu"**                   | Evet — Releases, Homebrew, ByteDance destekli, makale + yayımlı model                                | Kısmen — iskelet bağlı, S0–S12 hepsi 🟠, vision/credential/memory atıl, tek run                                                                                                                             | **UI-TARS** — kesin                                                                                                                                                    |
| 3   | **Kategori genişliği**                     | Bilgisayar-geneli GUI + (Agent TARS) terminal/kod/araştırma/MCP                                      | Yalnız tarayıcı içi görevler                                                                                                                                                                                | **UI-TARS/Agent TARS** — çok daha geniş yüzey                                                                                                                          |
| 4   | **Algı paradigması**                       | Saf vision + koordinat; DOM'a bakmaz (Agent TARS `hybrid`'de DOM ekler)                              | DOM/a11y-önce (ADR-0008) + diff/elision; vision yalnız fallback (atıl)                                                                                                                                      | **Duruma göre**: genellik + DOM-çürümesi direncinde vision (UI-TARS); temiz DOM'da hız/kesinlik/token'da Tepegöz tasarımı — ama kanıtsız                               |
| 5   | **Algı ekonomisi (token/hız)**             | Her adım tam görüntü çıkarımı; son 5 kare penceresi                                                  | Değişen-only diff + unchanged elision + sanitizer; görüntü yalnız eskalasyonda                                                                                                                              | **Tepegöz** (tasarımda) — vision-her-adım pahalı ve yavaş; ama Tepegöz ölçmedi                                                                                         |
| 6   | **Model / sağlayıcı genişliği**            | Agent TARS ~13–14 sağlayıcı (openai/anthropic/gemini/mistral/groq/…); UI-TARS Desktop tek VLM ailesi | 8 sağlayıcı (bazıları stub) + `local`                                                                                                                                                                       | **Agent TARS** — ham genişlik. UI-TARS Desktop bilinçli dar                                                                                                            |
| 7   | **Sağlayıcı mimarisi**                     | OpenAI-uyumlu normalize + native işleyiciler; resmî `openai` SDK                                     | Tek `Canon*` şeması + capability→tier router + GBNF JSON zorlaması + DPAPI kasa                                                                                                                             | **Tepegöz** — daha temiz, tipli, tek kaynak                                                                                                                            |
| 8   | **Aksiyon repertuvarı**                    | ~10 GUI aksiyonu (koordinat); Agent TARS + shell/Python/kod-editör/DOM/MCP                           | ~30 araç + tam dosya-sistemi + tab_* + web_* + download_* (execute_js/terminal YOK)                                                                                                                         | **Agent TARS** ham kapsamada; **Tepegöz** tarayıcı-görev araçlarının derinliğinde                                                                                      |
| 9   | **Araç çağırma disiplini**                 | Politika kapısı yok — parse edilen aksiyon doğrudan çalıştırılır                                     | **Tek PEP**: lookup→idempotency→zod→policy→HITL→execute→audit; MCP/builtin ayrımsız                                                                                                                         | **Tepegöz** — her araç istisnasız aynı denetim hattından                                                                                                               |
| 10  | **Ajan döngüsü olgunluğu**                 | Yayında, retry matrisi, olay-akışı, pause/resume; ama loop-dedektör/kondensasyon zayıf               | Planner→Executor→Reactor, tipli kararlar, 2-aşama HITL; tek eşzamanlı run, checkpoint-resume yok                                                                                                            | **UI-TARS/Agent TARS** (savaş-test). Tepegöz yapıda daha açık ama serileştirilmiş + kanıtsız                                                                           |
| 11  | **Mod / strateji sistemi**                 | `dom` / `visual-grounding` / `hybrid` tarayıcı stratejileri + omni composable                        | Otonomi seviyeleri (`ask`/`act`/`auto`) + effort ön-ayarları                                                                                                                                                | **Agent TARS** strateji seçilebilirliğinde; **Tepegöz** otonomi seviyelendirmesinde                                                                                    |
| 12  | **Doğrulanmış sonuç / yalan-başarı**       | `finished()` modelin kararı; içerik-kanıt oracle'ı yok                                               | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                                           | **Tepegöz** — mekanizma düzeyinde belirgin fark (ölçüm borçlu)                                                                                                         |
| 13  | **Prompt-injection savunması (mimari)**    | Yok — screenshot güvenilmez içerik, sarma/sanitizasyon/sözleşme yok                                  | Model-ÖNCESİ Policy Kernel + EgressFirewall + taint provenance + biyometrik yüksek-risk                                                                                                                     | **Tepegöz** — rakip bu ekseni boş bırakmış                                                                                                                             |
| 14  | **Prompt-injection (kanıt bugün)**         | Ölçülü injection korpusu görünmüyor                                                                  | Redteam + injection-corpus var ama claim-grade ASR bataryası measurement-owed                                                                                                                               | **Berabere / zayıf** — ikisinin de yayımlı ASR sayısı yok; Tepegöz'ün en azından korpusu var                                                                           |
| 15  | **İzin / onay / otonomi**                  | Onay yok — talimat ver, fare hareket eder; yalnız pause/stop + `call_user`                           | 2-aşamalı fail-safe HITL + kademeli otonomi + ticaret çift-onay + Human Handoff                                                                                                                             | **Tepegöz** — kesin                                                                                                                                                    |
| 16  | **Hesap verebilirlik / denetlenebilirlik** | HTML rapor + UTIO telemetri (ham talimatı sunucuya yollar); imza/zincir yok                          | Sevk edilmiş: event-sourced journal. **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + Replay Receipt + `tepegoz-verify`) yazılı/testli ama `apps/desktop`'a **bağlanmamış** — bugün receipt üretmiyor | **Mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir tasarım; ayrıca telemetri göndermiyor. **Bugün** ikisi de yalnızca yerel/imzasız kayıt üretiyor |
| 17  | **Kimlik bilgisi / sır işleme**            | Özel mekanizma yok; model parola alanını doldurabilir                                                | Credential Broker (sır ajana ulaşmaz, OS-auth olana dek reddeder) + vault + egress denetimi                                                                                                                 | **Kavramsal Tepegöz** ama **atıl** — pratikte ikisi de "çözülmüş" değil; UI-TARS hiç denemiyor                                                                         |
| 18  | **Checkpoint / geri-alma**                 | Yok (snapshot = test çatısı)                                                                         | Notary imzalı checkpoint (bağlanmamış — bugün üretilmiyor) + recipe replay; dayanıklı resume sevk edilmedi                                                                                                  | **Tepegöz** (yalnız mimaride) — "kaldığı yerden sürdür" ikisinde de yok, imzalı checkpoint de bugün üretilmiyor                                                        |
| 19  | **Çevrimdışı / yerel model**               | Yerel VLM endpoint'i (kendin deploy) — model gerçek, yol belgeli; gömülü motor/katalog yok; RAG yok  | `local-inference` motoru + sha256'lı model kataloğu + maliyet düğmesi; uçtan uca akış eksik; RAG yok                                                                                                        | **UI-TARS** bugün yerel VLM koşturmada; **Tepegöz** gömülü altyapıda — ikisinde de RAG yok                                                                             |
| 20  | **MCP**                                    | Agent TARS kernel'i MCP üzerine kurulu — in-process + dış sunucular, hem istemci hem sunucu          | MCP **istemcisi**; dış araçlar tek PEP altında; sunucu yüzeyi yok                                                                                                                                           | **Agent TARS** entegrasyon olgunluğunda; **Tepegöz** mimari temizlikte (dış araç da politika kapısından)                                                               |
| 21  | **Deterministik (model-free) otomasyon**   | Yok — her adım modele gider; "preset" yalnız ayar paketi                                             | `macro-engine` + `recipe-compiler` (imzalı, oracle'lı) + `tasks` (tetikleyicili)                                                                                                                            | **Tepegöz** — net                                                                                                                                                      |
| 22  | **Asistan UX**                             | SoM overlay + tıklama marker + water-flow + rapor paylaşımı; uygulama i18n'i yok (EN/ZH)             | Replay timeline, kanıt rozetleri, plan önizleme, steer, scope-grant, ticaret kapısı; streaming measurement-owed                                                                                             | **UI-TARS** sevk edilmiş görsel cilada; **Tepegöz** rıza-granülerliği + plan/replay'de                                                                                 |
| 23  | **Site adaptörleri**                       | Yok (yalnız arama motoru seçimi)                                                                     | Yok                                                                                                                                                                                                         | **Berabere** — ikisinde de yok                                                                                                                                         |
| 24  | **Türkçe / bölgesel**                      | Yok — uygulama EN/ZH, VLM dili yalnız en/zh, Türkçe seçeneği bile yok                                | Parity-zorunlu EN+TR i18n, TR-web H2H şartı, Phase 11 kamu/e-Devlet/KVKK                                                                                                                                    | **Tepegöz** — kıyas kabul etmez                                                                                                                                        |
| 25  | **Model-yeteneğinin kamuya açık kanıtı**   | Hakemli makale + HF'de yayımlı ağırlıklar + benchmark tabloları                                      | Yok — S-fazları 🟠, gösterecek yayımlı sonuç yok                                                                                                                                                            | **UI-TARS** — Tepegöz'ün bu satırda hiçbir şeyi yok                                                                                                                    |
| 26  | **Ajan-katmanı ölçüm / dürüstlük kültürü** | `agent-snapshot` regresyon testi; iddia-reddedilebilirliği kültürü belgede yok                       | Ground-truth eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                                   | **Tepegöz** — araştırma-sınıfı disiplin (ama yeteneğin henüz orada olmadığının da işareti)                                                                             |

---

## Sonuç

**Bugün, "çalışıyor mu" ve genişlik ekseninde UI-TARS Desktop / Agent TARS kazanıyor:** yayında bir
masaüstü uygulaması, ByteDance desteği, hakemli bir makale ve HF'de indirilebilir model ağırlıkları,
**bilgisayar-geneli** GUI kontrolü (Tepegöz'ün yapamayacağı bir şey), Agent TARS tarafında terminal +
Python + kod-editörü + geniş MCP entegrasyonu ve 13–14 model sağlayıcısı. Vision-koordinat paradigması
basit, genel ve DOM çürümesine dayanıklı; UI-TARS ekibi bunu gerçek bir modele bağlamış ve o model var.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz kazanıyor:** model-öncesi deterministik
Policy Kernel, egress firewall + entropi analizi, taint provenance, kriptografik Replay Receipt'ler
(Notary — paket yazılı ve testli, ama uygulamaya bağlanmadığı için bugün hiçbir çalışma receipt
üretmiyor), kanıt-atıflı tamamlama + yalan-başarı savunması, iki-aşamalı fail-safe HITL, tek-PEP araç
çağrısı, model-free deterministik otomasyon şeridi, araştırma-sınıfı eval harness ve Türkçe/kamu
derinliği. UI-TARS Desktop bir _bilgisayar-kullanımı_ ajanı olmasına rağmen **hiçbir onay modeli,
prompt-injection savunması veya denetlenebilir kayıt** taşımıyor — gerçek fareyi sürüyor ama güvenlik
katmanı yok; UTIO telemetrisi ham talimatı bir sunucuya yolluyor. Tepegöz'ün DOM/a11y-önce algısı da
tasarımda daha ucuz/hızlı/kesin — ama bu **kanıtlanmadı**: S0–S12 fazlarının hepsi 🟠, vision /
credential-broker / memory atıl sevk edilmiş, aynı anda tek run çalışıyor, site adaptörü yok.

Dürüst özet: **UI-TARS Desktop bugün gerçekten çalışan, genel bir GUI/bilgisayar ajanı; Tepegöz ise
güvenli, hesap-verebilir ve Türkçe olanı olmak üzere tasarlanmış ve bunu henüz kanıtlamadı.** Bir
masaüstünü veya tarayıcıyı doğal dille sürmek istiyorsan ve "hiç frenli değil, gerçek fareyi oynatıyor"u
kabul ediyorsan → UI-TARS Desktop (ya da geniş çok-kipli iş için Agent TARS). Tez "oturum-açık banka
oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, model-öncesi deterministik bir
politikayla frenlenmiş, Türkçe bir tarayıcı ajanı" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta.
