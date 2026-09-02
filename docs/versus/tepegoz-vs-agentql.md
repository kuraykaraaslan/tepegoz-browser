# Tepegöz vs AgentQL — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **AgentQL** (TinyFish, Inc. — doğal-dil sorgu diliyle
> web sayfasında eleman ve veri bulan, kapalı-kaynak barındırılan servis + Python/JS SDK'ları)
> arasında, örtüşen eksende iş-iş kimin neyi daha iyi yaptığını tabloya döken bir karşılaştırma.
>
> **Yöntem.** `.junk/agentql` deposu **ince bir örnek deposudur** — 144 dosya, tamamı örnek
> script + CI/güvenlik iskeleti; **AgentQL'in kendisi bu checkout'ta yok**. Okunanlar: `README.md`,
> `Makefile`, `LICENSE`, `osv-scanner.toml`, `golden-images.yaml`, `.semgrepignore`, `.tags.json`,
> `.github/workflows/*` (js-precommit, python-precommit, secrets-scanner, vuln-scanner-pr),
> `.github/config/.pre-commit-config-template.yaml`, `.templates/{js,python}/*`,
> `examples/examples.md`, `examples/js/package.json`, `examples/python/pyproject.toml` ve
> `examples/{python,js}/` altındaki ~25 örnek script (first_steps, get_by_prompt, list_query_usage,
> log_into_sites, save_and_load_authenticated_session, stealth_mode, humanlike-antibot,
> use_existing_browser, use_remote_browser, xpath, submit_form, close_cookie_dialog, close_popup,
> compare_product_prices, infinite_scroll, wait_for_entire_page_load, collect_paginated_news_headlines,
> perform_sentiment_analysis, news-aggregator, maps_scraper). Tepegöz tarafı: `phases/ai-agent/`,
> `packages/{orchestrator,model-gateway,capability-plane,security-policy,agent-runtime,browser-tools,
tool-executor,web-tools,local-inference,mcp-client,recipe-compiler,macro-engine,notary,
credential-vault,human-input}`, `apps/desktop/src/main/macro/macro-selector-healer.electron.ts`,
> `docs/adr/*` (özellikle 0006/0007/0008/0013).
>
> **Kanıt sınırı — açıkça.** Aşağıda AgentQL hakkında söylenenlerin **büyük bölümü README ve resmî
> dokümantasyon iddiasıdır**, okunabilir kaynaktan değil. Bu checkout'tan **doğrudan doğrulanabilen**
> tek şey: SDK'nın çağrı yüzeyi (`agentql.wrap()`, `query_elements()`, `query_data()`,
> `get_by_prompt()`, `wait_for_page_ready_state()`, `enable_stealth_mode()`, `paginate()`,
> `create_browser_session()`), sorgu dilinin sözdizimi, API-anahtarı ile bir servise bağlandığı
> (`AGENTQL_API_KEY`), Playwright'a sarmalayıcı olduğu ve deponun MIT lisanslı olduğu. Sorgu çözümünün
> **nasıl** yapıldığı (hangi model, hangi caching, "self-healing" mekaniği, sunucuya sayfanın ne kadarı
> gider) bu depoda **görünmüyor** — o yüzden aşağıda mekanizma iddiası kurmuyorum, iddiayı iddia
> olarak etiketliyorum.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** `phases/tracks/agentql-agent-parity.md` **henüz yok**; yapısal örnek olarak
> [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md).
>
> **Kategori uyarısı.** AgentQL bir **tarayıcı ajanı değil**. Bir **eleman-bulma / veri-çıkarma
> katmanı**: Playwright'ın üstüne oturan bir sorgu dili + barındırılan bir çözümleyici servis. Karar
> vermez, plan yapmaz, otonomi seviyesi yoktur, izin sormaz, kendi tarayıcısı yoktur (Playwright'ınkini
> sarar). Kontrol akışını **sen Python/JS'te yazarsın**. Dolayısıyla head-to-head kıyas yalnızca **algı
> ekseninde** (bir elemanı nasıl bulup dayanıklı biçimde adresliyorsun) ve ikincil olarak
> sağlayıcı/maliyet/egemenlik ekseninde anlamlıdır. Ajan döngüsü, policy kernel, HITL, hesap
> verebilirlik gibi başlıklar tek taraflıdır ve aşağıda "Örtüşmeyen alanlar" başlığında ayrılmıştır.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | AgentQL                                                                                                                 | Tepegöz                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Ne          | **Sorgu dili + barındırılan çözümleyici servis** + Python/JS SDK, REST API, Chrome debugger eklentisi, playground       | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                 |
| Birincil iş | Canlı sayfada **elemanı bul, yapılandırılmış veriyi çıkar** — otomasyonu geliştirici yazar                              | Kullanıcı adına **niyeti uçtan uca yürüt**, güvenlik ve hesap verebilirlik sınırları içinde                       |
| Olgunluk    | **Ticari ürün, yayında** — PyPI/npm paketleri, ücretli API, şirket (TinyFish), Discord; bu depo yalnız örnek vitrini    | **1.0 öncesi**; ajan "gerçekten bağlanmış iskelet, ince ölçülmüş", sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | **Bu checkout'ta çekirdek yok** — 144 dosya, ~25 örnek script + CI. Çekirdek kapalı, hosted. MIT olan yalnızca örnekler | Strict TS, pnpm+turbo monorepo, ~70 paket, ADR güdümlü, tamamı okunabilir                                         |
| Felsefe     | "Doğal dille adresle, servis çözsün, UI değişse de sorgu tutsun" — geliştirici ergonomisi önce                          | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik          |

