# Tepegöz vs Crawl4AI — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Crawl4AI** (açık kaynak, Apache-2.0 lisanslı, "LLM-dostu
> web crawler & scraper" Python kütüphanesi; ~50k GitHub yıldızı, 0.9.x serisi, "Development Status ::
> Beta"; `pip install crawl4ai`, Docker API sunucusu ve `crwl` CLI) arasında, iş-iş kimin neyi daha iyi
> yaptığını tabloya döken bir karşılaştırma.
>
> **Yöntem.** `.junk/crawl4ai` deposunun (`README.md`, `README-first.md`, `MISSION.md`, `ROADMAP.md`,
> `PROGRESSIVE_CRAWLING.md`, `pyproject.toml` + `requirements.txt`, `crawl4ai/` kaynak ağacı:
> `extraction_strategy.py` (Cosine / LLM / JsonCss / JsonXPath + şema doğrulama geri-besleme döngüsü),
> `content_filter_strategy.py` (Pruning / BM25 / LLM), `prompts.py`, `adaptive_crawler.py`,
> `async_webcrawler.py` + `async_crawler_strategy.py` (Playwright / patchright / stealth + HTTP-only
> strateji), `deep_crawling/` (BFS/DFS/BestFirst + filtre + skorlayıcı), `async_url_seeder.py`,
> `chunking_strategy.py`, `table_extraction.py`, `script/` (c4a DSL + `lark` derleyici), `config.py` /
> `types.py` (`LLMConfig`), `utils.py` (`perform_completion_with_backoff` → litellm), `hub.py` +
> `crawlers/` (amazon_product, google_search), `deploy/docker/` (`server.py`, `mcp_bridge.py`,
> `egress_broker.py`, `auth.py`), `SECURITY.md`) ve bu reponun AI yüzeyinin (`phases/ai-agent/`,
> `packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|tool-executor|local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|
credential-vault|human-input|agent-eval`, `extensions/ext-agent`, `docs/adr/*`) aynı oturumda
> okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`phases/tracks/README.md`'deki
> "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı
> haliyle korunan bir kayıttır.
>
> **İlgili.** Yapısal referans: [`docs/others/tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md) ve
> [`docs/others/tepegoz-vs-kilocode.md`](tepegoz-vs-kilocode.md) (o da farklı-kategori kıyası).
> `phases/tracks/crawl4ai-agent-parity.md` **yok** ve bu belgeye göre yazılması da erken olur: Crawl4AI'nin
> yüzeyinin büyük kısmı bir tarayıcı ajanının parity hedefi değil.
>
> **Kategori uyarısı.** Bunlar **farklı ürün kategorileri**. Crawl4AI bir _kütüphane / çatı_: bir URL'yi
> (ya da binlercesini) alır, tarayıcıyla veya tarayıcısız çeker, HTML'i LLM'e hazır **Markdown**'a ya da
> şema güdümlü **yapılı JSON**'a çevirir, derin-crawl / URL-keşif / "yeterli bilgi toplandı mı" durdurma
> mantığı sunar. Hedef kullanıcı: RAG hattı, veri boru hattı ya da başka bir ajan kuran **geliştirici**.
> Crawl4AI'nin kendisi bir hedef alıp canlı bir oturumda çok-adımlı **aksiyon** yürütmez — "Agentic
> Crawler" `ROADMAP.md`'de duruyor, sevk edilmedi (kaynak ağacında `crawl4ai/agents` / `crawl4ai/discovery`
> modülü yok; README'nin TODO listesindeki ✓ işareti kaynakta karşılıksız). Tepegöz ise bir _tarayıcı
> ajanı + güvenlik-önce native tarayıcı_: sayfayı okur, tıklar/yazar, form gönderir, sekme yönetir,
> model-öncesi deterministik bir Policy Kernel'den geçer, tamamlamayı kanıta atıfla imzalar. Bu belge önce
> bu asimetriyi söyler, sonra **yalnızca örtüşen eksenlerde** (çok-model/çok-sağlayıcı, içerik
> algısı/çıkarımı, prompt mimarisi, deterministik/model-free çıkarım, maliyet şeffaflığı, çevrimdışı, MCP,
> tarayıcı kontrolü) iş-iş kıyaslar. Örtüşmeyenler `## Örtüşmeyen alanlar` başlığında ayrıca listelenir.

---

## Önce çerçeve: bunlar farklı ürünler

|             | Crawl4AI                                                                                                                                                                                                                       | Tepegöz                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Python **kütüphanesi** (`AsyncWebCrawler`) + Docker API sunucusu + `crwl` CLI; web → temiz Markdown / yapılı JSON                                                                                                              | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                   |
| Olgunluk    | **Yaygın kullanımda** — ~50k yıldız, PyPI'da beta (0.9.x), büyük topluluk, Discord, sponsor programı, düzenli blog sürümleri; API yüzeyi "battle-tested"                                                                       | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Python 3.10+, `setuptools`, tek paket + `deploy/docker/` FastAPI sunucusu; Playwright/patchright/`playwright-stealth` + `aiohttp` HTTP yolu; opsiyonel `torch`/`transformers`/`sentence-transformers`                          | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her sınırda                                                  |
| Felsefe     | "Veriye herkes erişebilmeli; pahalı modele bel bağlamadan, sezgisel (heuristic) zekâyla çıkar"; açık kaynak, geliştirici-önce, hız-önce. `MISSION.md` daha büyük bir "veri kapitalizasyonu / veri pazarı" vizyonu tarif ediyor | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Bir sayfayı/siteyi çekip **LLM'e hazır içeriğe** dönüştürmek: Markdown üretimi, şema çıkarımı, derin-crawl, URL keşfi, "yeterli bilgi" durdurma                                                                                | Web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu                                        |

Yani: **olgun, geniş, gerçekten kullanılan bir crawl/scrape kütüphanesi** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir tarayıcı ajanı**. İkisi de "HTML'i bir LLM'in işine yarar hâle getir" işini yapıyor;
Crawl4AI bunu bir _anlık görüntüyü veriye_ çevirmek için, Tepegöz bir _ajanın canlı sayfada
davranabilmesi_ için yapıyor. Bir hedefi alıp adım adım tıklayarak yürüten döngü Crawl4AI'de yok.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Model / sağlayıcı desteği — Crawl4AI genişlikte, Tepegöz disiplinde

Crawl4AI: LLM erişimi tamamen **litellm** üzerinden (kendi pinlenmiş fork'u `unclecode-litellm==1.81.13`).
`perform_completion_with_backoff(provider, prompt, api_token, base_url=…)` tek giriş noktası; `provider`
bir `"<sağlayıcı>/<model>"` dizesi. `config.py` yalnızca ~7 sağlayıcı ailesini adıyla tanıyor (openai —
varsayılan `openai/gpt-4o`, anthropic, gemini, groq, deepseek, ollama, bedrock ön-eki) ama litellm
altında **100+ sağlayıcı API'si** ve her OpenAI-uyumlu `base_url` (Ollama/LM Studio/vLLM/LocalAI dâhil)
erişilebilir. `litellm.drop_params = True` ile desteklenmeyen parametreler otomatik düşürülüyor. Router
yok, yetenek katmanı yok, zorunlu bütçe yok, kanonik şema yok — normalizasyonu litellm yapıyor. LLM
yalnızca dört yerde kullanılıyor: LLM çıkarımı, LLM içerik filtresi, şema üretimi, c4a script üretimi.

Tepegöz: **8 sağlayıcı** (`anthropic`, `openai`, `gemini`, `kimi`, `nova`, `deepseek`, `xai`, `groq`) +
`local` (node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u **GBNF gramerle** zorlayan). Hepsi tek
`CanonRequest`/`CanonResponse` şemasına normalize; `ModelRouter` yeteneği (`plan`/`exec`/`classify`) →
tier + yerel/bulut'a eşliyor; her `ModelGateway.complete()` çağrısı **`maxTokens` + `timeoutMs` zorunlu**;
`TokenLedger` her çağrının token/maliyetini işliyor; DPAPI'li BYO-key kasası. **Ama** yalnız Anthropic
resmi SDK kullanıyor, OpenAI ham REST, birkaç sağlayıcı stub.

Örtüşen eksende **Crawl4AI ham genişlikte açık ara** (litellm = tek arayüzden yüzlerce model, `base_url`
ile herhangi bir yerel endpoint). Tepegöz'ün mimarisi (tek Canon şema, zorunlu bütçe alanları, router,
GBNF) daha tipli ve daha disiplinli ama yüzeyi dar. İkisinde de "ajan görev ortasında model seçiyor" diye
bir şey yok — Crawl4AI'de zaten ajan yok.

### İçerik algısı / çıkarımı — Crawl4AI olgun ve kanıtlı; farklı amaç için

Crawl4AI'nin çekirdek işi bu ve derin: `html2text` tabanlı **Markdown üreteci** (`raw_markdown` +
sezgisel süzülmüş `fit_markdown`), **içerik filtreleri** — `PruningContentFilter` (link/metin yoğunluğu
sezgiseli, model yok), `BM25ContentFilter` (sorgu güdümlü, model yok), `LLMContentFilter`
(`PROMPT_FILTER_CONTENT` ile LLM). Yapılı çıkarım: `JsonCssExtractionStrategy` / `JsonXPathExtractionStrategy`
(şema güdümlü, **çalışma anında LLM yok** — hızlı, deterministik; `nested`/`list`/`nested_list`/`regex`/
`transform` alan tipleri, kardeş-eleman `source` sözdizimi), `LLMExtractionStrategy` (litellm, blok veya
şema; chunk + overlap + paralel; `TokenUsage` izleme), `CosineStrategy` (yerel `sentence-transformers`
gömüleri + hiyerarşik kümeleme). Girdi biçimi seçilebilir: `markdown` / `html` / `fit_markdown`. Ek: tablo
çıkarımı (sezgisel `DefaultTableExtraction` + `LLMTableExtraction`), PDF, `capture_network_requests` /
`console_messages` / MHTML / SSL sertifikası yakalama, virtual-scroll.

