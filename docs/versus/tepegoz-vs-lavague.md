# Tepegöz vs LaVague — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **LaVague** (Apache-2.0 lisanslı, açık kaynak bir
> "Large Action Model" / AI web-ajanı **Python framework'ü** — `pip install lavague`, `lavague` 1.1.19 /
> `lavague-core` 0.2.x) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir
> karşılaştırma.
>
> **Yöntem.** `.junk/lavague` deposunun (`README.md`, `pyproject.toml`, `docs/docs/learn/architecture.md`,
> `docs/docs/module-guides/{agents,world-model,action-engine,navigation-engine,browser-drivers,evaluation}.md`,
> `docs/docs/learn/actions.md`, `docs/docs/get-started/{customization,token-usage}.md`,
> `lavague-core/lavague/core/{agents,world_model,action_engine,navigation,python_engine,retrievers,memory,context}.py`,
> `lavague-core/lavague/core/utilities/telemetry.py`,
> `lavague-integrations/{contexts,drivers,retrievers}/*`,
> `lavague-integrations/drivers/lavague-drivers-selenium/.../base.py`, `lavague-server/…`,
> `extension_chrome/README.md`, `lavague-qa/…`, `examples/`) ve bu reponun AI yüzeyinin
> (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`,
> `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** `phases/tracks/webbrain-agent-parity.md` (aynı ailedeki bir rakip için yazılmış parity
> track'i). LaVague'a özgü bir parity track'i henüz yok.
>
> **Kategori uyarısı.** LaVague bir **ürün değil, bir kütüphane/SDK'dır**: geliştiricinin kendi
> uygulamasına gömüp bir hedefi ("objektif") Selenium/Playwright koduna "derleyen" bir ajan motoru.
> Tepegöz ise son kullanıcının çalıştırdığı tam bir tarayıcı. Kıyas yalnızca **örtüşen ajan
> eksenlerinde** (model/sağlayıcı desteği, algı, aksiyon repertuvarı, ajan döngüsü, doğrulanmış sonuç,
> prompt-injection, otonomi/izin, checkpoint, maliyet şeffaflığı, context yönetimi, ölçüm kültürü)
> yapılır; kategoriye özgü olanlar "Örtüşmeyen alanlar" başlığında ayrılmıştır. Ayrıca: LaVague
> deposunda **son commit 2025-01-21 tarihli** ("CI: drop cron schedule run") — bu belgenin tarihine göre
> ~20 ay hareketsiz; depoda etiket (tag) yok, `pyproject.toml` olgunluğu `"Development Status :: 3 -
Alpha"`. Yani proje **fiilen atıl/bakımsız** görünüyor; aşağıdaki "bugün çalışıyor mu" değerlendirmeleri
> bunu içerir.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | LaVague                                                                                                                                                                                                          | Tepegöz                                                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Ne          | AI web-ajanı **inşa etmek için Python framework** (`pip install lavague`); LlamaIndex üzerine kurulu "Large Action Model" çatısı                                                                                 | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                          |
| Birincil iş | Geliştiricinin kendi ürününe gömdüğü, objektifi çalıştırılabilir Selenium/Playwright koduna çeviren ajan motoru                                                                                                  | Son kullanıcının kullandığı, güvenlik-önce, kriptografik hesap-verebilir tarayıcı-içi ajan                                                 |
| Olgunluk    | Apache-2.0, **alfa** (`Development Status :: 3 - Alpha`), `lavague` 1.1.19 / `lavague-core` 0.2.x; **depoda son commit 2025-01-21 — ~20 ay hareketsiz**, etiket yok                                              | **1.0 öncesi**; roadmap'in kendi ifadesi: ajan "gerçekten bağlanmış iskelet, ölçümü zayıf", sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Python, Poetry monorepo (`lavague-core` + `lavague-integrations` + `lavague-server` + `lavague-qa` + `extension_chrome`); World Model / Action Engine ayrımı LeCun'un "otonom makine zekâsı" makalesinden esinli | Strict TS, pnpm+turbo monorepo, ~70 paket, ADR güdümlü                                                                                     |
| Felsefe     | Geliştirici-önce, "objektif → çalışır kod", topluluk datseti (BigAction); telemetri **varsayılan açık**                                                                                                          | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik; local-first                      |

Yani: **atıl görünen, geliştiricilere yönelik bir kütüphane-ajan** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir native-tarayıcı ajanı**. LaVague'ın mimarisi (multimodal World Model natural-language
alt-yönerge üretir, ikinci bir model bunları sayfadaki seçiciye "bağlar", screenshot + DOM birlikte
kullanılır) **`browser-use` / `nanobrowser` ailesiyle akrabadır** — Tepegöz'ün v1 AI roadmap'i bu
aileyi açıkça _"tekniği çal, asla adapte etme"_ diye listeliyor (`phases/ai-agent/history.md`).
Bugünkü "işi yapıyor mu" ile "doğru inşa edilmiş mi" farklı eksenler; üstelik LaVague tarafında
"bugün" sorusu "kütüphane hâlâ bakılıyor mu" sorusuyla da gölgeleniyor.

---

## Derinlemesine: iş iş kim ne yapıyor

### Model / sağlayıcı desteği — prensipte LaVague geniş, pratikte Tepegöz

LaVague her modeli **LlamaIndex soyutlaması üzerinden** kabul eder (`BaseLLM` / `MultiModalLLM` /
`BaseEmbedding`) — teoride LlamaIndex'in desteklediği her şey. Hazır "Context" paketleri ise sınırlı:
**OpenAI** (varsayılan `gpt-4o` + `text-embedding-3-small`), **Anthropic** (Claude 3.5 Sonnet),
**Gemini** (1.5 pro/flash), **Fireworks** (llama-3.1-70b), **Azure** (OpenAI paketi üzerinden) +
retriever tarafında **Cohere** rerank. Yani ~4-5 üretime hazır sağlayıcı profili. Kritik pürüz:
embedding varsayılanı OpenAI'ye bağlı (Anthropic context'i bile OpenAI embedding kullanır) ve
**yerleşik bir yerel-model context'i yok** (yerel model yalnızca LlamaIndex üzerinden elle mümkün;
`idefics_example.py`).

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u GBNF gramerle zorlayan). Hepsi tek
`CanonRequest/CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify)
tier+yerel/bulut'a eşliyor; DPAPI'li BYO-key kasası. **Kim daha iyi:** eklenti-noktası genişliğinde
LaVague (LlamaIndex ekosistemi), ama first-class sağlayıcı sayısı, tek tipli şema, yerel-önce ve
grammar-zorlaması Tepegöz'de — günlük kullanımda **Tepegöz**.

### Sağlayıcı mimarisi — Tepegöz

LaVague kendi kanonik istek/yanıt şemasını tutmaz; her şeyi LlamaIndex'e devreder. `Context` sadece
`{llm, mm_llm, embedding, extraction_llm}` demeti. Bu, hızlı prototip için pratik ama trust-boundary
doğrulaması, token/timeout zorlaması, redaksiyon gibi katmanların hepsi üçüncü-parti kütüphaneye
bağımlı. Tepegöz: tek `Canon*` şeması, her `complete()` çağrısında `maxTokens`+`timeoutMs` **zorunlu**,
capability→tier router, `TokenLedger`. **Kim daha iyi:** Tepegöz — daha temiz, tipli, tek kaynak.

### Algı (sayfayı okuma) — bugün LaVague fiilen multimodal, tasarımda Tepegöz

LaVague her adımda **screenshot + tam HTML** toplar. World Model çok-modlu LLM'e ekran görüntüsüyle
akıl yürütür; Navigation Engine ise HTML üzerinde bir **retriever pipeline** çalıştırır:
`InteractiveXPathRetriever` (yalnız etkileşilebilir xpath'li elemanlar, viewport-önce) →
`FromXPathNodesExpansionRetriever` (kardeş/ebeveyn genişletme, ~750 karakter chunk) →
`SemanticRetriever` (embedding, top-k). `SCAN` komutu tüm sayfanın ekran görüntülerini alır; iframe'ler
için özyinelemeli `switch_frame`. PDF okuma ve shadow DOM delme **yok**.

Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision** (token kesmek
için), `aria-labelledby`/`label[for]` çözümü, `browser_get_article`. Vision **yalnızca eskalasyon** ve
bugün **atıl (inert)**: Reactor'ın `captureVision` geri-çağrısı opsiyoneldir ve onu üretimde geçen
hiçbir çağıran yok (yalnız testler geçiyor) — yani bir bayrak kapalı olduğu için değil, **kimse
kabloyu takmadığı için**. **Kim daha iyi:** bugün LaVague (vision
gerçekten çalışıyor, Tepegöz'ünki atıl); algı token ekonomisi ve enjeksiyon-vektörü temizliğinde
tasarım olarak Tepegöz.

### Algı güvenliği (güvenilmez içerik) — Tepegöz, net

LaVague'da **hiçbir katman yok**: retrieved HTML doğrudan Navigation Engine prompt'una, sayfa metni
doğrudan World Model ve Python Engine prompt'una ham girer. `agent`, `inject`, `sanitize`, `untrusted`
gibi terimler `lavague-core` kaynağında hiç geçmiyor. Dahası Selenium sürücüsü Chrome'u varsayılan
olarak `--disable-web-security` ve `--no-sandbox` ile açar. Tepegöz: `@tepegoz/tool-executor`
gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini ayrı bir pakette temizler,
`wrapUntrustedContent` ile sarar. **Kim daha iyi:** Tepegöz — kıyas kabul etmez.

### Aksiyon repertuvarı — Tepegöz genişlik + disiplin; LaVague'ın çıktısı "script"

LaVague'ın gerçek aksiyon seti dar: Navigation Engine ~**6 element aksiyonu** (`click`, `setValue`,
`setValueAndEnter`, `dropdownSelect`, `hover`, `scroll`) + Navigation Controls **7 komut** (`WAIT`,
`BACK`, `SCAN`, `MAXIMIZE_WINDOW`, `SCROLL_DOWN`, `SCROLL_UP`, `SWITCH_TAB`) + Python Engine (sayfadan
bilgi çıkarımı için kod/RAG). CAPTCHA, dosya yükleme/indirme, pano, ağ araçları, çoklu-sekme yönetimi
gibi aileler yok. Buna karşılık LaVague'ın doğal çıktısı **çalıştırılabilir Selenium/Playwright
script'idir** (`ActionResult.code` başarılı adımları biriktirir) — sonradan CI'de elle oynatılır.

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*`, `web_*`, **`file_*`** (tam sandbox'lı
dosya sistemi), `clipboard_*`, `journal_search_events`, `task_*`. Ayrıca **model-free deterministik
şerit**: `@tepegoz/macro-engine` (iMacros halefi) ve `@tepegoz/recipe-compiler` (imzalı, oracle'lı
tekrar-oynatma). **Kim daha iyi:** Tepegöz — genişlik ve denetim; LaVague'ın "objektiften çıkan
script" çıktısı niş bir artı.

