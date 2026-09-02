# Tepegöz vs Steel — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Steel** (açık kaynak, Apache-2.0 lisanslı,
> `steel-browser` deposu — "AI ajanları ve uygulamaları için açık kaynak tarayıcı API'si";
> `v0.5.x` / public beta, ayrıca `app.steel.dev` üzerinde ticari **Steel Cloud** barındırması)
> arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/steel-browser` deposunun (`README.md`, `CONTRIBUTING.md`,
> `docs/ARCHITECTURE.md`, `docs/PLUGIN_DEVELOPMENT.md`, `docs/README.md`, `package.json` +
> workspace ağacı `api/` · `ui/` · `repl/`, `api/src/modules/{actions,sessions,cdp,files,selenium,logs}`,
> `api/src/services/cdp/cdp.service.ts` + `instrumentation/**`, `api/src/services/session.service.ts`,
> `api/src/services/file.service.ts`, `api/src/plugins/**`, `api/src/utils/{proxy,requests,scrape}/**`,
> `api/src/scripts/index.ts` (fingerprint), `api/extensions/recorder/**` (rrweb kaydı),
> `api/src/utils/scrape/__tests__/**` (markdown regresyon + Tier-1 invariant harness),
> `api/src/env.ts`) ve bu reponun AI yüzeyinin (`phases/ai-agent/`,
> `packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|tool-executor|local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|
credential-vault|human-input`, `extensions/ext-agent`, `docs/adr/*`) aynı oturumda okunmasından
> çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje
> eserleri İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili.** Kardeş belge: [`docs/others/tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md).
> Bir "Steel'in yaptığını Tepegöz de yapsın" track'i (`phases/tracks/steel-browser-agent-parity.md`)
> henüz yok; `prompts/rival-agent-parity-track.md` bu belgeyi girdi olarak alıp üretebilir.
>
> **Kategori uyarısı.** Bunlar **farklı ürün kategorileri ve bu belgedeki en asimetrik kıyas**.
> Steel bir _tarayıcı-oturum altyapısı_ / _AI ajanları için tarayıcı API'si_: Chrome'u
> Puppeteer + CDP ile yönetir; oturum, sayfa ve tarayıcı süreçlerini soyutlar; `/scrape`
> `/screenshot` `/pdf` `/search` gibi hızlı-aksiyon HTTP uç noktaları sunar; proxy rotasyonu,
> parmak-izi enjeksiyonu, eklenti yükleme, oturum kaydı (rrweb) ve canlı görüntüleyici sağlar.
> **Steel'in kendi LLM'i, kendi ajan döngüsü, sağlayıcı soyutlaması, araç/izin modeli, prompt
> mimarisi, context yönetimi ya da prompt-injection savunması YOKTUR** — bunların hepsi Steel'i
> _süren ayrı bir ajanın_ işidir. Tepegöz ise _tam bir tarayıcı + güvenlik-önce bir ajan_:
> sayfayı okur, tıklar/yazar, form gönderir, model-öncesi deterministik bir Policy Kernel'den
> geçer, tamamlamayı kanıta atıfla imzalar. Bu belge önce bu asimetriyi söyler, sonra yalnızca
> **örtüşen eksenlerde** (tarayıcı yaşam döngüsü & oturum modeli, algı/scrape yüzeyi, anti-bot /
> parmak izi / insan-benzeri etkileşim, egress & proxy kontrolü, egemenlik / self-host, ölçüm
> kültürü) iş-iş kıyaslar. Ajan döngüsü, sağlayıcılar, Policy Kernel, HITL, hesap verebilirlik
> gibi her şey Tepegöz'e özgüdür ve "Örtüşmeyen alanlar" başlığında ayrılır.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | Steel                                                                                                                                                                                                | Tepegöz                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Fastify **API sunucusu** + React UI + REPL; Chrome'u Puppeteer/CDP ile saran, oturum/proxy/parmak-izi yöneten **tarayıcı altyapısı**. Docker/Railway/Render ile self-host, ayrıca hosted Steel Cloud | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — `v0.5.4-beta`, GHCR Docker imajı, Steel Cloud canlı, `steel-sdk` (Node + Python), cookbook, Discord; kendi ifadesiyle "public beta and evolving every day"                             | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | TypeScript, npm workspaces (`api`/`ui`/`repl`), Fastify + Puppeteer-core + zod; eklenti-tabanlı CDP plugin mimarisi; Node ≥ 22                                                                       | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her sınırda                                                  |
| Felsefe     | "Otomasyon altyapısını sıfırdan kurma — sen AI uygulamana odaklan, karmaşıklığı Steel halletsin"; altyapı-önce, entegrasyon-önce, açık kaynak + hosted ikili model                                   | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Bir ajanın/uygulamanın süreceği **canlı tarayıcı oturumları** sunmak: CDP uç noktası, oturum durumu (çerez/localStorage), proxy, parmak izi, dosya, scrape/screenshot/pdf, canlı izleyici            | Web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu — **ajanın kendisi**                   |

Yani: **olgun, yayında, "ajanın altındaki tarayıcı katmanı" olan bir altyapı** vs. **erken,
mimari ağırlıklı, güvenlik-önce bir tarayıcı ajanı**. Steel bir ajanın _bileşeni_ olabilecek şeyi
yapar; Tepegöz _ajandır_ (ve ayrıca tarayıcıdır). İkisi de "Chrome + CDP + oturum + proxy + parmak
izi" iskeletini paylaşır; işleri farklıdır. Aşağıda "kim daha iyi" yalnızca bu paylaşılan alt-eksenlerde
anlamlıdır.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Tarayıcı yaşam döngüsü & oturum modeli — Steel bu iş için tasarlanmış

Steel: `CDPService` (EventEmitter) tarayıcı ömrünü (launch/shutdown/refresh), sayfa oluşturmayı,
CDP WebSocket proxy'sini ve plugin koordinasyonunu yönetir. `SessionService` **izole tarayıcı
context'leri** kurar (çerez/localStorage/sessionStorage ayrımı), oturum başına proxy, `extensions`,
`skipFingerprintInjection`, `timezone`, `dimensions`, `userAgent`, `blockAds`, `optimizeBandwidth`
(proxy seviyesinde görsel/medya/stylesheet/host/pattern bloklama), `persist`/`userDataDir`,
`deviceConfig` (desktop/mobile), `userPreferences` (Chrome tercihleri). `/v1/sessions` create/list/
get/release; `BasePlugin` yaşam döngüsü kancaları (`onBrowserLaunch`/`onPageCreated`/`onPageNavigate`/
`onPageUnload`/`onBeforePageClose`/`onBrowserClose`/`onShutdown`), `PluginManager` hata izolasyonuyla.
Puppeteer, Playwright veya **Selenium** (drop-in WebDriver uyumluluğu, `isSelenium`) dönen CDP
URL'sine bağlanır. Eşzamanlı çok oturum, otomatik temizlik, canlı görüntüleyici iframe
(`/v1/sessions/debug`, `showControls`/`theme`/`interactive`) ve `live-details` (pages/tabs/browserState).

Tepegöz: kendi **sekme/pencere modeli**, out-of-process CDP, tek güvenli `createWindow()` fabrikası,
typed `contextBridge`; ajan `tab_*` araçları (`create`/`list`/`get`/`update`/`delete`/`spawn`/
`egress_blocked`). Ama bu **tek kullanıcının tarayıcısı**: sekme-grubu-başı bir ajan oturumu,
aynı anda **tek çalışma** (ADR-0013); dışarıdan tüketilecek bir oturum-fabrikası API'si, üçüncü-taraf
CDP plugin sistemi, Selenium uyumluluğu yok.

Örtüşen eksende **Steel net önde**: dışarıdan sürülen, çok-oturumlu, proxy/parmak-izi/eklenti
parametreli efemer tarayıcı oturumları tam olarak Steel'in varlık sebebi. Tepegöz'ün oturum modeli
bir son-kullanıcı ürününün içinde, tek kişilik ve tek-run.

### Algı yüzeyi: scrape / screenshot / okunabilirlik — farklı amaçlar, Steel içerik-çıkarımında olgun

Steel: `/v1/scrape` bir sayfayı **`html` / `cleaned_html` / `markdown` / `readability`** formatlarına
çevirir (readability + markdown `defuddle` ile; `cleanHtml` kendi temizleyicisi; JSON yanıtları
` ```json ` bloğuna; PDF'ler `mupdf` ile HTML'e), `screenshot`+`pdf` ekleyebilir, `removeBase64Images`.
`/v1/screenshot` (`fullPage`, jpeg q100), `/v1/pdf` (`page.pdf()`), `/v1/search` (Brave arama sonucu
kazıma). Metadata çıkarımı zengin (title/lang/og:_/article:_/canonical/favicon/JSON-LD/wordCount).
Amaç: **tüketen ajana temiz, iyi biçimli context metni** vermek.

Tepegöz: **DOM/a11y-önce algı** (ADR-0008) — kimlik-kararlı ref'ler + diff/dedupe/elision (token
kesmek için), `aria-labelledby`/`label[for]` çözümü, `browser_get_article` (reader çıkarımı, HTML'siz
tipli bloklar), `browser_get_elements` (etkileşilebilir hedefler + locator'lar). `@tepegoz/tool-executor`
gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini temizler ve `wrapUntrustedContent` ile sarar.
Vision yalnızca eskalasyon (ADR-0008) — ve bugün **atıl, çünkü hiç bağlanmamış**: Reactor'ın
`captureVision` geri-çağrısı opsiyonel ve üretimde onu geçen bir çağıran yok. Amaç: **modelin
kendi tool-call'ları için etkileşimli, zeminlenmiş bir erişilebilirlik ağacı**.

Örtüşme kısmi: Steel'in `/scrape` markdown/readability hattı **içerik-çıkarımı için daha olgun ve
daha test edilmiş** (aşağıya bkz. ölçüm), ama etkileşimli element ref'i / tıklama hedefi üretmez.
Tepegöz'ün algısı etkileşim (tıkla/yaz) için kurulmuş, tipli ve token-agresif ama ölçülmemiş; okuma
tarafında Steel kadar cilalı bir "sayfa → markdown" çıktısı yok. **Kim daha iyi:** salt okuma/çıkarım
için Steel; ajan-etkileşimi zeminlemesi için Tepegöz.

### Anti-bot / parmak izi / insan-benzeri etkileşim — farklı katman, ikisi de kanıtsız

Steel: `fingerprint-generator` + `fingerprint-injector` (`2.1.82`) ile **ortam parmak izi enjeksiyonu**
— `loadFingerprintScript` WebGL vendor/renderer, `hardwareConcurrency`, `deviceMemory`, `platform`,
UA-CH `brands`/architecture/bitness/platformVersion değerlerini sabitler; `skipFingerprintInjection`
opsiyonu; `SKIP_FINGERPRINT_INJECTION` env. rrweb kaydedici uzantısı ayrıca **WebRTC'yi devre dışı
bırakır** (IP sızıntısı önleme; `meet.google.com`/`zoom.us`/`discord.com` hariç). README "stealth
plugins" diyor; bu sürümde asıl mekanizma fingerprint-injector. `installMouseHelper` yalnızca
hata-ayıklama için fare işaretçisi görselleştiricisi — **insan-benzeri hareket üretimi değil**.
CAPTCHA çözme (`solveCaptcha`) yalnızca hosted Steel Cloud'da.

Tepegöz: `@tepegoz/human-input` — **Catmull-Rom fare eğrileri + Gaussian jitter** (girdi-dinamiği
gerçekçiliği, bot-tespiti karşıtı hareket profili). Parmak-izi spoofing tarafında Steel'inkine denk
bir jeneratör/enjektör yok; hassas-site kilidi ve CAPTCHA'da duruş "çözme değil, insana devir"
(`detectHandoff`, ADR-0039 broker).

Farklı eksenler: Steel = **ortam/parmak-izi maskeleme**; Tepegöz = **girdi-dinamiği gerçekçiliği**.
Steel'in parmak-izi yüzeyi bugün daha geniş ve sevk edilmiş; Tepegöz'ün fare-eğrisi mekanizması
tamamlayıcı ama tek başına yeterli değil. **Kim daha iyi:** parmak-izi/ortam maskeleme Steel;
hareket profili Tepegöz — ikisinin de yayımlanmış tespit-kaçınma ölçümü yok.

### Egress & proxy kontrolü — Steel rotasyon altyapısı, Tepegöz sızıntı savunması

Steel: `proxy-chain` tabanlı **oturum-başına proxy sunucusu** — IP rotasyonu, `txBytes`/`rxBytes`
muhasebesi, internal-bypass (localhost passthrough), SOCKS/HTTPS agent'ları, `PROXY_INTERNAL_BYPASS`.
`optimizeBandwidth` proxy seviyesinde görsel/medya/stylesheet bloklar. Amaç **IP rotasyonu +
bant genişliği** — çıkış içeriğini denetleyen bir katman **yok**. (İnce bir egemenlik detayı: scrape
testleri `defuddle`'ın kendi ağ isteği yapmadığını invariant olarak tutuyor, "böylece çıkarım oturum
proxy'sini atlamıyor / sunucu IP'sini sızdırmıyor".)

Tepegöz: `EgressFirewall` (`inspectEgress`, **Shannon entropisi** ile sır / yüksek-entropi blob
sızıntı denetimi), `tab_egress_blocked` aracı, SSRF-güvenli sitemap reader, `TaintTracker` provenance.
Amaç **veri-kaçağı önleme / exfiltration savunması**. IP rotasyonu için Steel'inki gibi bir proxy-havuz
altyapısı yok.

Farklı hedefler: **IP rotasyonu ve bant-genişliği yönetiminde Steel önde** (bunun için yapılmış);
**çıkış-sızıntı / exfiltration denetiminde Tepegöz önde** (Steel'de hiç yok).

### Egemenlik / self-host — ikisi de güçlü, farklı biçimlerde

Steel: **Apache-2.0**, tek Docker imajıyla self-host (`docker run ghcr.io/steel-dev/steel-browser`),
telemetri varsayılan **noop** (`@opentelemetry/api` opsiyonel peer, `telemetry/noop.ts`), Pino
loglama, DuckDB veya in-memory log deposu seçilebilir. `steel-sdk` `baseURL`/`base_url` ile self-host
instance'a yönlendirilir. Karşı taraf: **Steel Cloud** ticari bir barındırma katmanı (krediler, CAPTCHA
çözme, oturum görüntüleyici) — repodaki bazı alanlar (`credentials.autoSubmit`, `logSinkUrl`,
`creditsUsed`, `solveCaptcha`) "hosted steel'e özgü" olarak işaretli.

Tepegöz: **local-first native uygulama**, `@tepegoz/local-inference` seam'i (node-llama-cpp),
`@tepegoz/model-catalog` (sha256'lı GGUF, resumable indirme), BYO-key kasası (DPAPI/safeStorage),
"ağırlıkları repoya koyma yok". Bulut katmanı **yok**.

İkisi de gerçekten self-host edilebilir ve varsayılan-telemetri-yok. Steel **çalıştırdığın bir sunucu
altyapısı**; Tepegöz **çalıştırdığın bir masaüstü uygulaması**. Steel Cloud bir upsell; Tepegöz'ün
karşılığı yok. **Kim daha iyi:** kabaca berabere — Steel dağıtım kolaylığında (tek imaj, 1-tık deploy),
Tepegöz "hiç bulut yok, cihazda çıkarım seam'i" saflığında.

### Araç & izin / otonomi modeli — Steel'de yok (çağıran sahiplenir)

Steel: `/scrape` `/screenshot` `/pdf` **HTTP uç noktalarıdır**, model tool-call'ları değil. Girdi
doğrulaması zod şemalarıyla yapılır (mimari doküman bunu vurgular), dosya tipi/boyut limitleri, CSP
başlıkları var. Ama **izin / onay / otonomi / HITL kavramı yoktur** — Steel'i süren ajan neyi ne zaman
yapacağına tümüyle kendi karar verir; Steel sadece komutu yürütür. Bu bir kusur değil, kategori
tanımı: güvenlik sınırı tüketicinin sorumluluğunda.

Tepegöz: **tek kapı — `ToolGateway` PEP** (`capability-plane`): `lookup → idempotency → zod →
PolicyKernel → HITL → execute → audit`. Built-in/MCP/extension aracı ayrımsız aynı hattan. Karar
**model-öncesi deterministik `PolicyKernel`** (ADR-0006): danger class (`read`/`state_changing`/
`destructive`/`financial`) + taint + hedef site → `allow`/`deny`/`ask` + makine-okunur reason code +
biyometrik. `isSensitiveSite` her otonomi seviyesinde sert `deny`. İki-aşamalı HITL (plan önizleme +
araç-başı), her ikisi fail-safe.

Bu eksen **örtüşmüyor denecek kadar tek taraflı**: Steel tasarımı gereği bu katmanı taşımaz; Tepegöz'ün
ayırt edici mimarisi tam olarak budur.

### Ölçüm / dürüstlük kültürü — ikisinde de var, farklı şeyi ölçüyor

Steel: `api/src/utils/scrape/__tests__/` — **scrape → markdown regresyon paketi**: donmuş HTML
fixture'ları (article/wikipedia/arxiv/sec/synthetic/fallback/api.json), property assertion'ları,
"sessiz kalite regresyonu (özellikle kötü bir `defuddle` sürüm bump'ı) CI'ı düşürür". Ayrı bir
**Tier-1 label-free invariant harness** (`eval/invariants.ts`): script/style sızıntısı, çözülmemiş
relative link, contentful sayfada boş çıktı, **sır sızıntısı**, dengesiz kod-fence, aşırı-büyük çıktı —
`error` = CI kapısı, `warn` = sinyal. Ayrıca yavaş, elle koşulan LLM-judge benchmark'ı (Steel vs
Firecrawl/Jina). Bu ciddi bir disiplin — ama **scrape kalitesini** ölçüyor, ajan yeteneğini değil
(Steel'in ajanı yok).

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı
iddiası **reddedilebilir** (`bridgeClaim` 25 insan etiketinin altında `publishable:false`), ön-kayıtlı
H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var — her
S-fazı 🟠, hiçbiri ✅ değil.

Örtüşen eksende ikisi de sağlam mühendislik ölçümü yapıyor; **kapsam farklı**: Steel bir çıkarım
hattının kalite regresyonunu, Tepegöz bir ajanın uçtan-uca yeteneğini hedefliyor. "Kim daha iyi"
doğrudan kıyaslanamaz; Steel bugün ölçtüğü şeyi (scrape) yayımlanabilir biçimde ölçüyor, Tepegöz
ölçmeyi _hedeflediği_ şeyi henüz ölçmedi.

---

## Örtüşmeyen alanlar

**Yalnızca Steel'de var (Tepegöz'de karşılığı yok):**

- Dışarıdan tüketilen **oturum-fabrikası API'si**: `/v1/sessions` + dönen CDP WebSocket URL'sine
  **Puppeteer / Playwright / Selenium** bağlama; drop-in **Selenium WebDriver** uyumluluğu.
- **Hızlı-aksiyon HTTP uç noktaları**: `/scrape` (html/cleaned_html/markdown/readability, `defuddle`),
  `/screenshot`, `/pdf` (`mupdf` PDF→HTML dahil), `/search` (Brave kazıma).
- **CDP plugin sistemi**: `BasePlugin` yaşam döngüsü kancaları + `PluginManager` hata izolasyonu;
  üçüncü-taraf plugin dağıtımı (`@steel-browser/api/cdp-plugin`).
- **Oturum kaydı**: rrweb tabanlı kaydedici uzantı (`@rrweb/packer` ile paketlenmiş DOM olayları,
  `POST /events`) + canlı görüntüleyici/debugger iframe (embed edilebilir).
- **Oturum-başına proxy rotasyonu** + `txBytes`/`rxBytes` muhasebesi + `optimizeBandwidth`
  (proxy seviyesinde görsel/medya/CSS bloklama).
- **Parmak-izi jeneratörü/enjektörü** (`fingerprint-generator`/`fingerprint-injector`) — WebGL/UA-CH/
  hardware maskeleme; WebRTC devre dışı bırakma.
- **HTTP dosya API'si**: `/v1/sessions/:id/files` upload (binary veya URL'den indirme)/download/list/
  delete/`files.zip` arşivi, oturum-scoped.
- **SDK'lar** (`steel-sdk` Node + Python) + 1-tık bulut deploy (Railway/Render/GHCR) + ticari
  **Steel Cloud** (krediler, CAPTCHA çözme, barındırma).

**Yalnızca Tepegöz'de var (Steel'de karşılığı yok — çünkü Steel bir ajan değil):**

- **Ajan döngüsü**: Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor (tipli
  `Decision`: continue/retry/replan/stop), completion-evidence, navigation-grounding, cache-window.
- **Sağlayıcı katmanı**: 8 sağlayıcı (anthropic/openai/gemini/kimi/nova/deepseek/xai/groq) + `local`;
  tek `CanonRequest`/`CanonResponse` şeması, `ModelRouter` (capability→tier), `TokenLedger`, her çağrıda
  zorunlu `maxTokens`+`timeoutMs`, GBNF JSON gramer zorlaması.
- **Model-öncesi deterministik Policy Kernel** (ADR-0006) + hassas-site kategorik sert deny + biyometrik
  yüksek-risk kapısı + iki-aşamalı **HITL** + kademeli otonomi (`ask`/`act`/`auto`).
- **Tek `ToolGateway` PEP** (built-in/MCP/extension ayrımsız `lookup→zod→policy→HITL→execute→audit`).
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance +
  `detectHandoff` (CAPTCHA/2FA → insana devir, çözme değil).
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme +
  tuzak fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **Notary** (Phase 7): hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** +
  bağımsız `tepegoz-verify` CLI — paket yazılı ve testli, ama `apps/desktop`'a **bağlanmamış**; bugün
  hiçbir çalışma receipt üretmiyor (ADR-0030 bunu kaydediyor).
- **MCP istemcisi** (ADR-0018) — dış araçlar aynı PEP'ten geçer.
- **Model-free deterministik şerit**: `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı replay
  - `evaluateAssertion` success oracle); `@tepegoz/human-input` insan-benzeri fare eğrileri.
- **Ajan belleği** (ADR-0027: advisory/tainted/re-validated, karantina), **skill kütüphanesi** (prompt
  şablonları), `@tepegoz/tasks` (kayıtlı görev tetikleyicileri).
- **Asistan UX**: Agent Console, plan önizleme, replay timeline, kanıt rozetleri, çalışırken steer,
  ticaret çift-onay, scope grant, Human Handoff Controller.
- **Türkçe/kamu derinliği**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H görev şartı,
  Phase 11 e-Devlet/KVKK güven modeli, Türk şirket.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                                    | Steel                                                                                                                | Tepegöz                                                                                                                                                                                                                          | Kim daha iyi + neden                                                                                                                                             |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi / birincil iş**                        | AI ajanları için tarayıcı-oturum altyapısı / API                                                                     | Web'de görev yürüten güvenlik-önce tarayıcı ajanı                                                                                                                                                                                | **Örtüşmüyor** — Steel bir ajanın _bileşeni_, Tepegöz _ajanın kendisi_; "kim iyi" ancak alt-eksenlerde                                                           |
| 2   | **Dağıtım / form**                                       | Docker imajı + SDK; mevcut ajan yığınına REST/CDP ile takılır, 1-tık bulut deploy                                    | Tam Electron tarayıcı; kurulum + tarayıcı değişimi gerek, henüz yayında değil                                                                                                                                                    | **Bugün Steel** (erişim + olgunluk + entegrasyon kolaylığı). Farklı yeri hedefliyorlar                                                                           |
| 3   | **Çok-oturumlu tarayıcı yaşam döngüsü**                  | `SessionService` + izole context + oturum-başına proxy/parmak-izi/eklenti + eşzamanlı çok oturum + otomatik temizlik | Kendi sekme/pencere modeli + tek `createWindow` fabrikası; tek kullanıcı, **tek eşzamanlı ajan run**                                                                                                                             | **Steel** — dışarıdan sürülen efemer çok-oturum tam olarak varlık sebebi                                                                                         |
| 4   | **CDP erişimi / otomasyon istemcisi uyumu**              | Puppeteer + Playwright + **Selenium** (drop-in WebDriver) dönen CDP URL'sine bağlanır                                | Out-of-process CDP ama dahili; dış istemci bağlama yüzeyi yok                                                                                                                                                                    | **Steel** — açık; herhangi bir otomasyon istemcisiyle çalışır                                                                                                    |
| 5   | **Plugin / genişletilebilirlik**                         | `BasePlugin` yaşam döngüsü kancaları + `PluginManager` hata izolasyonu + üçüncü-taraf plugin dağıtımı                | `extensions/*` (ext-agent, ext-translate, ext-adblock…) + MCP istemcisi; CDP-plugin SDK'sı yok                                                                                                                                   | **Steel** — dokümante, üçüncü-taraf CDP plugin ekosistemi hedefli                                                                                                |
| 6   | **Scrape / içerik çıkarımı (html→markdown/readability)** | `/scrape` 4 format, `defuddle` + `cleanHtml` + JSON→md + `mupdf` PDF→HTML; zengin metadata                           | `browser_get_article` (reader, tipli bloklar) + DOM diff/elision; "sayfa→markdown" cilalı çıktısı yok                                                                                                                            | **Steel** — salt okuma/çıkarımda daha olgun ve daha test edilmiş                                                                                                 |
| 7   | **Etkileşimli algı (tıklama hedefi / element ref)**      | Yok — `/scrape` etkileşilebilir ref üretmez; tıklama/yazma Steel'i süren ajanın işi                                  | DOM/a11y-önce, kimlik-kararlı ref'ler + locator cascade + `aria-labelledby`/`label[for]` çözümü                                                                                                                                  | **Tepegöz** — etkileşim zeminlemesi için kurulmuş (ölçüm borçlu)                                                                                                 |
| 8   | **Screenshot / PDF**                                     | `/screenshot` (`fullPage`, jpeg q100) + `/pdf` (`page.pdf()`) uç noktaları                                           | `browser_get_screenshot` + download; vision yalnız eskalasyon (atıl)                                                                                                                                                             | **Berabere** — ikisi de temel yeteneği veriyor; Steel HTTP uç noktası olarak daha erişilebilir                                                                   |
| 9   | **Parmak izi / ortam maskeleme**                         | `fingerprint-generator`/`injector` (WebGL/UA-CH/hardware) + WebRTC devre dışı + `skipFingerprintInjection`           | Denk bir jeneratör/enjektör yok                                                                                                                                                                                                  | **Steel** — sevk edilmiş, parametreli parmak-izi yüzeyi                                                                                                          |
| 10  | **İnsan-benzeri girdi dinamiği**                         | Yok (`installMouseHelper` sadece debug görselleştirici)                                                              | `@tepegoz/human-input` Catmull-Rom fare eğrileri + Gaussian jitter                                                                                                                                                               | **Tepegöz** — hareket profili tarafında tek yapan                                                                                                                |
| 11  | **Tespit-kaçınma kanıtı (bugün)**                        | Yayımlanmış tespit-atlatma ölçümü yok                                                                                | Yayımlanmış tespit-atlatma ölçümü yok                                                                                                                                                                                            | **Berabere-zayıf** — ikisinin de sayısı yok                                                                                                                      |
| 12  | **Egress / proxy — IP rotasyonu & bant genişliği**       | `proxy-chain` oturum-başına proxy + tx/rx muhasebesi + `optimizeBandwidth` bloklama                                  | IP-rotasyon proxy havuzu yok                                                                                                                                                                                                     | **Steel** — bunun için yapılmış altyapı                                                                                                                          |
| 13  | **Egress — çıkış-sızıntı / exfiltration denetimi**       | Yok — proxy içerik denetlemiyor                                                                                      | `EgressFirewall` (Shannon entropi, sır/blob sızıntı) + `TaintTracker` + SSRF-güvenli reader                                                                                                                                      | **Tepegöz** — belirgin mimari fark; Steel'de hiç yok                                                                                                             |
| 14  | **Ad / kaynak bloklama**                                 | `blockAds` (host blocklist, request interception) + `optimizeBandwidth`                                              | `ext-adblock` + içerik guard                                                                                                                                                                                                     | **Berabere** — ikisi de var; Steel oturum-parametresi olarak daha entegre                                                                                        |
| 15  | **Oturum kaydı / tekrar-izleme**                         | rrweb kaydedici uzantı + `@rrweb/packer` + canlı görüntüleyici iframe                                                | Replay timeline (ajan adımları) + `journal_search_events`; DOM-seviyesi rrweb kaydı yok                                                                                                                                          | **Farklı** — Steel DOM-olay kaydında (embed edilebilir izleyici), Tepegöz ajan-adımı replay'inde; imzalı receipt tarafı ise henüz bağlanmadı                     |
| 16  | **Dosya işleme**                                         | HTTP dosya API'si: upload (binary/URL)/download/list/delete/zip, oturum-scoped, 100MB/oturum                         | `file_*` tam sandbox'lı dosya sistemi (ajan sandbox'ı) + `download_*`/`upload_*`                                                                                                                                                 | **Farklı amaç** — Steel dış istemci için HTTP dosya deposu; Tepegöz ajanın çalışma alanı                                                                         |
| 17  | **Araç / izin / onay / otonomi modeli**                  | Yok — güvenlik sınırı Steel'i süren tüketicinin sorumluluğunda (zod girdi doğrulama + CSP + limitler var)            | Tek `ToolGateway` PEP + model-öncesi deterministik `PolicyKernel` + iki-aşama HITL + kademeli otonomi + biyometrik                                                                                                               | **Tepegöz** — kategori tanımı gereği; Steel bu katmanı taşımıyor                                                                                                 |
| 18  | **Sağlayıcı / model desteği**                            | Yok — LLM yok                                                                                                        | 8 sağlayıcı + `local`, tek `Canon*` şema, router, `TokenLedger`, GBNF JSON zorlaması                                                                                                                                             | **Tepegöz** — Steel'in bu ekseni yok                                                                                                                             |
| 19  | **Ajan döngüsü / orkestrasyon**                          | Yok                                                                                                                  | Planner→Executor→Reactor (tipli `Decision`) + 2-aşama HITL; **tek eşzamanlı run**, checkpoint-resume yok                                                                                                                         | **Tepegöz** — Steel'in bu ekseni yok (ama Tepegöz'ünki de henüz kanıtsız)                                                                                        |
| 20  | **Prompt-injection / güvenilmez içerik savunması**       | Yok — Steel'i süren ajanın işi                                                                                       | Pre-model kernel + `tool-executor` homoglyph/bidi/zero-width sanitizer + `wrapUntrustedContent` + `EgressFirewall` + taint                                                                                                       | **Tepegöz** — Steel'in bu ekseni yok; ama claim-grade ASR bataryası measurement-owed                                                                             |
| 21  | **Hesap verebilirlik / denetlenebilirlik**               | OpenTelemetry (varsayılan noop) + Pino log + DuckDB/in-memory log deposu + rrweb kaydı                               | Sevk edilmiş: event-sourced journal. **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify`) yazılı/testli ama `apps/desktop`'a **bağlanmamış** — bugün receipt üretmiyor | **Mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir tasarım; Steel'de eşi yok. **Bugün Steel** — sevk edilmiş, gerçekten kayıt üreten taraf o |
| 22  | **Egemenlik / self-host**                                | Apache-2.0, tek Docker imajı, telemetri varsayılan noop; karşı tarafta ticari Steel Cloud (upsell)                   | Local-first native uygulama + `local-inference` seam + BYO-key kasa; bulut yok                                                                                                                                                   | **Berabere** — Steel dağıtım kolaylığında, Tepegöz "hiç bulut yok" saflığında                                                                                    |
| 23  | **Ölçüm / dürüstlük kültürü**                            | Scrape→markdown regresyon paketi + Tier-1 label-free invariant harness + elle LLM-judge benchmark (scrape kalitesi)  | `agent-eval` ground-truth harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia (ajan yeteneği)                                                                                                                     | **Kapsam farklı** — Steel bugün ölçtüğü şeyi (scrape) yayımlanabilir ölçüyor; Tepegöz hedeflediği şeyi (ajan) henüz ölçmedi                                      |
| 24  | **Türkçe / bölgesel derinlik**                           | Yok (altyapı; UI İngilizce)                                                                                          | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli, Türk şirket                                                                                                                              | **Tepegöz** — taahhüt derinliği                                                                                                                                  |
| 25  | **"Bugün çalışıyor mu"**                                 | Evet — `v0.5.4-beta`, Docker imajı + SDK + Steel Cloud, gerçek kullanıcılar                                          | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run                                                                                                                                                  | **Steel** kendi kategorisinde kesin; **Tepegöz** ajan olarak henüz değil                                                                                         |

---

## Sonuç

**Bunlar farklı kategoriler ve bu belgedeki en asimetrik kıyas.** Steel bir _ajan değildir_: LLM'i,
ajan döngüsü, sağlayıcı katmanı, izin/otonomi modeli, prompt mimarisi, context yönetimi ya da
prompt-injection savunması yoktur. Steel, bir ajanın _altında_ duran tarayıcı-oturum katmanıdır —
Chrome'u Puppeteer/CDP ile yönetir, oturum/proxy/parmak-izi/eklenti/dosya soyutlar, `/scrape`
`/screenshot` `/pdf` uç noktaları ve canlı görüntüleyici sunar. "Hangisi daha iyi bir ajan" sorusu
Steel için tanımsızdır.

**Örtüşen altyapı eksenlerinde (çok-oturumlu tarayıcı yaşam döngüsü, CDP/Selenium istemci uyumu,
plugin sistemi, scrape/okunabilirlik çıkarımı, parmak-izi maskeleme, IP-rotasyon proxy'si, oturum
kaydı, HTTP dosya API'si, dağıtım kolaylığı) bugün Steel önde** — ve bu şaşırtıcı değil: bunların
her biri Steel'in varlık sebebi, Tepegöz'ün ise ya bir yan-ürünü ya da hiç kapsamadığı bir şey.
Steel yayında, SDK'lı, Docker'la tek komutta ayağa kalkan, gerçek kullanıcısı olan olgun bir altyapı.

**Örtüşmeyen eksenlerde — ki Steel'in tanımı gereği çoğu eksen örtüşmüyor — kıyas anlamsız çünkü
Steel bunları taşımıyor:** model-öncesi deterministik Policy Kernel, tek `ToolGateway` PEP,
`EgressFirewall` entropi/sızıntı denetimi, taint provenance, kanıt-atıflı tamamlama + yalan-başarı
savunması, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify` (paketi yazılı ve testli, ama
uygulamaya bağlanmadığı için bugün receipt üretmiyor), MCP istemcisi, model-free
macro/recipe şeridi, iki-aşamalı HITL + kademeli otonomi, insan-benzeri girdi profili, ajan belleği,
ve Türkçe/kamu derinliği — hepsi Tepegöz'e özgü. Tepegöz'ün yaptığı bahis "güvenli, hesap-verebilir
bir _ajan_"; Steel'in yaptığı bahis "ajanların üstüne kuracağı sağlam bir _tarayıcı katmanı_".

Dürüst özet: **Steel bugün kendi işini (ajanlar için tarayıcı altyapısı) yapan olgun bir üründür;
Tepegöz'ün ajanı ise henüz kanıtlanmamıştır** — her S-fazı 🟠 measurement-owed, vision/credential-broker/
memory atıl sevk, aynı anda tek run, site adaptörü yok, sağlayıcıların bir kısmı stub. Bir ajanın
altına takılacak, çok-oturumlu, self-host edilebilir bir tarayıcı katmanı lazımsa → Steel (hatta
Tepegöz'ün ajan mantığı bir gün Steel oturumlarını sürebilir). Tez "oturum-açık banka oturumuna
güvenebileceğin, model-öncesi deterministik bir çekirdekten geçen, ne yaptığının kriptografik kanıtı
olan, Türkçe bir _ajan_" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta.