Yani: **çalışan, dar kapsamlı, kapalı bir algı servisi** ile **geniş kapsamlı, açık, henüz kanıtlanmamış
bir ajan tarayıcısı** kıyaslanıyor. AgentQL'in yaptığı iş Tepegöz'ün **bir alt sisteminin bir
parçasının** işidir; buna karşılık o parçayı bugün ticari kalitede yapıyor ve Tepegöz'ün o parçadaki
karşılığı ölçülmemiş durumda.

---

## Derinlemesine: örtüşen eksende kim ne yapıyor

### Eleman adresleme — AgentQL'in tek ve gerçek kozu

AgentQL'in çekirdek fikri örneklerden net okunuyor: bir CSS/XPath seçici yerine **sayfanın anlamını
tarif eden bir sorgu** yazıyorsun ve SDK sana Playwright locator'ı döndürüyor.

```
{ username_field  password_field  submit_btn }
{ cookies_form { reject_btn } }
```

`query_elements()` bunu iç içe bir yanıt nesnesine çeviriyor (`response.sign_in_form.email_input.fill(...)`),
`get_by_prompt("the search bar")` ise sorgusuz, tek cümlelik bir hedefleme veriyor. Kazanç somut:
`log_into_sites`, `submit_form`, `close_cookie_dialog`, `close_popup` örneklerinin hiçbirinde tek bir
seçici yok. README ayrıca **siteler-arası taşınabilirlik** ve **UI değişimine dayanıklılık
("self-healing")** iddia ediyor — bu iddianın mekanizması checkout'ta görünmüyor, ölçüsü de yok.

Tepegöz'ün karşılığı farklı bir bahis: **DOM/a11y-önce algı** (ADR-0008). `browser_get_elements`
erişilebilirlik ağacından `{ ref, role, name, value?, disabled? }` listesi döndürüyor; model bir seçici
yazmıyor, bir `ref` seçiyor. Ref'ler yalnız en son snapshot için geçerli, navigasyonda düşüyor;
`ElementsDiffMemory` değişmeyeni eleyip yalnız değişeni yeniden gönderiyor (token ekonomisi).
`@tepegoz/tool-executor` bu düğümleri modele vermeden önce gizli/zero-width/bidi/homoglyph enjeksiyon
vektörlerinden temizliyor. **Kim daha iyi:** ergonomi ve kararlılık iddiası bugün AgentQL'de (ürün
olarak satılıyor, ölçüsü olmasa da kullanılıyor); mimaride Tepegöz, çünkü hedefleme **modelin
yazamayacağı** bir uzayda (ref indeksi) tutuluyor — halüsinasyon seçici yapısal olarak imkânsız — ve
sayfa içeriği modele girmeden sanitize ediliyor.

### Seçici iyileşmesi ("self-healing") — beklenmedik biçimde en yakın temas noktası

AgentQL "UI değişse de sorgu çalışır" diyor; nasıl olduğu kapalı.