### Ajan döngüsü / orkestrasyon — mimaride Tepegöz; LaVague'ınki minimal ve donmuş

LaVague `WebAgent.run()`: `n_steps` (varsayılan **10**) kez → `run_step`: `get_obs` (screenshot + HTML

- URL + sekme bilgisi) → `world_model.get_instruction` → motor `COMPLETE`/`SUCCESS` ise bitir, değilse
  `ActionEngine.dispatch` → `ShortTermMemory` güncelle. **Yeniden-planlayıcı yok**, tipli `Decision`
  yok, döngü-içi context sıkıştırma yok, token bütçesi yönetimi yok, loop dedektörü yok (yalnızca
  başarısız adıma `[FAILED]` öneki eklenir). `ShortTermMemory` kodu üstünde `"""TODO: Make this class
generalizable"""` yorumu duruyor.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`). İki-aşamalı HITL, `CompletionEvidence`,
navigation-grounding, cache-window (lag-2 breakpoint). Ama **aynı anda tek çalışma**;
paralel/checkpoint-resume sevk edilmedi. **Kim daha iyi:** mimaride Tepegöz (tipli kararlar, açık
faz ayrımı); LaVague'ınki daha basit ve ~20 aydır dokunulmamış — ne genişlik ne de sağlamlık kanıtı
var.

### Çok-motor / mod sistemi — kabaca eşit

LaVague'ın "multi-agent"i yok ama bir **motor yönlendirmesi** var: World Model her adım üç alt-motordan
birini (`Navigation Engine` / `Navigation Controls` / `Python Engine`) seçer. Tepegöz'de `ModelRouter`
(tier seçimi) + otonomi modları (`ask`/`act`/`auto`). **Kim daha iyi:** eşit — ikisinde de rol ayrımı
var, farklı biçimlerde.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

LaVague: World Model ekran görüntüsüne bakıp "objektife ulaşıldı" der ve cevabı `instruction` alanında
satır içi döndürür; Python Engine bir `score` (0-1 güven) üretir ve düşükse OCR-benzeri bir
screenshot-tarama fallback'ine geçer. Tuzak fixture, çelişki tespiti, mutasyon-öncesi origin yeniden
doğrulaması **yok**.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme** (model, sayfanın çürüttüğü bir
iddiayı `done`'a konuşturamaz), "Saved!" yazan ama 5xx dönen tuzak fixture'lar, UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**), mutasyon öncesi deterministik origin kapısı,
recipe-compiler'ın `evaluateAssertion` success oracle'ı. **Kim daha iyi:** Tepegöz — mekanizma
belirgin biçimde daha ileri (ölçüm borçlu).

### Prompt-injection savunması — Tepegöz (mimari + bugünkü fark büyük)

LaVague: yukarıda geçtiği gibi **savunma yok**. Tek dolaylı sınır, Navigation Engine'in kısıtlı
hardcoded aksiyon seti ve bir **xpath yetki kontrolü** (`_verify_llm_reponse` → üretilen xpath
retrieved HTML içindeki "authorized" listede değilse `HallucinatedException` /
`ElementOutOfContextException`) — bu anti-halüsinasyon içindir, anti-injection değil.

Tepegöz: **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006): danger class + taint + hedef site →
allow/deny/ask + makine-okunur reason code + biyometrik. Hassas-site kilidi = her otonomi seviyesinde
sert deny. **EgressFirewall** (`inspectEgress`, Shannon entropisi). TaintTracker provenance. **Kim
daha iyi:** Tepegöz — pre-model kernel + çıkış-sızıntı denetimi (Tepegöz'ün ASR bataryası
"measurement-owed" ama mekanizma sevk edilmiş; LaVague'da hiçbir şey yok).

### İzin / onay / otonomi modeli — Tepegöz, net

LaVague: varsayılan **tam otonom** (`n_steps` kadar durmadan). Tek insan-döngüsü seçeneği
`step_by_step=True` — bu da her adımda bir `input("Press ENTER to continue")`'dan ibaret. Risk sınıfı,
hassas-site farkındalığı, araç-başı onay, ticaret çift-onayı yok. Tepegöz: `ask`/`act`/`auto`
(+ rezerve `dangerous`), araç-başı ve plan-önizleme iki-aşama HITL (ikisi de fail-safe), hassas-site
her seviyede sert deny, ticaret çift-onay kapısı, scope-grant. **Kim daha iyi:** Tepegöz — net.

### Checkpoint / geri-alma — Tepegöz

LaVague: çalışma sırasında geri-alma yok. Dolaylı olarak `ActionResult.code` başarılı adımların
Selenium/Playwright kodunu biriktirir, yani bir çalışmayı sonradan script olarak yeniden
üretebilirsin — ama bu bir checkpoint/rollback değil. Tepegöz: **Notary** — hash-zinciri + Ed25519
imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify` CLI. **Ama paket
`apps/desktop` içinde tüketilmiyor** (`@tepegoz/notary`'yi import eden bir üretim dosyası yok, ADR-0030
bunu kaydediyor): bugün hiçbir çalışma bir checkpoint ya da makbuz üretmiyor. **Kim daha iyi:**
mimaride Tepegöz (mekanizma yazılmış ve testli); **bugün ikisi de checkpoint/geri-alma sevk etmiyor**.