Tepegöz: DOM/a11y-önce algı (ADR-0008) — **kimlik-kararlı ref'ler** (ajan tıklayıp sonra elemanı yeniden
bulabilsin diye), diff/dedupe/elision (token kesmek için değişmeyen DOM'u atma), `aria-labelledby`/
`label[for]` çözümü, `browser_get_article`. `@tepegoz/tool-executor` gizli/zero-width/bidi/homoglyph
enjeksiyon vektörlerini ayrı bir pakette temizliyor ve `wrapUntrustedContent` ile sarıyor. Vision
**yalnızca eskalasyon** (ADR-0008/S10), ama **üretimde hiç bağlanmamış**: `captureVision` Reactor'a
enjekte edilen opsiyonel bir geri-çağrı ve onu geçen tek yer testler; yani atıl.

"Bir sayfayı yapılı veriye çevir" ekseninde **Crawl4AI bugün belirgin şekilde önde** — daha çok strateji,
daha çok sayfa türü (PDF, tablo, sonsuz-kaydırma), yıllardır saha kullanımı. "Canlı bir DOM'u bir ajan
davranabilecek şekilde algıla ve elemanları yeniden konumlandır" ekseni Tepegöz'ün tasarımı (kararlı
ref + sanitizer), ama ölçülmemiş. İkisi aynı işi yapmıyor.

### Prompt mimarisi — Crawl4AI'nin olgun, örnek-ağır, kendini düzelten bir sistemi var

Crawl4AI `prompts.py`: `PROMPT_EXTRACT_BLOCKS` (+ talimatlı varyant), `PROMPT_EXTRACT_SCHEMA_WITH_INSTRUCTION`
(kalite-yansıması + 1–5 kalite skoru istiyor), `PROMPT_EXTRACT_INFERRED_SCHEMA`, `PROMPT_FILTER_CONTENT`,
ve iki büyük **`JSON_SCHEMA_BUILDER`** (CSS + XPath) — 8 işlenmiş örnek, açık anti-pattern uyarıları
("asla hash'lenmiş CSS-in-JS sınıf adı kullanma", "baseSelector'ı alan seçici olarak tekrar kullanma"),
kardeş-satır örnekleri. Üstüne **şema doğrulama geri-besleme döngüsü**: üretilen şema HTML'e karşı
çalıştırılıyor (`_validate_schema`), 0 eleman/boş alan tespit ediliyor, `_build_feedback_message` yapısal
bir tanı üretiyor ve LLM'e tekrar denetiliyor. `GENERATE_SCRIPT_PROMPT` de c4a/JS üretimi için bir
"felsefe + komut tablosu + vaka örnekleri" prompt'u.