Tepegöz'de bunun okunabilir bir eşi var: `apps/desktop/src/main/macro/macro-selector-healer.electron.ts`.
Deterministik `SelectorChain` replay'de çözülemezse — **ve yalnız o zaman** — tek bir kapsamlı model
çağrısı yapılıyor. Kritik tasarım: sayfaya enjekte edilen script aday elemanları **kendisi** sayıyor ve
her biri için benzersiz CSS locator'ı **kendisi** hesaplıyor (id → data-testid → nth-of-type ata
zinciri); modelin tek işi bir **indeks seçmek** ya da reddetmek. Yani model asla CSS/XPath yazmıyor,
uydurma seçici yapısal olarak imkânsız; sağlayıcı anahtarı yoksa, aday yoksa, yanıt bozuksa → `null` ve
mevcut hata yoluna düşülüyor. Üstelik healer, kullanıcının zaten onayladığı **aynı adım** için tek bir
alternatif locator öneriyor; ne yapılabileni genişletiyor ne çalışmayı bloke ediyor. **Kim daha iyi:**
kapsam ve kanıt bugün AgentQL'de (her sayfa, her sorgu, ticari); **tasarım dürüstlüğünde Tepegöz** —
iyileşmenin ne zaman devreye girdiği, ne yapabildiği ve nasıl başarısız olduğu okunabilir ve dar.

### Yapılandırılmış veri çıkarımı — AgentQL, ama dar bir farkla

`query_data()` sorgunun şeklini çıktının şekline çeviriyor; tip/dönüşüm ipuçları sorgunun içinde:

```
{ price_currency  products[] { name  price(integer) } }
{ items(might be articles, posts, tweets)[] { published_date(convert to XX/XX/XXXX format)  author(person's name; return "n/a" if not available) } }
```

Bu gerçekten güzel: `maps_scraper`, `news-aggregator`, `collect_ecommerce_pricing_data` örnekleri tek
sorguyla CSV üretiyor. Ek olarak `paginate(page, QUERY, 3)` sayfalama, `wait_for_page_ready_state()`
dinamik-yükleme beklemesi var.

Tepegöz'ün en yakın karşılığı `browser_analyze_page` (S5): model **küçük bir JS ifadesi yazıyor**, bu
ifade sayfanın bir **kopyası** üzerinde, ağı olmayan ve gerçek sayfaya erişemeyen bir sandbox'ta
çalışıyor; sonuç kapaklanıyor, journal'a **script gövdesi değil hash'i** yazılıyor (script sayfa
içeriğinden bestelendiği için gövdeyi loglamak enjeksiyon yükünü denetim kaydına kopyalamak olurdu).
Ayrıca `@tepegoz/reader` HTML'siz tipli bloklar üretiyor, `browser_get_article` makale çıkarıyor. Ama
**şema-güdümlü, tip-dönüşümlü, sayfalamayı bilen bir çıkarım dili yok** ve S5 dahil tüm S-fazları 🟠.
**Kim daha iyi: AgentQL** — ergonomi ve bugün-çalışırlık ekseninde net.

### Karar / kontrol akışı — kıyas yok

AgentQL'de ajan döngüsü **yoktur**. `if`, `for`, retry, sayfa sırası — hepsi örneklerdeki Python/JS'in
içinde, elle. `close_cookie_dialog` `if response.cookies_form.reject_btn != None` yazıyor;
`infinite_scroll` `for times in range(3)` ile kaydırıyor. Bu bir eksiklik değil, ürünün kapsamı.

Tepegöz: Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor (continue/retry/replan/stop,
tipli `Decision`), iki-aşamalı HITL, `CompletionEvidence`, navigation-grounding. Ama **aynı anda tek
run** (ADR-0013), checkpoint-resume yok, ölçüm borçlu. **Kim daha iyi:** soru yanlış — AgentQL bu işi
yapmaya çalışmıyor. Karşılaştırılabilir olan tek şey: AgentQL kullanıcısı döngüyü **kendi** yazdığı
için bugün öngörülebilir bir sonuç alıyor; Tepegöz döngüyü kendi yazıyor ve henüz güvenilirliğini
kanıtlamadı.

### Model / sağlayıcı ve maliyet şeffaflığı — Tepegöz

AgentQL'de model seçimi **yok**: `AGENTQL_API_KEY` ile bir servise bağlanıyorsun, hangi modelin sorguyu
çözdüğü, token maliyeti, gecikmesi ne — checkout'tan görünmüyor, SDK yüzeyinde de bir seçenek yok.
`perform_sentiment_analysis` örneği bunu ilginç biçimde gösteriyor: veriyi AgentQL çıkarıyor, ama
yorumlama için ayrıca **OpenAI istemcisi** kuruluyor (`gpt-3.5-turbo`) — yani LLM katmanı AgentQL'in
işi değil.