### Hesap verebilirlik / denetlenebilirlik — Tepegöz (kriptografik + yerel)

LaVague: `AgentLogger` (bellekte pandas DataFrame) + opsiyonel `LocalDBLogger` (SQLite, `log_to_db`).
Ek olarak **telemetri varsayılan AÇIK**: `LAVAGUE_TELEMETRY` ayarlı değilse her çalışma sonunda
`telemetrylavague.mithrilsecurity.io` adresine `requests.post` yapılır — objektif, düşünce zinciri,
üretilen aksiyonlar, ziyaret edilen URL'ler, bounding box'lar, viewport, token maliyetleri gider
(screenshot/HTML çıkarılır). Kapatmak için `LAVAGUE_TELEMETRY=NONE`. Kriptografik imza, hash-zinciri,
bağımsız doğrulama yok.

Tepegöz: event-sourced yerel journal; local-first, satıcı telemetrisi yok. Üstüne **Notary** —
hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI —
**ama paket yazılmış ve testli olduğu halde `apps/desktop`'a bağlanmamış**, yani bugün hiçbir çalışma
makbuz üretmiyor. **Kim daha iyi:** yerellik ve telemetri duruşunda Tepegöz (LaVague'ın opt-out —
opt-in değil — telemetrisi bir eksi); **kriptografik doğrulanabilirlik ise bugün ikisinde de yok**,
Tepegöz'de yalnız mimari bir bahis olarak duruyor.

