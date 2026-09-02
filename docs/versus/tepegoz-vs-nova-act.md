# Tepegöz vs Nova Act — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Amazon Nova Act** (AWS'in "üretimdeki UI iş akışlarını
> ölçekte otomatikleştiren ajan filoları" hizmeti; depoda yalnızca Apache-2.0 lisanslı **Python SDK**'sı
> var, v3.4.187.0) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir
> karşılaştırma.
>
> **Yöntem.** `.junk/nova-act` deposunun (`README.md` 1.275 satır, `FAQ.md`, `CONTRIBUTING.md`,
> `pyproject.toml`, `requirements*.txt`, `src/nova_act/nova_act.py`, `impl/dispatcher.py`,
> `impl/program/runner.py`, `impl/interpreter.py`, `impl/backends/{base,factory,burst,sunburst,
starburst}`, `tools/browser/interface/browser.py`, `tools/browser/default/*` +
> `util/get_simplified_dom.js`, `tools/actuator/interface/actuator.py`,
> `tools/human/interface/human_input_callback.py`, `types/{guardrail,features,act_errors,workflow,
hooks}.py`, `impl/run_info_compiler.py`, `impl/trajectory/types.py`, `browser_auth/*`,
> `cli/README.md`, `cli/browser/README.md`, `cli/browser/services/*`, `samples/*`, `scripts/`) ve bu
> reponun AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|
mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input|tasks`,
> `extensions/ext-agent`, `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** [`docs/others/tepegoz-vs-webbrain.md`](tepegoz-vs-webbrain.md) — aynı şablonun daha önce
> uygulandığı karşılaştırma; varsa `phases/tracks/nova-act-agent-parity.md`.
>
> **Kategori uyarısı — açık SDK / kapalı hizmet ayrımı.** Nova Act _bir tarayıcı ajanıdır_, yani
> Tepegöz'ün ajanıyla doğrudan aynı işi yapar; bu yüzden kıyas büyük ölçüde head-to-head'dir. **Ama**
> depodaki kod, ürünün yalnızca istemci yarısıdır: `act()`'i yöneten **model ve planlayıcı AWS'de,
> kapalı olarak çalışır** (`api.nova.amazon.com` — ücretsiz/API-key katmanı; `nova-act.us-east-1.
amazonaws.com` — IAM'li AWS hizmeti). Depodaki SDK Playwright aktüasyonunu, gözlem üretimini, program
> yorumlayıcısını, HITL geri-çağrılarını ve AWS dağıtım CLI'ını içerir. Aşağıda **kaynaktan doğrulanan**
> ile **yalnızca belgelenen** her yerde ayrı ayrı işaretlenmiştir. Ayrıca ikinci bir asimetri var:
> Nova Act bir **geliştirici kütüphanesi + bulut hizmeti**dir, son-kullanıcı tarayıcısı değil; Tepegöz
> ise bir tarayıcı ürünüdür. Örtüşmeyen taraflar ayrı başlıkta toplanmıştır.
>
> **Karıştırmayın: `nova` sağlayıcısı ≠ Nova Act.** Tepegöz zaten `nova` adlı bir sağlayıcı taşıyor —
> bu, Amazon Nova'nın **OpenAI-uyumlu tüketici sohbet uç noktasıdır** (`api.nova.amazon.com`, Bearer
> key, Bedrock/region yok) ve `ModelGateway` adaptörlerinden biridir. Nova Act **aynı konağın altında
> ama farklı bir üründür**: `/agent/workflow-definitions/…/invoke-step` yolunu kullanır, sohbet modeli
> değil ekran-eylem için eğitilmiş ayrı bir "act" modelini çalıştırır ve anahtarları
> `nova.amazon.com/act` üzerinden verilir. Yani Tepegöz'ün Nova'yı desteklemesi Nova Act'i
> desteklediği anlamına **gelmez**.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | Nova Act                                                                                                                                                     | Tepegöz                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Kapalı, barındırılan **AWS ajan hizmeti** + ince açık **Python SDK** (Apache-2.0, ~41k satır Python, 345 dosya)                                              | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                  |
| Birincil iş | Geliştiricinin script yazıp **üretimde UI iş akışı filoları** koşturması (QA, form doldurma, veri çekme, alışveriş)                                          | Son kullanıcının kendi tarayıcısında, oturum-açık haldeyken güvenle iş yaptırması                                                                  |
| Olgunluk    | **Yayında** — GA AWS hizmeti, ücretli, AWS Console'da izlenebilir, IDE eklentisi, playground, resmi destek; SDK 3.x, 3.0 altı sürümler desteklenmiyor        | **1.0 öncesi**; roadmap'in kendi ifadesi: ajan "gerçekten bağlanmış iskelet, ince ölçülmüş", sahip verdiği not: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Python 3.10+, strict mypy + pydantic, Playwright; sync SDK **async kaynaktan otomatik üretiliyor** (`scripts/generate_sync.py`, libcst). Depoda **test yok** | Strict TS, pnpm+turbo monorepo, ~70 paket, ADR güdümlü, testler + eval harness repoda                                                              |
| Felsefe     | "Tek satıcı, tek model, ölçekte güvenilirlik"; zekâ bulutta, istemci ince ve **kasıtlı olarak dar**                                                          | "Security-by-design, local-first"; sağlayıcı-agnostik (ADR-0005), model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik            |

Yani: **çalışan, ölçeklenen, tek-satıcıya kilitli bir bulut ajan hizmeti** vs. **erken, mimari
ağırlıklı, sağlayıcı-agnostik ve yerel-önce bir native-tarayıcı ajanı**. Nova Act'in kıyası Tepegöz'ün
tam zıt bahsidir: Nova Act zekâyı kapalı bir sunucuya taşıyıp istemciyi minimuma indirerek güvenilirlik
alıyor; Tepegöz kararı istemciye çekip modeli değiştirilebilir bir bileşen yaparak egemenlik ve
denetlenebilirlik almaya çalışıyor. Bugünkü "işi yapıyor mu" ile "kimin makinesinde, kimin modeliyle,
kimin görebildiği veriyle yapıyor" farklı eksenlerdir.

---

## Kaynaktan doğrulanan / doğrulanamayan

Kapalı hizmet ayrımı bu belgenin en önemli dürüstlük kaydı olduğu için ayrı yazıyorum.