Tepegöz'ün prompt'ları farklı bir işi hedefliyor: **orkestrasyon/karar** prompt'ları — Planner
(Intent→DAG), Reactor kararları (tipli `Decision`), `CompletionEvidence`, navigation-grounding,
vision-trigger. "Bu sayfayı JSON'a çevir" prompt ailesi Tepegöz'de daha küçük (`reader`, `browser_get_article`).

"Sayfayı yapılı veriye çeviren prompt" ekseninde **Crawl4AI net önde** — olgun, örnek-ağır, ve şema
üretimi için gerçek bir kendini-düzeltme döngüsü var. Tepegöz'ün prompt yatırımı ajan-karar tarafında.

### Deterministik / model-free çıkarım — ikisinin de var, farklı biçimlerde

Crawl4AI: `JsonCssExtractionStrategy` / `JsonXPathExtractionStrategy` bir şema verildiğinde **hiç model
çağırmadan** çalışır (bir kez LLM ile şema üretip sonra binlerce sayfada model-siz koşmak tipik akış).
Ayrıca **c4a script** — `lark` grameriyle derlenen bir DSL (`GO`/`CLICK`/`WAIT \`css\``/`SET`/`EVAL`/`IF`/
`REPEAT`/`PROC`…), crawl **öncesi** sayfayı hazırlamak için (çerez banner'ı kapat, "load more", login);
elle yazılır ya da LLM ile üretilir, sonra deterministik koşar. `PruningContentFilter` ve BM25 filtresi
de model-siz.

Tepegöz: **model-free deterministik şerit** — `@tepegoz/macro-engine` (iMacros halefi, kontrol akışı +
oto-bekleme) ve `@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren seçicili tekrar-oynatma +
`evaluateAssertion` success oracle). `@tepegoz/human-input` insan-benzeri fare eğrileri.

İkisi de "bir kez akıllı ol, sonra ucuz/deterministik tekrar et" desenini benimsiyor. Crawl4AI'ninki
**veri çıkarımına** dönük (şema tekrar-oynatma) ve bugün yaygın kullanımda; Tepegöz'ünki **aksiyon
tekrar-oynatmaya** dönük (macro/recipe) ve imzalı success-oracle'ı var ama ölçülmemiş.

### Ajan döngüsü / otonomi — Crawl4AI'de aksiyon ajanı yok; en yakını "yeterli bilgi" durdurucu

Crawl4AI: `AdaptiveCrawler.digest(start_url, query)` — bir sorgu için "yeterli bilgi toplandı mı"
sorusunu yanıtlayan bir **bilgi-yeterliliği optimizasyonu** (`PROGRESSIVE_CRAWLING.md`: coverage /
consistency / saturation metrikleri, `confidence_threshold`, `max_pages`). İki strateji: `statistical`
(saf BM25 / terim frekansı — **model gerekmez**) ve `embedding` (gömü uzayında kapsam/boşluk). Bilgi
tabanı diske serileştiriliyor (resumable crawl, paylaşılabilir). Derin-crawl tarafında `BFSDeepCrawlStrategy`
/ `DFSDeepCrawlStrategy` / `BestFirstCrawlingStrategy` + filtre zinciri (domain / içerik-tipi / SEO /
URL-pattern / BM25 içerik-alaka) + skorlayıcılar (anahtar-kelime alaka / domain otoritesi / tazelik /
yol derinliği). Bunların hiçbiri canlı bir sayfada **tıklayıp form gönderen** bir hedef-ajanı değil —
bunlar link seçen ve ne zaman duracağına karar veren crawl kontrolörleri.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor** (tipli `Decision`:
`continue`/`retry`/`replan`/`stop`). İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe.
Otonomi: `ask`/`act`/`auto` (+ rezerve `dangerous`); `deny` sınıfı her seviyede sert bloke. **Ama** aynı
anda **tek çalışma** (ADR-0013); paralel/dayanıklı checkpoint-resume roadmap'te, sevk edilmedi.

Bu eksen **örtüşmüyor denecek kadar asimetrik**: Crawl4AI'nin "döngüsü" ne zaman durup hangi linki
izleyeceğine dair; Tepegöz'ünki bir kullanıcı hedefini adım adım aksiyona çeviren. Crawl4AI'nin
adaptif-durdurma mantığı (özellikle saf-istatistiksel yol) sevk edilmiş ve model-siz çalışıyor;
Tepegöz'ün ajan döngüsü tipli ve daha açık ama serileştirilmiş + kanıtsız.

### Aksiyon repertuvarı — Crawl4AI'de "crawl-öncesi hazırlık", Tepegöz'de "ajan araçları"

Crawl4AI'nin aksiyonları c4a script komutları (`CLICK`/`TYPE`/`SET`/`SCROLL`/`WAIT`/`DRAG`/`PRESS`/`EVAL`

- `IF`/`REPEAT`/`PROC`) ve `js_code` hook'ları — hepsi **bir çekimden önce** sayfayı okunur hâle
  getirmek için. Oturum yönetimi, `storage_state`, `BrowserProfiler` ile kalıcı (oturum-açık) profiller,
  proxy rotasyonu, indirme yakalama var. Ama bu komutlar bir hedefe göre model tarafından **döngü içinde**
  seçilmiyor; script baştan tanımlı.

Tepegöz: ~30 araç, hepsi **tek kapıdan** (ToolGateway PEP): `browser_*` (get_page, get_elements,
get_article, click, type, gezinme verbleri, validate_*, analyze_page, get_screenshot), `tab_*`
(create/list/spawn/egress_blocked), `web_*` (search, get_page, send_form), **`file_*`** (tam sandbox'lı
dosya sistemi), `clipboard_*`, `download_*`/`upload_*`, `journal_search_events`, `task_*`, `extension_*`.
`execute_js`/terminal/kod-editleme **yok** (ADR-0026/0029).

Örtüşen eksende: Crawl4AI'nin browser kontrolü **crawl için** zengin (stealth, profil, proxy, ölçek),
Tepegöz'ünki **bir ajanın yönetilen tek oturumu için**. Model güdümlü aksiyon döngüsü yalnızca Tepegöz'de
(ve kanıtsız).

### Maliyet şeffaflığı — ikisi de token sayıyor, ikisi de temel

Crawl4AI: `LLMExtractionStrategy` her çağrının `TokenUsage`'ını (prompt/completion/total) biriktiriyor,
`show_usage()` çağrı-başı bir tablo yazdırıyor; maliyet hesabını litellm yapıyor. Zorunlu `max_tokens`
yok, wall-clock bütçesi yok, ön-kayıtlı hedef yok — strateji-başı raporlama.

Tepegöz: `TokenLedger` her `ModelGateway.complete()` çağrısının token/maliyetini kaydeder; her çağrı
`maxTokens` + `timeoutMs` **zorunlu** (bütçesiz çağrı yok); S7 `$ / wall-clock` hedefleri ön-kayıtlı;
`ext-agent`'ta effort ön-ayarları + replay timeline.

Örtüşen eksende **kabaca eşit**: Crawl4AI raporluyor, Tepegöz zorluyor ("hiçbir çağrı bütçesiz koşamaz").
İkisi de kullanıcıya-dönük fiyat panosu / eğitim-bayrağı gibi zenginlikler sunmuyor.

### Prompt-injection & güvenilmez içerik — farklı problemler

Crawl4AI: LLM çıkarımı `sanitize_html` + `escape_json_string`'den geçmiş HTML'i `<html>…</html>` içinde
prompt'a koyuyor; prompt "içeriği asla değiştirme, kopyala" diyor. **Ayrı bir homoglyph/bidi/zero-width
sanitizer yok, taint takibi yok, nonce'lu `<untrusted>` sarma yok, "bu veri talimat değil" etiketi yok.**
Crawl4AI'nin güvenlik yatırımı başka yerde ve gerçek: **Docker API sunucusu** — auth varsayılan açık,
token verilmedikçe loopback'e bağlanıyor, istek gövdesi "güvenilmez güven sınırı"; `egress_broker.py`
(SSRF: `not ip.is_global` olan her çözülmüş IP reddedilir, resolve-and-pin ile DNS-rebinding kapatılır);
URL şema doğrulaması (`file://`/`javascript:`/`data:` blok); hook'lar varsayılan kapalı + kısıtlı
builtin'ler; deserialization allowlist; hesaplanmış-alan `expression`'ı **güvenlik gereği devre dışı**
(eval yerine `function` callable). `SECURITY.md` geçmiş RCE/LFI CVE'lerini ve düzeltmelerini listeliyor.
Ama bu, "bir crawl sunucusunu güvenli çalıştırma" tehdit modeli — "oturum-açık bir hesapta ajanın ne
yapabileceğini kısıtlama" değil. `SECURITY.md` bile "çıkarılan içeriği başka sistemlerde kullanmadan önce
sanitize edin" diyor (yükü çağırana bırakıyor).

Tepegöz: **model-öncesi deterministik Policy Kernel** (ADR-0006) kararın kendisini injection'dan bağımsız
kılar (danger class + taint + site → deny/ask, argüman değerini görmeden). `@tepegoz/tool-executor`
gizli/zero-width/bidi/homoglyph vektörlerini ayrı pakette temizler. `EgressFirewall` (`inspectEgress`,
Shannon entropisi ile sır/yüksek-entropi blob sızıntı denetimi). `TaintTracker` provenance. **Ama**
claim-grade ASR bataryası measurement-owed (S6).

Örtüşen eksende: Crawl4AI'nin SSRF/egress sertleştirmesi (sunucu tarafı) **sevk edilmiş ve gerçek**;
Tepegöz'ün `EgressFirewall`'ı entropi tabanlı sızıntı denetimi ekliyor ama ölçülmemiş. Prompt-injection'ın
kendisi (güvenilmez sayfa metni → model talimatı) Crawl4AI'nin ele almadığı, Tepegöz'ün mimari olarak
ele aldığı ama henüz kanıtlamadığı bir eksen.

### Hesap verebilirlik / denetlenebilirlik — farklı artefaktlar

Crawl4AI: `CrawlResult` zengin adli malzeme taşıyor — Markdown, ham/temiz HTML, ekran görüntüsü, MHTML,
`network_requests`, `console_messages`, SSL sertifikası, yönlendirme zinciri. Docker sunucusunun SBOM'u
(`sbom/`), auth'u, CVE geçmişi var. Ama **imzalı / hash-zincirli çalışma defteri yok, taşınabilir replay
receipt yok.**

Tepegöz: **Notary** (Phase 7) — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt**

- bağımsız `tepegoz-verify` CLI + event-sourced journal. Paket yazılmış ve testli, **ama `apps/desktop`'a
  bağlanmamış**: `@tepegoz/notary` kendi paketi dışında hiçbir yerden import edilmiyor, yani bugün hiçbir
  çalışma makbuz üretmiyor (ADR-0030 bunu kabul ediyor).

Örtüşen eksende: Crawl4AI bir çekimin **artefaktlarını** iyi yakalıyor (ne indiğinin kanıtı) ve bunu
bugün yapıyor; Tepegöz bir ajan çalışmasını **kriptografik olarak tasdiklemek üzere tasarlanmış** (ne
yaptığının satıcıdan bağımsız doğrulanabilir kanıtı) ama mekanizma henüz kablolanmadığı için bugün
tasdik üretmiyor. İkincisinin Crawl4AI'de eşi yok — ama Crawl4AI'nin işi de bir ajan çalışmasını
tasdiklemek değil.

### Çevrimdışı / egemenlik — ikisi de kısmi, farklı yönlerden

Crawl4AI: **HTTP-only crawler stratejisi** (tarayıcı gerekmez, `aiohttp`); adaptif crawl'ın
`statistical` yolu **hiç model gerektirmez** (saf BM25/terim frekansı); `CosineStrategy` ve adaptif
`embedding` yolu **yerel** `sentence-transformers` gömüleri kullanabilir (`crawl4ai-download-models`);
yerel LLM için litellm'i Ollama'ya/`base_url`'e yöneltmek yeterli. Ama gömülü bir çevrimdışı bilgi yığını
/ RAG deposu **yok** (Web Embedding Index `ROADMAP.md`'de). Crawl4AI RAG _için_ Markdown üretir, kendi RAG'ı
yoktur.

Tepegöz: `@tepegoz/local-inference` (`LocalProvider`, node-llama-cpp, **GBNF JSON gramer zorlaması**) +
`@tepegoz/model-catalog` (GGUF, zorunlu sha256, resumable indirme) + "basit adımlar cihazda"
maliyet-tasarrufu düğmesi. **Ama** S12 "indirilmiş ağırlıklara takılı", sahiplik tablosu BOŞ; çevrimdışı
RAG yok.

Örtüşen eksende **kabaca eşit ve ikisi de kısmi**: Crawl4AI'nin saf-istatistiksel + HTTP-only yolu
"sıfır model, sıfır API" ile gerçekten çalışır; Tepegöz'ün GBNF gramer zorlaması yerel modelden güvenilir
JSON almak için daha sağlam bir mekanizma ama arkasındaki faz ölçülmemiş.

### MCP — ters yönler

Crawl4AI: **MCP sunucusu** (`deploy/docker/mcp_bridge.py`) — Docker dağıtımı SSE (`/mcp/sse`) ve WebSocket
(`/mcp/ws`) üzerinden bir MCP sunucusu açar; FastAPI rotalarını `@mcp_tool` ile sarar. 7 araç: `md`,
`html`, `screenshot`, `pdf`, `execute_js`, `crawl`, `ask`. Yani Claude Code / başka ajanlar **Crawl4AI'yi
bir araç sağlayıcısı** olarak kullanır. MCP istemcisi yok.

Tepegöz: **MCP istemcisi** (ADR-0018, `mcp-client`) — dış MCP sunucularının araçları Capability Plane'e
girer ve **aynı PEP'ten** geçer; `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`), `dangerClassFor`
(bilinmeyen annotation → en kısıtlı sınıf, fail-safe). MCP **sunucu** yüzeyi henüz yok (Phase 1b).

Örtüşen eksende: yönler zıt, ikisi de kendi yönünde sevk edilmiş. Crawl4AI dışarıya **araç sunar**;
Tepegöz dışarıdan **araç tüketir** ve her birini deterministik kernel + audit hattından geçirir.

### Tarayıcı kontrolü — Crawl4AI ölçek/kaçınma, Tepegöz yönetilen tek oturum

Crawl4AI: Playwright + **patchright** (yamalı Playwright) + `playwright-stealth` + `UndetectedAdapter` +
`antibot_detector.py` + `user_agent_generator` + proxy rotasyon stratejileri + `MemoryAdaptiveDispatcher`
(bellek-uyarlı paralel çekim) + `BrowserProfiler` (kalıcı oturum-açık profiller) + virtual-scroll +
`raw:`/`file://` girdi. Ayrıca tam **tarayısız** HTTP yolu. Yani hedef: engellenmeden, ölçekte sayfa çekmek.

Tepegöz: **native out-of-process CDP**, kendi sekme/pencere modeli, `@tepegoz/human-input` insan-benzeri
fare eğrileri/jitter (bot-tespiti karşıtı hareket profili), dialog interception, occlusion re-check,
locator cascade.

Örtüşen eksende: Crawl4AI **çekim verimi ve kaçınmada** olgun ve kanıtlı; Tepegöz **yönetilen, denetlenen
tek ajan oturumu** için tasarlanmış. Farklı hedefler; toplu-crawl için Crawl4AI, yönetişimli interaktif
ajan için Tepegöz (kanıtsız).

### Türkçe / bölgesel — Tepegöz

Crawl4AI: Türkçe'ye özgü bir şey yok; İngilizce kod tabanı, İngilizce prompt'lar, bölgesel adaptör yok
(`crawlers/` yalnızca `amazon_product` + `google_search`). Dil-agnostik bir kütüphane.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır (ADR-0016),
`ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11 "regional-trust-kamu"
(e-Devlet, KVKK, ADR-0036 kamu adaptör güven modeli). Şirket Türk (roltek.com.tr).

Örtüşen eksende **Tepegöz** — ama Crawl4AI için bu bir hedef değil (kütüphane, UI yok).

### Ölçüm / dürüstlük kültürü — farklı türde

Crawl4AI: gerçek bir topluluk-projesi ölçümü — `tests/` dizini, düzenli blog sürüm notları, `JOURNAL.md`,
CHANGELOG, `crawl4ai-doctor` teşhis komutu, SBOM, güvenlik-araştırmacısı teşekkürleri + CVE listesi.
`PROGRESSIVE_CRAWLING.md` adaptif-crawl için bir değerlendirme metodolojisi (sentetik veri seti, ablasyon,
BFS/DFS/oracle baseline'ları, ANOVA) tarif ediyor — ama bu bir tasarım belgesi, "LLM seviyesi" gelecek
işareti taşıyor. Ajan-yetenek benchmark'ı / adversaryal ASR / ground-truth eval harness'ı repoda yok
(zaten bir crawl kütüphanesi için farklı bir gereksinim).

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı
iddiası **reddedilebilir** (`bridgeClaim` 25 insan etiketinin altında `publishable:false`), ön-kayıtlı H2H
protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var — her S-fazı
🟠, hiçbiri ✅ değil.

Örtüşen eksende: Crawl4AI'nin ölçümü **ürün/kütüphane sağlamlığında** olgun ve sevk edilmiş; Tepegöz'ünki
**ajan-yetenek iddiasında** araştırma-sınıfı ama henüz doğrulayacak yeteneğin kendisi yok.

---

## Örtüşmeyen alanlar

**Yalnızca Crawl4AI'de var (Tepegöz'de karşılığı yok):**

- **Toplu / paralel crawl**: `arun_many`, `MemoryAdaptiveDispatcher` / `SemaphoreDispatcher`, rate limiter,
  canlı `CrawlerMonitor` panosu.
- **Derin-crawl stratejileri**: BFS / DFS / Best-First + filtre zinciri (domain / içerik-tipi / SEO /
  URL-pattern / BM25 içerik-alaka) + skorlayıcılar (anahtar-kelime / domain otoritesi / tazelik / yol
  derinliği).
- **URL keşfi**: `AsyncUrlSeeder` — sitemap + Common Crawl'dan saniyeler içinde binlerce URL, sorguya
  karşı BM25 skorlama; `domain_mapper`, `link_preview` 3-katmanlı skorlama.
- **Adaptif "bilgi yeterliliği" durdurma**: `AdaptiveCrawler.digest`, statistical + embedding stratejileri,
  bilgi tabanı export/import (resumable/paylaşılabilir crawl).
- **Markdown üretim hattı**: `html2text` tabanlı üreteç, `fit_markdown`, alıntı/atıf desteği.
- **Şema güdümlü çıkarım + LLM şema üretimi**: `JsonCss`/`JsonXPath` + `JSON_SCHEMA_BUILDER` +
  **şema doğrulama geri-besleme döngüsü** (0-eleman/boş-alan tanısı → yeniden dene).
- **Cosine/kümeleme çıkarımı**, **chunking stratejileri** (Regex / NLP-cümle / topic-segmentation /
  sliding-window / overlapping-window).
- **Tablo çıkarımı** (sezgisel + LLM), **PDF işleme**, virtual-scroll, `raw:`/`file://` girdi.
- **Tarayısız HTTP crawl yolu** (`aiohttp`); **stealth/anti-bot** (patchright, `playwright-stealth`,
  `UndetectedAdapter`, `antibot_detector`), proxy rotasyonu, `BrowserProfiler`.
- **Docker API sunucusu** + interaktif Playground + monitoring dashboard + **MCP sunucusu** (7 araç) +
  `egress_broker` SSRF sertleştirmesi + auth gate + SBOM.
- **c4a script DSL + `lark` derleyici** (crawl-öncesi deterministik sayfa hazırlama; LLM ile üretilebilir).
- `crwl` CLI, `crawl4ai-doctor`, `CrawlerHub` (domain-özel crawler kayıt defteri), önbellek katmanı.

**Yalnızca Tepegöz'de var (Crawl4AI'de karşılığı yok):**

- **Model güdümlü aksiyon ajanı**: Planner→Executor→Reactor (tipli `Decision`), iki-aşamalı HITL,
  `ask`/`act`/`auto` otonomi.
- **Model-öncesi deterministik Policy Kernel** (danger class + taint + site → deny/ask, argümanı görmeden)
  - hassas-site kategorik sert deny + biyometrik yüksek-risk kapısı.
- **Tek ToolGateway PEP** (built-in / MCP / extension ayrımsız: lookup → idempotency → zod → policy →
  HITL → execute → audit).
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance +
  `detectHandoff` (captcha/2FA → insana devir).
- **Notary** (Phase 7): hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız
  `tepegoz-verify` CLI — paket yazılmış ve testli, ama `apps/desktop`'a **bağlanmamış**: bugün hiçbir
  çalışma makbuz üretmiyor (ADR-0030).
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme + tuzak
  fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **Aksiyon-tekrar-oynatma** model-free şerit: `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı
  replay + `evaluateAssertion` success oracle); `@tepegoz/human-input` insan-benzeri fare eğrileri.
- **Kimlik bilgisi brokeri** (sırrın ajana ulaşacağı bir şekil yok; OS-auth kapısı olana dek her dolgu
  reddedilir — atıl sevk) + advisory bellek (poison-filtreli karantina, ADR-0027).
- **MCP istemcisi** (dış araçlar tek PEP altında), **Agent Console** UX (plan önizleme, replay timeline,
  steer, pause/resume, arka-plan run, ticaret çift-onay, scope grant), `task_*` kayıtlı görevler.
- **Native Electron tarayıcı** (out-of-process CDP, kendi sekme/pencere modeli), araştırma-sınıfı
  `agent-eval` harness'ı + anti-debt / PROSE-LEDGER / reddedilebilir kuzey-yıldızı iddiası.
- **Türkçe/kamu derinliği**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H görev şartı, Phase 11
  e-Devlet/KVKK güven modeli.
- **GBNF gramer-zorlamalı** yerel çıkarım seam'i + sha256'lı GGUF model kataloğu.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                           | Crawl4AI                                                                                                             | Tepegöz                                                                                                                                                                  | Kim daha iyi + neden                                                                                                                               |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi / birincil iş**               | Crawl/scrape kütüphanesi: web → LLM'e hazır Markdown / yapılı JSON                                                   | Tarayıcı ajanı: web'de çok-adımlı görev yürüt                                                                                                                            | **Örtüşmüyor** — farklı problemler; "kim iyi" ancak alt-eksenlerde anlamlı                                                                         |
| 2   | **Dağıtım / form**                              | `pip install` kütüphanesi + Docker API + `crwl` CLI; bir boru hattına gömülür                                        | Tam Electron tarayıcı; kurulum + tarayıcı değişimi gerek, henüz yayında değil                                                                                            | **Bugün Crawl4AI** (erişim + olgunluk). Tepegöz yapısal olarak farklı bir yeri hedefliyor                                                          |
| 3   | **Sağlayıcı genişliği**                         | litellm (fork) → tek arayüzden 100+ sağlayıcı API'si + her OpenAI-uyumlu `base_url`; config'te ~7 aile tanınır       | 8 sağlayıcı (bazıları stub) + `local`                                                                                                                                    | **Crawl4AI** — kıyas kabul etmez (litellm)                                                                                                         |
| 4   | **Sağlayıcı mimarisi**                          | litellm normalizasyonu, `LLMConfig` (provider/token/base_url); router yok, bütçe yok                                 | Tek `Canon*` şeması, capability→tier router, zorunlu `maxTokens`+`timeoutMs`, GBNF JSON zorlaması, DPAPI kasa                                                            | **Tepegöz** — daha tipli, tek kaynak, bütçesiz çağrı imkânsız                                                                                      |
| 5   | **Sayfa → yapılı veri çıkarımı**                | Markdown üreteci + Pruning/BM25/LLM filtre + JsonCss/XPath şema + Cosine + tablo + PDF; yıllarca saha kullanımı      | DOM/a11y algı + diff/elision + `reader`/`get_article`; ajan-için kararlı ref, snapshot-çıkarımı dar                                                                      | **Crawl4AI** — daha çok strateji, daha çok sayfa türü, kanıtlı                                                                                     |
| 6   | **Canlı DOM algısı (ajan-için)**                | Yok — çıkarım anlık görüntüden; tıklama sonrası eleman yeniden-konumlama derdi yok                                   | Kimlik-kararlı ref'ler + diff/dedupe/elision + occlusion re-check + locator cascade                                                                                      | **Tepegöz** — ama bu Crawl4AI'nin problemi değil; ölçülmemiş                                                                                       |
| 7   | **Prompt mimarisi (çıkarım)**                   | Olgun: `JSON_SCHEMA_BUILDER` (8 örnek + anti-pattern) + kalite-skoru + **şema doğrulama geri-besleme döngüsü**       | Orkestrasyon/karar prompt'ları (Planner/Reactor/CompletionEvidence); çıkarım prompt'ları daha küçük                                                                      | **Crawl4AI** — sayfa→JSON prompt'unda derin + kendini düzelten döngü                                                                               |
| 8   | **Deterministik / model-free çıkarım**          | JsonCss/XPath şema (bir kez LLM ile üret, sonra model-siz koş) + Pruning/BM25 filtre                                 | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, success-oracle)                                                                                             | **Farklı hedef**; Crawl4AI veri-çıkarımında + bugün yaygın, Tepegöz aksiyon-tekrarında + imzalı                                                    |
| 9   | **c4a script / pre-crawl DSL**                  | `lark`-derlenmiş DSL (`CLICK`/`WAIT`/`SET`/`IF`/`PROC`); elle veya LLM ile üretilir, deterministik koşar             | Yok (macro-engine benzer amaçlı ama farklı)                                                                                                                              | **Crawl4AI** — crawl-öncesi hazırlık için sevk edilmiş, dokümante araç                                                                             |
| 10  | **Ajan döngüsü (aksiyon)**                      | Yok — "Agentic Crawler" ROADMAP'te, kaynakta yok                                                                     | Planner→Executor→Reactor, tipli kararlar, 2-aşama HITL; tek eşzamanlı run, checkpoint-resume yok                                                                         | **Tepegöz** — tek tarafta var (ama serileştirilmiş + kanıtsız)                                                                                     |
| 11  | **Adaptif crawl / "yeterli bilgi"**             | `AdaptiveCrawler.digest`: statistical (model-siz) + embedding; coverage/consistency/saturation; resumable KB         | Yok (Reactor completion-evidence farklı problem)                                                                                                                         | **Crawl4AI** — sevk edilmiş, saf-istatistiksel yol model gerektirmiyor                                                                             |
| 12  | **Derin-crawl + URL keşfi**                     | BFS/DFS/BestFirst + filtre/skorlayıcı zinciri; `AsyncUrlSeeder` (sitemap + Common Crawl + BM25)                      | Yok                                                                                                                                                                      | **Crawl4AI** — net                                                                                                                                 |
| 13  | **Toplu / paralel çekim**                       | `arun_many` + bellek-uyarlı dispatcher + rate limiter + canlı monitor                                                | Aynı anda **tek run** (ADR-0013)                                                                                                                                         | **Crawl4AI** — net                                                                                                                                 |
| 14  | **Tarayıcı kontrolü**                           | Playwright + patchright + stealth + undetected + proxy rotasyon + kalıcı profil + tarayısız HTTP yolu                | Native out-of-process CDP + kendi sekme modeli + insan-benzeri fare eğrileri                                                                                             | **Crawl4AI** çekim-ölçeği/kaçınmada; **Tepegöz** yönetilen tek oturumda                                                                            |
| 15  | **Aksiyon repertuvarı**                         | c4a script komutları + hook'lar (crawl-öncesi, baştan tanımlı)                                                       | ~30 araç tek PEP'ten (browser__/tab__/web__/file__ sandbox/clipboard/download/task)                                                                                      | **Tepegöz** — model güdümlü, denetlenen araç seti; Crawl4AI'de aksiyon döngü-içi seçilmiyor                                                        |
| 16  | **Araç çağırma disiplini**                      | Yok (kütüphane API'si; Docker'da auth + egress gate)                                                                 | **Tek PEP**: zod→PolicyKernel→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                           | **Tepegöz** — her araç istisnasız aynı deterministik hattan                                                                                        |
| 17  | **Model-öncesi güvenlik kararı**                | Yok (ajan yok)                                                                                                       | **Deterministik PolicyKernel** danger-class+taint+site, argümanı görmez; hassas-site kategorik deny; biyometrik                                                          | **Tepegöz** — belirgin mimari fark (ama ajan bağlamında; Crawl4AI için gereksiz)                                                                   |
| 18  | **SSRF / egress sertleştirme**                  | `egress_broker`: `not ip.is_global` reddi + resolve-and-pin (DNS-rebinding kapalı) + URL şema blok — sevk edilmiş    | `EgressFirewall` (`inspectEgress` + Shannon entropi ile sızıntı/blob denetimi) — measurement-owed                                                                        | **Berabere**: Crawl4AI bugün sevk edilmiş SSRF savunması; Tepegöz entropi-tabanlı sızıntı denetimi ekliyor ama ölçmüyor                            |
| 19  | **Prompt-injection (güvenilmez sayfa → model)** | `sanitize_html` + escape; ayrı homoglyph/bidi sanitizer / taint / "veri değil talimat" etiketi **yok**               | Pre-model kernel + `tool-executor` homoglyph/bidi/zero-width sanitizer + `wrapUntrustedContent` + taint                                                                  | **Tepegöz** (mimaride) — ama Crawl4AI bunu tehdit modeline almıyor; Tepegöz'ün ASR kanıtı da yok                                                   |
| 20  | **Sunucu güvenlik geçmişi**                     | Docker sunucusu: auth varsayılan açık, loopback bind, hook'lar kapalı, deserialization allowlist, CVE listesi + SBOM | Renderer-untrusted + `createWindow` fabrikası + typed contextBridge; ajan dosya araçları ajan-sandbox'ında                                                               | **Farklı yüzeyler** — Crawl4AI bir API sunucusunu, Tepegöz bir GUI + renderer'ı sertleştiriyor; ikisi de ciddi                                     |
| 21  | **Hesap verebilirlik / denetlenebilirlik**      | `CrawlResult` artefaktları (Markdown/HTML/screenshot/MHTML/network/console/SSL) + SBOM                               | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + `tepegoz-verify` CLI — ama `apps/desktop`'a **bağlanmamış** (bugün makbuz üretmiyor) | **Bugün Crawl4AI** (artefaktları gerçekten üretiyor); **tasarımda Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir, Crawl4AI'de eşi yok |
| 22  | **Maliyet şeffaflığı**                          | `TokenUsage` + `show_usage()` çağrı-başı tablo; litellm maliyet hesabı; zorunlu bütçe yok                            | `TokenLedger` + zorunlu per-çağrı `maxTokens`+`timeoutMs` + S7 ön-kayıtlı $ hedefleri                                                                                    | **Kıl payı Tepegöz** ("bütçesiz çağrı imkânsız"); ikisi de kullanıcı-yüzü panosu sunmuyor                                                          |
| 23  | **Çevrimdışı / egemenlik**                      | Tarayısız HTTP yolu + saf-istatistiksel adaptif (model-siz) + yerel `sentence-transformers` gömüleri; RAG deposu yok | `local-inference` (GBNF JSON zorlaması) + sha256 GGUF katalog; RAG yok, S12 ağırlıklara takılı                                                                           | **Berabere** — ikisi de kısmi; Crawl4AI "sıfır model" yolu çalışıyor, Tepegöz'ün GBNF'i daha sağlam ama ölçülmemiş                                 |
| 24  | **MCP**                                         | **Sunucu** (SSE/WS, 7 araç: md/html/screenshot/pdf/execute_js/crawl/ask) — başka ajanlar Crawl4AI'yi kullanır        | **İstemci** — dış araçlar tek PEP altında; sunucu yüzeyi yok                                                                                                             | **Ters yönler** — ikisi de kendi yönünde sevk edilmiş; Crawl4AI farklılaşmış özellik, Tepegöz mimari temizlik                                      |
| 25  | **Yerel model mekanizması**                     | litellm → Ollama/`base_url`; `CosineStrategy` yerel gömü                                                             | `LocalProvider` (node-llama-cpp) + **GBNF JSON gramer zorlaması** + resumable GGUF indirme                                                                               | **Tepegöz** güvenilir-JSON mekanizmasında; **Crawl4AI** ekosistem genişliğinde; ikisi de kısmi                                                     |
| 26  | **Türkçe / bölgesel derinlik**                  | Yok (dil-agnostik kütüphane, UI yok)                                                                                 | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli, Türk şirket                                                                      | **Tepegöz** — ama Crawl4AI için hedef değil                                                                                                        |
| 27  | **Kanıt-atıflı tamamlama / yalan-başarı**       | Yok (ajan yok; adaptif crawl'da `confidence_threshold` var ama farklı şey)                                           | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                        | **Tepegöz** — tek tarafta var (ölçüm borçlu)                                                                                                       |
| 28  | **Olgunluk / topluluk**                         | ~50k yıldız, büyük topluluk, düzenli sürümler, sponsorlar, `crawl4ai-doctor`, `tests/`                               | 1.0 öncesi, tek şirket, tüm S-fazları 🟠                                                                                                                                 | **Crawl4AI** — kesin                                                                                                                               |
| 29  | **Ölçüm kültürü**                               | Kütüphane sağlamlığı: `tests/`, CVE disiplini, SBOM, blog notları; ajan-ASR/ground-truth harness yok (gereksiz)      | `agent-eval` (ground-truth-önce) + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                         | **Farklı türde** — Crawl4AI ürün-sağlamlığında sevk edilmiş; Tepegöz ajan-iddiasında araştırma-sınıfı ama yeteneksiz                               |
| 30  | **"Bugün çalışıyor mu"**                        | Evet — kütüphane olarak yaygın kullanımda, beta ama sağlam                                                           | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                             | **Crawl4AI** — kendi kategorisinde kesin                                                                                                           |

---

## Sonuç

**Bunlar farklı ürünler.** Crawl4AI bir crawl/scrape kütüphanesi: bir URL'yi (ya da binlercesini) çekip
LLM'e hazır Markdown ya da şema güdümlü JSON üretir, derin-crawl / URL-keşfi / "yeterli bilgi" durdurma
sunar; hedef kullanıcısı bir boru hattı veya başka bir ajan kuran geliştiricidir. Tepegöz web'de görev
yürüten güvenlik-önce bir tarayıcı ajanıdır. "Hangisi daha iyi" bütün olarak yanlış sorudur — Crawl4AI'de
model güdümlü aksiyon döngüsü, model-öncesi Policy Kernel, Notary replay-receipt, kanıt-atıflı tamamlama,
MCP istemcisi ya da kimlik-brokeri yok; Tepegöz'de toplu/paralel crawl, derin-crawl stratejileri, URL
seeder, adaptif bilgi-yeterliliği durdurma, Markdown üretim hattı, şema doğrulama geri-besleme döngüsü,
tablo/PDF çıkarımı, Docker API sunucusu + playground + MCP sunucusu ya da c4a script DSL yok.

**Örtüşen eksenlerde (çok-sağlayıcı/model, sayfa→yapılı-veri çıkarımı, çıkarım prompt mimarisi,
deterministik/model-free çıkarım, çevrimdışı, tarayıcı-kontrolü-çekim-tarafı, olgunluk) bugün Crawl4AI
önde:** litellm ile 100+ sağlayıcı (8'e karşı), yıllarca saha kullanımı görmüş çıkarım stratejileri,
kendini düzelten şema-üretim döngüsü, sevk edilmiş adaptif-crawl ve SSRF sertleştirmesi, stealth/proxy ile
ölçekli çekim — ve hepsinin üstünde **geliştiricilerin gerçekten kullandığı, ~50k yıldızlı olgun bir
kütüphane**.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz önde:** tek ToolGateway PEP, model-argümanını
görmeden karar veren deterministik Policy Kernel, hassas-site kategorik deny + biyometrik, `EgressFirewall`
entropi denetimi, taint provenance, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify` (Crawl4AI'de
eşi yok — ama paket yazılmış ve testli olduğu hâlde `apps/desktop`'a bağlanmamış, bugün makbuz
üretmiyor), kanıt-atıflı tamamlama + yalan-başarı savunması, MCP istemcisinin tek-kernel entegrasyonu,
araştırma-sınıfı `agent-eval` + anti-debt kültürü, ve Türkçe/kamu derinliği. Bunların çoğu ancak bir
_aksiyon ajanı_ bağlamında anlam taşır — Crawl4AI'nin olmadığı bağlam.

Dürüst özet: **Crawl4AI bugün iş gören, olgun bir kütüphane (kendi kategorisinde); Tepegöz'ün ajanı henüz
kanıtlanmadı** — her S-fazı 🟠 measurement-owed, 3 yetenek (vision / credential-broker / memory) atıl,
aynı anda tek run, sağlayıcıların bir kısmı stub, site adaptörü yok. Bir sayfayı ya da siteyi LLM'e hazır
veriye çevirmek, bir RAG hattı beslemek ya da ölçekte crawl etmek istiyorsan → Crawl4AI. Tez "oturum-açık
banka oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, model-öncesi deterministik bir
çekirdekten geçen, Türkçe bir _tarayıcı_ ajanı" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta.