### Kimlik bilgisi / sır işleme — kavramsal Tepegöz (ama iki taraf da kanıtsız)

LaVague: sır yönetimi **yok**. README açıkça _"objektiflerine ve extra user data'na ASLA kişisel bilgi
koyma"_ diye uyarır (telemetri yüzünden). Form doldurmak için verilen `user_data` düz metin olarak
bellekte ve prompt'ların içinde durur. Tepegöz: Credential Broker (ajanda sırrın gireceği bir şekil
yok; OS-auth kapısı olana dek her dolgu reddedilir — **atıl sevk**) + strictGuard "hardened reading".
**Kim daha iyi:** kavramsal olarak Tepegöz (sır ajana hiç ulaşmıyor); ikisi de sahada kanıtsız ama
LaVague'da bu boyut tamamen boş.

### Çevrimdışı / egemenlik — Tepegöz (niyet düzeyinde; ikisi de eksik)

LaVague: çevrimdışı çalışamaz — varsayılan embedding OpenAI'ye, varsayılan model bulut sağlayıcıya
gider; telemetri açık; çevrimdışı bilgi tabanı (ZIM/korpus/RAG-arşiv) yok; yerleşik yerel-model
context'i yok. Tepegöz: `@tepegoz/local-inference` seam'i + sha256'lı model kataloğu + "basit adımlar
cihazda" maliyet-tasarrufu düğmesi; ama çevrimdışı RAG yok, S12 indirilmiş ağırlıklara takılı,
sahiplik tablosu boş. **Kim daha iyi:** Tepegöz — hem niyet (local-first) hem de gerçek bir
`LocalProvider` var; LaVague'da yerel yol first-class değil. Yine de ikisi de tam bir çevrimdışı yığın
sevk etmiyor.