**Kaynaktan doğruladım (depoda okunabilir):** aksiyon setinin tamamı ve imzaları; gözlem formatı
(ekran görüntüsü + basitleştirilmiş DOM + bbox haritası); ajan döngüsünün istemci tarafı; program
yorumlayıcısı ve şema doğrulaması; state-guardrail geri-çağrısının **tam girdi yüzeyi**; HITL
araçlarının tanımı ve varsayılan davranışı; `SecurityOptions` alanları; oturum kalıcılığı
sağlayıcıları; API-key/IAM kimlik doğrulama akışı ve gönderilen başlıklar; telemetri yükü; iz
(trace) üretimi; AWS dağıtım hattı; tarayıcı CLI'ının komut listesi; prompt-injection savunmasının
**yokluğu** (grep ile: SDK'da tek bir sanitize/untrusted-content mekanizması yok).

**Doğrulayamadım (sunucuda, kapalı):** `act` modelinin kendisi, sistem-prompt'u, planlama stratejisi,
context/mesaj yönetimi ve sıkıştırma politikası, adım başına token ekonomisi, "RAI guardrails"ın ne
denetlediği (`ActGuardrailsError` / `AGENT_GUARDRAILS_TRIGGERED` yalnızca istemcide _yakalanır_,
kuralları görünmez), model tarafında herhangi bir enjeksiyon savunması olup olmadığı, HITL'i tetikleme
eşikleri, ScreenSpot/GroundUI Web benchmark sayıları (FAQ blog yazısına işaret ediyor — depoda ölçüm
yok), veri saklama süreleri. Bu maddelerin hiçbiri hakkında "yok" demiyorum; **göremiyorum** diyorum.
Tepegöz tarafında aynı maddelerin karşılığı repoda okunabilir olduğu için karşılaştırma bu noktada
kaçınılmaz olarak asimetriktir ve bunu Nova Act aleyhine bir kanıt gibi kullanmıyorum.

---

## Derinlemesine: iş iş kim ne yapıyor

### Model / sağlayıcı desteği — Tepegöz, tartışmasız

Nova Act: **tek model, seçim yok**. FAQ Teknik Soru 7 birebir şöyle: _"The SDK only works with the Nova
Act model."_ `model_id` yalnızca `nova-act-latest` / `nova-act-preview` alıyor. Yerel model yok,
Bedrock üzerinden başka bir modele geçiş yok, kendi anahtarınla başka sağlayıcıya yönlendirme yok.
Karşılığında `model_temperature`, `model_top_k`, `model_seed` açık — yani en azından tekrarlanabilirlik
düğmeleri var.

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, `responseFormat:'json'`'da GBNF gramer zorlaması). Hepsi tek
`CanonRequest`/`CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify)
tier + yerel/bulut'a eşliyor; her çağrıda `maxTokens` + `timeoutMs` **zorunlu**; DPAPI/safeStorage'lı
BYO-key kasası. Dürüst tarafı: yalnız Anthropic resmi SDK kullanıyor, OpenAI ham REST, bazı sağlayıcılar
stub, sıfır-kurulum bulut yok.

**Kim daha iyi:** Tepegöz — bu, ADR-0005'in tam olarak önlemek için yazıldığı kilitlenmenin canlı
örneği. Nova Act'te model satıcıyı değiştirmek "ayar" değil, ürünü terk etmek demek.

### Algı (sayfayı okuma) — mimaride Tepegöz, bugün Nova Act daha basit ve çalışıyor

Nova Act: her adımda `takeObservation` → **ekran görüntüsü (base64 JPEG data-URL)** + `simplifiedDOM`
(664 satırlık enjekte edilen JS; sabit bir `ATTRIBUTES_TO_KEEP` kümesi — `alt/role/placeholder/href/
title/value/scrollable/currently-obscured/data-testid…`, `nova-act-id` ile elemanlara kimlik verir) +
`idToBboxMap` + `activeURL` + `browserDimensions` + `userAgent`. Model konumu **normalize koordinatla**
(0–1000 kutu) söyler, SDK bunu viewport piksellerine çevirir. Yani algı **görüntü-önce, DOM-destekli**;
ekran boyutuna hassas (README: 864×1296–1536×2304 dışında performans düşer). Adaptif pencere, diff,
sayfalama, PDF okuma, shadow-DOM delme yok — bunlar model tarafında olabilir ama SDK'da yok.

Tepegöz: **DOM/a11y-önce** (ADR-0008), kimlik-kararlı ref'ler + diff/dedupe/elision (token kesmek
için), `aria-labelledby`/`label[for]` çözümü, `browser_get_article`. Vision yalnızca **eskalasyon** ve
bugün **atıl sevk ediliyor** — bir bayrak kapalı olduğu için değil, **kablosu takılmadığı için**:
Reactor'ın `captureVision` geri-çağrısı opsiyoneldir ve onu üretimde geçen bir çağıran yok (yalnız
testler geçiyor). `@tepegoz/tool-executor` gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini ayrı
bir pakette temizliyor.

**Kim daha iyi:** Bugün Nova Act'in yaklaşımı _çalıştığı kanıtlanmış_ olan; mimaride Tepegöz — çünkü
her adımda tam ekran görüntüsü göndermek hem token/gizlilik maliyeti hem de "ekranda görünen her sır
sunucuya gider" demek (Nova Act README bunu açıkça uyarı olarak yazıyor).

### Aksiyon repertuvarı — Nova Act kasıtlı olarak minik, Tepegöz geniş ve kapılı

Nova Act'in **tüm** aksiyon seti, kaynaktan sayarak **11 tanedir**: `agentClick`, `agentHover`,
`agentScroll`, `agentType`, `goToUrl`, `return`, `think`, `throw`, `wait`, `waitForPageToSettle`,
`takeObservation`. Hepsi `@final` — sınıf yorumu şöyle diyor: _"Ensures that function signatures /
descriptions are never modified during override and exactly match the model's expected format."_ Yani
liste **model eğitimine kilitli**. Sekme yok, indirme yok, yükleme aracı yok, pano yok, dosya sistemi
yok. Bunlara ihtiyacın olursa **Playwright'ı kendin çağırırsın** (`nova.page.keyboard.type(...)`,
`page.expect_download()`) — güç Python tarafında, ajanda değil. Ek olarak istemci `@tool` işlevleri
(strands) ve Strands MCP istemcisi üzerinden dış araçlar verilebilir; bunların şemaları `CreateAct`
ile sunucuya yollanır ve **çağırma kararını sunucudaki model verir**.

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*` (spawn + egress_blocked dahil), `web_*`
(search/get_page/send_form), `file_*` (tam sandbox'lı ajan dosya sistemi), `clipboard_*`, `download_*`,
`upload_*`, `journal_search_events`, `task_*`, `extension_*`. Ayrıca **model-free deterministik şerit**:
`@tepegoz/macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme) ve `@tepegoz/recipe-compiler`
(imzalı, `evaluateAssertion` success-oracle'lı tekrar-oynatma). `@tepegoz/human-input` insan-benzeri
fare eğrileri/jitter.

**Kim daha iyi:** Genişlikte Tepegöz; **disiplinde ikisi de savunulabilir ama farklı şekilde** — Nova
Act yüzeyi küçülterek riski azaltıyor (11 aksiyonun hiçbiri dosya yazamaz), Tepegöz yüzeyi büyütüp her
çağrıyı politikadan geçirerek. Nova Act'in yolu daha az şey yapabilmek pahasına daha az şey kırabilmek;
Tepegöz'ünki daha çok şey yapıp her birini denetlemek — ve bu denetim henüz ölçülmemiş.

### Ajan döngüsü / orkestrasyon — farklı yerlerde

Nova Act (istemci tarafı kaynaktan): `ActDispatcher.dispatch()` → ilk `waitForPageToSettle` +
`takeObservation` programını çalıştır → döngü: zaman aşımı ve `max_steps` (**varsayılan 30**) kontrolü
→ `backend.step()` ile gözlemi sunucuya yolla → sunucudan gelen "calls" listesini `ProgramRunner`
yürüt → `return`/`throw` görünce bitir. Duraklat/iptal `ctrl+x` ile (ayrı dinleyici thread). Planlama,
yeniden-planlama, döngü tespiti, context sıkıştırma — hepsi **sunucuda ve görünmez**. Uzun görevler
için önerilen çözüm mimari değil prompt disiplini: README açıkça _"works most reliably when the task
can be accomplished in fewer than 30 steps"_ diyor ve görevi Python koduyla parçalamanı öğütlüyor.
Buna karşılık **gerçek paralellik var**: birden fazla `NovaAct` örneği aynı süreçte eşzamanlı koşar
(çok-thread destekli; çok-process değil, boto3 Session pickle'lanamıyor).

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`); `CompletionEvidence`, navigation-grounding,
vision-trigger, cache-window (lag-2 breakpoint); iki-aşamalı HITL (plan önizleme + araç-başı), her
ikisi de fail-safe. Ama **aynı anda tek çalışma** (ADR-0013); paralel/dayanıklı checkpoint-resume
roadmap'te, sevk edilmedi.

**Kim daha iyi:** Bugün Nova Act — hem çalışıyor hem paralel koşuyor hem de basitliği sayesinde
öngörülebilir. Tepegöz'ün döngüsü kâğıtta daha zengin (yeniden-planlama, tipli kararlar, kanıt) ama
serileştirilmiş ve kanıtlanmamış. Ayrıca Nova Act'in "30 adımdan uzun görevi Python'a böl" önerisi,
Tepegöz'ün Planner'ının çözmeye çalıştığı problemi ürün seviyesinde **kullanıcıya devretmesi** demek.

### İzin / onay / otonomi modeli — Tepegöz'ün asıl kozu, ve fark yapısal

Nova Act'te ajanın izin modeli üç parçadan ibaret ve üçü de kaynaktan okunabiliyor:

1. **`state_guardrail`** — senin yazdığın bir Python geri-çağrısı. Girdisi tam olarak tek alandır:
   `GuardrailInputState(browser_url: str)`. Her `takeObservation`'dan sonra, sunucuya adım isteği
   gitmeden önce çağrılır; `BLOCK` dönerse `ActStateGuardrailError` fırlar. Yani **deterministik ve
   model-öncesi** — bu iyi. Ama gördüğü tek şey URL: aksiyonun ne olduğunu, hangi elemana
   dokunulacağını, para transferi mi form doldurma mı olduğunu **görmez**.
2. **`SecurityOptions`** — iki liste: `allowed_file_open_paths` ve `allowed_file_upload_paths`, ikisi
   de varsayılan boş (yani `file://` ve yükleme kapalı). Hepsi bu.
3. **HITL araçları** — `human_Approve` ve `human_UiTakeover`. Kritik ayrıntı: bunlar **modelin
   çağırdığı araçlardır**. `human_Approve`'un eğitilmiş açıklaması _"…request human approval to
   complete tasks such as financial transactions, cart checkout or sensitive form submissions **when
   the task requires it**"_ diyor. Yani finansal bir işlemde onay istenip istenmeyeceğine **model karar
   verir**. Dahası varsayılan uygulama `DefaultHumanInputCallbacks`'tir ve `NoHumanInputToolAvailable`
   fırlatır — geri-çağrıları sen yazmadıysan **HITL hiç yoktur**.

Tepegöz: **model-ÖNCESİ deterministik PolicyKernel** (ADR-0006): danger class
(read/state_changing/destructive/financial) + taint + hedef site → allow/deny/ask + makine-okunur reason
code + biyometrik (Windows Hello) gereksinimi. `isSensitiveSite` (banka/kripto/sağlık/kamu/parola
yöneticisi) **her otonomi seviyesinde sert deny**; otonomi (`ask`/`act`/`auto`) yalnız kernel'in sorduğu
prompt'u atlayabilir, deny'ı bozamaz. İki-aşamalı HITL fail-safe (yanıt yok = deny). Ticaret için ayrı
çift-onay kapısı; ADR-0033 transaction-mandate kernel.

**Kim daha iyi:** Tepegöz, ve bu belgedeki en büyük mimari fark. Nova Act'te "bu bir para işlemi mi"
sorusunun cevabı modeldedir; Tepegöz'de kernel'dedir. Nova Act'in guardrail'i deterministik olması
bakımından doğru fikirdir ama yüzeyi bir alandan (URL) ibarettir. Buna karşılık dürüst olmak gerekir:
Tepegöz'ün credential-broker ve biyometrik kapıları **atıl sevk ediliyor**, ASR ölçümü borçlu — yani
Tepegöz'ün üstünlüğü bugün mekanizmada, kanıtta değil.

### Prompt-injection savunması — mimaride Tepegöz; Nova Act'te SDK tarafında yok

Nova Act: SDK'da tek bir enjeksiyon savunması **bulamadım** — sayfa içeriğini sarmalama, nonce,
breakout-strip, güvenilmez-içerik işaretleme, çıktı sanitizasyonu yok (grep: `inject|sanitize|untrusted`
yalnızca AWS kaynak adı temizleme ve CLI uyarılarında geçiyor). Model tarafında bir savunma olabilir;
**göremiyorum**. Depodaki tek muamele README Disclosure #2'dir ve bir mekanizma değil bir uyarıdır:
_"…prompt injections may cause the model to … perform unauthorized actions, or exfiltrating sensitive
data. To reduce the risks … it is important to monitor Nova Act and review its actions."_ Yani savunma
kullanıcıya devredilmiştir. Ek olarak sunucu tarafında "RAI guardrails" var (istemci
`AGENT_GUARDRAILS_TRIGGERED` reason'ını yakalıyor) ama neyi denetlediği yayınlanmamış.

Tepegöz: model-öncesi Policy Kernel (yukarıda) + `TaintTracker` provenance seviyeleri +
`@tepegoz/tool-executor`'ın `sanitizeText` / `wrapUntrustedContent` / `finalizeElements` hattı (gizli,
zero-width, bidi, homoglyph vektörleri) + **EgressFirewall** (`inspectEgress`, Shannon entropisi ile
sır/yüksek-entropi blob sızıntı denetimi) + `detectHandoff` (captcha/2FA). **Ama** claim-grade ASR
bataryası `measurement-owed`; roadmap `auto` otonomisinin finans katmanını koşulsuz onayladığı bir
hatayı açıkça itiraf ediyor (okuyarak bulunmuş, düzeltilmiş).

**Kim daha iyi:** Tepegöz — mimaride net fark. Nova Act'in tarafı "modeli izle" ile "sunucuda bir şey
var ama söylemiyoruz" arasında; Tepegöz'ünki ölçülmemiş ama görünür ve denetlenebilir kod.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz

Nova Act: `act()` dönerken şema verilmişse (`act_get`) yanıt JSONSchema'ya karşı doğrulanır
(`jsonschema`), uymuyorsa `ActInvalidModelGenerationError`. Bu **biçim** doğrulamasıdır — "değer
şemaya uyuyor mu", "iddia gerçekten oldu mu" değil. Sayfanın modelin iddiasını yalanlayıp
yalanlamadığına bakan bir mekanizma SDK'da yok. Bunun ötesi prompt disiplinine bırakılmış (README:
"return the address of the hotel you booked" gibi kanıt-istemeyi prompt'a yazmayı öğütlüyor).

Tepegöz: **S4** — `CompletionEvidence` + deterministik düşürme: model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz; "Saved!" yazıp 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı;
recipe-compiler'ın `evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi yakalıyor.
Kuzey-yıldızı koşulu #3: _"fabricated-success ≈ 0"_.

**Kim daha iyi:** Tepegöz — mekanizma seviyesinde belirgin fark (ama yine ölçüm borçlu).

### Hesap verebilirlik / denetlenebilirlik — bölünmüş: operasyonel Nova Act, kriptografik Tepegöz

Nova Act sevk edilmiş, gerçekten kullanışlı bir gözlemlenebilirlik yığını taşıyor: her `act()` sonunda
**kendi kendine yeten HTML iz dosyası** (adım adım ekran görüntüleri, üzerine çizilmiş bbox'lar, araç
çağrıları ve sonuçları), yanında `_traces.json`; `record_video=True` ile tam oturum videosu;
`replayable=True` ile serileştirilebilir `Trajectory` (her adımda `active_url` + `image` +
`simplified_dom` + `program`); `S3Writer` stop-hook'u ile oturum eserlerini kendi S3 kovana yazma
(SSE-KMS); AgentCore'a dağıtıldığında CloudWatch + OpenTelemetry log grupları ve AWS Console'da
izleme; `time_worked` ölçümü (insan bekleme süresi düşülmüş — dürüstçe "yaklaşık, faturalama için
kullanmayın" notuyla).

Tepegöz: **Notary** (ADR-0030) — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay
Receipt** + bağımsız `tepegoz-verify` CLI. **Ama** paket yazılmış ve testli olduğu halde uygulamaya
**hiç bağlanmamış**: `@tepegoz/notary`'yi kendi paketi dışında import eden yer yok, `apps/desktop` onu
tanımıyor, ve ADR-0030 bunu kendisi kaydediyor — yani **bugün hiçbir çalışma makbuz üretmiyor**. Sevk
edilen taraf: olay-kaynaklı journal + `journal_search_events` aracı.

**Kim daha iyi:** Farklı sorulara cevap veriyorlar. "Ajan ne yaptı, bakayım" için **bugün Nova Act**,
ve açık ara (görsel iz + video + CloudWatch, hepsi sevk edilmiş; Tepegöz'ün karşılığı journal +
replay timeline). "Ajanın yaptığını üçüncü tarafa, satıcıya güvenmeden kanıtlayayım" ekseninde
**bugün hiç kimse** — Nova Act'in izleri imzasız, Tepegöz'ünki üretilmiyor. O eksende Tepegöz'ün
sahip olduğu şey **tasarım**: imzalı, taşınabilir, bağımsız doğrulanabilir bir makbuz, Nova Act'te
kavram olarak bile eşi yok.

### Kimlik bilgisi / sır işleme — kavramsal olarak Tepegöz, pratikte ikisi de eksik

Nova Act'in tavsiyesi açık ve dürüst: modele şifre verme, alanı odakla ve **Playwright ile kendin yaz**
(`nova.page.keyboard.type(getpass())`) — bu değer ağ üzerinden gitmez. Ama hemen ardından gelen uyarı
mekanizmanın sınırını gösteriyor: _"if you instruct Nova Act to take an action on any browser screen
displaying sensitive information … that information will be included in the screenshots collected."_
Yani sır ekranda görünür haldeyse **bir sonraki gözlemde sunucuya gider**. Oturum kalıcılığı tarafı
teknik olarak özenli (README'de OWASP/NIST atıflı bir çerez-vs-localStorage-vs-IndexedDB tablosu var):
yerel dosya sağlayıcısı `~/.nova-act/sessions/<profile>.json`, `0o600` — **şifrelenmemiş**; S3
sağlayıcısı SSE-KMS ile şifreli; AgentCore profilleri hizmet tarafından yönetiliyor. API anahtarı
`NOVA_ACT_API_KEY` ortam değişkeninde ve CLI'da `~/.act_cli/browser/config.yaml` (0600) — **OS
anahtarlığı / DPAPI kullanımı yok**; CLI README'si bunu kendisi itiraf ediyor ("key is accessible to
any code running in the same process").

Tepegöz: Credential Broker — ajanda sırrın gireceği bir _şekil_ yok; OS-auth kapısı olana dek her dolgu
reddedilir (**atıl sevk**). `@tepegoz/credential-vault` BYO-key, DPAPI/safeStorage. EgressFirewall
çıkışta yüksek-entropi blob avlıyor.

**Kim daha iyi:** Kavramsal olarak Tepegöz (sır ajana hiç ulaşmıyor + OS-seviyesi şifreleme), ama
broker atıl olduğu için **bugün ikisi de tam çözmüş değil**. Nova Act'in çözümü çalışıyor ama
ekran-görüntüsü kanalını kapatmıyor; Tepegöz'ünki kanalı kapatıyor ama sevk edilmemiş.

### Çevrimdışı / egemenlik / veri — Tepegöz, ve fark keskin

Nova Act **tanımı gereği çevrimdışı çalışamaz**: her adımda gözlem (ekran görüntüsü + DOM) Amazon'a
gider, program Amazon'dan gelir. Yerel model yok, kendi kendine barındırma yok, Bedrock'ta bile
"kendi VPC'nde model çalıştır" seçeneği bu SDK'da yok. Veri tarafı: **Disclosure #4** — API-key
katmanında _"we collect information on interactions with Nova Act, **including in-browser
screenshots**, to develop and improve our services"_; silme talebi e-posta ile. IAM/AWS hizmet
katmanında AWS Service Terms geçerli (muhtemelen daha koruyucu, ama depodan doğrulanamaz). Bölge:
Nova Act AWS hizmeti şu an **yalnızca us-east-1**. Ayrıca telemetri (`/agent/telemetry`): act sonucu,
gecikme, Python sürümü, OS/sürüm, SDK sürümü, session id, aktüatör tipi — susturma bayrağı görmedim.

Tepegöz: `@tepegoz/local-inference` (node-llama-cpp) + sha256'lı GGUF kataloğu + "basit adımlar
cihazda" maliyet-tasarrufu düğmesi; Phase 8 / S12 çoğunlukla **inşa edilmemiş** ve indirilmiş
ağırlıklara takılı; çevrimdışı RAG yok.

**Kim daha iyi:** Tepegöz — çünkü burada kıyaslanan şey olgunluk değil _mümkünlük_. Tepegöz'ün yerel
yolu zayıf ama var; Nova Act'in yerel yolu **yok ve olamaz**. Türkiye'de KVKK kapsamındaki bir iş
akışının her ekran görüntüsünü us-east-1'e göndermek bir tercih değil, mimarinin şartıdır.

### Asistan UX — örtüşme az; Nova Act'in UX'i geliştiricinin, Tepegöz'ünki kullanıcının

Nova Act: son-kullanıcı arayüzü **yok** — arayüz Python'dur. Onun yerine geliştirici deneyimi var ve
iyi: `nova.amazon.com/act` playground, IDE eklentisi (chat-to-script, oturum hata ayıklama, adım adım
test), interaktif REPL modu (`ctrl+x` ile ajanı durdur, tarayıcıyı açık bırak), headless oturumu
`devtoolsFrontendUrl` ile canlı izleme, ve **41 komutluk `act browser` CLI'ı** (19 gezinme, 10 çıkarım,
8 oturum, 4 kurulum; CDP ile oturumlar çağrılar arası kalıcı). CLI'da dikkat çeken güvenlik ayrıntısı:
`--ignore-https-errors` **varsayılan açık** ve `evaluate` keyfi JavaScript çalıştırıyor — kendi
README'si bunları uyarı olarak listeliyor.

Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme (adım seç), kademeli otonomi + amber
risk banner, effort ön-ayarları, kaydırılabilir replay timeline, kanıt rozetleri, çalışırken **steer**,
pause/resume, arka-plana devam + tepsi göstergesi, sekme-grubu-başı oturum, sohbet geçmişi + arama,
composer ekleri, ticaret çift-onay, scope grant, Human Handoff Controller.

**Kim daha iyi:** Örtüşmüyorlar. Geliştirici için **Nova Act** (playground + IDE + CLI + iz dosyası
zinciri gerçekten sevk edilmiş); son kullanıcı için **Tepegöz** — Nova Act'in bu kategoride bir
teklifi yok.

### Bellek & skill / iş akışı tanımı — Nova Act "Python kodudur" diyor

Nova Act'in iş akışı tanım stili şu: **doğal dil adımları + Python kontrol akışı**. Bir `Workflow`
bağlam yöneticisi (veya `@workflow` dekoratörü) AWS'te bir workflow-run açar, içinde ardışık `act()`
çağrıları yaparsın, dallanmayı/döngüyü/yeniden denemeyi normal Python ile yazarsın. Ajan belleği yok;
FAQ'nun "öğrendiğini hatırlayabilir mi" sorusuna cevabı _"Chrome user data directory ile oturum
durumunu kaydedebilirsin"_ — yani bellek = çerez. Skill kütüphanesi, öğrenilen seçici, kendini
iyileştiren tarif yok. Tekrarlanabilirlik `model_seed`/`temperature` ve **`replayable` trajectory
serileştirmesi** ile ele alınıyor (izi kaydet, incele) — ama model-free yeniden oynatma değil.
CLI tarafında ilginç bir istisna var: `qa-plan`, **Gherkin `.feature` dosyalarını** CLI komut planına
derliyor ve login/captcha/OTP içeren adımları `requires: human_auth` diye işaretliyor.

Tepegöz: S9 — alan-başı **advisory bellek** + yazma-tarafı zehir filtresi + sil-değil-karantina +
görev-çiti dışında yalnız-tavsiye recall (ADR-0027); skill kütüphanesi = **saklı prompt şablonları**
(bilerek muhafazakâr, çalıştırmaz); ayrıca deterministik `macro-engine` + imzalı `recipe-compiler`
şeridi ve kayıtlı görevler (`@tepegoz/tasks`: interval/page-change/external tetikleyici).

**Kim daha iyi:** "Bugün üretimde bir iş akışı yazacağım" için **Nova Act** — Python kontrol akışı
dürüst, anlaşılır ve gerçekten kullanılıyor. "Ajan öğrendiğini saklasın / model-free tekrar oynatsın"
için **Tepegöz** (macro + recipe + notary üçlüsünün Nova Act'te karşılığı yok).

### MCP — aynı yön, farklı katman

Nova Act: **MCP istemcisi**, ama dolaylı — Strands'in `MCPClient`'ı ile araçları listeleyip `tools=`
parametresine verirsin; şemalar `CreateAct` ile sunucuya gider ve çağrı kararını **sunucudaki model**
verir, yerel bir politika kapısı yoktur. MCP sunucu yüzeyi yok. (README ayrıca "remote MCP" desteğini
Preview olarak anıyor — depodan doğrulanamıyor.)

Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP araçları CapabilityRegistry'ye girer ve **aynı PEP'ten**
geçer; `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen annotation →
en kısıtlı sınıf). MCP **server** yüzeyi yok (Phase 1b planlı, yapılmamış).

**Kim daha iyi:** Tepegöz — aynı yön, ama Tepegöz'de dış araç yerel politikadan geçer; Nova Act'te dış
aracın çağrılıp çağrılmayacağına kapalı sunucu karar verir.

### Site adaptörleri — ikisinde de yok

Nova Act'te site-başı adaptör, sayfa-şekli rehberi, finans sitesi özel muamelesi yok. Bunun yerine
"prompt'u parçala ve ipucu ver" öğretiliyor; sitenin tuhaflığını **sen prompt'a yazarsın**.
Tepegöz'de de agent için site-adaptör sistemi yok (Phase 2 "adapters" içerik/reklam engelleme + Safe
Browsing, ADR-0043; hassas-site yalnızca _kategori_ olarak var, kilit için).

**Kim daha iyi:** Beraberlik — ikisi de yapmıyor. (Karşılaştırma için: WebBrain'in 58+ adaptörü var.)

### Türkçe / bölgesel — Tepegöz, ve fark mutlak

Nova Act README'sinde tek satır: _"Note: Nova Act supports English."_ Kaynak ağacında i18n, locale,
sözlük, çeviri altyapısı **yok** (grep ile doğrulandı — `translate` geçen tek yer AWS hata çevirisi).
Hizmet bölgesi us-east-1. Türkiye'ye özgü site, kamu entegrasyonu, KVKK yaklaşımı yok.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır
(ADR-0016), `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036 kamu adaptör güven modeli). Şirket Türk
(roltek.com.tr).

**Kim daha iyi:** Tepegöz — burada rekabet yok; Nova Act Türkçe bir görevi _deneyebilir_ ama ürün
olarak Türkçeyi desteklemediğini kendisi yazıyor.

### Ölçüm / dürüstlük kültürü — ikisi de dürüst, ama farklı şeyler hakkında

Nova Act'in dürüstlüğü **operasyonel**: Known Limitations bölümü net (tarayıcı dışına çıkamaz, tarayıcı
penceresi modallerine dokunamaz, ekran çözünürlüğüne hassas); `time_worked` için "yaklaşıktır,
faturalama için kullanmayın" uyarısı; CLI README'sinde kendi tehlikeli varsayılanlarını
(`--ignore-https-errors` açık, `evaluate` keyfi JS, ağ yakalamasının bellekte `Authorization`/`Cookie`
başlıkları tuttuğu) listelemesi; oturum kalıcılığı için OWASP/NIST atıflı bir risk tablosu vermesi;
prompt-injection uyarısını Disclosure'a koyması. Buna karşılık: **depoda hiç test yok**, benchmark
sayıları blog yazısına havale ediliyor, sunucu tarafı hiçbir metriğiyle doğrulanamıyor.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, havuzlanmış aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER,
reddedilebilir kuzey-yıldızı iddiası (`bridgeClaim` 25 insan etiketinin altında `publishable:false`),
ön-kayıtlı H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için
var — her S-fazı 🟠, hiçbiri ✅ değil.

**Kim daha iyi:** Ölçüm altyapısı ve iddia disiplininde **Tepegöz**; "kullanıcıya riskini söyleme"
dürüstlüğünde **Nova Act de sağlam** (özellikle kendi CLI'ının güvenlik notları alışılmadık derecede
açık sözlü).

> Not: Tepegöz'ün roadmap'i `browser-use`/`nanobrowser` ailesini _"tekniği çal, asla benimseme"_ ve
> "satıcı ajan SDK'ları yok" diye listeliyor. Nova Act tam olarak o "satıcı ajan SDK'sı"dır — Python
> sidecar + ikinci Chromium (Playwright) + kapalı model üçlüsü, Tepegöz'ün "Never" listesinin üç
> maddesine birden değiyor. Yani buradan alınacak şey kod değil, iki fikirdir: (a) aksiyon setini
> model eğitimine kilitlemek ve `@final` yapmak, (b) her `act()` sonunda kendi kendine yeten görsel iz
> dosyası üretmek.

---

## Örtüşmeyen alanlar

**Yalnızca Nova Act'te olan:**

- **Bulut filo yönetimi**: `act workflow deploy` → Docker imajı → ECR → otomatik IAM rolü → Bedrock
  AgentCore Runtime → CloudWatch/OTEL log grupları; AWS Console'da workflow-run izleme;
  `~/.act_cli/state/{account}/{region}/workflows.json` ile hesap+bölge başına durum.
- **Bedrock AgentCore Browser Tool** ile yönetilen bulut tarayıcısında koşma; AgentCore browser
  profilleri ile yönetilen oturum kalıcılığı.
- **Gerçek eşzamanlı çok-oturum** (map-reduce tarzı paralel tarayıcı kullanımı).
- **QA/test odaklı yüzey**: Gherkin `.feature` → CLI plan derleyici, `verify`, `wait-for`, `diff`,
  `perf` (performans metrikleri), `network-log`, `console-log`, CDP trace start/stop, `pdf`, `snapshot`.
- **Geliştirici yüzeyi**: playground, IDE eklentisi, `act browser` CLI'ı, pydantic şemalı yapılandırılmış
  çıkarım (`act_get` + `model_json_schema()`), `model_seed`/`temperature`/`top_k`.
- **Ticari zemin**: fiyatlandırma, kota/rate-limit hata sınıfları, resmi destek, AWS Service Card.

**Yalnızca Tepegöz'de olan:**

- Bir **tarayıcı** olmak: kendi sekme/pencere modeli, internal pages, eklenti barındırma, adblock,
  Safe Browsing (ADR-0043), sayfa çevirisi (ADR-0042), okuyucu, indirme güven modeli (ADR-0040),
  parola kasası, profiller, sertifika/bağlantı güvenliği UI'ı (ADR-0044).
- Sağlayıcı-agnostik model katmanı + yerel çıkarım seam'i + GGUF kataloğu.
- Model-öncesi deterministik PolicyKernel, TaintTracker, EgressFirewall, biyometrik kapılar,
  transaction-mandate.
- Notary (imzalı, taşınabilir, bağımsız doğrulanabilir replay receipt) — _paket yazılmış ve testli,
  ama `apps/desktop`'a bağlanmamış; bugün makbuz üretmiyor (ADR-0030)_ — + olay-kaynaklı journal.
- Model-free deterministik otomasyon şeridi (macro-engine + recipe-compiler) ve kayıtlı görevler.
- Per-paket EN+TR i18n parity, Türkçe-web benchmark şartı, kamu/e-Devlet güven modeli.
- Ajan belleği (ADR-0027), skill şablonları, Agent Console'un tüm son-kullanıcı UX'i.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

| #   | Boyut                                    | Nova Act                                                                                                                                                                              | Tepegöz                                                                                                                                                                      | Kim daha iyi + neden                                                                                                                 |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Dağıtım / form**                       | Python kütüphanesi + kapalı bulut hizmeti; Playwright ile ayrı Chrome açar veya CDP'ye bağlanır                                                                                       | Tam tarayıcı — kendi sekme modeli, pencere fabrikası, out-of-process CDP; ama tarayıcı değiştirmen gerek + yayında değil                                                     | **Amaca göre**: script yazan geliştirici için Nova Act, son kullanıcı için Tepegöz. Yapısal kontrol derinliğinde **Tepegöz**         |
| 2   | **Model seçimi**                         | **Tek model, seçim yok** ("The SDK only works with the Nova Act model"); yerel yok, Bedrock ikamesi yok                                                                               | 8 sağlayıcı + `local`, `CanonRequest` normalizasyonu, capability→tier router, BYO-key kasası                                                                                 | **Tepegöz** — ADR-0005'in tam olarak önlediği kilitlenme; Nova Act'te satıcı değiştirmek ürünü terk etmektir                         |
| 3   | **Model kalitesi (ekran aktüasyonu)**    | Amaca özel eğitilmiş act modeli; ScreenSpot/GroundUI Web iddiaları var ama **depodan doğrulanamıyor**                                                                                 | Genel amaçlı modeller + DOM-önce algı; ekran aktüasyon benchmark'ı yok                                                                                                       | **Muhtemelen Nova Act**, ama kanıtı repoda değil — dürüst cevap "bilinmiyor, Nova Act lehine sanı"                                   |
| 4   | **Sayfa algısı (bugün)**                 | Her adımda ekran görüntüsü + `simplifiedDOM` + bbox haritası; sabit attribute kümesi; ekran boyutuna hassas                                                                           | DOM/a11y-önce + diff/elision + article; vision atıl (bağlanmamış — `captureVision`'ı üretimde geçen çağıran yok)                                                             | **Bugün Nova Act** (çalışan, kanıtlı bir hat). **Mimaride Tepegöz** (ekran görüntüsü göndermeden okuyor)                             |
| 5   | **Algı ekonomisi + gizlilik**            | Her adım tam ekran görüntüsü sunucuya; API-key katmanında bu görüntüler **hizmet iyileştirme için toplanıyor** (Disclosure #4)                                                        | Değişen-only diff + unchanged elision + sanitizer; vision yalnız eskalasyon                                                                                                  | **Tepegöz** — hem token hem gizlilik ekseninde; Nova Act'in tasarımı "ekranda ne varsa gider"                                        |
| 6   | **Aksiyon repertuvarı**                  | **11 aksiyon**, `@final`, model eğitimine kilitli; sekme/indirme/dosya/pano aracı yok — Playwright'a düşersin                                                                         | ~30 araç: `browser_*`, `tab_*`, `web_*`, `file_*` (sandbox), `clipboard_*`, `download_*`, `upload_*`, `task_*`                                                               | **Tepegöz** genişlikte. Nova Act'in darlığı bilinçli bir güvenlik tercihi ama yeteneği de sınırlıyor                                 |
| 7   | **Araç çağırma disiplini**               | Yerel: `jsonschema` doğrulaması + tipli hata sınıfları. Politika kapısı yok; dış/MCP araçlarının çağrı kararı **kapalı sunucuda**                                                     | **Tek PEP**: lookup→idempotency→zod→PolicyKernel→HITL→execute→audit; builtin/MCP/eklenti ayrımsız                                                                            | **Tepegöz** — her araç istisnasız aynı denetim hattından geçiyor                                                                     |
| 8   | **İzin / otonomi modeli**                | `state_guardrail` deterministik **ama girdisi tek alan: URL**; `SecurityOptions` = 2 dosya-yolu listesi; gerisi modelde                                                               | Model-öncesi danger class + taint + site → allow/deny/ask + reason code + biyometrik; hassas site her seviyede sert deny                                                     | **Tepegöz** — belgedeki en büyük mimari fark; kararın yeri model değil kernel                                                        |
| 9   | **HITL / insan eskalasyonu**             | `human_Approve` + `human_UiTakeover` — **modelin çağırdığı araçlar**; varsayılan uygulama yok (yazmazsan HITL hiç yok); UI takeover ve onay UI'ını sen kurarsın                       | İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe (yanıt yok = deny), ticaret çift-onay, Human Handoff Controller                                            | **Tepegöz** — "onay gerekiyor mu" sorusunu modele sormuyor. Nova Act'in yaklaşımı esnek ama fail-open                                |
| 10  | **CAPTCHA / 2FA**                        | Çözmüyor; `ui_takeover` ile insana devrediyor (doğru tercih)                                                                                                                          | `detectHandoff` + Human Handoff Controller: kullanıcıya geri ver, çözme (ADR-0039 broker ile auto-clear)                                                                     | **Beraberlik, ilkede aynı** — Tepegöz'de tespit deterministik ve tarayıcıya gömülü, Nova Act'te modelin kararı                       |
| 11  | **Ajan döngüsü**                         | 30 adım varsayılan; planlama/sıkıştırma/döngü-tespiti **sunucuda ve görünmez**; uzun görev için "Python'da parçala"                                                                   | Planner→Executor→Reactor, tipli `Decision`, completion-evidence, navigation-grounding, cache-window                                                                          | **Bugün Nova Act** (çalışıyor, öngörülebilir). **Mimaride Tepegöz**, ama serileştirilmiş ve kanıtsız                                 |
| 12  | **Eşzamanlılık**                         | Çok örnek = gerçek paralel oturum; çok-thread destekli (çok-process değil)                                                                                                            | **Aynı anda tek run** (ADR-0013); paralel + checkpoint-resume roadmap'te                                                                                                     | **Nova Act** — net ve sevk edilmiş fark                                                                                              |
| 13  | **Doğrulanmış sonuç / yalan-başarı**     | `act_get` JSONSchema **biçim** doğrulaması; sayfanın iddiayı çürütmesini yakalayan mekanizma yok                                                                                      | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Unconfirmed/Contradicted + origin kapısı                                                          | **Tepegöz** — mekanizma seviyesinde belirgin fark (ölçüm borçlu)                                                                     |
| 14  | **Prompt-injection (mimari)**            | SDK'da **hiçbir savunma yok** (grep ile doğrulandı); README uyarısı "ajanı izleyin"; sunucudaki RAI guardrails kapalı                                                                 | Pre-model Policy Kernel + `sanitizeText`/`wrapUntrustedContent` + TaintTracker + EgressFirewall (Shannon entropi)                                                            | **Tepegöz** — açık ara; Nova Act savunmayı kullanıcıya devretmiş                                                                     |
| 15  | **Prompt-injection (kanıt bugün)**       | Yayınlanmış korpus/ASR sayısı yok; sunucu tarafı doğrulanamıyor                                                                                                                       | Redteam + injection-corpus var, claim-grade ASR bataryası **measurement-owed**                                                                                               | **Kimse kazanmıyor** — Tepegöz'ün mekanizması görünür, ikisinin de sayısı yok                                                        |
| 16  | **Operasyonel gözlemlenebilirlik**       | Act-başı **kendi kendine yeten HTML iz** (bbox çizili ekran görüntüleri + araç sonuçları), `_traces.json`, video, `Trajectory` serileştirme, S3Writer, CloudWatch+OTEL, `time_worked` | Replay timeline UI + olay-kaynaklı journal + `journal_search_events`                                                                                                         | **Nova Act** — sevk edilmiş, zengin, "ne oldu" sorusuna bugün cevap veriyor                                                          |
| 17  | **Kriptografik hesap verebilirlik**      | Yok — izler imzasız, doğrulanabilir değil                                                                                                                                             | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI — **yazılmış ve testli, ama `apps/desktop`'a bağlanmamış** | **Mimaride Tepegöz** — Nova Act'te kavram olarak bile eşi yok. **Bugün hiç kimse** — Nova Act'inki imzasız, Tepegöz'ünki üretilmiyor |
| 18  | **Sır / kimlik bilgisi işleme**          | "Şifreyi modele verme, Playwright ile yaz" (doğru) — **ama ekranda görünüyorsa ekran görüntüsüyle sunucuya gider**; anahtar env değişkeni + 0600 dosya, OS anahtarlığı yok            | Credential Broker (sırrın gireceği şekil yok, OS-auth olmadan reddeder — **atıl**) + DPAPI/safeStorage kasa + egress entropi denetimi                                        | **Kavramsal Tepegöz**, ama broker atıl → **bugün ikisi de eksik**; Nova Act'inki çalışıyor ama kanalı kapatmıyor                     |
| 19  | **Oturum kalıcılığı**                    | 4 seçenek (yerel JSON 0600 şifresiz / S3 SSE-KMS / AgentCore profilleri / Chromium profili), OWASP atıflı dürüst risk tablosu                                                         | Tarayıcının kendi profil/oturum modeli + profiller paketi                                                                                                                    | **Nova Act** — bu spesifik problemi daha olgun ve daha açık belgelenmiş şekilde çözmüş                                               |
| 20  | **Çevrimdışı / egemenlik**               | **Yapısal olarak imkânsız** — her adım Amazon'a gider; hizmet yalnız us-east-1; API-key katmanında ekran görüntüleri toplanıyor                                                       | `local-inference` seam + sha256'lı model kataloğu + "basit adımlar cihazda"; RAG yok, S12 ağırlıklara takılı                                                                 | **Tepegöz** — olgunlukta değil, _mümkünlükte_ kazanıyor; KVKK'lı bir iş akışı için fark belirleyici                                  |
| 21  | **Deterministik (model-free) otomasyon** | Yok; `model_seed`/`temperature` + `replayable` trajectory (kaydet-incele, yeniden oynatma değil)                                                                                      | `macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme) + `recipe-compiler` (imzalı, oracle'lı, kendini iyileştiren seçici)                                             | **Tepegöz** — her koşuda modele para ödemeden çalışan bir şerit var                                                                  |
| 22  | **İş akışı tanım stili**                 | NL adımlar + **Python kontrol akışı**; `Workflow` context manager / `@workflow` dekoratörü; Gherkin→plan derleyici                                                                    | Planner'ın ürettiği DAG + plan önizleme + kayıtlı görevler + tarifler                                                                                                        | **Nova Act** — bugün üretimde iş akışı yazmak için daha dürüst ve daha anlaşılır bir model                                           |
| 23  | **MCP**                                  | İstemci, ama Strands üzerinden dolaylı; şemalar sunucuya gider, **çağrı kararı kapalı modelde**; sunucu yüzeyi yok                                                                    | İstemci (ADR-0018); dış araçlar CapabilityRegistry'ye girip **aynı PEP'ten** geçer; sunucu yüzeyi yok                                                                        | **Tepegöz** — aynı yön, ama dış araç yerel politikadan geçiyor                                                                       |
| 24  | **Site adaptörleri**                     | Yok — sitenin tuhaflığını prompt'a sen yazarsın                                                                                                                                       | Yok (Phase 2 adaptörleri içerik/güvenlik tarafında)                                                                                                                          | **Beraberlik** — ikisi de yapmıyor                                                                                                   |
| 25  | **Türkçe / bölgesel**                    | _"Nova Act supports English."_ — kaynakta i18n **yok**; hizmet us-east-1                                                                                                              | Parity-zorunlu EN+TR i18n (ADR-0016), TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli                                                                            | **Tepegöz** — rekabet yok                                                                                                            |
| 26  | **Ölçüm / dürüstlük**                    | Known Limitations net, CLI güvenlik notları alışılmadık derecede açık; ama **depoda test yok**, benchmark'lar blog'a havale                                                           | Ground-truth eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                    | **Tepegöz** ölçüm altyapısında; **Nova Act** kullanıcıya risk anlatmada sağlam                                                       |
| 27  | **"Bugün çalışıyor mu"**                 | Evet — GA AWS hizmeti, fiyatlandırma, playground, IDE eklentisi, gerçek müşteriler                                                                                                    | Kısmen — iskelet bağlı, tüm S-fazları 🟠, 3 yetenek atıl, tek run, adaptör yok                                                                                               | **Nova Act** — kesin                                                                                                                 |

---

## Sonuç

**Bugün "çalışıyor mu" ekseninde Nova Act kazanıyor, ve tartışmasız:** GA bir AWS hizmeti, fiyatlandırması
ve destek kanalı olan, ekran aktüasyonu için özel eğitilmiş bir modeli, gerçek paralel oturumları,
sevk edilmiş bir gözlemlenebilirlik zinciri (HTML iz + video + trajectory + CloudWatch), 41 komutluk bir
tarayıcı CLI'ı, IDE eklentisi ve playground'ı var. Aksiyon setini 11'e indirip `@final` yapması ve
"30 adımı geçme, görevi Python'da parçala" demesi bir eksiklik değil, ölçekte güvenilirlik için verilmiş
bilinçli bir karar — ve o karar işe yaramış görünüyor. Tepegöz'ün bu eksende Nova Act'e söyleyecek bir
sözü yok: tüm S-fazları 🟠, vision/credential-broker/memory atıl sevk ediliyor, Notary hiç
bağlanmamış, aynı anda tek run çalışıyor, ajan sahibinin kendi ifadesiyle "hâlâ istediği gibi çalışmıyor".

**Mimari ve yapılan bahis ekseninde Tepegöz kazanıyor, ve bu belgedeki en net çizgi budur.** Nova Act'te
"bu bir para işlemi mi, insana sorayım mı" sorusunun cevabı **modeldedir** (`human_Approve`'u model
çağırır, hem de sen geri-çağrıyı yazdıysan); Tepegöz'de **kernel'dedir** ve hassas sitelerde otonomi
seviyesinden bağımsız serttir. Nova Act'te prompt-injection savunması SDK'da **yoktur** — README
"ajanı izleyin" diyor; Tepegöz'de pre-model kernel + taint + sanitizer + egress firewall vardır (henüz
ölçülmemiş olsa da). Nova Act'te modelin ne yaptığının kanıtı satıcının imzasız HTML dosyasıdır;
Tepegöz'ün cevabı Ed25519 imzalı, taşınabilir, bağımsız doğrulanabilir bir Replay Receipt olacak —
**ama bu eksende üstünlük bugün yalnızca niyettir**: Notary kütüphanesi yazılmış ve test edilmiş,
uygulamaya hiç bağlanmamış, ve ADR-0030 bunu itiraf ediyor. Ve en yapısal
fark: Nova Act **çevrimdışı çalışamaz, model değiştirilemez, veri us-east-1'e gider ve API-key
katmanında ekran görüntüleri hizmet iyileştirmesi için toplanır** — bu bir olgunluk eksiği değil,
ürünün tanımıdır. Tepegöz'ün yerel yolu bugün zayıftır ama vardır; Nova Act'inki yoktur ve olamaz.
Türkçe tarafında rekabet dahi yok: Nova Act İngilizce destekler, kaynakta i18n yoktur.

**Dürüst özet:** Nova Act bugün daha iyi çalışan ajandır ve bunu tek satıcıya, tek modele, bir buluta ve
her adımda ekran görüntüsü göndermeye kilitlenerek satın almıştır; Tepegöz o kilidin hiçbirini kabul
etmeyen bir mimari kurmuş ama henüz çalıştığını kanıtlamamıştır. Ölçekte, üretimde, İngilizce UI iş
akışları koşturacak bir geliştirici ekibiysen → **Nova Act**. Tez "kendi makinemde, seçtiğim modelle,
ekranımı kimseye göndermeden, oturum-açık banka sekmemin yanında güvenle çalışan, ne yaptığının
kriptografik kanıtını üreten, Türkçe bir ajan" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta.
