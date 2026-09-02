# Tepegöz vs AIPex — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **AIPex** ("Open Claude for Chrome" — MIT lisanslı, açık
> kaynak tarayıcı-otomasyon ajanı; mevcut tarayıcının içinde yaşayan Chrome/Edge MV3 eklentisi + yerel
> WebSocket daemon + `aipex-mcp-bridge` MCP köprüsü) arasında, iş-iş kimin neyi daha iyi yaptığını
> tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/aipex` deposunun (`README.md`, `AGENTS.md`/`CLAUDE.md`, `package.json`,
> `pnpm-workspace.yaml`; `packages/core/src/agent/aipex.ts`, `core/src/config/ai-providers.ts`,
> `core/src/conversation/compressor.ts`; `packages/browser-runtime/src/tools/index.ts`,
> `automation/snapshot-manager.ts`, `ws-bridge/ws-mcp-server.ts` + `ws-transport.ts`,
> `intervention/intervention-manager.ts`, `runtime/automation-mode.ts`, `lib/vm/skill-api.ts` +
> `url-guard.ts`, `skill/lib/services/skill-executor.ts`, `tools/skill.ts`, `skill/built-in/*/SKILL.md`;
> `packages/dom-snapshot/README.md` + `src/index.ts`; `packages/aipex-react/src/hooks/use-agent.ts` +
> `use-chat.ts`, `components/chatbot/constants.ts`, `components/chatbot/components/mode-indicator.tsx`,
> `lib/models.ts`; `packages/browser-ext/src/background.ts`, `lib/ai-provider.ts`,
> `lib/browser-agent-config.ts`, `manifest.json`; `mcp-bridge/README.md` + `src/bridge.ts` +
> `src/daemon.ts` + `src/tool-schemas.ts`; `skill/SKILL.md` + `skill/references/tools-reference.md`;
> `migration/TOOL_SURFACE_AUDIT.md`, `MIGRATION_STRATEGY.md`, `LOGIC_INCONSISTENCIES_BY_PACKAGE.md`) ve
> bu reponun AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|
capability-plane|security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|
model-catalog|mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input`,
> `extensions/ext-agent`, `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`tepegoz-vs-webbrain.md` ile aynı
> gerekçe: proje eserleri İngilizce-öncedir, bu yazıldığı haliyle korunan bir kayıttır).
>
> **İlgili:** AIPex için ayrı bir parity track'i yok; bu belge
> [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md)'nin yanında
> ikinci bir dış-referans okumasıdır. AIPex'in getirdiği asıl yeni soru — "dış ajanlar (Claude Code,
> Cursor) Tepegöz tarayıcısını MCP üzerinden sürebilmeli mi" — Phase 1b'nin yapılmamış MCP-server
> maddesine bağlanır.
>
> **Sürüm notu.** İncelenen depo `@aipexstudio/root` **0.0.2** — mağazada yayında olan AIPex'in
> (`manifest.json` sürüm **2.2.39**, Chrome Web Store + Edge Add-ons) **monorepo'ya yeniden yapılandırma
> ("new-aipex") dalı**. `migration/` klasörü bu geçişin açık boşluklarını dürüstçe sayıyor: yayındaki
> AIPex ~70-82 MCP aracı taşırken bu depo varsayılan pakette **32 araç** derliyor, `use-cases` paketi
> henüz yok, ses üç-katmandan Web Speech API'ye düşmüş, birçok araç "kodda var ama kayıtlı değil". Yani:
> **ürün olarak AIPex bu repodan daha yetenekli**; burada denetlenen, bugünkü ağaçta gerçekten monte
> edilen yüzey.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|          | AIPex                                                                                                                                                                                                             | Tepegöz                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Ne       | Chrome + Edge MV3 **eklentisi** (mevcut tarayıcıda) + `aipex-mcp-bridge` (yerel stdio MCP sunucusu + daemon + `browser-cli`)                                                                                      | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                         |
| Olgunluk | **Yayında** — 2 mağaza, Discord, katkıcılar, star history; ama incelenen depo bir **geçiş dalı** (32 araç, `use-cases` yok, ses düşmüş, birçok araç kayıtsız — `migration/` bunu itiraf ediyor)                   | **1.0 öncesi**; roadmap'in kendi ifadesi ajan "gerçekten bağlanmış iskelet, ölçümü zayıf", sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod      | 5 paketli pnpm monorepo (`@core` saf TS + `@browser-runtime` Chrome + `@aipex-react` UI + `browser-ext` + `dom-snapshot`); ajan çekirdeği **`@openai/agents` SDK** üstüne kurulu, model katmanı Vercel **AI SDK** | Strict TS, pnpm+turbo, ~70 paket, ADR güdümlü; **satıcı ajan SDK'sı yok** (bilinçli "Never" maddesi)                                      |
| Felsefe  | "Tarayıcın zaten çalışıyor" — sıfır göç, BYOK, MIT; hız = yerel-önce kontrol yolu + **DOM snapshot before vision**; "agent-ready" (MCP, skill, `browser-cli` aynı yerel runtime'ı paylaşır); pratik, ürün-önce    | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik                                  |

Yani: **yayında olan, mevcut tarayıcıya giren, ajan-ekosistemine tarayıcıyı araç olarak açan bir
eklenti-köprü** vs. **erken, mimari ağırlıklı, güvenlik-önce bir native-tarayıcı ajanı**. Bugünkü "işi
yapıyor mu" ile "doğru inşa edilmiş mi" farklı eksenler.

**İlginç örtüşme (aşağıda derinleşiyor):** AIPex'in `README.md`'sindeki _"DOM snapshot before vision …
avoiding slow screenshot loops"_ + roadmap'teki `[x] Search-based Retrieval / [x] Drop unused snapshot /
[x] id-based operation` ile Tepegöz'ün **ADR-0008** başlığı — _"DOM/a11y-first perception, vision
fallback"_ ve _"gerçek hız avantajı … DOM/a11y + screenshot eviction'dan gelir"_ — neredeyse birebir aynı
sonuç. İki ekip birbirinden bağımsız olarak aynı yere varmış.

---

## Derinlemesine: iş iş kim ne yapıyor

### Model / sağlayıcı — AIPex'te sıfır-kurulum var, Tepegöz'de yerel çıkarım var

AIPex iki yolla model kullanır: **BYOK** (kendi anahtarın, `chrome.storage.local`'da, UI'da maskeli) veya
**proxy modu** (`claudechrome.com/api/ai` — oturum çerezi kimliğiyle, anahtar gerekmez, varsayılan model
`deepseek/deepseek-chat-v3.1`). Yani kurulum gerektirmeyen bir bulut yolu **var**. `AI_PROVIDERS`
kataloğu ~16 kart listeler (openai, anthropic, google, openrouter, requesty, deepseek, groq, together,
mistral, cohere, perplexity, fireworks, replicate, azure, custom) ama gerçekte yalnız **3 sağlayıcı tipi**
(`google`/`openai`/`claude`) var; geri kalan hepsi `@ai-sdk/openai-compatible` üzerinden geçer.
Normalizasyonu Vercel AI SDK yapıyor; sağlayıcı soyutlaması ince — hatta Anthropic-via-proxy'nin
parametresiz araç çağrılarını düzeltmek için ham SSE akışına yama atan bir transform var
(`createEmptyToolArgsFinalizer`). Model listesi `claudechrome.com/api/models`'ten dinamik çekiliyor (≤200
model, önbellekli). **Yerel çıkarım yok** (llama.cpp/Ollama/node-llama-cpp yok), WebGPU yok, çevrimdışı
hiçbir şey yok.

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, `responseFormat:'json'`'da GBNF gramer zorlaması). Hepsi tek
`CanonRequest/CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify)
tier+yerel/bulut'a eşliyor; her `ModelGateway.complete()` çağrısı `maxTokens`+`timeoutMs` zorunlu;
`TokenLedger`; DPAPI'li BYO-key kasası. Ama: yalnız Anthropic resmi SDK kullanıyor, birkaç sağlayıcı stub,
**sıfır-kurulum bulut yok** — ilk çalıştırmada anahtar veya indirilmiş ağırlık şart.

**Fark:** AIPex sıfır-kurulum bulutta (proxy) ve model çeşitliliği kartında önde; Tepegöz yerel çıkarım
seam'i, tek şema, tipli router ve GBNF zorlamasında önde. AIPex ajanı **`@openai/agents` (OpenAI Agents
SDK) üstüne kurulu** — Tepegöz'ün roadmap'inin açıkça reddettiği "satıcı ajan SDK'sı" kategorisi. Bu,
AIPex için savaş-test edilmiş bir döngü (artı), Tepegöz için mimari bağımsızlık (artı) demek.

### Algı (sayfayı okuma) — felsefe neredeyse aynı, mekanizma ayrışıyor

AIPex'in birincil aracı `search_elements`: aracın kendi tarifiyle **"[FAST — USE FIRST]"**. Sayfanın
erişilebilirlik ağacının metinleştirilmiş halinde **glob/grep** deseni arar (`{button,input}*`,
`*[Ll]ogin*` …), eşleşen satırları + N seviye bağlam döndürür, tüm ağacı dökmez. Her eşleşen öğede
kararlı bir `uid=` tutamacı olur; `click(tabId, uid)` / `fill_element_by_uid(tabId, uid, value)` doğrudan
bu UID ile çalışır.

`SnapshotManager` şunu yapıyor: CDP `Accessibility.getFullAXTree` → Puppeteer tarzı iki-geçişli "ilgi
çekici düğüm" toplama → metin ağacına serileştir → **`data-aipex-nodeid` özniteliğini canlı DOM'a enjekte
et** (CDP `DOM.resolveNode` + `Runtime.callFunctionOn`) ki UID'ler snapshot'lar arası kararlı kalsın.
Ayrı, CDP gerektirmeyen bir strateji de var: `@aipexstudio/dom-snapshot` — saf DOM gezinimi, aynı
`data-aipex-nodeid`, aynı-origin iframe gezinimi, glob araması. README'si açıkça _"Why Not CDP AXTree?"_
diye başlıyor (tarayıcı bağımlılığı, gecikme, kurulum, taşınabilirlik). Shadow DOM ve cross-origin iframe
CDP frame-merge ile ele alınıyor. Roadmap: `[x] Accessibility Tree`, `[x] Optimised Dom`, `[ ] Vision`
(vision **kutusu işaretsiz**).

Tepegöz: DOM/a11y-önce (ADR-0008), **kimlik-kararlı ref'ler + diff/dedupe/elision** (token kesmek için),
`aria-labelledby`/`label[for]` çözümü, `browser_get_article`. `@tepegoz/tool-executor` gizli/zero-width/
bidi/homoglyph enjeksiyon vektörlerini **ayrı bir pakette** temizliyor. Vision **yalnızca eskalasyon**
(ADR-0008 / S10, `vision-trigger.ts`) — ama bugün **bağlanmamış**: Reactor'ın `captureVision?` geri-çağrısı
opsiyonel (`reactor-types.ts`), ve üretimde onu geçen bir çağıran yok (yalnız testler geçiyor).

**Örtüşme:** İkisi de "DOM/a11y snapshot → kararlı öğe kimliği → vision yalnızca fallback" ve ikisi de
gerekçeyi **token ekonomisi + gecikme** olarak veriyor. AIPex README: _"text snapshots and targeted
element operations are much cheaper than repeatedly sending full-page images"_; Tepegöz'ün "Never"
listesi: _"her-adım-screenshot vision YOK"_. Bağımsız yakınsama.

**Ayrışma:** (1) AIPex kararlı-kimliği **sayfaya yazarak** kuruyor (`data-aipex-nodeid` DOM mutasyonu);
Tepegöz sayfayı değiştirmeden kimlik-kararlı ref + diff/elision yapıyor. (2) AIPex'te sayfadan gelen
metni temizleyen bir enjeksiyon-sanitizer paketi yok; Tepegöz'de var. (3) AIPex bugün AXTree + DOM +
iframe + shadow DOM + Monaco/CodeMirror/ACE editör içeriği + glob araması **sevk ediyor**; Tepegöz'ün
vision'ı bağlanmamış, ama algı hattı non-mutatif ve saldırı-yüzeyi temizlemeli.

### Aksiyon repertuvarı — sayıca yakın, disiplinde uzak

AIPex varsayılan `allBrowserTools`: **32-34 araç**. Kategoriler: sekme (7), UI (8:
`search_elements`, `click`, `fill_element_by_uid`, `get_editor_value`, `fill_form`,
`hover_element_by_uid`, `upload_file_to_input`, `computer`), sayfa (4), screenshot (3), indirme (2),
insan-müdahalesi (4), skill (6). `computer` aracı = Anthropic computer-use tarzı: screenshot piksel
uzayında `left_click`/`type`/`scroll`/`key`/`left_click_drag`/`hover` … `upload_file_to_input` CDP
`DOM.setFileInputFiles` kullanıyor (dosya içeriği belleğe okunmuyor). **Yok:** dosya-sistemi araçları
(yalnız diske indirme var), clipboard araçları (kodda var, kayıtlı değil, "güvenlik incelemesi lazım"),
CAPTCHA çözücü, medya indirme, varsayılan pakette `web_search`/`fetch_url`, journal/history/bookmark
araçları (hepsi kodda var, varsayılanda kayıtlı değil). Eski AIPex ~70-82 MCP aracı taşıyordu; bu
yeniden-yapılandırma 32 sevk ediyor.

**Deterministik (model-siz) otomasyon: yok.** Makro motoru yok, tarif derleyici yok, imzalı tekrar-oynatma
yok. (Web sitesinden gelen `REPLAY_USER_MANUAL` — click/navigation adımları — bir site özelliği, model-siz
yorumlayıcı değil; `replay-controller` servisi "taşınmadı" olarak işaretli.) Bir görsel sahte-imleç var
(`fake-mouse` — odak modunda kullanıcıya geri-bildirim için), ama bu bot-tespiti karşıtı bir hareket
profili değil.

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod → PolicyKernel
→ HITL → execute → audit. `browser_*`, `tab_*` (spawn + egress_blocked dahil), `web_*`, **`file_*`** (tam
sandbox'lı dosya sistemi), `clipboard_*`, `journal_search_events`. Ayrıca **model-free deterministik
şerit**: `@tepegoz/macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme) ve
`@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren seçicili tekrar-oynatma). `@tepegoz/human-input`
Catmull-Rom fare eğrileri + Gaussian jitter (gerçek bot-tespiti karşıtı hareket profili).

### Ajan döngüsü — kütüphane vs tipli durum makinesi

AIPex: `AIPex.chat()` → `runExecution()` → **`@openai/agents` SDK'nın `run()`**'u (`maxTurns: 2000`,
`stream: true`, `session`, `callModelInputFilter` ile screenshot şekillendirme). Planlama **prompt
seviyesinde**: `SYSTEM_PROMPT` "Enhanced Planning Framework + ReAct" tarif ediyor (TASK ANALYSIS →
PLANNING → THINK/ACT/OBSERVE/REASON → MONITORING), TODO listesi yönetimi, `TASK_COMPLETE` işaretçisi. Tipli
bir Planner→Executor→Reactor durum makinesi değil, LLM'e verilen bir talimat. Bağlam sıkıştırma:
`ConversationCompressor` — N-öğe-sonrası özet **veya** token su-seviyesi; son N öğe korunur;
araç-çağrı/sonuç çiftleri `expandForToolCallClosure` ile bölünmez. `migration/` bu yeni sıkıştırıcının
legacy'nin yapılandırılmış-markdown / gerçek-token-watermark yaklaşımından **"bilerek daha basit"**
olduğunu söylüyor. Loop dedektörü yok, adım-başı oto-sıkıştırma yok, "detached run" yok. `interrupt()` =
`generator.return()` (işbirlikçi iptal); `regenerate()` + `rollbackLastAssistantTurn()`. **Eşzamanlılık:**
MCP yolu tek seferde bir araç çağrısı (60 s timeout); UI ajanı yan-panel başına tek run.
Checkpoint/resume yok, tipli `Decision` yok, replan primitifi yok.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`). İki-aşamalı HITL (plan önizleme + araç-başı).
`CompletionEvidence`, `navigation-grounding`, `cache-window` (lag-2 breakpoint), `vision-trigger`. Ama
**aynı anda tek çalışma** (ADR-0013); paralel/dayanıklı checkpoint-resume roadmap'te, sevk edilmedi.

**Fark:** AIPex'in döngüsü olgun bir kütüphaneden geliyor (uzun run'lara dayanıklı, savaş-test) ama opak +
satıcıya bağlı ve tipli karar/replan yok. Tepegöz'ün döngüsü şeffaf tipli bir makine ama serileştirilmiş
ve kanıtsız.

### MCP köprüsü — ters yönler, ve bu farkın anlamı büyük

AIPex esas olarak bir **MCP *sunucusu***dur. `aipex-mcp-bridge` bir **stdio MCP sunucusu**: Cursor,
Claude Code, Claude Desktop, Windsurf, VS Code Copilot ona bağlanır; köprü paylaşımlı bir yerel daemon
otomatik başlatır (`ws://localhost:9223`); AIPex eklentisi daemon'a bir WS _istemcisi_ olarak bağlanıp
araç çağrılarını çalıştırır. Yani **dış kodlama ajanları senin oturum-açık tarayıcını sürer** — ~30 araç
MCP üzerinden açılır. Ayrıca `browser-cli` / `aipex-cli` terminal/CI için aynı daemon'a konuşur.
Mimarî: `AI Agent ──stdio──▶ aipex-mcp-bridge ──WS──▶ AIPex Extension ──▶ Browser`.

AIPex bir MCP _istemcisi_ **değildir** — dış MCP sunucularının araçlarını tüketmez.
`migration/LOGIC_INCONSISTENCIES` madde 1.3: _"MCP System Absent"_ — legacy'nin UnifiedToolManager /
MCP-to-OpenAI yolu düşürülmüş; araçlar artık doğrudan OpenAI Agents SDK'ya geçiyor.

Tepegöz'ün tam aynası: Tepegöz bir MCP **istemcisi** (ADR-0018) — dış MCP sunucularının araçları
CapabilityRegistry'ye girer ve **aynı PEP'ten** geçer. MCP **sunucu** yüzeyi henüz yok (Phase 1b DoD
maddesi, tamamlanmadı).

**Anlamı:** AIPex "tarayıcı otomasyonu"nu "başka ajanların çağırdığı bir MCP sunucusu"na çevirmiş —
döngüye sahip olan dış ajan, AIPex değil. Bu, sevk edilmiş, gerçekten işe yarayan bir farklılaşma. Ama
güvenlik çevresi de "dış ajan + yerel daemon + Chrome'un kendi izin uyarıları ne veriyorsa o" haline
geliyor: **`ws://localhost:9223/cli` veya `/bridge` uçlarına makinedeki herhangi bir yerel süreç,
kimlik-doğrulaması olmadan bağlanıp 30+ aracı onaysız sürebilir** (daemon CSWSH için Origin denetliyor —
`http(s)` origin'leri reddediyor, `chrome-extension://` ve Origin'siz Node istemcilerini kabul ediyor,
`127.0.0.1`'e bağlanıyor, boşta oto-kapanıyor — ama WS'in kendisinde jeton yok). Tepegöz'de böyle açık
bir yerel port yok; ve Tepegöz'de her araç çağrısı — builtin, MCP, eklenti ayrımsız — kim istemiş olursa
olsun `zod → policy → HITL → audit` hattından geçer.

### Yerel-önce mimari — AIPex daemon vs Tepegöz native ana-süreç

AIPex "yerel-önce": eklenti tarayıcı API'lerini doğrudan çalıştırır (uzak tarayıcı akışı yok), MCP köprüsü
`127.0.0.1`'de bir daemon çalıştırır. Veri makineden çıkmaz (BYOK), proxy modu hariç (o
`claudechrome.com`'a çıkar). Ama "yerel" burada "eklenti + servis-worker + ayrı bir Node daemon"
demek — üç ayrı süreç, biri açık bir WS portu.

Tepegöz: tek Electron ana-süreci; out-of-process CDP sürücü; kendi sekme modeli; kendi pencere fabrikası
(`createWindow()`); tipli `contextBridge`. Açık yerel port yok; sır yalnız ana-süreçte `safeStorage`
arkasında.

**Fark:** İkisi de "yerel-önce" iddiasında dürüst. AIPex'in daemon'u genişlik (herhangi bir CLI/CI
sürebilir) getiriyor ama bir yerel-süreç güven sınırı açıyor. Tepegöz native form sayesinde bu portu hiç
açmıyor — ama bunun karşılığında tarayıcı değiştirmen gerekiyor ve henüz yayında değil.

### `skill/` — AIPex'te skill var, ve kod ÇALIŞTIRIYOR

İki ayrı "skill":

1. **`skill/SKILL.md` (depo kökü)** = Claude Code / OpenClaw uyumlu runtime'lar için `aipex-browser`
   skill _paketi_. 30+ MCP aracının kullanım stratejisini + tam parametre şemalarını + yaygın
   otomasyon desenlerini paketliyor ki dış ajan araçları sıfırdan keşfetmesin. Belge-olarak-skill;
   öncelik sırası dayatıyor: `search_elements` → UID-tabanlı aksiyon → (yalnız 2 desen başarısızsa)
   `capture_screenshot(sendToLLM=true)` + `computer`.

2. **`packages/browser-runtime/src/skill/`** = AIPex'in _iç_ skill sistemi. Skill paketleri (`.zip`:
   `SKILL.md` frontmatter + `scripts/` + `references/` + `assets/`), ZenFS'te (IndexedDB sanal dosya
   sistemi) saklanır; `execute_skill_script` aracı script'leri bir **QuickJS WASM sandbox**'ında
   **çalıştırır** (100 MB bellek, 1 MB stack, CSP-uyumlu senkron WASM; `fetch` köprüsü SSRF-korumalı).
   Yerleşik skill'ler: `skill-creator-browser`, `ux-audit-walkthrough`, `wcag22-a11y-audit`. 6 skill
   aracı: `load_skill`, `execute_skill_script`, `read_skill_reference`, `get_skill_asset`,
   `list_skills`, `get_skill_info`.

Tepegöz: skill kütüphanesi = **saklı prompt şablonları** (seçince kutuyu doldurur, **çalıştırmaz** —
bilerek muhafazakâr, "silahlandırılamaz"); ayrıca deterministik recipe/macro şeridi ayrı. S9'da alan-başı
**advisory bellek** + yazma-tarafı zehir filtresi + sil-değil-karantina (ADR-0027).

**Fark:** AIPex skill'leri _iş yapıyor_ (sandbox'lı da olsa gerçek kod yürütme). Tepegöz skill'leri
bilerek pasif; kod yürütme tarafında (ADR-0026) "izole-dünya çürütüldü, salt-okunur" kararı var.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

AIPex: esasen yok. `CompletionEvidence` yok, deterministik düşürme yok, tuzak fixture yok, kanıt rozeti
yok. `done` = prompt'taki `TASK_COMPLETE` işaretçisi. `transformToolEvent` bir araç sonucunda
`success: false` görürse `tool_call_error` yayıyor — o kadar. Roadmap: `[ ] Evaluation -
Online-Mind2Web` **kutusu işaretsiz**; repoda eval harness'ı yok.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme** (model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz); "Saved!" yazan ama 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri (**Checked
/ Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı; recipe-compiler'ın
`evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi yakalıyor. Kuzey-yıldızı koşulu
#3: _"fabricated-success ≈ 0"_. **Ama** bu S-fazı da measurement-owed.

### Prompt-injection savunması — mimari olarak neredeyse tek taraflı

AIPex: **mimari seviyede yok.** `<untrusted_page_content>` sarma yok, nonce yok, breakout-strip yok,
yetenek×origin izin kapısı yok, sayfadan gelen içerik için çıktı sanitizer'ı yok, model-öncesi politika
çekirdeği yok. Sayfa içeriği `search_elements` metniyle **hiçbir çerçeve olmadan** modele akıyor.
`sanitizeErrorMessage` yalnız _UI'da gösterilen hata dizelerinden_ API anahtarı / bearer jetonu redakte
ediyor — görüntü hijyeni, enjeksiyon savunması değil.

Var olan savunmalar dolaylı: MV3 eklenti sandbox'ı + Chrome kurulum-zamanı izinleri; `debugger` izni
tarayıcının kendi "AIPex bu tarayıcıda hata ayıklamaya başladı" bandını gösterir; skill `fetch`'i ve AI
host'u için **SSRF guard** (RFC1918 + `169.254.169.254` + `localhost` + IPv6 ULA/link-local, redirect
yok); daemon'da **CSWSH origin denetimi**; indirmelerde dizin-geçişi doğrulaması; skill'ler için QuickJS
sandbox.

Tepegöz: **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006): danger class (read / state_changing /
destructive / financial) + taint + hedef site → allow/deny/ask + makine-okunur reason code + biyometrik
(Windows Hello). Hassas-site kilidi (banka/kripto/sağlık/kamu/parola yöneticisi) = **her otonomi
seviyesinde sert deny**. **EgressFirewall** (`inspectEgress`, Shannon entropisi — sızıntı/yüksek-entropi
blob tespiti). `TaintTracker` provenance. `detectHandoff` (captcha/2FA). Advisory critic (kernel-sonrası,
engelleyemez). **Ama** ASR bataryası measurement-owed.

### Çevrimdışı / egemenlik — bu sefer Tepegöz'ün bir seam'i var, AIPex'in hiçbir şeyi yok

AIPex: proxy modu `claudechrome.com`'a bağımlı; BYOK bir bulut sağlayıcısı gerektirir; yerel model yok,
RAG yok, ZIM/Wikipedia yok, WebGPU yok, çevrimdışı vision yok. "Cihazda" bir yol **hiç yok**.

Tepegöz: `local-inference` seam'i + sha256'lı model kataloğu + resumable indirme + "basit adımlar
cihazda" maliyet-tasarrufu düğmesi. Çevrimdışı RAG yok; Phase 8 / S12 **çoğu inşa edilmemiş**, S12
indirilmiş ağırlıklara takılı.

(Not: `tepegoz-vs-webbrain.md`'de WebBrain bu eksende ezici üstündü — Apocalypse Mode, tam çevrimdışı RAG
yığını. AIPex bu tarafta WebBrain'in tersine hiçbir şey sunmuyor.)

### Asistan UX

AIPex: yan panel (MV3 `side_panel`), içerik-script omni (Ctrl/Cmd+M komut menüsü), ses girişi (bu
yeniden-yapılandırmada yalnız Web Speech API; legacy'de 3-katmanlı STT + ElevenLabs + WebGL parçacık
görselleştirmesi vardı), streaming yanıtlar, token kullanım göstergesi, fiyat seviyeli model seçici
(cheap/normal/expensive), **"focus/immersive" ↔ "background" otomasyon modu** anahtarı (`ModeIndicator` —
background modu `computer` + screenshot araçlarını filtreler), interrupt/regenerate, odak modunda görsel
sahte imleç, müdahale kartları (monitor-operation / voice-input / user-selection). **Yok:** slash
komutları, adım-seçmeli plan önizleme, kanıt rozetleri, kaydırılabilir replay timeline, risk banner'lı
kademeli otonomi, ticaret çift-onayı, scope-grant UX, arka-plan-run + tepsi.

Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme (adım seç), kademeli otonomi + amber
risk banner, effort ön-ayarları, **kaydırılabilir replay timeline**, kanıt rozetleri, çalışırken
**steer**, pause/resume, arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi + arama,
**ticaret çift-onay kapısı**, scope-grant UX, Human Handoff Controller. Streaming ADR-0025 ile bağlı ama
"measurement-owed".

**Fark:** Kabaca başa baş — AIPex sevk edilmiş ama ince (bu dalda ses bile düşmüş); Tepegöz tasarlanmış
ama kanıtsız. Rıza-granülerliğinde Tepegöz belirgin şekilde daha derin.

### Güvenlik / izin modeli

AIPex: MV3 eklenti. `host_permissions: <all_urls>` + geniş `permissions` seti — `tabs`, `windows`,
`tabGroups`, `bookmarks`, `browsingData`, `history`, `scripting`, `management`, `downloads`, **`debugger`**,
`cookies`, `webNavigation`, `audioCapture`, `alarms`. Runtime'da araç-başı onay kapısı **yok**. Danger
sınıflandırması yok, hassas-site kilidi yok, biyometrik yok, taint yok, egress firewall yok. `management`
izni = başka eklentileri devre dışı bırakma/kaldırma (araçlar kodda, varsayılanda kayıtsız). Müdahale
sistemi: ajanın _istediği_ insan girişi (CAPTCHA/2FA/belirsizlik), timeout'lu, sayfa-navigasyonu/sekme-
değişiminde oto-iptal, "disabled/passive" sohbet modları — bu bir HITL ama **ajan-başlatımlı ve
tavsiye niteliğinde**, deterministik bir kapı değil. BYOK anahtarı `chrome.storage.local`'da (eklenti,
`safeStorage`/DPAPI kullanamaz).

Tepegöz: **model-öncesi PolicyKernel** tek geçit; `isSensitiveSite` her otonomi seviyesinde sert deny;
otonomi yalnız kernel'in sorduğu prompt'u atlayabilir, deny'ı bozamaz; biyometrik yüksek-risk kapıları;
Credential Broker (sırrın gireceği şekil yok — atıl sevk); tek `createWindow()` fabrikası; renderer
güvenilmez.

### Türkçe / bölgesel — Tepegöz

AIPex: i18n bu dalda yalnız `en.json` + `zh.json` (İngilizce + Çince). README 9 dile çevrili
(de/es/fr/ja/ko/pt/ru/zh-CN) — **Türkçe README yok**. Türkçe locale yok, bölgesel adaptör yok. Çince-önce
miras belirgin (`snapshot-manager.ts` yorumları Çince, `SYSTEM_PROMPT` yorumu "(Chinese)").

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır (ADR-0016),
`ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036). Şirket Türk (roltek.com.tr).

### Ölçüm / dürüstlük kültürü — ikisi de dürüst, ama farklı şekilde

AIPex: `migration/` klasörü gerçekten dürüst — `LOGIC_INCONSISTENCIES_BY_PACKAGE.md` her boşluğu sayıyor
(araç yüzeyi 70→32, ses düşmüş, sıkıştırıcı basitleşmiş, `use-cases` yok, servisler taşınmamış) P0/P1/P2
öncelikleri ve "Superseded / Mitigated / Resolved" durumlarıyla. Bu gerçek mühendislik dürüstlüğü. **Ama**
eval harness'ı yok, benchmark yok, injection korpusu yok, istatistiksel titizlik yok; roadmap
`[ ] Evaluation` işaretsiz. `AGENTS.md`: "test kapsamını anlamlı şekilde artır"; Vitest unit + snapshot/
locator için Puppeteer testleri.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, N≥10), **anti-debt kuralı**, PROSE-LEDGER, reddedilebilir kuzey-yıldızı iddiası,
ön-kayıtlı H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var —
her S-fazı 🟠, hiçbiri ✅ değil.

> Not: Tepegöz'ün roadmap'i `browser-use`/`nanobrowser` ailesini _"tekniği çal, asla benimseme"_ diye
> listeliyor ve ayrıca "satıcı ajan SDK'ları YOK" diyor. AIPex ajan çekirdeğini doğrudan
> **`@openai/agents`** üstüne kurmuş — yani Tepegöz'ün bilinçle reddettiği yolu seçmiş. İki ekip de
> DOM-önce algıya bağımsız varmış (yakınsama), ama ajan döngüsünün nereden geleceğinde ayrışmış
> (AIPex: hazır kütüphane; Tepegöz: kendi tipli makinesi).

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | AIPex                                                                                                                                         | Tepegöz                                                                                                                                                                                                                                                                                                                      | Kim daha iyi + neden                                                                                                                                 |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                         | Eklenti — mevcut tarayıcıda, sıfır göç; ama MV3 API + `chrome.debugger` ile sınırlı, artı bir yerel Node daemon                               | Tam tarayıcı — out-of-process CDP, kendi sekme/pencere modeli, açık yerel port yok; ama tarayıcı değiştirmen gerek + henüz yayında değil                                                                                                                                                                                     | **Bugün AIPex** (erişim). **Yapısal olarak Tepegöz** (kontrol derinliği + origin izolasyonu)                                                         |
| 2   | **Göç maliyeti / benimseme**               | Sıfır — kur, anahtarını gir, çalış; oturumların/çerezlerin zaten orada                                                                        | Yeni tarayıcı indir + kur + geçir                                                                                                                                                                                                                                                                                            | **AIPex** — net                                                                                                                                      |
| 3   | **Sağlayıcı genişliği + sıfır-kurulum**    | ~16 kart (çoğu openai-compatible), **proxy modu = anahtarsız bulut**, dinamik model listesi                                                   | 8 sağlayıcı (bazıları stub) + `local`; sıfır-kurulum bulut yok                                                                                                                                                                                                                                                               | **AIPex** — proxy modu ve dinamik katalog                                                                                                            |
| 4   | **Yerel çıkarım / cihazda model**          | Yok (llama.cpp/Ollama/WebGPU yok)                                                                                                             | `local-inference` seam + node-llama-cpp + sha256'lı GGUF kataloğu + GBNF JSON zorlaması                                                                                                                                                                                                                                      | **Tepegöz** — AIPex'in bu tarafta hiçbir şeyi yok                                                                                                    |
| 5   | **Sağlayıcı mimarisi**                     | İnce: Vercel AI SDK normalizasyonu + SSE yama hack'i; ajan çekirdeği `@openai/agents` SDK                                                     | Tek `Canon*` şeması, capability→tier router, DPAPI key kasası, `maxTokens`+`timeoutMs` zorunlu, GBNF                                                                                                                                                                                                                         | **Tepegöz** — tipli, tek kaynak, satıcı SDK'sına bağlı değil                                                                                         |
| 6   | **Sayfa algısı — felsefe**                 | "DOM snapshot before vision", search-based retrieval, id-based operation, drop unused snapshot                                                | DOM/a11y-önce (ADR-0008), diff/dedupe/elision, vision yalnız fallback                                                                                                                                                                                                                                                        | **Beraberlik** — bağımsız yakınsama; ikisi de gerekçeyi token+gecikme veriyor                                                                        |
| 7   | **Sayfa algısı — mekanizma**               | CDP AXTree + `data-aipex-nodeid`'i **canlı DOM'a yazar**; ayrıca CDP'siz `dom-snapshot` lib; enjeksiyon-sanitizer yok                         | Kimlik-kararlı ref + diff/elision, sayfayı **değiştirmeden**; ayrı pakette zero-width/bidi/homoglyph temizliği                                                                                                                                                                                                               | **Tepegöz** — non-mutatif + saldırı-yüzeyi temizlemeli. AIPex'in CDP'siz fallback lib'i temiz bir artı                                               |
| 8   | **Algı — bugün ne okuyor**                 | AXTree + DOM + iframe + shadow DOM + Monaco/CodeMirror/ACE + glob araması — **sevk edilmiş**                                                  | DOM/a11y + article + diff — vision **bağlanmamış** (`captureVision` geri-çağrısını üretimde geçen yok)                                                                                                                                                                                                                       | **AIPex** — bugün daha çok sayfa türünü okuyor                                                                                                       |
| 9   | **Vision fallback**                        | `capture_screenshot` + `computer` (computer-use tarzı), `[HIGH-COST FALLBACK]`, `sendToLLM` varsayılan false; roadmap `[ ] Vision`            | ADR-0008 eskalasyon; mekanizma yazılı ama **bağlanmamış** (opsiyonel `captureVision` geri-çağrısını üretimde geçen yok)                                                                                                                                                                                                      | **AIPex** — bugün kullanılabilir bir fallback var; ikisi de felsefe olarak "her adım değil"                                                          |
| 10  | **Aksiyon repertuvarı**                    | 32 sevk (~70 legacy, çoğu kayıtsız): computer-use, CDP dosya upload, editör içeriği; FS/clipboard/journal yok                                 | ~30, hepsi tek PEP'ten: tam sandbox'lı FS, clipboard, journal, tab spawn/egress                                                                                                                                                                                                                                              | **Beraberlik** — AIPex'te computer-use + editör; Tepegöz'de FS + yönetişimli geçit                                                                   |
| 11  | **Araç çağırma disiplini**                 | Kapı yok — araçlar OpenAI Agents SDK / köprü tarafından doğrudan çağrılır (60 s timeout)                                                      | **Tek PEP**: lookup → idempotency → zod → policy → HITL → execute → audit, MCP/eklenti/builtin ayrımsız                                                                                                                                                                                                                      | **Tepegöz** — belirgin fark; her araç istisnasız aynı hattan                                                                                         |
| 12  | **Deterministik (model-free) otomasyon**   | Yok (site-güdümlü manuel replay hariç)                                                                                                        | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, oracle'lı) + Notary replay (paket yazılı, uygulamaya **bağlanmamış**)                                                                                                                                                                                           | **Tepegöz** — net (Notary payı hariç)                                                                                                                |
| 13  | **Doğrulanmış sonuç / yalan-başarı**       | Prompt `TASK_COMPLETE` işaretçisi + `success:false` yüzeye çıkarma; `[ ] Evaluation` işaretsiz                                                | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                                                                                                                                                            | **Tepegöz** — mekanizma seviyesinde net fark (ölçüm borçlu)                                                                                          |
| 14  | **Prompt-injection savunması (mimari)**    | Yok — untrusted-content çerçevesi yok, araç-başı kapı yok; yalnız hata-dizesi redaksiyonu + SSRF/CSWSH                                        | Model-ÖNCESİ Policy Kernel + EgressFirewall (Shannon entropi) + taint provenance + biyometrik                                                                                                                                                                                                                                | **Tepegöz** — geniş farkla                                                                                                                           |
| 15  | **Yerel süreç güven sınırı**               | `ws://localhost:9223/cli` + `/bridge`: makinedeki herhangi bir süreç 30+ aracı **onaysız** sürebilir (CSWSH-korumalı ama kimlik-doğrulamasız) | Açık yerel port yok; her çağrı PEP'ten                                                                                                                                                                                                                                                                                       | **Tepegöz** — AIPex'in köprüsü gerçek bir açık yerel saldırı yüzeyi                                                                                  |
| 16  | **Kimlik bilgisi / sır işleme**            | BYOK anahtarı `chrome.storage.local` (maskeli UI); proxy site çerezi kullanır                                                                 | Credential Broker (sır ajana ulaşmaz — **atıl**) + DPAPI kasası + strictGuard                                                                                                                                                                                                                                                | **Kavramsal Tepegöz**; pratikte ikisi de "çalışır" ama AIPex'inki asgari                                                                             |
| 17  | **Hesap verebilirlik / denetlenebilirlik** | IndexedDB sohbet geçmişi + token metrikleri; imza/zincir yok                                                                                  | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI — **paket yazılı ve testli, ama `apps/desktop` içinde onu çağıran hiçbir yer yok** (ADR-0030 kendisi yazıyor); bugün hiçbir run makbuz üretmiyor. Bugün elde olan: event-sourced journal + replay timeline | **Mimari eksende Tepegöz** (AIPex'te tasarım olarak da eşi yok); **bugün eksende beraberlik** — iki tarafta da imzalı/zincirli bir kayıt üretilmiyor |
| 18  | **Çevrimdışı / egemenlik**                 | Yok — proxy `claudechrome.com` gerektirir, BYOK bulut gerektirir, yerel model/RAG yok                                                         | `local-inference` seam + model kataloğu + maliyet-tasarrufu düğmesi; RAG yok, S12 ağırlıklara takılı                                                                                                                                                                                                                         | **Tepegöz** — bir seam var; AIPex'te hiçbir şey yok                                                                                                  |
| 19  | **MCP yönü**                               | MCP **sunucusu** (köprü) — Claude Code/Cursor/CI senin tarayıcını sürer + `browser-cli` + skill paketi — **sevk edilmiş**                     | MCP **istemcisi** — dış araçlar tek PEP altında; sunucu yüzeyi yok (Phase 1b)                                                                                                                                                                                                                                                | Farklı yönler; **AIPex** sevk edilmiş farklılaşmada, **Tepegöz** tüketen tarafın mimari temizliğinde                                                 |
| 20  | **Skill sistemi**                          | Gerçek skill paketleri, script'ler **QuickJS sandbox'ında çalışır**, yerleşik a11y/UX audit skill'leri, skill-creator                         | Skill = yalnız prompt şablonu (bilerek, çalıştırmaz); poison-filtreli karantina belleği; recipe/macro ayrı                                                                                                                                                                                                                   | **AIPex** (skill'ler _iş yapıyor_). **Tepegöz** "silahlandırılamaz" tarafta                                                                          |
| 21  | **Ajan döngüsü olgunluğu**                 | `@openai/agents` `run()`, maxTurns 2000, prompt-seviye ReAct; savaş-test ama opak + satıcıya bağlı; tipli karar/replan yok                    | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL; **tek eşzamanlı run**, checkpoint-resume yok                                                                                                                                                                                                                       | **AIPex** (uzun run dayanıklılığı, kütüphane olgunluğu). **Tepegöz** yapı olarak daha açık ama kanıtsız                                              |
| 22  | **Otonomi modeli**                         | "focus/background" = araç filtresi; araç-başı onay yok; maxTurns 2000 otonom                                                                  | `ask`/`act`/`auto` + deny her seviyede sert bloke + biyometrik yüksek-risk                                                                                                                                                                                                                                                   | **Tepegöz** — gerçek bir otonomi modeli                                                                                                              |
| 23  | **Türkçe / bölgesel**                      | `en` + `zh` locale, Türkçe README/locale/adaptör yok, Çince-önce miras                                                                        | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli                                                                                                                                                                                                                                       | **Tepegöz** — net                                                                                                                                    |
| 24  | **Ölçüm / dürüstlük kültürü**              | Dürüst `migration/` boşluk defteri (gerçekten iyi) ama eval harness / benchmark / injection korpusu **yok**                                   | Ground-truth harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                                                                                                                                                         | **Bölünmüş** — AIPex boşluklarında dürüst; Tepegöz'de titizlik aparatı var (ama yetenek henüz yok)                                                   |
| 25  | **"Bugün çalışıyor mu"**                   | Evet — yayında bir eklenti + çalışan bir MCP tarayıcı-sunucusu; incelenen depo geçiş dalı olsa da                                             | Kısmen — iskelet bağlı, çoğu faz measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                                                                                                                                                      | **AIPex** — kesin                                                                                                                                    |

---

## Sonuç

**Bugün, "çalışıyor" ve "erişilebilir" ekseninde AIPex önde:** mevcut tarayıcına giriyor (sıfır göç),
anahtarsız bir bulut yolu (proxy) var, DOM-önce algısı gerçekten sevk edilmiş, skill'leri kod
çalıştırıyor, ve en önemlisi **Claude Code / Cursor / bir CI job'ı senin oturum-açık tarayıcını bugün MCP
üzerinden sürebiliyor**. İncelenen depo bir yeniden-yapılandırma dalı ve boşlukları var (32 araç, ses
düşmüş, `use-cases` yok) — ama ürün olarak AIPex insanların kullandığı, olgunlaşmış bir şey.

**Mimari ve yaptığı spesifik bahislerde Tepegöz önde:** model-öncesi deterministik policy kernel, egress
firewall + Shannon entropi denetimi, taint provenance, kriptografik replay receipt'leri (Notary +
bağımsız `tepegoz-verify` — paket yazılı ve testli, ama uygulamaya bağlanmadığı için bugün makbuz
üretmiyor), kanıt-atıflı tamamlama + yalan-başarı savunması, biyometrik yüksek-risk
kapıları, model-free deterministik otomasyon şeridi, tek-PEP araç çağrısı, yerel çıkarım seam'i, Türkçe/
kamu derinliği, ve araştırma-sınıfı ölçüm aparatı. AIPex bunların neredeyse hiçbirini taşımıyor —
güvenliği MV3 sandbox'ına + Chrome'un izin uyarılarına + `debugger` bandına + SSRF/CSWSH guard'larına
dayanıyor, ve Tepegöz'ün bilinçle reddettiği bir **satıcı ajan SDK'sının** (`@openai/agents`) üstüne
kurulu. Ayrıca AIPex'in MCP köprüsü, kimlik-doğrulaması olmayan bir yerel WS portu açarak makinedeki
herhangi bir sürece 30+ aracı onaysız veriyor — Tepegöz'ün native formunda böyle bir port hiç yok.

**MCP-köprü farkının anlamı:** AIPex "tarayıcı otomasyonu"nu "başka ajanların çağırdığı bir MCP
sunucusu"na çevirmiş — döngüye dış ajan sahip. Bu sevk edilmiş, gerçekten yararlı bir farklılaşma ve
Tepegöz'de karşılığı yok (Phase 1b, yapılmamış). Ama tersi de doğru: Tepegöz dış MCP araçlarını **tek
yönetişimli geçitten** _tüketiyor_ (ADR-0018), AIPex ise dış ajanlara _yayınlıyor_ ve o noktadan sonra
güvenlik çevresini dış ajanın + yerel daemon'un eline bırakıyor.

Dürüst özet: **AIPex bugün çalışan, tarayıcını ajan ekosistemine açan pratik bir araç; Tepegöz ise
oturum-açık banka oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, Türkçe bir ajan
olmak üzere tasarlanmış ve bunu henüz kanıtlamamış.** Claude Code'un veya bir script'in senin gerçek
tarayıcını, kullandığın tarayıcıda, açık kaynak ve BYOK ile sürmesini istiyorsan → AIPex. Deterministik
model-öncesi reddi, taşınabilir Replay Receipt'i ve Türkçe/kamu derinliği olan bir ajan istiyorsan → o
Tepegöz'ün oyunu, hâlâ tezgâhta.