### Asistan UX — Tepegöz (son kullanıcı); LaVague geliştiriciye yeter

LaVague: `agent.demo()` bir **Gradio** demo arayüzü açar; notebook'ta `display=True` ile screenshot
akışı; `step_by_step` ENTER istemi. Chrome eklentisi var ama çalışması için yerelde bir Python
`AgentServer` (WebSocket) + `OPENAI_API_KEY` gerekir — yani son-kullanıcı ürünü değil, geliştirici
demosu. Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme, kademeli otonomi + amber
risk banner, kaydırılabilir replay timeline, kanıt rozetleri, çalışırken **steer**, pause/resume,
arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi + arama. **Kim daha iyi:** son
kullanıcı deneyiminde Tepegöz (kanıtsız ama tasarlanmış); geliştirici demosu olarak LaVague yeterli.

### Bellek & skill — Tepegöz (ikisi de muhafazakâr/kanıtsız)

LaVague: kalıcı bellek yok; `ShortTermMemory` yalnızca `previous_instructions` string'i +
`agent_outputs` + `user_inputs` tutar, sıkıştırılmaz. Skill/workflow sistemi yok. En yakın şey
`add_knowledge(file_path)` — bir dosyadan few-shot örneklerini World Model prompt'una ekler. Teacher
mode / kaydedilmiş workflow yok. Tepegöz: S9 — alan-başı **advisory bellek** + yazma-tarafı zehir
filtresi + sil-değil-karantina + görev-çiti dışında yalnız-tavsiye recall (ADR-0027); skill kütüphanesi
= saklı prompt şablonları (çalıştırmaz); ayrıca deterministik recipe/macro şeridi. **Kim daha iyi:**
Tepegöz.

### MCP — yalnızca Tepegöz'de var

LaVague'da MCP (Model Context Protocol) **hiç yok** (ne istemci ne sunucu; kaynak ağacında tek geçiş
yok). `lavague-server` bir MCP sunucusu değil, Chrome eklentisinin Python ajanına bağlanması için bir
WebSocket köprüsüdür. Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP sunucularının araçları Capability
Plane'e girer ve aynı PEP'ten geçer. **Kim daha iyi:** Tepegöz (MCP server yüzeyi Tepegöz'de de yok).

### Site adaptörleri — fiilen ikisinde de yok

LaVague'da site-özel adaptör sistemi yok; `user_data` sözlüğü ve `add_knowledge` ile sayfaya özel
ipucu enjekte edilebilir (çok hafif). Tepegöz'de de agent için site-adaptör sistemi yok; hassas-site
yalnızca _kategori_ (kilit için). **Kim daha iyi:** berabere-yok; LaVague'ın `add_knowledge`'i küçük
bir artı.

### Maliyet şeffaflığı — kabaca eşit

LaVague: `TokenCounter` modülü (opt-in, varsayılan kapalı) — World Model / Action Engine / embedding
ayrımıyla input/output token sayımı, `pricing_config.yml` çarpanlarıyla tahmini `$` maliyet, adım-başı
dökümü. Tepegöz: `TokenLedger` + her `complete()` çağrısında `maxTokens`+`timeoutMs` **zorunlu**
(kaçak maliyet zemini yok). **Kim daha iyi:** eşe yakın — LaVague kullanıcıya net `$` tahmini sunar,
Tepegöz bütçeyi mimari olarak zorlar.

### Ölçüm / dürüstlük kültürü — Tepegöz (ve fark büyük)

LaVague: `Evaluator` modülü var — `RetrieverEvaluator` + `LLMEvaluator`, retriever ve LLM'in xpath
hedeflemesinde precision/recall, `BigAction/the-meta-wave-raw` HF datseti (250 satır) üzerinde. Bu
**bileşen-seviyesi** ölçüm; uçtan-uca görev başarısı oracle'ı, istatistiksel disiplin, donmuş fixture
registry'si, "fabricated-success" metriği yok. BigAction, topluluk LAM datseti için dürüst bir açık
girişim.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, N≥10), **anti-debt kuralı**, PROSE-LEDGER, **reddedilebilir** kuzey-yıldızı iddiası
(`bridgeClaim` 25 insan etiketinin altında `publishable:false`), ön-kayıtlı H2H protokolü. **Kim daha
iyi:** Tepegöz — araştırma-sınıfı disiplin (ama bu, yeteneğin henüz orada olmadığının da işareti).