Tepegöz: 8 sağlayıcı (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, `responseFormat:'json'`'da GBNF gramer zorlaması), tek
`CanonRequest`/`CanonResponse` şeması, `ModelRouter` (plan/exec/classify → tier + local/cloud),
`TokenLedger`, her çağrıda **zorunlu** `maxTokens`+`timeoutMs`, DPAPI/safeStorage BYO-key kasası. Bazı
sağlayıcılar stub, yalnız Anthropic resmî SDK kullanıyor. **Kim daha iyi: Tepegöz** — AgentQL'de
seçilecek bir şey yok, maliyet ve gecikme kapalı kutu.

### Egemenlik / veri akışı — Tepegöz, ve fark yapısal

AgentQL'de her `query_elements`/`query_data`/`get_by_prompt` çağrısı **satıcının sunucusuna gider**.
Sayfanın ne kadarının gönderildiği checkout'tan görünmüyor, ama sorgunun çözülebilmesi için sayfa
yapısının anlamlı bir kısmının gitmesi gerekir. `save_and_load_authenticated_session` ve `log_into_sites`
örnekleri **oturum-açık** sayfalarda çalışıyor; `use_remote_browser` ise tarayıcının kendisini
satıcının bulutuna taşıyor (`create_browser_session()` → `cdp_url`, hatta `get_page_streaming_url(0)`).
Yani en hassas senaryoda (giriş yapılmış hesap) hem sayfa hem tarayıcı satıcı tarafında olabiliyor.
Çevrimdışı çalışma **yok** — API anahtarı olmadan hiçbir örnek çalışmaz.

Tepegöz: `local-inference` seam'i + sha256 doğrulamalı model kataloğu + "basit adımlar cihazda"
maliyet-tasarrufu düğmesi; algı ve seçici çözümü **zaten cihazda** (CDP + a11y ağacı), model çağrısı
opsiyonel ve yönlendirilebilir. Ama çevrimdışı RAG yok, S12 indirilmiş ağırlıklara takılı, sahiplik
tablosu boş. **Kim daha iyi: Tepegöz** — mimari olarak net; ama "yerel model gerçekten iyi çalışıyor
mu" sorusu Tepegöz'de de cevapsız.

### Sır / kimlik bilgisi işleme — Tepegöz kavramsal olarak, ama atıl

AgentQL örnekleri kimlik bilgisini **düz metin sabit** olarak tutuyor (`EMAIL`/`PASSWORD` modül
seviyesinde) ve `response_credentials.sign_in_form.password_input.fill(PASSWORD)` ile dolduruyor. Depo
kendi güvenlik hijyenini ciddiye alıyor — TruffleHog pre-commit + PR taraması, OSV-Scanner, semgrep
ignore'ları, CODEOWNERS'ta `security_team`, `pyproject.toml`'da CVE için taban sürüm pinleri
(`urllib3>=2.7.0`, `pygments>=2.20.0`), `golden-images.yaml` ile digest-sabitli imajlar — ama bunlar
**deponun kendi tedarik zinciri** hijyeni, ürünün çalışma-zamanı güvenlik modeli değil. Sorgu-çözüm
katmanının sırla ne yaptığına dair checkout'ta hiçbir kanıt yok.

Tepegöz: `@tepegoz/credential-vault` (BYO-key, DPAPI/safeStorage) + Credential Broker — **sırrın ajana
ulaşacağı bir şekil yok**; OS-auth kapısı devreye girene dek her dolgu reddediliyor. `EgressFirewall`
(`inspectEgress`, Shannon entropisi) sır/yüksek-entropi blob sızıntısını denetliyor. **Ama Credential
Broker atıl (inert) sevk ediliyor.** **Kim daha iyi:** kavramsal olarak Tepegöz açık ara; **bugün
pratikte** AgentQL kullanıcısı işini yapıyor, Tepegöz kullanıcısı henüz o yolu kullanamıyor.

### Bot-tespiti karşıtı hareket — ilginç bir kesişim

AgentQL bunu **örnek** olarak veriyor, ürün olarak değil: `stealth_mode` (rastgele user-agent,
timezone/geolocation, referer, Accept-Language, proxy yuvası, `--disable-blink-features=AutomationControlled`
gibi launch argümanları, `enable_stealth_mode(nav_user_agent=...)`) ve `humanlike-antibot` (rastgele
fare hareketi, bounding-box merkezine tıklama, `press_sequentially`, rastgele scroll — hepsi ~30
satırlık kullanıcı kodu).

Tepegöz: `@tepegoz/human-input` — Catmull-Rom fare eğrileri + Gaussian jitter; kütüphane olarak, örnek
olarak değil. **Kim daha iyi: Tepegöz** (mekanizma daha ciddi ve tekrar kullanılabilir); ama AgentQL'in
`enable_stealth_mode()` SDK çağrısının arkasında ne olduğunu göremiyoruz — bu satırın kanıt tabanı zayıf.

### MCP — yön farkı

AgentQL README'si bir **MCP sunucusu** olduğunu (Langchain, Zapier entegrasyonlarıyla birlikte)
söylüyor; sunucunun kendisi bu depoda **yok**. Yani başka ajanlar AgentQL'in sorgu yeteneğini araç
olarak çağırabiliyor.

Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP araçları CapabilityRegistry'ye girip **aynı PEP'ten**
geçiyor; `McpSupervisor` reconnect + `MAX_TOOLS_PER_SERVER`, `dangerClassFor` bilinmeyen annotation'ı en
kısıtlı sınıfa düşürüyor. MCP **sunucu** yüzeyi yok (Phase 1b, yapılmamış). **Kim daha iyi:** ters
yönler — AgentQL sevk edilmiş bir sunucu olarak, Tepegöz istemci tarafındaki denetim temizliğinde.
İlginç sonuç: AgentQL, Tepegöz'ün MCP istemcisine bağlanabilecek bir araç; rakip olmaktan çok
tamamlayıcı.

### Türkçe / bölgesel

AgentQL'de bölgeselleştirme **yok** — SDK'nın kullanıcı-yüzü yok, sorgular İngilizce yazılıyor
(`search_product_box`, `submit_btn`), örneklerin tamamı İngilizce siteler (`bestbuy`, `target`,
`yelp`, `gov.uk`, `news.ycombinator`), `stealth_mode` locale havuzu `en-US/en-GB/fr-FR`. Doğal-dil
sorgu Türkçe sayfada çalışır mı — bilinmiyor, ölçülmemiş, iddia edilmemiş.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşıyor
(ADR-0016), `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036). **Kim daha iyi: Tepegöz** — kıyas yok.

### Ölçüm / dürüstlük kültürü

AgentQL bu depoda hiçbir eval, benchmark veya doğruluk metriği yayınlamıyor. "Cross-site
compatibility", "resilience to UI changes", "self-healing" — üçü de **ölçüsüz iddia**. CI yalnız lint,
format, secret ve CVE tarıyor; hiçbir işlevsel test yok.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, ground-truth-önce skorlama, LLM-judge
ikincil), SHA-256'lı donmuş fixture registry'leri, istatistiksel anayasa (Wilson CI, iddia için N≥10),
anti-debt kuralı, `bridgeClaim` 25 insan etiketinin altında `publishable:false`. **Kim daha iyi:
Tepegöz** disiplinde — ama madalyonun öbür yüzü aynı: bu disiplin kısmen yetenek henüz orada olmadığı
için var. Her S-fazı 🟠, hiçbiri ✅ değil.

---

## Örtüşmeyen alanlar

**Yalnızca AgentQL'de var:**

- Bir **sorgu dili** — sözdizimi, iç içe şema, `[]` liste, `(integer)` / `(convert to …)` dönüşüm
  ipuçları. Tepegöz'de dengi yok.
- **REST API** (SDK'sız çağrı), **Chrome debugger eklentisi** (canlı sayfada sorgu deneme),
  **playground** (sorgu optimize + Python export). Geliştirici araç zinciri olgun.
- **Python SDK** ve Playwright ekosistemine doğal giriş — mevcut scraping/test yığınına damlatarak
  eklenebilirlik. Tepegöz bir uygulama; kütüphane olarak tüketilemez.
- **Barındırılan uzak tarayıcı** (`create_browser_session()`, UA preset, sayfa-streaming URL'i) ve
  headless/CI-dostu çalışma. Tepegöz headless çalışmaz; masaüstü tarayıcıdır.
- **Langchain / Zapier / MCP-server entegrasyonları** (README iddiası; kod burada değil).

**Yalnızca Tepegöz'de var:**

- **Ajan döngüsü**: Planner→Executor→Reactor, tipli `Decision`, replan.
- **Model-öncesi deterministik PolicyKernel** (ADR-0006): danger class + taint + hedef site →
  allow/deny/ask + makine-okunur reason code + biyometrik; `isSensitiveSite` her otonomi seviyesinde
  sert deny.
- **Tek kapı ToolGateway PEP** (ADR-0007): lookup → idempotency → zod → policy → HITL → execute →
  audit; built-in/MCP/eklenti araçları ayrımsız.
- **İki-aşamalı HITL** (plan önizleme + araç-başı), her ikisi fail-safe (yanıt yok = deny).
- **Hesap verebilirlik**: bugün elde olan event-sourced journal + `journal_search_events`.
  `@tepegoz/notary` — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız
  `tepegoz-verify` CLI — **yazılmış ve testli, ama `apps/desktop` içinde onu import eden hiçbir yer yok**
  (ADR-0030 kendisi yazıyor): bugün hiçbir run makbuz üretmiyor.
- **Doğrulanmış tamamlama**: `CompletionEvidence` + deterministik düşürme + Checked/Unconfirmed/
  Contradicted rozetleri + `evaluateAssertion` success oracle.
- **Prompt-injection savunması**: `sanitizeText` (zero-width/bidi/homoglyph), `wrapUntrustedContent`,
  `TaintTracker` provenance, `EgressFirewall` + Shannon entropi.
- **Model-free deterministik şerit**: `@tepegoz/macro-engine` (iMacros halefi, kontrol akışı +
  oto-bekleme), `@tepegoz/recipe-compiler` (imzalı replay).
- **Asistan UX**: Agent Console, komut paleti, plan önizleme, kademeli otonomi + risk banner, replay
  timeline, steer, pause/resume, ticaret çift-onay, Human Handoff Controller (CAPTCHA/2FA =
  kullanıcıya devret, çözme).
- **Kayıtlı görevler / tetikleyiciler** (`@tepegoz/tasks`), **çeviri/adblock/typo eklentileri**, tarayıcı
  olmanın getirdiği her şey (sekme modeli, indirme güveni ADR-0040, Safe Browsing ADR-0043).

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — bu tablo yalnızca "kim daha iyi + neden". "K" işaretli satırlarda AgentQL tarafı **kaynaktan
değil README/doküman iddiasından** okunmuştur.

| #   | Boyut                                      | AgentQL                                                                                                                        | Tepegöz                                                                                                                                                                            | Kim daha iyi + neden                                                                                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Ürün formu**                             | Kütüphane + hosted servis; mevcut Playwright yığınına damlar                                                                   | Tam tarayıcı uygulaması; kütüphane olarak tüketilemez                                                                                                                              | **Farklı işler.** Entegrasyon kolaylığında AgentQL, kapsamda Tepegöz                                                                       |
| 2   | **Eleman adresleme ergonomisi**            | NL sorgu (`{ submit_btn }`) + `get_by_prompt()`; seçici yazmıyorsun                                                            | `browser_get_elements` → a11y ref listesi; model ref seçer, seçici yazmaz                                                                                                          | **Bugün AgentQL** (insan geliştirici için belirgin daha rahat). Model için ref indeksi daha güvenli                                        |
| 3   | **Adresleme dayanıklılığı**                | "Self-healing / UI değişimine dirençli" — **K**, mekanizma kapalı, ölçü yok                                                    | Ref'ler snapshot-başı (navigasyonda düşer) + `SelectorChain` başarısızsa kapsamlı healer: model **indeks seçer**, CSS yazmaz                                                       | **İddiada AgentQL, denetlenebilirlikte Tepegöz** — Tepegöz'ün healer'ı halüsinasyon seçiciyi yapısal olarak imkânsız kılıyor ve okunabilir |
| 4   | **Siteler-arası taşınabilirlik**           | Aynı sorgu benzer sitelerde çalışır — **K**                                                                                    | Ref'ler sayfa-başı; sorgu kavramı yok, taşınabilir hedefleme yok                                                                                                                   | **AgentQL** — Tepegöz'de bu fikrin karşılığı yok                                                                                           |
| 5   | **Yapılandırılmış çıkarım**                | `query_data()` + iç içe şema + `(integer)`/`(convert to …)` dönüşümleri + `paginate()`                                         | `browser_analyze_page` (sandbox'ta model-yazımı JS, kopya sayfa, hash'li journal) + `reader` + `get_article`                                                                       | **AgentQL** — şema-güdümlü çıkarım dili ve sayfalama bugün çalışıyor; Tepegöz'ün yolu daha güvenli ama daha kaba                           |
| 6   | **Dinamik sayfa bekleme**                  | `wait_for_page_ready_state()` — tek, temiz çağrı                                                                               | `browser_validate_page` (bekle + görünür-metin doğrulama), macro-engine oto-bekleme                                                                                                | **Berabere** — ikisi de aynı problemi çözüyor, Tepegöz'ünki doğrulama de yapıyor                                                           |
| 7   | **Aksiyon repertuvarı**                    | Aksiyon YOK — Playwright'ın locator'ına devrediyor (`fill/click/select_option`)                                                | ~30 araç: `browser_*`, `tab_*`, `web_*`, `file_*`, `clipboard_*`, `download_*`, `upload_*`, `task_*`                                                                               | **Tepegöz** — AgentQL bu işi üstlenmiyor                                                                                                   |
| 8   | **Araç çağırma disiplini**                 | Kavram yok; kontrolü geliştirici kodu yapar                                                                                    | **Tek PEP**: zod→policy→HITL→execute→audit, istisnasız                                                                                                                             | **Tepegöz** — kıyas yok                                                                                                                    |
| 9   | **Karar / ajan döngüsü**                   | Yok; `if`/`for`'u sen yazarsın                                                                                                 | Planner→Executor→Reactor, tipli kararlar, replan; **tek eşzamanlı run**, checkpoint-resume yok                                                                                     | **Tepegöz** (var olmak vs olmamak). Ama öngörülebilirlikte bugün elle yazılmış script daha güvenilir                                       |
| 10  | **İzin / otonomi modeli**                  | Yok — script ne derse onu yapar                                                                                                | `ask`/`act`/`auto`, danger class, hassas-site sert deny, biyometrik yüksek-risk kapısı                                                                                             | **Tepegöz** — kıyas yok                                                                                                                    |
| 11  | **Prompt-injection savunması**             | Yüzey daha küçük (sayfa ajanı yönlendirmiyor, sorgu sabit) ama sayfa metni satıcı modeline gidiyor; savunma görünmüyor         | `sanitizeText` + `wrapUntrustedContent` + taint + `EgressFirewall`; ASR bataryası **measurement-owed**                                                                             | **Tepegöz mimaride.** AgentQL'in avantajı savunma değil, **maruziyetin dar olması** — bu da meşru bir azaltım                              |
| 12  | **Hesap verebilirlik / denetlenebilirlik** | Yok (script'in kendi logları)                                                                                                  | Bugün: event-sourced journal. Notary hash-zinciri + Ed25519 checkpoint + Replay Receipt + bağımsız `tepegoz-verify` **yazılı ama uygulamaya bağlanmamış** — bugün makbuz üretmiyor | **Tepegöz** — ama yalnız journal payında; kriptografik kanıt bugün iki tarafta da yok, o kısım mimari bahis                                |
| 13  | **Sır / kimlik bilgisi**                   | Örneklerde düz-metin sabit; servis tarafı bilinmiyor                                                                           | Credential Broker (sırrın ajana ulaşacağı şekil yok) + vault — **atıl sevk**                                                                                                       | **Kavramsal Tepegöz**, ama atıl olduğu için **bugün pratikte kimse önde değil**                                                            |
| 14  | **Veri egemenliği**                        | Her sorgu satıcıya gider; `use_remote_browser` tarayıcıyı da satıcıya taşır; çevrimdışı çalışma yok                            | Algı+seçici cihazda; `local` sağlayıcı + sha256 GGUF kataloğu; RAG yok, S12 takılı                                                                                                 | **Tepegöz** — yapısal fark, oturum-açık sayfalarda kritik                                                                                  |
| 15  | **Model seçimi / maliyet şeffaflığı**      | Seçim yok, model kapalı, token görünmüyor; ayrı LLM işi için kullanıcı kendi OpenAI'ını kuruyor                                | 8 sağlayıcı + `local`, tek `Canon*` şeması, `TokenLedger`, zorunlu `maxTokens`/`timeoutMs`                                                                                         | **Tepegöz** — AgentQL'de seçilecek/görülecek bir şey yok                                                                                   |
| 16  | **Kapalılık / doğrulanabilirlik**          | Çekirdek kapalı; MIT olan yalnız örnekler; bu depoda çözümleyici yok                                                           | Tamamı okunabilir, ADR'lerle gerekçelendirilmiş                                                                                                                                    | **Tepegöz** — güvenlik iddiası ancak okunabilirse denetlenebilir                                                                           |
| 17  | **Bot-tespiti karşıtı**                    | `enable_stealth_mode()` + örnek-seviye rastgele fare/scroll/UA/proxy                                                           | `@tepegoz/human-input`: Catmull-Rom eğrileri + Gaussian jitter (kütüphane)                                                                                                         | **Tepegöz** mekanizmada; AgentQL tarafı örnek kodu, ürün yüzeyi kapalı                                                                     |
| 18  | **MCP**                                    | MCP **sunucusu** + Langchain/Zapier — **K**, kod burada değil                                                                  | MCP **istemcisi**; dış araçlar tek PEP altında; sunucu yüzeyi yok                                                                                                                  | **Ters yönler** — AgentQL sevk edilmiş bir yetenek olarak, Tepegöz denetim temizliğinde. Aslında birbirini tamamlıyorlar                   |
| 19  | **Deterministik (model-siz) tekrar**       | Yok — her çağrı servise gider                                                                                                  | `macro-engine` (model-siz yorumlayıcı) + `recipe-compiler` (imzalı replay + success oracle)                                                                                        | **Tepegöz** — çalışma başına maliyeti sıfıra indiren tek yol                                                                               |
| 20  | **Türkçe / bölgesel**                      | Yok; sorgular ve tüm örnekler İngilizce, TR sayfada davranış ölçülmemiş                                                        | Parity-zorunlu EN+TR i18n, TR-web H2H şartı, Phase 11 kamu/e-Devlet                                                                                                                | **Tepegöz** — kıyas yok                                                                                                                    |
| 21  | **Ölçüm / dürüstlük**                      | Sıfır eval; "self-healing"/"cross-site" ölçüsüz iddia. Tedarik-zinciri hijyeni (TruffleHog/OSV/pinler/golden images) ise ciddi | Ground-truth eval harness + istatistiksel anayasa + reddedilebilir iddia + donmuş fixture'lar                                                                                      | **Tepegöz** işlevsel ölçümde; **AgentQL** repo/tedarik-zinciri hijyeninde daha somut                                                       |
| 22  | **"Bugün çalışıyor mu"**                   | Evet — ticari ürün, PyPI/npm, gerçek müşteriler; ama dar bir iş                                                                | Kısmen — iskelet bağlı, S-fazlarının hepsi 🟠, 3 yetenek atıl, tek run                                                                                                             | **Kendi kapsamında AgentQL** — dar ama sevk edilmiş                                                                                        |

---

## Sonuç

**Bugün, "çalışıyor mu" ekseninde AgentQL kendi dar kapsamında kazanıyor.** Bir elemanı doğal dille
adreslemek, bir listeyi şemaya göre çekmek, sayfalamak — bunlar ticari kalitede, PyPI/npm'den kurulur
ve Playwright bilen bir geliştirici için beş dakikada iş görür. Tepegöz'ün bu dilimde eşdeğer bir
ergonomisi yok: `browser_get_elements` + `browser_analyze_page` ikilisi aynı işi yapabilir ama şema
dili, dönüşüm ipuçları ve sayfalama yardımcıları yok, üstelik S-fazları henüz ölçülmemiş. Bu depodan
alınacak en dürüst ders de bu: **sorgu-şekilli çıkarım arayüzü iyi bir fikirdir** ve Tepegöz'ün
`browser_analyze_page`'inin üstüne oturtulabilir.

**Mimari ve bahis ekseninde karşılaştırma neredeyse tek taraflı — ama bunun sebebi Tepegöz'ün daha iyi
olması değil, AgentQL'in başka bir iş yapıyor olması.** AgentQL karar vermez, izin sormaz, kanıt
üretmez, sırrı korumaz; bunlar onun sözü değil. Örtüşen yerlerde ise Tepegöz'ün duruşu somut olarak
daha savunulabilir: hedefleme modelin yazamayacağı bir uzayda tutulur, seçici iyileşmesi tek bir
kapsamlı çağrıdır ve modelin CSS yazmasına izin vermez, sayfa metni modele girmeden sanitize edilir,
sorgu çözümü **cihazda** olur (AgentQL'de her çağrı satıcının sunucusuna gider — `use_remote_browser`
ile oturum-açık tarayıcının kendisi bile), model ve maliyet görünürdür, Türkçe birinci sınıftır.
AgentQL'in karşı-argümanı meşru: maruziyeti dar, çünkü sayfayı ajanı yönlendirmek için değil, yalnız
bir eleman bulmak için okuyor.

**Dürüst özet:** AgentQL, Tepegöz'ün bir alt sisteminin bir parçasını bugün daha rahat kullanılır
biçimde yapıyor; Tepegöz o parçanın etrafındaki her şeyi (döngü, politika, onay, kanıt, egemenlik)
yapmayı tasarlamış ve **henüz kanıtlamamış** — S-fazlarının tamamı 🟠, vision/credential-broker/memory
atıl sevk ediliyor, aynı anda tek run çalışıyor, site adaptörü yok. Bir scraping/otomasyon script'i
yazacaksan ve verinin satıcıya gitmesi sorun değilse → AgentQL. Kullanıcı adına oturum-açık bir sayfada
iş yapan, ne yaptığının kriptografik kanıtı olan, verisi cihazda kalan, Türkçe bir ajan istiyorsan → o
Tepegöz'ün oyunu, hâlâ tezgâhta. İkisi rakip değil: AgentQL, Tepegöz'ün MCP istemcisine bağlanabilecek
bir araçtır.
