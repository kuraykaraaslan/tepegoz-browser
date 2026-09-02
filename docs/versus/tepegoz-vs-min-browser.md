# Tepegöz vs Min — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Min** (yayında olan, Apache-2.0 lisanslı,
> gizlilik-odaklı minimal masaüstü Electron tarayıcısı, v1.35.7) arasında bir karşılaştırma.
> Ama önce: Min'in **hiçbir LLM/ajan özelliği yok** — bu belge bir "ajan karşılaştırması"
> değil, bir "tarayıcı-kabuğu karşılaştırması" olarak okunmalı.
>
> **Yöntem.** `.junk/min-browser` deposunun (`README.md`, `package.json`, `docs/statistics.md`,
> `SECURITY.md`, `main/*.js` — `main.js`, `filtering.js`, `viewManager.js`, `UASwitcher.js`,
> `permissionManager.js` —, `js/` ağacı — `pageTranslations.js`, `places/fullTextSearch.js`,
> `readerView.js`, `readerDecision.js`, `userscripts.js`, `passwordManager/*`,
> `searchbar/instantAnswerPlugin.js`, `searchbar/calculatorPlugin.js`, `tabState/task.js`,
> `preload/translate.js` —, `pages/translateService/translateService.js`,
> `ext/readability-master/`, `ext/abp-filter-parser-modified/`, `ext/franc/`,
> `ext/textColor/textColor.js`, `localization/languages/tr.json`) ve bu reponun AI yüzeyinin
> (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input|tasks`, `extensions/ext-agent`,
> `docs/adr/*`) aynı oturumda okunmasından çıkarıldı. Min tarafında `agent`, `llm`, `openai`,
> `anthropic`, `claude`, `gpt`, `chat`, `assistant`, `prompt`, `inference` gibi terimler tüm
> kaynak ağacında arandı; tek anlamlı isabet "user agent" (tarayıcı kimlik dizesi) ve
> `ext/textColor/textColor.js` içindeki brain.js ile üretilmiş bir metin-rengi kontrast
> fonksiyonu ("neural network" yorumu) — ikisi de LLM değil.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje
> eserleri İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** `phases/tracks/webbrain-agent-parity.md` (yapı referansı). Min için bir
> `min-agent-parity` track'i **yok** ve olması da beklenmiyor — aşağıdaki kategori uyarısına bakın.
>
> **Kategori uyarısı.** Min **geleneksel bir minimal masaüstü tarayıcısıdır** — tam-metin
> geçmiş araması, reklam/izleyici engelleme, otomatik reader görünümü, sekme grupları ("Tasks"),
> yer imi etiketleme, parola yöneticisi entegrasyonu ve **yerel (çevrimdışı) sayfa çevirisi**
> sunar. **LLM, ajan, sohbet asistanı, "yap" modu, araç çağırma, otonomi — hiçbiri yok.**
> Tepegöz ile örtüşme yalnızca **tarayıcı-kabuğu düzeyinde** vardır (ikisi de Electron; gizlilik
> modeli; reader; sekme grupları; çeviri; yerelleştirme). Bu eksenlerde karşılaştırıyoruz.
> AI/ajan ekseninin tamamı "Örtüşmeyen alanlar" başlığında **yalnızca-Tepegöz** olarak durur.
> Bu belge "tarayıcı özellikleri" için faydalı bir kıyastır, "ajan özellikleri" için değil.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | Min                                                                                                                                                                                        | Tepegöz                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ne          | Gizlilik-odaklı **minimal masaüstü tarayıcısı** (Electron 43, vanilla JS, framework yok, browserify paketleme)                                                                             | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                    |
| Birincil iş | Dikkat dağıtmayan, hızlı, izlemeyen bir gündelik tarayıcı                                                                                                                                  | Güvenlik-önce, yerel-öncelikli, **ajan güdümlü** bir tarayıcı                                                                        |
| Olgunluk    | **Yayında** — v1.35.7, prebuilt binary'ler (Win/macOS/Linux/RPi), yıllardır sürüyor, Discord, sponsorlar, ~35 UI dili                                                                      | **1.0 öncesi**; roadmap ajan için "gerçekten bağlanmış iskelet, ince ölçülmüş" diyor, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Vanilla JS, `standard` stil, build framework'ü yok, `chokidar`+`browserify` watch; UI penceresi tam Node erişimli (`nodeIntegration:true, contextIsolation:false`), web içeriği sandbox'lı | Strict TS, pnpm+turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, renderer güvenilmez + tipli `contextBridge` zorunlu             |
| Felsefe     | "Minimal, hızlı, gizlilik" — pratik, ürün-önce, **AI'sız bilinçli sadelik**                                                                                                                | "Security-by-design, local-first" — model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik                            |

Yani: **olgun, sade, çalışan bir gizlilik tarayıcısı** vs. **erken, mimari ağırlıklı, güvenlik-önce
bir ajan-tarayıcısı**. Örtüşen tek zemin "tarayıcı kabuğu": ikisi de Electron, ikisi de reader ve
sekme grupları ve yerel çeviri sunuyor. Ajan ekseninde **kıyaslanacak bir şey yok** — Min o alana
hiç girmiyor. Bu belge bunu dürüstçe yansıtmaya çalışıyor: Min'i "kötü bir ajan" diye eleştirmek
kategori hatası olur; Tepegöz'ün ajanının **henüz kanıtlanmadığını** söylemek ise gerçek.

---

## Derinlemesine: iş iş kim ne yapıyor (yalnızca örtüşen tarayıcı-kabuğu eksenleri)

### Dağıtım / form — bugün Min, yapısal olarak ikisi de tam tarayıcı

Min: bağımsız Electron uygulaması, üç platformda prebuilt binary, "kur ve kullan". Tepegöz de tam
Electron tarayıcı ama **henüz yayında değil**. İkisi de eklenti değil, gerçek tarayıcı — bu eksende
kategori aynı; fark yalnızca olgunluk. **Bugün Min** (indirilebilir, çalışıyor).

### Gizlilik & içerik engelleme — Min sevk ediyor, Tepegöz farklı katmanda

Min: değiştirilmiş ABP filtre ayrıştırıcısı (`ext/abp-filter-parser-modified/`), EasyList +
EasyPrivacy, izleme parametresi soyma (`gclid`/`fbclid`/`msclkid`… + site-başı Amazon/eBay kuralları),
HTTPS yükseltme listesi, seçilebilir engelleme seviyeleri, `franc` ile dil tespiti. Varsayılan açık,
sekme çubuğunda anlık göstergesi var. **Ama**: varsayılan olarak kullanım istatistiği topluyor
(`docs/statistics.md`, opt-out).

Tepegöz: reklam/izleyici engelleme Phase 2 "adapters" + Safe Browsing (ADR-0043) kapsamında; asıl
gizlilik yükü **ajan tarafında** — `EgressFirewall` (Shannon entropisi ile sır/yüksek-entropi blob
sızıntı denetimi), `TaintTracker` provenance, `isSensitiveSite` kategorik kilidi. Telemetri kültürü
tersi (local-first, redaksiyon).

**Kim daha iyi:** Klasik reklam/izleyici engelleme **bugün Min** (sevk edilmiş, ayarlanmış). Ama
Min'in varsayılan-açık telemetrisi Tepegöz'ün local-first duruşuyla çelişir; "hiçbir şey dışarı
sızmasın" istiyorsan Tepegöz'ün mimarisi daha ileri (henüz ajan bağlamında).

### Reader / makale çıkarımı — pratikte eşit, kaynak aynı aile

Min: Mozilla **Readability** fork'u (`ext/readability-master/`), otomatik reader kararı
(`readerDecision.js` — sayfa başına "bir daha deneme" hafızası), tema seçici, PDF görüntüleyici
(`pdfjs-dist`). Sevk edilmiş, günlük kullanımda.

Tepegöz: `@tepegoz/reader` — makale çıkarımı, **HTML'siz tipli bloklar** (ajan tüketimi için de
uygun), `browser_get_article` aracı olarak ajana da açık, `ext-translate` ile birlikte çalışır.

**Kim daha iyi:** Son-kullanıcı reader deneyimi **bugün Min** (kanıtlı, PDF tema dahil). Mimari
olarak Tepegöz'ün tipli-blok çıktısı daha genel amaçlı (hem UI hem ajan), ama bu ajan faydası
henüz ölçülmedi.

### Sekme grupları — Min'in "Tasks"ı olgun, Tepegöz'ünki oturum-eksenli

Min: **Tasks** = birinci sınıf sekme grupları (`js/tabState/task.js`, `js/taskOverlay/`),
kalıcı, yeniden adlandırılır, arşivlenir, "restore task" searchbar eklentisi, sekme grubu başına
renk. Min'in imza özelliklerinden biri; yıllardır cilalanıyor.

Tepegöz: sekme grubu var ama asıl anlamı **"sekme-grubu başına ajan oturumu"** — Agent Console
her sekme grubunda ayrı bir konuşma/çalışma bağlamı tutuyor. Grup, ajan izolasyonunun birimi.

**Kim daha iyi:** Saf sekme-grubu yönetimi ürünü olarak **Min** (daha olgun, daha çok araç).
Tepegöz'ün grubu farklı bir işe koşuyor (ajan kapsamı) — kıyas kısmen elmayla armut.

### Yerel (çevrimdışı) çeviri — gerçek örtüşme, ikisi de yerel-önce

Min: **Bergamot** (`@browsermt/bergamot-translator`, Mozilla'nın WASM nöral MT'si) — çeviri
**tamamen cihazda** çalışır, model dosyaları min'in sunucusundan indirilir ama çıkarım yereldir,
bulut yok. ~21 dil, İngilizce pivot dili, seçim değil **tam sayfa** çevirisi. Türkçe destekli.

Tepegöz: `extensions/ext-translate` — **yerel-önce** seçim + sayfa çevirisi (ADR-0042 sayfa
çevirisi), gerekirse bulut sağlayıcıya eskale. `translate-host` main süreçte.

**Kim daha iyi:** Kabaca **eşit ve felsefe aynı** (ikisi de "önce cihazda çevir"). Min saf
Bergamot'a bağlı (LLM yok, deterministik, hafif); Tepegöz LLM sağlayıcılarına eskale edebildiği
için daha esnek ama daha ağır. Çevrimdışı garanti istiyorsan Min'in yolu daha katı.

### Tam-metin geçmiş araması — Min'in imza özelliği, Tepegöz'de eşi yok (ajan journal'ı farklı iş)

Min: ziyaret edilen tüm sayfaların **tam metnini** indeksliyor (`js/places/fullTextSearch.js` —
Dexie/IndexedDB, `stemmer`, durak kelime listesi, ters indeks, `quick-score` bulanık eşleşme).
Searchbar'dan geçmişte "ne okuduğunu" kelimeyle bulabiliyorsun. Min'in en ayırt edici özelliği.

Tepegöz: ajanın `journal_search_events` aracı ve event-sourced journal'ı var ama bu **ajan
eylemlerinin** denetim kaydı, kullanıcının gezinme geçmişinin tam-metin araması değil. Farklı iş.

**Kim daha iyi:** Kişisel gezinme geçmişi tam-metin araması olarak **Min — net**. Tepegöz bu
son-kullanıcı özelliğini hedeflemiyor.

### Genişletilebilirlik — userscript vs eklenti + `ext-*`

Min: **userscript** desteği (`js/userscripts.js` — Tampermonkey başlıklarının alt kümesi,
`chokidar` ile hot-reload), searchbar "bang" komutları, DuckDuckGo anlık yanıtları
(`instantAnswerPlugin.js`), `expr-eval` tabanlı hesap makinesi eklentisi. WebExtension yok.

Tepegöz: kendi eklenti ailesi — `ext-agent` (Agent Console), `ext-translate`, `ext-typo`,
`ext-macros`, `ext-tasks`, `ext-adblock`; her biri kendi i18n sözlüğünü taşıyor (ADR-0016).

**Kim daha iyi:** Hızlı "kendi scriptini yapıştır" için **Min** (userscript + bang basit ve
etkili). Yapılandırılmış özellik paketleri için Tepegöz'ün `ext-*` modeli daha güçlü ama daha ağır.

### Renderer güven modeli / mimari disiplin — Tepegöz

Min: tarayıcı **UI penceresi** `nodeIntegration: true, contextIsolation: false` ile çalışıyor
(`main/main.js`) — yani Min'in kendi kabuğu tam Node erişimli, güvenilir kabul ediliyor; web
içeriği ise sandbox'lı + `contextIsolation: true` (`main/viewManager.js`). Vanilla JS, tip yok,
zod yok, trust-boundary şeması yok. Küçük ve okunur ama sözleşmesiz.

Tepegöz: **renderer güvenilmez**, tek `createWindow()` fabrikası, yalnızca tipli `contextBridge`,
her güven sınırında zod `safeParse` (IPC, LLM tool-call, MCP, journal, policy),
`AppError(message, statusCode)` sınır eşlemesi (ADR-0009), strict TS (`@ts-ignore` yasak).

**Kim daha iyi:** **Tepegöz** — mimari disiplin ve saldırı yüzeyi izolasyonunda belirgin. Min'in
"kendi UI'ma güvenirim" modeli küçük bir kod tabanında savunulabilir ama Tepegöz'ün sözleşmeli
sınırları daha sağlam.

### Ölçüm / dürüstlük kültürü — farklı ligler, çünkü farklı iddialar

Min: resmi bir eval harness'ı yok; güven, yıllardır sürmesi ve gerçek kullanıcı tabanından geliyor.
`docs/` klasörü tek dosya (istatistik politikası). Dürüstlük burada "özellik listesi abartısız" —
README ne yaptığını sade anlatıyor.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama,
LLM-judge ikincil), SHA-256'lı donmuş fixture registry'leri, istatistiksel anayasa (Wilson CI,
iddia için N≥10), anti-debt kuralı, PROSE-LEDGER, reddedilebilir kuzey-yıldızı iddiası. Her S-fazı
🟠, hiçbiri ✅.

**Kim daha iyi:** Kıyas anlamsız — Min ölçülecek bir ajan iddiası ortaya atmıyor, dolayısıyla
harness'a ihtiyacı yok. Tepegöz'ün araştırma-sınıfı disiplini var **ama** bu kısmen yeteneğin
henüz orada olmamasından. "Bugün çalışan bir tarayıcı" diyorsan Min'in kanıtı kullanıcılarıdır.

---

## Örtüşmeyen alanlar

### Yalnızca Min'de olan (Tepegöz'de yok / hedeflenmiyor)

- **Tam-metin gezinme geçmişi araması** — ziyaret edilen her sayfanın metnini indeksleyip
  kelimeyle arama (Dexie + stemmer + ters indeks + `quick-score`). Tepegöz'ün journal'ı ajan
  denetimi içindir, bu değil.
- **Sevk edilmiş çok-dilli olgunluk** — ~35 UI dili (`localization/languages/*.json`), Türkçe
  dahil neredeyse tam (`tr.json` 315/319 satır).
- **Parola yöneticisi entegrasyonları** — Bitwarden CLI, 1Password CLI ve dahili keychain
  (`js/passwordManager/*`), otomatik doldurma + yakalama. Tepegöz tarafında bu bir kullanıcı
  özelliği olarak yok; ajan tarafında `credential-vault` var ama **atıl** ve BYO-key odaklı.
- **DuckDuckGo anlık yanıtları + bang komutları + hesap makinesi** searchbar eklentileri.
- **Userscript desteği** (Tampermonkey-benzeri, dosya izleme ile hot-reload).
- **Olgun "Tasks" sekme-grubu UX'i** — arşivle/yeniden adlandır/geri yükle, grup rengi, overlay.
- **PDF görüntüleyici** (pdf.js) tema seçiciyle, otomatik reader kararı hafızası.
- **Bergamot ile saf-yerel tam sayfa çevirisi** — LLM'siz, deterministik, hafif (Tepegöz'ün
  `ext-translate`'i benzer ama buluta eskale edebiliyor).

### Yalnızca Tepegöz'de olan (Min'de hiç yok — AI/ajan ekseninin tamamı)

- **Ajan orkestrasyonu** — `@tepegoz/orchestrator`: Planner (Intent→DAG) → Executor (PEP'ten
  serileştirilmiş) → Reactor (continue/retry/replan/stop, tipli `Decision`); completion-evidence,
  navigation-grounding, vision-trigger, cache-window (lag-2 breakpoint).
- **Çok-sağlayıcılı model geçidi** — `@tepegoz/model-gateway`: 8 sağlayıcı (anthropic, openai,
  gemini, kimi, nova, deepseek, xai, groq) + `local`; tek `CanonRequest/CanonResponse` şeması;
  `ModelRouter` (capability→tier+local/cloud); `TokenLedger`; her çağrıda `maxTokens`+`timeoutMs`
  zorunlu; streaming ADR-0025. (Bazı sağlayıcılar hâlâ stub.)
- **Tek tool-plane PEP** — `@tepegoz/capability-plane`: `CapabilityRegistry` + `ToolGateway`
  (lookup → idempotency → zod doğrulama → PolicyKernel → HITL → execute → audit); built-in/MCP/
  eklenti araçları ayrımsız aynı hattan.
- **Model-öncesi deterministik Policy Kernel** — `@tepegoz/security-policy` (ADR-0006): danger
  class (read/state_changing/destructive/financial) + taint + hedef site → allow/deny/ask +
  makine-okunur reason code + biyometrik; `isSensitiveSite` her otonomi seviyesinde **sert deny**;
  `TaintTracker` provenance; `EgressFirewall` (Shannon entropisi ile sızıntı denetimi);
  `detectHandoff` (captcha/2FA).
- **İki-aşamalı HITL** — `@tepegoz/agent-runtime`: plan önizleme + araç-başı onay, ikisi de
  fail-safe (yanıt yok = deny).
- **Ajan araç seti (~30)** — `browser_*`, `tab_*`, `web_*`, tam sandbox'lı `file_*`,
  `clipboard_*`, `download_*`/`upload_*`, `journal_search_events`, `task_*`, `extension_*`.
  `execute_js`/terminal/kod-editleme **yok** (ADR-0026 izole-dünya sandbox ölçümle çürütüldü;
  ADR-0029 DevTools kullanıcı-only).
- **DOM/a11y-önce algı** — `@tepegoz/browser-tools` (ADR-0008), `build-dom-tree-script`; vision
  yalnızca fallback ve bugün **atıl**: Reactor'ın `captureVision` geri-çağrısı opsiyoneldir ve onu
  üretimde geçen hiçbir çağıran yok (yalnız testler geçiyor) — bir bayrak kapalı olduğu için değil,
  **kimse kabloyu takmadığı için**.
- **Güvenilmez içerik temizliği** — `@tepegoz/tool-executor`: `sanitizeText` (gizli/zero-width/
  bidi/homoglyph enjeksiyon vektörleri), `wrapUntrustedContent`.
- **Deterministik (model-free) otomasyon şeridi** — `@tepegoz/macro-engine` (iMacros halefi,
  kontrol akışı + oto-bekleme) + `@tepegoz/recipe-compiler` (Phase 6: imzalı model-free replay +
  `evaluateAssertion` success oracle).
- **Kriptografik hesap verebilirlik** — `@tepegoz/notary` (Phase 7: hash-zinciri + Ed25519 imzalı
  checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI). Paket yazılmış ve testli
  ama **`apps/desktop`'a bağlanmamış** — `@tepegoz/notary`'yi import eden bir üretim dosyası yok
  (ADR-0030 bunu kaydediyor), yani bugün hiçbir çalışma makbuz üretmiyor.
- **MCP istemcisi** — `@tepegoz/mcp-client` (ADR-0018): dış MCP araçları CapabilityRegistry'ye
  girip aynı PEP'ten geçer; `McpSupervisor`. MCP **sunucu** yüzeyi yok (Phase 1b planlı).
- **Yerel çıkarım seam'i** — `@tepegoz/local-inference` (`LocalProvider`, node-llama-cpp,
  `responseFormat:'json'`'da GBNF gramer zorlaması) + `@tepegoz/model-catalog` (sha256'lı GGUF
  kataloğu, resumable indirme).
- **Diğer** — `@tepegoz/credential-vault` (BYO-key, DPAPI/safeStorage, **atıl**),
  `@tepegoz/human-input` (Catmull-Rom fare eğrileri, Gaussian jitter), `@tepegoz/tasks` (kayıtlı
  görev + interval/page-change/external tetikleyici), `@tepegoz/web-tools` (SSRF-güvenli
  `web_search`/`web_get_page`).
- **Agent Console UX** — `extensions/ext-agent`: Chat/Do/Make/Tasks paleti, plan önizleme (adım
  seç), kademeli otonomi + amber risk banner, effort ön-ayarları, kaydırılabilir replay timeline,
  kanıt rozetleri (Checked/Unconfirmed/Contradicted), çalışırken steer, pause/resume, arka-plana
  devam + tepsi, ticaret çift-onay, scope grant, Human Handoff Controller.

Bu listenin **hiçbir maddesinin Min'de karşılığı yoktur** — Min bir LLM çağrısı bile yapmıyor.
Aynı zamanda dürüst olmak gerekirse: bu maddelerin çoğu Tepegöz'de de **🟠 measurement-owed** —
sevk edilmiş ama ince ölçülmüş; vision/credential-broker/memory **atıl**; aynı anda **tek run**;
site adaptörü **yok**; çevrimdışı RAG **yok**.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — bu tablo yalnızca "kim daha iyi + neden". AI/ajan satırlarında Min'in hücresi "yok" =
kategori dışı, eleştiri değil.

| #   | Boyut                                          | Min                                                                                  | Tepegöz                                                                                                                                                                  | Kim daha iyi + neden                                                                           |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | **Ürün olgunluğu**                             | Yayında, v1.35.7, 3 platform prebuilt, yıllarca sürüş                                | 1.0 öncesi, henüz yayında değil                                                                                                                                          | **Min** — bugün indirip kullanabilirsin                                                        |
| 2   | **Kod tabanı disiplini**                       | Vanilla JS, `standard`, tip yok, zod yok, trust-boundary şeması yok                  | Strict TS, ~70 paket, ADR güdümlü, her sınırda zod `safeParse`                                                                                                           | **Tepegöz** — sözleşmeli, denetlenebilir mimari                                                |
| 3   | **Renderer güven modeli**                      | UI penceresi `nodeIntegration:true`/`contextIsolation:false`; web içeriği sandbox'lı | Renderer güvenilmez, tek `createWindow()`, yalnız tipli `contextBridge`                                                                                                  | **Tepegöz** — saldırı yüzeyi izolasyonu daha katı                                              |
| 4   | **Reklam / izleyici engelleme**                | ABP fork + EasyList/EasyPrivacy + param soyma + HTTPS upgrade, sevk edilmiş          | Phase 2 adapters + Safe Browsing (ADR-0043), ajan-eksenli                                                                                                                | **Bugün Min** — kullanıcı özelliği olarak hazır ve ayarlı                                      |
| 5   | **Telemetri duruşu**                           | Varsayılan **açık** kullanım istatistiği (opt-out)                                   | Local-first, redaksiyon, ajanda `EgressFirewall`                                                                                                                         | **Tepegöz** — "hiçbir şey sızmaz" duruşu tutarlı                                               |
| 6   | **Tam-metin geçmiş araması**                   | İmza özelliği — tüm sayfa metni indeksli, kelimeyle arama                            | Yok (journal ajan denetimi içindir)                                                                                                                                      | **Min** — net, Tepegöz bunu hedeflemiyor                                                       |
| 7   | **Reader / makale görünümü**                   | Readability fork + PDF viewer + oto-karar hafızası, sevk                             | `@tepegoz/reader` tipli bloklar (UI + ajan)                                                                                                                              | **Bugün Min** (kanıtlı UX). Mimaride Tepegöz daha genel                                        |
| 8   | **Sekme grupları**                             | Olgun "Tasks" (arşiv/rename/restore/renk/overlay)                                    | Grup = ajan oturum birimi                                                                                                                                                | **Min** saf yönetim ürünü olarak; Tepegöz farklı işe koşuyor                                   |
| 9   | **Yerel çeviri**                               | Bergamot WASM, **tam çevrimdışı çıkarım**, LLM'siz, ~21 dil                          | `ext-translate` yerel-önce, gerekirse buluta eskale (ADR-0042)                                                                                                           | **Eşit** — felsefe aynı; Min daha katı-çevrimdışı, Tepegöz daha esnek                          |
| 10  | **Yerelleştirme genişliği**                    | ~35 dil sevk, Türkçe neredeyse tam                                                   | Per-paket EN+TR parity testli (ADR-0016), TR birinci sınıf                                                                                                               | **Bugün Min** genişlikte; **Tepegöz** Türkçe derinliği + parity zorunluluğunda                 |
| 11  | **Parola yöneticisi**                          | Bitwarden/1Password/keychain entegrasyonu + autofill + capture                       | Kullanıcı özelliği yok; `credential-vault` atıl, BYO-key                                                                                                                 | **Min** — sevk edilmiş, çalışıyor                                                              |
| 12  | **Genişletilebilirlik**                        | Userscript (Tampermonkey alt kümesi) + bang + anlık yanıt + hesap makinesi           | `ext-*` eklenti ailesi, her biri kendi i18n'i                                                                                                                            | **Min** hızlı script için; **Tepegöz** yapılandırılmış paketler için                           |
| 13  | **LLM sağlayıcı desteği**                      | **Yok** — hiç LLM çağrısı yok                                                        | 8 sağlayıcı + `local`, tek `Canon*` şema, capability router                                                                                                              | **Tepegöz** (Min kategori dışı)                                                                |
| 14  | **Ajan döngüsü / orkestrasyon**                | Yok                                                                                  | Planner→Executor→Reactor, tipli kararlar, 2-aşama HITL; tek run                                                                                                          | **Tepegöz** (Min kategori dışı)                                                                |
| 15  | **Araç / aksiyon repertuvarı**                 | Yok (otomasyon aracı yok)                                                            | ~30 araç, tek PEP'ten (zod→policy→HITL→execute→audit)                                                                                                                    | **Tepegöz** (Min kategori dışı)                                                                |
| 16  | **Prompt-injection savunması**                 | Uygulanamaz (LLM yok)                                                                | Model-öncesi Policy Kernel + EgressFirewall + taint provenance + biyometrik                                                                                              | **Tepegöz** (Min kategori dışı) — ama Tepegöz'de de ASR bataryası measurement-owed             |
| 17  | **Doğrulanmış sonuç / yalan-başarı savunması** | Uygulanamaz                                                                          | `CompletionEvidence` + deterministik düşürme + tuzak fixture + kanıt rozetleri                                                                                           | **Tepegöz** (Min kategori dışı)                                                                |
| 18  | **Hesap verebilirlik / denetlenebilirlik**     | Yerel gezinme geçmişi (kullanıcı için); ajan trace'i yok                             | Event-sourced journal; **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + `tepegoz-verify` CLI) yazılı ama **`apps/desktop`'a bağlanmamış** — bugün makbuz üretmiyor | **Mimaride Tepegöz** (ajan ekseninde); farklı amaç, ve kriptografik makbuz henüz sevk edilmedi |
| 19  | **Deterministik (model-free) otomasyon**       | Userscript = manuel script; otomasyon motoru yok                                     | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, oracle'lı)                                                                                                  | **Tepegöz** — gerçek model-siz yorumlayıcı + imzalı tarif                                      |
| 20  | **MCP**                                        | Yok                                                                                  | MCP **istemcisi** (dış araçlar tek PEP altında); sunucu yüzeyi yok                                                                                                       | **Tepegöz** (Min kategori dışı)                                                                |
| 21  | **Çevrimdışı / egemenlik**                     | Bergamot yerel çeviri + yerel geçmiş indeksi; LLM yok                                | `local-inference` seam + sha256'lı model kataloğu; RAG yok, S12 ağırlıklara takılı                                                                                       | **Kısmi Min** (çeviri+arama bugün yerel çalışıyor); LLM egemenliğinde ikisi de eksik           |
| 22  | **"Bugün çalışıyor mu"**                       | Evet — gündelik tarayıcı olarak tam                                                  | Kısmen — tarayıcı kabuğu var, ajan iskelet + measurement-owed, atıl yetenekler, tek run                                                                                  | **Min** gündelik tarayıcı olarak; **hiçbiri** kanıtlı ajan olarak                              |

---

## Sonuç

**Bugün, "çalışan bir tarayıcı" ekseninde Min kazanıyor** — ve bunu söylemek kolay, çünkü Min
yıllardır yayında olan, cilalı, gerçek kullanıcı tabanı olan bir üründür: tam-metin geçmiş araması,
reklam/izleyici engelleme, olgun sekme grupları, parola yöneticisi entegrasyonları, ~35 dil,
çevrimdışı Bergamot çevirisi. Tepegöz'ün tarayıcı kabuğu da tam bir Electron tarayıcısı ama henüz
yayında değil ve bu son-kullanıcı özelliklerinin çoğu Tepegöz'ün önceliği bile değil.

**Mimari ve güvenlik ekseninde Tepegöz kazanıyor** — ama bu, Min'in kaybettiği bir yarış değil,
Min'in _katılmadığı_ bir yarış. Tepegöz'ün model-öncesi deterministik policy kernel'i, tek-PEP araç
çağrısı, egress firewall'ı, taint provenance'ı, kriptografik replay receipt'leri (Notary — paket
yazılmış ve testli ama henüz `apps/desktop`'a bağlanmamış, yani bugün makbuz üretmiyor),
kanıt-atıflı tamamlama savunması, strict-TS + zod trust-boundary disiplini ve renderer-güvenilmez
duruşu, Min'in vanilla-JS "kendi UI'ma güvenirim" modelinin çok ötesinde. Ayrıca Min'in
varsayılan-açık telemetrisi, Tepegöz'ün local-first tezinin tam tersi bir tercih.

**Kategori farkının tek cümlelik özeti:** Min **AI'sız, bilinçli olarak minimal bir gizlilik
tarayıcısıdır** ve hiçbir LLM/ajan özelliği yoktur; Tepegöz ise bir **ajan-tarayıcısı** olmayı
hedefler ama o ajan henüz kanıtlanmamıştır (S-fazları 🟠, üç yetenek atıl, aynı anda tek run, site
adaptörü ve çevrimdışı RAG yok) — dolayısıyla bu belge "tarayıcı özellikleri" için anlamlı bir
kıyastır, "ajan özellikleri" için değil. Dürüst öneri: dikkat dağıtmayan, hızlı, izlemeyen bir
gündelik tarayıcı istiyorsan → **Min**; tarayıcının içine gömülü, güvenlik-önce, Türkçe bir ajan
tezine yatırım yapmak istiyorsan → **Tepegöz**, hâlâ tezgâhta.
