# Tepegöz vs Browser Use — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Browser Use** (yayında olan, MIT lisanslı **Python
> kütüphanesi/çerçevesi** — LLM + CDP ile web ajanı; `browser-use` v0.13.8 — artı ayrı, kapalı ücretli
> bir bulut ürünü) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir
> karşılaştırma. Browser Use burada özel bir durum: Tepegöz'ün ajan roadmap'inin **birinci sürümü
> (AI-1…AI-8) resmen "the browser-use/nanobrowser port" adını taşıyordu** ve
> [`phases/ai-agent/history.md`](../../phases/ai-agent/history.md)'deki "build-vs-buy"
> kaydı `browser-use`'u adıyla değerlendirip **runtime bağımlılığı olarak reddediyor** ("tekniği çal,
> asla adapte etme"). Yani bu uzak bir rakip değil, Tepegöz ajanının doğrudan referans-atası.
>
> **Yöntem.** `.junk/browser-use` deposunun (`README.md`, `CLAUDE.md`, `AGENTS.md`,
> `BETA_AGENT_INTEGRATION_FEATURES.md`, `CLOUD.md`, `pyproject.toml`, `server.json`,
> `browser_use/agent/{service,prompts,views,judge,variable_detector}.py`,
> `browser_use/agent/system_prompts/system_prompt.md`,
> `browser_use/agent/message_manager/service.py`, `browser_use/tools/service.py`,
> `browser_use/tools/{registry,extraction}/…`, `browser_use/llm/{__init__,models,base}.py` +
> `browser_use/llm/*/` sağlayıcı alt-paketleri, `browser_use/browser/watchdogs/security_watchdog.py`,
> `browser_use/dom/serializer/serializer.py`, `browser_use/mcp/{client,server}.py`,
> `browser_use/skills/{service}.py` + `skills/browser-use/SKILL.md`,
> `browser_use/filesystem/file_system.py`, `browser_use/tokens/service.py`, `browser_use/actor/`,
> `browser_use/integrations/gmail/`) ve bu reponun AI yüzeyinin
> (`phases/ai-agent/{README,history,constitution}.md` + S0–S12 fazları,
> `packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|tool-executor|local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|
credential-vault|human-input`, `extensions/ext-agent`, `docs/adr/*`) aynı oturumda okunmasından
> çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla ve
> [`tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md) / [`tepegoz-vs-nanobrowser.md`](tepegoz-vs-nanobrowser.md)
> belgeleriyle aynı gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı haliyle korunan bir
> kayıttır.
>
> **İlgili.** Browser Use'a özel bir parity track'i **henüz yok**; "rakibin yaptığı her şeyi Tepegöz de
> yapsın" tarafı için bkz. [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md)
> ve [`prompts/rival-agent-parity-track.md`](../../prompts/rival-agent-parity-track.md). "Build-vs-buy"
> gerekçesi zaten [`phases/ai-agent/history.md`](../../phases/ai-agent/history.md)'de kayıtlı.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|          | Browser Use                                                                                                                                                                                                                                              | Tepegöz                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne       | **Python kütüphanesi** (`pip install browser-use`) — LLM + CDP (`cdp-use`) ile ajan döngüsü ve tarayıcı sürücüsü; GUI yok, kendi Chromium'unu sürer. Yanında **ayrı, kapalı, ücretli bulut** (barındırılan ajan, stealth tarayıcılar, 1000+ entegrasyon) | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri, kendi `WebContentsView` + partition izolasyonunun içinde                                 |
| Olgunluk | **Yayında ve yaygın** — çok sayıda sürüm, büyük topluluk, Discord, kendi benchmark reposu, "Odysseys leaderboard #1" iddiası. Ama açık-kaynak tarafı bir **SDK**; "güçlü ajan" pratikte bulut ürünü                                                      | **1.0 öncesi**; roadmap'in kendi ifadesi: ajan "gerçekten bağlanmış iskelet, ölçümü zayıf"; sahip notu: _"hâlâ istediğim gibi çalışmıyor"_. Her S-fazı 🟠, hiçbiri ✅ değil |
| Kod      | Python ≥3.11, async, pydantic v2, `bubus` event-bus + watchdog servisleri, `cdp-use` tipli CDP sarmalayıcı. Resmî satıcı SDK'ları doğrudan bağımlılık (openai, anthropic, google-genai, groq, ollama, mcp)                                               | Strict TS, pnpm + turbo, ~70 `@tepegoz/*` paket, ADR güdümlü, **satıcı ajan SDK'sı yok** (LangChain dâhil), zod safeParse her güven sınırında                               |
| Felsefe  | "Web'i AI ajanları için erişilebilir kıl" — pratik, geliştirici-önce, hız/başarı-oranı odaklı; güvenlik `allowed_domains` + `sensitive_data` yer-tutucularıyla sınırlı ve bu sınırı **açıkça kabul ediyor**                                              | "Security-by-design, local-first"; model-öncesi deterministik policy kernel + kriptografik hesap verebilirlik + determinism-first + honest-measurement                      |

Yani: bir yanda **olgun, geniş, üzerine ürün kurulan bir Python ajan-çerçevesi** (ve onun kapalı bulut
uzantısı), diğer yanda **erken, mimari ağırlıklı, güvenlik-önce bir native-tarayıcı ajanı**.
Karşılaştırma iki kat asimetrik: (1) Browser Use bir **kütüphane**, Tepegöz bir **ürün** — biri diğerinin
içine gömülmez, farklı şeyler paketlerler; (2) Browser Use'un "en iyi" hâli **kapalı buluttadır** —
açık-kaynak SDK, stealth tarayıcı / CAPTCHA / kalıcı bellek / en iyi model / 1000+ entegrasyon olmadan
gelir. Bu belge **açık-kaynak `browser-use` kütüphanesini** esas alır; bulutu yalnızca "OSS'de yok, orada
var" biçiminde işaretler. Bugünkü "işi yapıyor mu" ile "doğru inşa edilmiş mi" hâlâ farklı eksenler.

---

## Derinlemesine: iş iş kim ne yapıyor

### Model / sağlayıcı desteği — Browser Use açık ara (genişlik), Tepegöz temizlik

Browser Use: **16 birinci-sınıf sağlayıcı adaptörü** — OpenAI, Anthropic, Google (Gemini), Groq, Azure
OpenAI, AWS Bedrock, AWS Bedrock-Anthropic, DeepSeek, Cerebras, Mistral, Ollama, OpenRouter, OrcaRouter,
Vercel AI Gateway, OCI (Oracle), ChatBrowserUse — artı opt-in **ChatLiteLLM** meta-adaptörü. OpenRouter /
Vercel / OrcaRouter / LiteLLM'in kendileri yönlendirici olduğu için **efektif model sayısı yüzlerce**;
herhangi bir OpenAI-uyumlu endpoint de çalışıyor. Yerel: Ollama + herhangi bir yerel OpenAI-uyumlu sunucu
(llama.cpp, LM Studio, vLLM…) + açık-ağırlıklı `bu-30b-a3b-preview`. `ChatBrowserUse` ile **tek
`BROWSER_USE_API_KEY`** sağlayıcı-önekli tüm modellere ulaşıyor. Maliyet: `TokenCost` servisi LiteLLM
fiyat tablosunu çekip token/USD izliyor (varsayılan kapalı). Sağlayıcı soyutlaması ince: `BaseChatModel`
protokolü + her sağlayıcının kendi serializer'ı; tek zorunlu bir kanonik şema **yok** (`ChatInvokeCompletion`
`.completion`/`.usage` normalizasyonu var, ama sağlayıcı-başı davranış farkı kabul ediliyor).

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u GBNF gramerle zorlayan). Hepsi **tek
`CanonRequest`/`CanonResponse` şemasına** normalize; her `complete()` çağrısı `maxTokens`+`timeoutMs`
**zorunlu**; `ModelRouter` yeteneği (plan/exec/classify) → tier + local/cloud eşliyor; `TokenLedger`;
DPAPI/safeStorage BYO-key kasası. Ama: yalnız Anthropic resmî SDK kullanıyor (OpenAI ham REST), birkaç
sağlayıcı stub, sıfır-kurulum bulut yok.

**Kim daha iyi:** genişlik ve sıfır-kurulumda **Browser Use** — kıyas kabul etmez. Mimari
temizlik/tiplilik/tek-kaynak ve her-çağrı-bütçe-zorunluluğunda **Tepegöz**.

### Algı (sayfayı okuma) — bugün Browser Use, ekonomide Tepegöz

Browser Use: DOM/erişilebilirlik-ağacı-önce. `DomService` + `DOMWatchdog` serileştirilmiş etkileşimli
öğe ağacı üretiyor (`[index]<tag attr=val />`), shadow DOM delme, iframe, `|SCROLL|` işaretçileri,
paint-order filtreleme, yeni öğe `*[` işareti. Vision: `use_vision='auto'` **varsayılan** — screenshot
aracı hazır ama model istemedikçe kullanılmıyor (`True`'da her adım, `False`'ta hiç); `vision_detail_level`.
Ayrı `page_extraction_llm` (küçük model) `extract` için. `search_page` (bedava metin araması),
`find_elements` (CSS), `find_text`, `save_as_pdf`; PDF oto-indirme + `pypdf`. Parola alanı değerleri DOM
anlık görüntüsüne **hiç** konmuyor (serializer'da açık "prompt-injection sızıntısı" notu). `markdownify`
ile sayfa metni.

Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision** (token kesmek için),
`aria-labelledby`/`label[for]` çözümü, `browser_get_article`. `@tepegoz/tool-executor` gizli/zero-width/
bidi/homoglyph enjeksiyon vektörlerini ayrı bir pakette temizliyor. Vision **yalnızca eskalasyon**
(ADR-0008/S10) — ama bugün **bağlanmamış**: Reactor'ın `captureVision?` geri-çağrısı opsiyonel ve üretimde
onu geçen bir çağıran yok (yalnız testler geçiyor); set-of-marks + bütçeli küçültme tasarlanmış ama ölçülmemiş.

**Kim daha iyi:** bugün daha çok sayfa türünü fiilen okuyan **Browser Use** (PDF, shadow, iframe hepsi
canlı). Token ekonomisi tasarımında (değişen-only diff + unchanged elision) ve enjeksiyon-vektörü
temizliğinde **Tepegöz** — ama Tepegöz tarafı ölçülmemiş.

### Aksiyon repertuvarı — Browser Use pratik + `evaluate`, Tepegöz disiplin

Browser Use: `tools/service.py`'de kayıtlı **~25 çekirdek araç** — `search` (arama motoru), `navigate`,
`go_back`, `wait`, `click` (index + koordinat), `input`, `upload_file`, `switch`/`close` (sekme),
`extract` (LLM çıkarımı), `search_page`, `find_elements`, `scroll`, `send_keys`, `find_text`,
`screenshot`, `save_as_pdf`, `dropdown_options`/`select_dropdown`, `write_file`/`replace_file`/`read_file`,
**`evaluate` (ajanın çağırabildiği ham JavaScript yürütme)**, `done`. Üstüne: MCP araçları (dinamik
olarak aksiyona kaydolur), `@tools.action` ile özel Python fonksiyonları, bulut "skill"leri (HTTP
araçları). Gmail entegrasyonu + `pyotp` → OTP/TOTP okuma. CAPTCHA çözücü **OSS'de yok** (bulut stealth
tarayıcının işi; sistem-prompt yine de "CAPTCHA'lar otomatik çözülür" diyor). İzin/onay kapısı yok.

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*` (spawn + egress_blocked dâhil), `web_*`
(search/get_page/send_form), **`file_*`** (tam sandbox'lı dosya sistemi), `clipboard_*`, `download_*`,
`upload_*`, `journal_search_events`, `task_*`, `extension_*`. **`execute_js`/terminal/kod-editleme YOK**
(ADR-0026: izole-dünya sandbox ölçümle çürütüldü, salt-okunur; ADR-0029: DevTools kullanıcı-only, asla
ajan aracı değil). Ayrıca **model-free deterministik şerit**: `@tepegoz/macro-engine` (iMacros halefi) +
`@tepegoz/recipe-compiler` (imzalı, oracle'lı tekrar-oynatma). `@tepegoz/human-input` insan-benzeri fare
eğrileri/jitter.

**Kim daha iyi:** ham kapsama ve "sayfa neyi kırıyorsa JS ile aş" pratikliğinde **Browser Use** —
özellikle `evaluate` ve OTP okuma. Ama tam bu `evaluate` Tepegöz'ün **bilinçle reddettiği** yüzey:
denetim disiplini, model-free şerit ve deterministik tarif tarafında **Tepegöz**.

### Ajan döngüsü / orkestrasyon — Browser Use savaş-test, Tepegöz yapıca daha ayrık

Browser Use: **tek `Agent` sınıfı, tek LLM-güdümlü `while step < max_steps` döngüsü** (varsayılan
`max_steps=500`; MCP üzerinden 100). Adım başına: tarayıcı durumu → mesaj kur → LLM (JSON: `thinking`,
`evaluation_previous_goal`, `memory`, `next_goal`, `current_plan_item`, `plan_update`, `action[]`) →
`multi_act` (adım başına ≤3 aksiyon, sayfa değişince kalanı atla) → geçmiş güncelle. `max_failures=3`
ardışık → sonlandır (bir son zorunlu yanıtla). Planlama: bant-içi opsiyonel `plan_update` todo listesi +
ardışık-hata sonrası "replan nudge" + "exploration nudge". Döngü kırma: sistem-prompt yönergesi ("3+ adım
aynı URL") + `consecutive_failures` sayacı (WebBrain'deki gibi 3 ayrı dedektör **yok**). `flash_mode`
düşünmeyi/eval'i atlar. Context sıkıştırma: adım-kadansı + karakter-tabanı tetikli LLM özeti
(`compacted_memory`), ilk öğe + son N tutulur. Planner/Executor/Reactor ayrımı **yok**, tipli `Decision`
yok, DAG yok. `pause`/`resume`/`stop` var (CLI'de Ctrl+C).

Tepegöz: **Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor** (continue/retry/replan/
stop, tipli `Decision`). İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe (yanıt yok =
deny). Native tool-calling anthropic/openai/gemini'de; streaming sınırı ADR-0025. `CompletionEvidence`,
navigation-grounding, cache-window (lag-2 breakpoint). Ama **aynı anda tek çalışma** (ADR-0013);
paralel/dayanıklı checkpoint-resume roadmap'te, sevk edilmedi.

**Kim daha iyi:** uzun-koşu dayanıklılığı, savaş-testi ve bant-içi sıkıştırmada **Browser Use** (500
adımlık gerçek koşular). Rol ayrımı, tipli kararlar ve model-öncesi HITL'de **Tepegöz** — ama
serileştirilmiş ve kanıtsız.

### Multi-agent / mod sistemi — örtüşme az

Browser Use OSS'de **çoklu-ajan yok** (nanobrowser'ın Planner/Navigator ayrımı burada yok — tek ajan).
Tek "mod" farkı `flash_mode` (hızlı, düşünmesiz) ↔ normal. `beta/` modülü "beta agent integration"
deneyselleri barındırıyor. Bulut daha fazlasını yapıyor ama repoda değil.

Tepegöz: tek orkestratör, ama `ask`/`act`/`auto` otonomi seviyeleri (+ rezerve `dangerous`), effort
ön-ayarları (low…max), Chat/Do/Make/Tasks paleti. "Mod" daha çok otonomi/effort kombinasyonu.

**Kim daha iyi:** eşit — ikisi de tek-ajan; Browser Use'un `flash_mode`'u ile Tepegöz'ün otonomi
kademesi farklı eksenler, ikisi de sevk edilmiş.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

Browser Use: **prompt seviyesinde** `pre_done_verification` — sistem-prompt'ta bir kontrol listesi
("USER REQUEST'i yeniden oku, öğeleri say, aksiyonların gerçekten tamamlandığını ekran görüntüsüyle
doğrula, her değer tool çıktısında **birebir** geçmeli, bloklayıcı hata varsa `success=false`"). `done`
aksiyonunda `success` bool'u. `agent/judge.py` bir LLM-yargıç (eval/bulut için). `variable_detector.py`.
Deterministik tamamlama-kanıtı kapısı, tuzak fixture'lar, "Contradicted" rozeti, mutasyon-öncesi origin
yeniden-doğrulama **yok** — dürüst prompt'lama, mekanizma değil.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme**: model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz; "Saved!" yazan ama 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı;
recipe-compiler'ın `evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi yakalıyor.
Kuzey-yıldızı koşulu: _"fabricated-success ≈ 0"_.

**Kim daha iyi:** **Tepegöz** — belirgin fark; mekanizma seviyesinde deterministik bir düşürme kapısı var,
Browser Use'da eşdeğeri yok. (Ama Tepegöz'ün ASR/başarı bataryası hâlâ measurement-owed.)

### Prompt-injection savunması (mimari + bugünkü kanıt) — Tepegöz mimaride, kanıtta beraberlik

Browser Use — **minimal ve bunu açıkça kabul ediyor**. (1) `allowed_domains` `SecurityWatchdog`:
allowlist dışı navigasyon/sekme/yönlendirmeyi engeller (glob desteği, glob'ların gevşek olduğu uyarısı).
(2) `sensitive_data`: `<secret>` yer-tutucu mekanizması; gerçek değerler LLM'e giden mesajlardan
`_filter_sensitive_data` ile çıkarılır, domain-kapsamlı kimlik, `allowed_domains` kilidi olmadan
kullanılırsa **gür uyarı** ("ajan kötü niyetli bir siteye girip prompt-injection ile karşılaşırsa
`sensitive_data` sızabilir"). (3) Parola alanı değerleri DOM anlık görüntüsüne konmaz. (4)
`sanitize_surrogates`. **Hepsi bu.** Güvenilmez sayfa içeriğini nonce'lu/etiketli bir blokta
sarma **yok**, yetenek×origin kapısı yok, model-öncesi policy kernel yok, egress firewall yok, taint
yok, repoda enjeksiyon korpusu/benchmark **yok**, araç-başı onay yok. Ajan, context'ine karışan sayfa
içeriğine tam güvenir — bilinen bir zayıflık, paçavralanmıyor.

Tepegöz — **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006): danger class + taint + hedef site →
allow/deny/ask + makine-okunur reason code + biyometrik. Hassas-site kilidi (banka/kripto/sağlık/kamu/
parola yön.) = **her otonomi seviyesinde sert deny**; otonomi yalnız kernel'in sorduğu prompt'u
atlayabilir, deny'ı bozamaz. **EgressFirewall** (`inspectEgress`, Shannon entropisi — sızıntı/yüksek-
entropi blob tespiti). `TaintTracker` provenance. Credential Broker (sırrın gireceği bir şekil yok;
OS-auth kapısı olana dek her dolgu reddedilir — **atıl sevk**). Advisory critic (kernel-sonrası,
engelleyemez). **Ama** ASR bataryası "measurement-owed"; roadmap `auto` otonomisinin finans katmanını
koşulsuz onayladığı bir hatayı açıkça itiraf ediyor (okuyarak bulundu, düzeltildi).

**Kim daha iyi:** mimaride **Tepegöz** açık ara (pre-model kernel + egress + entropi + taint + biyometrik
vs. allowlist + yer-tutucu). Bugünkü ölçülü kanıtta **beraberlik/kimse** — Browser Use'un da
adversaryal korpusu OSS'de yok, Tepegöz'ünki de claim-grade değil; fark şu ki Browser Use açığını
isimlendiriyor.

### Hesap verebilirlik / denetlenebilirlik — türde Tepegöz, bugün beraberlik

Browser Use: `AgentHistoryList` — tam adım geçmişi, `save_to_file` (sensitive_data redaksiyonlu),
`save_conversation_path`, screenshot yolları, `generate_gif`. PostHog telemetri (anonim, env ile
kapatılır). Bulutta koşu panoları. **Kriptografik imza, hash-zinciri, taşınabilir replay makbuzu,
bağımsız doğrulama CLI'si yok.** Geçmiş bir JSON kaydı.

Tepegöz: bugün elde olan **event-sourced journal** + replay timeline. **Notary** — hash-zinciri + Ed25519
imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify` CLI (ADR-0030) — paket
**yazılmış ve testli, ama `apps/desktop` içinde onu import eden hiçbir yer yok**; ADR-0030 bunu kendisi
kabul ediyor. Yani bugün hiçbir Tepegöz koşusu makbuz üretmiyor.

**Kim daha iyi:** **Mimari eksende Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir bir tasarım
ve Browser Use'da eşi yok. **Bugün eksende beraberlik:** iki tarafta da imzalı/zincirli bir kayıt
üretilmiyor; ikisi de bir JSON kaydı düzeyinde.

### Kimlik bilgisi / sır işleme — kavramda Tepegöz, pratikte beraberlik

Browser Use: `sensitive_data` sözlüğü (BYO, kod içinde geçilir) + `<secret>` yer-tutucular +
domain-kapsamlama + LLM context'inden filtreleme + kaydedilen geçmişten redaksiyon. Gerçek tarayıcı
profili yeniden-kullanımı (oturum-açık) + Gmail entegrasyonu ile OTP. Ama sır **tool katmanına ulaşır**:
`input` aksiyonu `<secret>tag</secret>` görünce gerçek değeri arayıp yazar — yani LLM görmez, tarayıcı ve
araç katmanı görür. OS-auth kapısı yok.

Tepegöz: Credential Broker — ajanda sırrın gireceği bir şekil yok; OS-auth kapısı olana dek her dolgu
reddedilir (**atıl sevk**); `strictGuard` "hardened reading". Kavramsal olarak sır ajana hiç ulaşmıyor.

**Kim daha iyi:** kavramsal olarak **Tepegöz** (sır ajana/araç katmanına hiç ulaşmasın tasarımı). Ama
bu kapı **atıl** — **bugün pratikte** çalışanı Browser Use'un LLM'den-filtreleme + redaksiyon zinciri.

### Çevrimdışı / egemenlik — dar örtüşme, ikisi de zayıf ama Browser Use daha esnek

Browser Use: Ollama + herhangi bir yerel OpenAI-uyumlu sunucu + açık-ağırlıklı `bu-30b-a3b-preview` +
LiteLLM. Yerel modelle **tamamen çevrimdışı** koşabilir. Ama: çevrimdışı RAG **yok**, ZIM/Wikipedia
arşivi yok, gömülü bilgi korpusu yok, tarayıcı-içi WebGPU model yok. Önerilen yol da çok belirgin biçimde
**bulut** (ChatBrowserUse + bulut tarayıcılar).

Tepegöz: `local-inference` seam'i + sha256'lı model kataloğu + "basit adımlar cihazda" maliyet-tasarrufu
düğmesi. Phase 8 / S12: **çoğu inşa edilmemiş**, S12 indirilmiş ağırlıklara takılı, sahiplik tablosu boş.
RAG yok.

**Kim daha iyi:** "yerel modelle çalışır mı" sorusunda **Browser Use** (bugün, Ollama ile gerçek). "Tam
çevrimdışı bilgi egemenliği" ikisinde de yok — WebBrain'in Apocalypse Mode'una benzer bir şey iki tarafta
da eksik.

### Asistan UX — örtüşmüyor (Browser Use'un UI'si yok)

Browser Use: **kütüphane** — GUI yok. CLI (`browser-use`, `uvx browser-use[cli]`), `rich` ile terminal
çıktısı, `generate_gif`, `save_conversation_path`. Bulut ürününün web arayüzü var ama repoda değil ve
ücretli.

Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme (adım seç), kademeli otonomi + amber
risk banner, effort ön-ayarları, **kaydırılabilir replay timeline**, kanıt rozetleri, çalışırken
**steer**, pause/resume, arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi + arama,
composer ekleri, ticaret çift-onay, scope-grant, Human Handoff Controller.

**Kim daha iyi:** sevk edilmiş kullanıcı-arayüzü olarak **Tepegöz** — Browser Use OSS bir SDK, son-kullanıcı
UX'i yok. (Geliştirici-ergonomisi ekseninde Browser Use'un API'si temiz ve olgun.)

### Bellek & skill — örtüşme az

Browser Use: OSS'de **kalıcı çapraz-koşu belleği yok** (dosya sistemi `todo.md`/`results.md` koşu-başı;
`available_file_paths` diskte kalır ama oto-hatırlanmaz). `compacted_memory` koşu-içi. "Skill"ler =
**bulut-barındırılan HTTP araç paketleri**, `BROWSER_USE_API_KEY` ile `SkillService` üzerinden çekilir —
yerel skill değil. `skills/browser-use/SKILL.md` ise Claude Code gibi ajan-harness'ların CLI'yi
kurması için manifest. Öğretme/gösterimden-öğrenme (Teacher mode) OSS'de yok.

Tepegöz: S9 — alan-başı **advisory bellek** + yazma-tarafı zehir filtresi + sil-değil-karantina +
görev-çiti dışında yalnız-tavsiye recall (ADR-0027); skill kütüphanesi = **saklı prompt şablonları**
(seçince kutuyu doldurur, **çalıştırmaz**); ayrıca deterministik recipe/macro şeridi.

**Kim daha iyi:** ikisi de zayıf. Browser Use'un bulut "skill"leri _iş yapıyor_ ama kapalı/ücretli;
Tepegöz'ün belleği tasarlanmış ama S9 🟠. Pratik fayda bugün Browser Use bulutunda, mimari hijyen
Tepegöz'de.

### MCP (yön!) — Browser Use her iki yönde, Tepegöz yalnız istemci

Browser Use: **hem istemci hem sunucu.** İstemci (`mcp/client.py`): dış MCP sunucularına bağlanır,
araçları keşfeder ve **aksiyon olarak kaydeder** — ama bu araçlar bir politika kapısından **geçmez**,
doğrudan registry'ye eklenir. Sunucu (`mcp/server.py`): ~15 tarayıcı aracı + `retry_with_browser_use_agent`
aracını MCP istemcilerine (Claude Desktop) açar; `uvx browser-use --mcp`, Claude Desktop uzantısı için
`manifest.json`/`.dxt`.

Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP araçları CapabilityRegistry'ye girer ve **aynı PEP'ten**
geçer; `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen annotation → en
kısıtlı sınıf). MCP **sunucu** yüzeyi yok (Phase 1b planlı, yapılmamış).

**Kim daha iyi:** kapsam olarak **Browser Use** (iki yön de sevk edilmiş; başka ajanlar onun ajanına
görev delege edebiliyor). Mimari temizlikte **Tepegöz** — dış MCP araçları da tek denetim hattından
geçiyor, Browser Use'da geçmiyor.

### Site adaptörleri — ikisinde de OSS'de yok

Browser Use OSS: **site-adaptör sistemi yok.** `integrations/gmail` tek site-özel kod. `domain-skills/<site>/`
kavramı SKILL.md'de var (harness workspace, `BH_DOMAIN_SKILLS=1`, varsayılan kapalı) ama repoda
doldurulmuyor. Bulut "1000+ entegrasyon" diyor — orada.

Tepegöz: ajan için site-adaptör sistemi **yok**. Phase 2 "adapters" daha çok içerik/reklam engelleme +
Safe Browsing (ADR-0043). Hassas-site yalnızca _kategori_.

**Kim daha iyi:** OSS-OSS eşit (ikisinde de yok). Bulut sayılırsa **Browser Use** ezici (1000+
entegrasyon), ama o kapalı/ücretli.

### Türkçe / bölgesel — Tepegöz

Browser Use: **hiç yok.** Sistem-prompt'ları İngilizce ("kullanıcının dilinde yanıt ver" yönergesiyle),
Türkçe hiçbir şey, bölgesel güven modeli yok.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır (ADR-0016),
`ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11 "regional-trust-kamu"
(e-Devlet, KVKK, ADR-0036). Şirket Türk (roltek.com.tr).

**Kim daha iyi:** **Tepegöz** — net.

### Ölçüm / dürüstlük kültürü — farklı okullar; Tepegöz araştırma-sınıfı, Browser Use endüstri-normu

Browser Use: dışarıda ayrı bir benchmark reposu (`browser-use/benchmark`, 100 görev), "Odysseys #1"
iddiası, `static/accuracy_by_model_*.png`, `agent/judge.py` LLM-yargıç, "asla mock'lama (LLM hariç)"
diyen CI testleri. Sağlam ve endüstri-normu — ama repo-içi istatistiksel anayasa, Wilson CI,
ön-kayıtlı H2H, anti-debt prose-ledger, sha256'lı donmuş fixture registry'leri **yok**. "Benchmark
koştur, sayıyı yayınla" modeli. CLAUDE.md'nin kişilik bölümü tuhaf; prompt-injection uyarıları
takdire değer biçimde açık sözlü.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, havuzlanmış aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER,
kuzey-yıldızı iddiası **reddedilebilir** (`bridgeClaim` 25 insan etiketinin altında `publishable:false`),
ön-kayıtlı H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var
— her S-fazı 🟠, hiçbiri ✅ değil.

**Kim daha iyi:** epistemik titizlikte **Tepegöz** (araştırma-sınıfı). "Bugün elde ölçülmüş, yayınlanmış
başarı sayısı var mı" sorusunda **Browser Use** (benchmark + leaderboard sayıları mevcut).

> Not: Tepegöz'ün roadmap'i `browser-use`/`nanobrowser` ailesini _"tekniği çal, asla adapte etme"_ diye
> listeliyor ve [`history.md`](../../phases/ai-agent/history.md) `browser-use`'u adıyla
> değerlendirip **Python + ayrı Chromium + Python sidecar** olduğu için runtime bağımlılığı olarak
> reddediyor; `nanobrowser` (browser-use'un TS/CDP portu) ise "porta hazır referans" seçiliyor.
> `apps/desktop/src/main/agent/build-dom-tree-script.ts` başlığı _"ported from the browser-use /
> nanobrowser technique"_ diyor ve izole-dünyada koşuyor. Yani Tepegöz'ün algı/döngü/aksiyon-sözlüğü/
> içerik-güvenliği katmanları doğrudan bu ailenin tekniğini kendi paketlerine, bir policy kapısının
> arkasına yeniden-yazarak taşıyor.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — bu tablo yalnızca "kim daha iyi + neden". `browser-use` = açık-kaynak Python kütüphanesi
(bulut ayrıca işaretlenir).

| #   | Boyut                                      | Browser Use                                                                                                                               | Tepegöz                                                                                                                                                                                                                                                | Kim daha iyi + neden                                                                                                                            |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                         | Python kütüphanesi — kendi koduna gömersin, kendi Chromium'unu sürer; GUI yok. "Güçlü" hâli kapalı bulutta                                | Tam tarayıcı — out-of-process CDP, kendi sekme/pencere modeli, partition izolasyonu; ama tarayıcı değiştirmen gerek + henüz yayında değil                                                                                                              | **Kullanıma göre değişir.** Otomasyon-kodu yazan geliştirici için **Browser Use**; son-kullanıcıya güvenli bir ürün için **Tepegöz** (mimaride) |
| 2   | **Sağlayıcı genişliği + sıfır-kurulum**    | 16 birinci-sınıf adaptör + LiteLLM/OpenRouter/Vercel/OrcaRouter → yüzlerce model; `BROWSER_USE_API_KEY` tek anahtar; Ollama yerel         | 8 sağlayıcı (bazıları stub) + `local`; sıfır-kurulum bulut yok                                                                                                                                                                                         | **Browser Use** — kıyas kabul etmez                                                                                                             |
| 3   | **Sağlayıcı mimarisi**                     | `BaseChatModel` protokolü + sağlayıcı-başı serializer; hafif normalizasyon                                                                | Tek `Canon*` şeması, capability→tier router, her çağrı `maxTokens`+`timeoutMs` zorunlu, DPAPI key kasası, GBNF JSON zorlaması                                                                                                                          | **Tepegöz** — daha temiz, tipli, tek kaynak, zorunlu bütçe                                                                                      |
| 4   | **Sayfa algısı (bugün)**                   | AX/DOM ağacı + PDF + shadow DOM + iframe + `search_page`/`find_elements` + ayrı extraction-LLM                                            | DOM/a11y + diff/elision + article; PDF/shadow yok, v2 flag-gated                                                                                                                                                                                       | **Browser Use** — daha çok sayfa türünü bugün okuyor                                                                                            |
| 5   | **Algı ekonomisi (token)**                 | Adaptif geçmiş sıkıştırma + görüntü opt-in + parola-alanı elemesi                                                                         | Değişen-only diff + unchanged elision + sanitizer paketi                                                                                                                                                                                               | **Tepegöz** — tasarım daha agresif token kesiyor (ama ölçülmemiş)                                                                               |
| 6   | **Aksiyon repertuvarı genişliği**          | ~25 araç + **`evaluate` (ham JS)** + OTP okuma + MCP + özel Python fn + bulut skill'leri                                                  | ~30 araç + tam dosya-sistemi + clipboard + download/upload + journal + task/extension                                                                                                                                                                  | **Browser Use** — `evaluate` ve OTP ile daha çok senaryoyu bugün aşar                                                                           |
| 7   | **Ajan JS / kod yürütme**                  | `evaluate(code)` ajana açık — ham JavaScript                                                                                              | **Yok** — ADR-0026 izole-dünya sandbox'ı ölçümle çürütüldü, salt-okunur; DevTools kullanıcı-only                                                                                                                                                       | **Kullanıma göre.** Güç isteyene **Browser Use**; saldırı yüzeyini kapatana **Tepegöz** (bilinçli ret)                                          |
| 8   | **Araç çağırma disiplini**                 | İzin kapısı yok; MCP araçları bile registry'ye gate'siz eklenir                                                                           | **Tek PEP**: zod→policy→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                                                                                                               | **Tepegöz** — her araç istisnasız aynı denetim hattından                                                                                        |
| 9   | **Deterministik (model-free) otomasyon**   | Yok — her adım LLM'e bağlı ( `initial_actions` hariç, o da LLM'siz sabit liste)                                                           | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, oracle'lı)                                                                                                                                                                                | **Tepegöz** — gerçek model-siz yorumlayıcı + imzalı tarif                                                                                       |
| 10  | **Ajan döngüsü olgunluğu**                 | Tek döngü, ≤500 adım, bant-içi LLM sıkıştırma, `max_failures` sonlandırma, replan/exploration nudge; gerçek uzun koşular                  | Planner→Executor→Reactor, tipli kararlar, 2-aşama HITL; **tek eşzamanlı run**, checkpoint-resume yok                                                                                                                                                   | **Browser Use** (savaş-test, uzun run). Tepegöz yapı olarak daha ayrık ama serileştirilmiş + kanıtsız                                           |
| 11  | **Doğrulanmış sonuç / yalan-başarı**       | `pre_done_verification` **prompt kontrol listesi** + `done.success` bool + LLM-judge                                                      | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                                                                                      | **Tepegöz** — mekanizma seviyesinde deterministik kapı; Browser Use'unki prompt-seviye                                                          |
| 12  | **Prompt-injection savunması (mimari)**    | `allowed_domains` watchdog + `<secret>` yer-tutucu filtresi + parola-alanı elemesi; başka katman yok, ajan sayfa içeriğine tam güvenir    | Model-ÖNCESİ Policy Kernel + EgressFirewall (Shannon entropi) + taint provenance + biyometrik yüksek-risk + içerik-guard sanitizer                                                                                                                     | **Tepegöz** — açık ara; pre-model kernel + çıkış-sızıntı denetimi vs. allowlist                                                                 |
| 13  | **Prompt-injection (kanıt bugün)**         | Repoda adversaryal korpus/benchmark yok; ama açığı belgede/uyarıda **açıkça isimlendiriyor**                                              | Redteam + injection-corpus var ama claim-grade **ASR bataryası measurement-owed**                                                                                                                                                                      | **Kimse net değil** — ikisinin de yayınlanmış ASR sayısı yok; Browser Use en azından boşluğu dürüstçe söylüyor                                  |
| 14  | **Hesap verebilirlik / denetlenebilirlik** | JSON adım geçmişi + conversation dump + GIF + PostHog (opt-out)                                                                           | Bugün: event-sourced journal + replay timeline. **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI) **yazılı ve testli ama uygulamaya bağlanmamış** — bugün makbuz üretmiyor (ADR-0030) | **Mimaride Tepegöz** (kriptografik, satıcıdan bağımsız doğrulanabilir bir tasarım); **bugün beraberlik** — iki tarafta da imzalı kayıt yok      |
| 15  | **Kimlik bilgisi / sır işleme**            | `sensitive_data` + `<secret>` yer-tutucu: LLM görmez ama **tool katmanı görür**; kilitsiz kullanımda gür uyarı; gerçek profil + Gmail OTP | Credential Broker: sırrın gireceği şekil yok, OS-auth olana dek reddeder (**atıl**) + strictGuard                                                                                                                                                      | **Kavramsal Tepegöz** (sır ajana/araca hiç ulaşmasın) ama **atıl** — **bugün pratikte Browser Use** çalışıyor                                   |
| 16  | **Çevrimdışı / yerel model**               | Ollama + yerel OpenAI-uyumlu + açık-ağırlıklı `bu-30b-a3b-preview`; tam çevrimdışı koşabilir ama RAG/korpus yok, önerilen yol bulut       | `local-inference` seam + model kataloğu + maliyet düğmesi; RAG yok, S12 ağırlıklara takılı                                                                                                                                                             | **Browser Use** — bugün Ollama ile gerçekten yerel koşar; Tepegöz tarafı çoğu inşa edilmemiş                                                    |
| 17  | **Maliyet şeffaflığı**                     | `TokenCost` — LiteLLM fiyat tablosundan token/USD (varsayılan kapalı, `calculate_cost`)                                                   | `TokenLedger` + `ModelRouter` tier + "basit adımlar cihazda" maliyet düğmesi                                                                                                                                                                           | **Beraberlik** — ikisi de token/maliyet izliyor; Browser Use'un fiyat-tablosu otomatik, Tepegöz'ün router'ı maliyet-farkında                    |
| 18  | **Asistan UX (sevk edilmiş cila)**         | Yok — kütüphane; CLI + GIF + conversation dump. Bulutta web UI (kapalı)                                                                   | Replay timeline, kanıt rozetleri, risk-sınıfı banner, scope-grant, steer, arka-plan run, ticaret kapısı, Human Handoff                                                                                                                                 | **Tepegöz** — Browser Use OSS'de son-kullanıcı arayüzü yok                                                                                      |
| 19  | **Bellek & skill (pratik fayda)**          | OSS'de kalıcı bellek yok; "skill" = bulut HTTP araçları (`BROWSER_USE_API_KEY`); Teacher mode yok                                         | Skill = yalnız prompt şablonu (bilerek); poison-filtreli karantina belleği; recipe/macro                                                                                                                                                               | **Beraberlik / Browser Use bulutta** — OSS'de ikisi de sınırlı; Browser Use'un "skill"leri iş yapıyor ama kapalı                                |
| 20  | **MCP**                                    | **Hem sunucu hem istemci** — başka ajanlar onun ajanına delege eder; ama gelen MCP araçları gate'siz                                      | MCP **istemcisi** — dış araçlar tek PEP altında; sunucu yüzeyi yok                                                                                                                                                                                     | **Kapsamda Browser Use** (iki yön sevk), **mimaride Tepegöz** (gate'li)                                                                         |
| 21  | **Site adaptörleri**                       | OSS'de yok (yalnız Gmail); bulutta "1000+ entegrasyon" (kapalı)                                                                           | Yok (ajan için)                                                                                                                                                                                                                                        | **OSS-OSS eşit**; bulut sayılırsa Browser Use                                                                                                   |
| 22  | **Türkçe / bölgesel derinlik**             | Hiç yok — İngilizce-only prompt'lar                                                                                                       | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli                                                                                                                                                                 | **Tepegöz** — net                                                                                                                               |
| 23  | **Ölçüm / dürüstlük kültürü**              | Dış benchmark reposu + leaderboard sayıları + LLM-judge; repo-içi istatistiksel anayasa yok                                               | Ground-truth eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                                                                              | **Epistemikte Tepegöz** (araştırma-sınıfı); **yayınlanmış sayıda Browser Use**                                                                  |
| 24  | **"Bugün çalışıyor mu"**                   | Evet — yaygın kullanılan kütüphane, gerçek koşular, leaderboard                                                                           | Kısmen — iskelet bağlı, çoğu faz measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                                                                                | **Browser Use** — kesin                                                                                                                         |

---

## Sonuç

**Bugün, genişlik ve "çalışıyor" ekseninde Browser Use kazanıyor:** sağlayıcılar (16 + yüzlerce vs. 8),
`evaluate` ile ham JS gücü, OTP okuma, bant-içi sıkıştırmalı 500-adımlık gerçek koşular, hem sunucu hem
istemci MCP, Ollama ile fiili yerel çalışma, dış benchmark + leaderboard sayıları — ve hepsinin üstünde,
**geliştiricilerin gerçekten kullandığı olgun bir kütüphane** (artı onun üstündeki kapalı bulut ürünü).
Karşılaştırmanın çift asimetrisi burada belirleyici: Browser Use bir **araç kutusu**, Tepegöz bir **ürün**;
ve Browser Use'un en güçlü yeteneklerinin çoğu (stealth tarayıcı, CAPTCHA, kalıcı bellek, 1000+
entegrasyon, en iyi model) **açık-kaynakta değil, ücretli bulutta**.

**Mimari ve yaptığı spesifik bahislerde Tepegöz kazanıyor:** model-öncesi deterministik policy kernel,
egress firewall + entropi analizi, taint provenance, kriptografik replay receipt'leri (Notary — paket
yazılı ve testli, ama uygulamaya bağlanmadığı için bugün makbuz üretmiyor),
kanıt-atıflı tamamlama + deterministik yalan-başarı düşürme kapısı, biyometrik yüksek-risk kapıları,
model-free deterministik otomasyon şeridi (macro + imzalı recipe), tek-PEP araç çağrısı (MCP dâhil),
araştırma-sınıfı ölçüm anayasası, ve Türkçe/kamu derinliği. Browser Use'un kendi belgeleri
prompt-injection karşısında `sensitive_data`'nın sızabileceğini açıkça söylüyor; Tepegöz tam bu boşluğu
kapatmak için model-öncesi bir kernel ve bir çıkış-firewall'ı inşa ediyor — henüz claim-grade
ölçülmemiş olsa da. Ayrıca Browser Use'un `evaluate` ile ajana verdiği ham JS yüzeyi Tepegöz'ün
ADR-0026 ile **bilinçle reddettiği** şey.

Dürüst özet: **Browser Use bugün daha yetenekli ve kanıtlanmış bir web-otomasyon aracı; Tepegöz onun
tekniğini alıp bir güvenlik ve hesap-verebilirlik planının arkasına koymak üzere tasarlanmış native bir
tarayıcı ve bunu henüz kanıtlamadı** (S-fazları 🟠, vision/credential-broker/memory atıl sevk, aynı anda
tek run, site adaptörü yok). Kendi kodunda, kendi LLM'inle, ölçekli web otomasyonu yazacaksan → Browser
Use (ve muhtemelen bulutu). "Oturum-açık banka oturumuna güvenebileceğin, ne yaptığının kriptografik
kanıtı olan, model-öncesi bir politika çekirdeğiyle sınırlanmış, Türkçe bir son-kullanıcı ajanı"
istiyorsan → o Tepegöz'ün tezi, hâlâ tezgâhta.