### Türkçe / bölgesel — Tepegöz

LaVague: Türkçe'ye ya da herhangi bir bölgeye özel bir şey yok (Fransız ekip, İngilizce framework;
örnekler `amazon.fr` gibi). Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da
parity testiyle taşır (ADR-0016), `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart
koşuyor, Phase 11 "regional-trust-kamu" (e-Devlet, KVKK, ADR-0036). Şirket Türk. **Kim daha iyi:**
Tepegöz.

---

## Örtüşmeyen alanlar

**Yalnızca LaVague'da olan (Tepegöz'ün işi değil):**

- Kendi ürününe gömülen bir **Python kütüphanesi/SDK** — Tepegöz bir kütüphane değil, bir uygulama.
- Bir objektifi **çalıştırılabilir Selenium/Playwright script'ine** derleyip döndürme (`ActionResult.code`).
- **LaVague QA** — Gherkin `.feature` dosyalarını `pytest` testlerine (Page Object dahil) çeviren ayrı
  CLI aracı; "web testini 10x hızlandır" hedefiyle.
- **Gradio demo harness'ı** (`agent.demo()`), notebook screenshot akışı.
- **BigAction** açık datset girişimi ve bileşen-seviyesi retriever/LLM evaluator'ı.
- LlamaIndex ekosistemine takılabilirlik (her LlamaIndex `llm`/`embedding`/`multi-modal` modeli).

**Yalnızca Tepegöz'de olan (LaVague'ın kapsamı dışında):**

- Tam tarayıcı: kendi sekme/pencere modeli, out-of-process CDP, güvenli `createWindow()` fabrikası.
- Model-öncesi deterministik **Policy Kernel**, **EgressFirewall**, **TaintTracker**, biyometrik
  yüksek-risk kapıları.
- **Notary** kriptografik replay receipt'leri + bağımsız `tepegoz-verify` (paket yazılmış ve testli,
  ama `apps/desktop`'a bağlanmamış — bugün makbuz üretmiyor).
- **Credential Broker**, kademeli otonomi + hassas-site sert deny, ticaret çift-onay.
- **MCP istemcisi** — dış araçlar tek PEP altında.
- Agent Console UX: replay timeline, kanıt rozetleri, steer, arka-plan run, scope-grant.
- `@tepegoz/recipe-compiler` / `macro-engine` / `tasks` / `reader` / `human-input` paketleri.
- Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

| #   | Boyut                                      | LaVague                                                                                                                                           | Tepegöz                                                                                                               | Kim daha iyi + neden                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                         | Python kütüphanesi; kendi koduna gömersin; Selenium/Playwright/Chrome-ext sürücü                                                                  | Tam tarayıcı; kendi tab/pencere modeli, out-of-process CDP; henüz yayında değil                                       | **Farklı amaç** — gömülebilirlik LaVague, kontrol derinliği + son-kullanıcı yüzeyi Tepegöz                      |
| 2   | **Sağlayıcı genişliği**                    | LlamaIndex üzerinden her model teorik; ~4-5 hazır context (OpenAI/Anthropic/Gemini/Fireworks/Azure); embedding OpenAI'ye bağlı; yerel context yok | 8 sağlayıcı + `local`, tek Canon şema, router, GBNF                                                                   | **Bugün Tepegöz** — first-class sağlayıcı + yerel + tek şema; eklenti-noktası genişliğinde LaVague              |
| 3   | **Sağlayıcı mimarisi**                     | LlamaIndex `BaseLLM`/`MultiModalLLM`/`BaseEmbedding`'e devrediyor; kendi şeması yok                                                               | Tek `Canon*`, her çağrıda `maxTokens`+`timeoutMs` zorunlu                                                             | **Tepegöz** — tipli, tek kaynak, zorunlu bütçe zemini                                                           |
| 4   | **Multimodal planlama**                    | World Model her adım screenshot+HTML+geçmiş+tarih → NL yönerge + motor seçimi (gpt-4o)                                                            | Planner Intent→DAG; vision-trigger var ama vision atıl                                                                | **Bugün LaVague** (multimodal planlamayı fiilen çalıştırıyor); tasarım disiplininde Tepegöz                     |
| 5   | **Sayfa algısı (kapsam)**                  | screenshot + tam HTML retriever pipeline (interaktif xpath → genişletme → semantik), SCAN tam-sayfa, iframe özyineleme; PDF/shadow yok            | DOM/a11y + diff/elision + article; PDF/shadow yok                                                                     | **Kabaca eşit** — LaVague iframe + vision bugün; Tepegöz kimlik-kararlı ref + token kesme                       |
| 6   | **Algı güvenliği**                         | Ham HTML/metin doğrudan prompt'a; sanitizer yok; Chrome `--disable-web-security --no-sandbox`                                                     | `tool-executor` sanitizer paketi (zero-width/bidi/homoglyph) + `wrapUntrustedContent`                                 | **Tepegöz** — net                                                                                               |
| 7   | **Aksiyon repertuvarı**                    | ~6 element aksiyonu + 7 nav kontrol + Python extraction motoru                                                                                    | ~30 araç + dosya sistemi + clipboard + journal + task                                                                 | **Tepegöz** — genişlik                                                                                          |
| 8   | **Aksiyon çıktısı / tekrar-üretim**        | `ActionResult.code` çalıştırılabilir Selenium/Playwright script biriktirir → CI'de oynatılır                                                      | `recipe-compiler` (imzalı, oracle'lı) + `macro-engine`                                                                | **Kabaca eşit** — "objektiften çalışır script" LaVague'ın doğal çıktısı; Tepegöz'ünki daha zengin ama daha ağır |
| 9   | **Araç çağırma disiplini**                 | Kısıtlı hardcoded aksiyon seti + xpath yetki kontrolü (anti-halüsinasyon)                                                                         | Tek PEP: zod→policy→HITL→execute→audit, builtin/MCP/eklenti ayrımsız                                                  | **Tepegöz** — istisnasız tek denetim hattı                                                                      |
| 10  | **Ajan döngüsü olgunluğu**                 | observe→WorldModel→dispatch, `n_steps=10`; replanner yok, tipli karar yok, sıkıştırma yok, loop dedektörü yok; kod ~20 aydır donmuş               | Planner→Executor→Reactor tipli kararlar, 2-aşama HITL; tek run, checkpoint-resume yok                                 | **Mimaride Tepegöz**; LaVague'ınki minimal ve bakımsız — ikisi de ölçekte kanıtsız                              |
| 11  | **Doğrulanmış sonuç / yalan-başarı**       | World Model screenshot'tan "ulaşıldı" der, cevabı satır içi verir; Python Engine confidence skoru                                                 | `CompletionEvidence` + deterministik düşürme + tuzak fixture + Checked/Contradicted rozeti + origin kapısı            | **Tepegöz** — mekanizma belirgin biçimde üstün (ölçüm borçlu)                                                   |
| 12  | **Prompt-injection savunması**             | Yok; ham içerik prompt'a; `--disable-web-security`                                                                                                | Model-öncesi Policy Kernel + EgressFirewall + taint provenance + biyometrik                                           | **Tepegöz** — büyük fark (Tepegöz'ün ASR ölçümü borçlu, mekanizma sevk edilmiş)                                 |
| 13  | **İzin / onay / otonomi**                  | Varsayılan tam otonom (`n_steps`); tek seçenek `step_by_step` → `input("ENTER")`; risk sınıfı/hassas-site yok                                     | `ask`/`act`/`auto` + hassas-site sert deny + araç-başı HITL + biyometrik + ticaret çift-onay                          | **Tepegöz** — net                                                                                               |
| 14  | **Checkpoint / geri-alma**                 | Yok (üretilen script sonradan elle oynatılabilir)                                                                                                 | Notary imzalı checkpoint + taşınabilir Replay Receipt — **ama `apps/desktop`'a bağlanmamış**, bugün makbuz üretmiyor  | **Mimaride Tepegöz**; bugün ikisi de sevk etmiyor                                                               |
| 15  | **Hesap verebilirlik / denetlenebilirlik** | Bellekte pandas log + opsiyonel SQLite; **telemetri varsayılan AÇIK** (satıcı endpoint'ine objektif/düşünce/aksiyon/URL/maliyet)                  | Yerel event-sourced journal, local-first; Notary hash-zinciri + Ed25519 + `tepegoz-verify` yazılı ama **bağlanmamış** | **Tepegöz** — yerellik ve telemetri duruşunda; kriptografik doğrulanabilirlik ise henüz ikisinde de yok         |
| 16  | **Kimlik bilgisi / sır**                   | Yok; README "objektife PII koyma" diye uyarıyor; `user_data` düz metin                                                                            | Credential Broker (atıl) + strictGuard                                                                                | **Kavramsal Tepegöz** (sır ajana ulaşmıyor); ikisi de sahada kanıtsız, LaVague'da boyut tamamen boş             |
| 17  | **Çevrimdışı / yerel model**               | Ağ gerekiyor (OpenAI embedding default), telemetri; yerleşik yerel-model context'i yok (yalnız LlamaIndex ile elle)                               | `LocalProvider` (node-llama-cpp) + GBNF + sha256 katalog; RAG yok, S12 takılı                                         | **Tepegöz** — niyet + gerçek `LocalProvider`; ikisi de tam bir çevrimdışı yığın değil                           |
| 18  | **Bellek & skill**                         | İnce `ShortTermMemory` + `add_knowledge` (dosyadan few-shot); kalıcı bellek/skill yok                                                             | S9 advisory bellek + poison filtre + karantina + recipe/macro                                                         | **Tepegöz** (ikisi de muhafazakâr/kanıtsız)                                                                     |
| 19  | **MCP**                                    | Yok (ne istemci ne sunucu)                                                                                                                        | MCP istemcisi — dış araçlar tek PEP altında                                                                           | **Tepegöz** (server yüzeyi ikisinde de yok)                                                                     |
| 20  | **Maliyet şeffaflığı**                     | `TokenCounter` (opt-in) — bileşen-başı, input/output, `pricing_config.yml`, tahmini `$`                                                           | `TokenLedger` + her çağrıda `maxTokens`+`timeoutMs` zorunlu                                                           | **Eşe yakın** — LaVague `$` tahmini sunar, Tepegöz bütçeyi mimari zorlar                                        |
| 21  | **Ölçüm / dürüstlük kültürü**              | `Evaluator` (retriever/LLM precision-recall, BigAction 250-satır datseti); uçtan-uca görev oracle'ı yok                                           | agent-eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture                        | **Tepegöz** — araştırma-sınıfı disiplin (yeteneğin henüz orada olmadığının işareti)                             |
| 22  | **Türkçe / bölgesel**                      | Özel bir şey yok                                                                                                                                  | Parity-zorunlu EN+TR, TR-web benchmark şartı, Phase 11 kamu/e-Devlet                                                  | **Tepegöz**                                                                                                     |
| 23  | **QA / test üretimi**                      | **LaVague QA**: Gherkin → `pytest` (Page Object) üreten ayrı CLI                                                                                  | `recipe-compiler` `evaluateAssertion` oracle'ı var ama Gherkin/QA ürünü yok                                           | **LaVague** — örtüşmeyen, sevk edilmiş farklılaşma                                                              |
| 24  | **"Bugün çalışıyor mu"**                   | Kütüphane olarak evet (alfa) — ama depo ~20 aydır hareketsiz, bakımsız görünüyor                                                                  | Kısmen — iskelet bağlı, çoğu faz measurement-owed, 3 yetenek atıl, tek run                                            | **Dar anlamda LaVague** (kurulur, çalışır) ama bakımsız; ikisi de kırılgan                                      |

---

## Sonuç

**Bugün, "kurulur ve çalışır" ekseninde LaVague önde ama zayıf bir önde:** `pip install lavague` ile
bir Python betiğinden bir objektif verip Selenium/Playwright ajanı koşturabilirsin, multimodal
planlamayı fiilen çalıştırır, maliyet tahmini verir, ve çıktısı olarak elinde CI'de oynatabileceğin
gerçek bir script kalır. LaVague QA ile Gherkin'den `pytest` üretmek de sevk edilmiş, örtüşmeyen bir
yetenek. Ne var ki depo ~20 aydır hareketsiz (`Development Status :: 3 - Alpha`, son commit 2025-01-21),
yani "çalışıyor" ile "bakılıyor" aynı şey değil.

**Mimari ve yapılan bahisler ekseninde Tepegöz açık ara önde:** model-öncesi deterministik policy
kernel, egress firewall, taint provenance, kriptografik replay receipt'leri (Notary), kanıt-atıflı
tamamlama + yalan-başarı savunması, biyometrik yüksek-risk kapıları, tek-PEP araç çağrısı, tipli
Reactor kararları, MCP istemcisi, model-free deterministik recipe/macro şeridi, araştırma-sınıfı ölçüm
altyapısı ve Türkçe/kamu derinliği. LaVague'da prompt-injection savunması, sır işleme, checkpoint,
otonomi/izin modeli ve MCP **hiç yok**; telemetri varsayılan açık; Chrome varsayılan olarak
`--disable-web-security --no-sandbox` ile açılıyor.

Dürüst özet: **LaVague, kendi ürününe gömeceğin, alfa ve şu an bakımsız görünen bir ajan
kütüphanesi; Tepegöz ise son kullanıcıya yönelik, çok daha güvenli ve hesap-verebilir olmak üzere
tasarlanmış bir tarayıcı-ajanı ve bunu henüz kanıtlamadı** (S-fazlarının hepsi 🟠, vision/credential
broker/memory atıl sevk, aynı anda tek run, site adaptörü yok). Bir Python uygulamasına gömülü,
script çıktısı veren bir web-otomasyon motoru veya Gherkin'den test üreten bir araç istiyorsan →
LaVague (ama fork'lamaya hazır ol). Oturum-açık bir tarayıcıya güvenebileceğin, ne yaptığının
kriptografik kanıtı olan, Türkçe bir son-kullanıcı ajanı istiyorsan → o Tepegöz'ün oyunu, hâlâ
tezgâhta.
