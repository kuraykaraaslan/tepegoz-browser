# Tepegöz vs OpenAI CUA Sample App — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **OpenAI CUA Sample App** (OpenAI'ın kendi yayımladığı,
> MIT lisanslı `gpt-5.4` computer-use örnek uygulaması; TypeScript monorepo, Next.js operatör konsolu +
> Fastify runner) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir
> karşılaştırma.
>
> **Yöntem.** `.junk/openai-cua-sample` deposunun (`README.md`, `docs/architecture.md`,
> `docs/scenarios.md`, `docs/contributing.md`, `package.json` + `pnpm-workspace.yaml`, `.env.example`,
> `packages/runner-core/src/responses-loop.ts` — deponun kendi ifadesiyle "canonical" Responses API
> entegrasyonu —, `runner-manager.ts`, `scenario-runtime.ts`, `executor-registry.ts`, `booking-plan.ts`,
> `kanban-plan.ts`, `workspace-lab-server.ts`, `scenarios/booking.ts`, `packages/replay-schema/src/index.ts`,
> `packages/browser-runtime/src/index.ts`, `packages/scenario-kit/src/scenarios.ts`,
> `apps/runner/src/server.ts`, `apps/demo-web/app/ui/operator-console/*`, `labs/*`, tüm test dosyaları)
> ve bu reponun AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|
capability-plane|security-policy|agent-runtime|browser-tools|tool-executor|web-tools|local-inference|
model-catalog|mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input|agent-eval`,
> `extensions/ext-agent`, `docs/adr/0005|0006|0007|0008|0013|0018|0025|0026|0029|0030|0039`) aynı oturumda
> okunmasından çıkarıldı. İddialar rakibin pazarlama metninden değil, kaynaktan alındı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **Kategori uyarısı.** Bunlar **farklı kategoriler**. OpenAI CUA Sample App bir **ürün değil, satıcı
> örnek uygulamasıdır**: kapalı bir computer-use modelinin (`gpt-5.4` + Responses API `computer` aracı)
> nasıl entegre edileceğini gösteren referans implementasyon. Üç **sentetik yerel lab** (kanban / paint /
> booking) üzerinde koşar, gerçek internete hiç çıkmaz, `0.0.0` sürümlü ve `private` paketlerden oluşur,
> dağıtılan bir binary'si yoktur. README'si bunu açıkça söyler: _"The public scenarios are local labs
> designed for deterministic verification. They are not intended as proofs of general web autonomy."_
> Tepegöz ise sevk edilmek üzere yazılan tam bir tarayıcı + ajan. Dolayısıyla "hangisi daha iyi bir ürün"
> sorusu anlamsız; anlamlı olan **hangi mimari bahsin daha iyi olduğu**. Bu belge üç eksende derinleşir:
> (a) **vision/koordinat CUA paradigması vs Tepegöz'ün DOM/a11y-önce algısı** (ADR-0008) — asıl kontrast;
> (b) **model-İÇİ `pending_safety_checks` vs model-ÖNCESİ deterministik PolicyKernel** (ADR-0006) —
> güvenliğin modelin içinde mi önünde mi durduğu; (c) **replay bundle + operatör konsolu vs Notary'nin
> imzalı Replay Receipt'i + `tepegoz-verify`**. Örtüşmeyenler ayrı başlıkta.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | OpenAI CUA Sample App                                                                                                                                                                                                                                                | Tepegöz                                                                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | **Satıcı örnek uygulaması**: Next.js operatör konsolu + Fastify runner + Playwright; `gpt-5.4` computer-use referans entegrasyonu                                                                                                                                    | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                  |
| Birincil iş | Kapalı bir CUA modelinin **nasıl bağlanacağını göstermek**: `computer` aracı ile piksel-koordinat sürüşü, ya da `exec_js` ile Playwright REPL — üç sentetik lab üzerinde                                                                                             | Gerçek web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; oturum-açık site otomasyonunu güvenli kılmak                       |
| Olgunluk    | **Referans olarak olgun** (temiz, tipli, testli, çalışır); **ürün olarak yok** — `0.0.0`, private paketler, üç yerel lab, gerçek web hedefi yok, README "Do not point this sample at authenticated, financial, medical, or otherwise high-stakes environments" diyor | **1.0 öncesi**; roadmap'in kendi ifadesi ajanın "gerçekten bağlanmış iskelet, ince ölçülmüş" olduğu, sahip notu _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Strict TS, pnpm workspace, 4 paket + 2 app, ~4-5k satır, sınırlarda zod (`replay-schema`), ~27 test                                                                                                                                                                  | Strict TS, pnpm+turbo monorepo, ~70 paket, ADR güdümlü, her güven sınırında zod `safeParse`                                                        |
| Felsefe     | "Tek kanonik yerden Responses API'yi göster"; güvenlik **modele ve satıcı API'sine devredilmiş**, harness'ta politika motoru yok                                                                                                                                     | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + sağlayıcı-agnostisizm + kriptografik hesap verebilirlik                   |

Yani: **kapalı, tek-satıcılı bir frontier CUA modelinin en temiz vitrin kablosu** vs. **sağlayıcı-agnostik,
güvenlik-önce, henüz kanıtlanmamış bir native-tarayıcı ajanı**. Bunlar aynı yarışta değil. Kıyaslanabilir
olan şey şu: aynı işi (bir tarayıcıyı bir modele sürdürmek) iki taraf hangi mimariyle yapıyor, ve o
mimarilerin hangisi gerçek web'de, gerçek hesapla, gerçek parayla ayakta kalacak biçimde kurulmuş.

---

## Derinlemesine: iş iş kim ne yapıyor

### Algı: vision/koordinat vs DOM/a11y — asıl kontrast

CUA Sample'ın `native` modu **saf vision + koordinat**tır. Döngü her turda tam sayfa PNG'sini base64
data-URL olarak modele yollar (`capturePageImageDataUrl`, `detail: "original"`), model de sabit
**1440×900** viewport'a karşı **ham piksel koordinatları** üretir; `executeComputerAction` bunları
doğrudan `page.mouse.click(x, y)` / `page.mouse.move` / `page.mouse.wheel` çağrılarına çevirir. Her
`computer_call` çıktısı yeni bir screenshot'tur — yani **her adımda görüntü**. Sayfanın yapısına dair
harness'ın hiçbir bilgisi yoktur: DOM yok, erişilebilirlik ağacı yok, element ref'i yok, seçici yok.
Konum bilgisinin tek kaynağı modelin gözüdür.

`code` modu bunun tam tersi uca gider ama arada bir katman yine yoktur: model `exec_js` ile **kendi
Playwright kodunu yazar** ve `page`/`context`/`browser` tutamaçlarına doğrudan erişir. Yani sayfayı
okumanın yolu, modelin o an uydurduğu bir `page.locator(...)` ifadesidir. Ne yapılandırılmış bir algı
katmanı, ne de token ekonomisi vardır; sıkıştırmanın tamamı Responses API'nin `truncation: "auto"`
ayarına devredilmiştir.

Tepegöz'ün bahsi bunun karşıtıdır: **DOM/a11y-önce algı** (ADR-0008 — "Perception is tiered: DOM +
accessibility tree first … vision only as a fallback … not every step"), kimlik-kararlı ref'ler,
diff/dedupe/elision ile token kesme, `aria-labelledby`/`label[for]` çözümü, `browser_get_article`. Ayrıca
`@tepegoz/tool-executor` gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini modele girmeden önce ayrı
bir pakette temizler — CUA Sample'da bunun karşılığı **hiç yoktur**, çünkü modele giden şey zaten bir
resimdir.

Tepegöz'ün vision katmanının bugünkü hali de dürüstçe söylenmeli. Karar mekanizması **gerçekten var**:
`packages/orchestrator/src/vision-trigger.ts` dört deterministik tetikleyici tanımlıyor (`canvas_dominant`,
`blind_page`, `persistent_occlusion`, `repeated_action_failure`) ve modülün başlığı _"Nothing here captures
an image; this module only decides"_ diyor; tek çağrı yeri `reactor.ts`, yorumuyla birlikte: _"Fallback-ONLY:
… An ordinary step has no path to a screenshot."_ Bütçe/küçültme/set-of-marks makinesi de
`packages/screenshots/src/vision-*.ts` altında duruyor. Ama **görüntüyü yakalayan taraf üretimde hiç
bağlanmamış**: `captureVision` enjekte edilen opsiyonel bir callback ve onu sağlayan tek yer bir test
dosyası. Yani vision atıldır — bir bayrak kapalı olduğu için değil, **kimse kabloyu takmadığı için**.

**Kim daha iyi:** Bu bir paradigma tercihi ve dürüst cevap "duruma göre"dir. Vision-koordinat **daha
geneldir** (canvas, `paint` labı gibi DOM'u anlamsız olan yüzeyler, shadow DOM, iframe, hatta native
uygulama) ve DOM çürümesine karşı bağışıktır. Tepegöz'ün yaklaşımı temiz DOM'da daha ucuz, daha hızlı ve
daha kesindir; ayrıca _sanitize edilebilir_ bir giriş yüzeyi verir — bir screenshot'ı sanitize edemezsiniz.
**Ama Tepegöz bunu ölçmedi.** CUA Sample tarafında ise paradigma bir modele bağlanmış ve o model gerçekten
var, gerçekten koordinat üretiyor. Mimari olarak Tepegöz, bugün çalışan koordinat sürüşünde CUA.

### Model / sağlayıcı desteği — Tepegöz, tek taraflı

CUA Sample'da **sağlayıcı soyutlaması yoktur**. `responses-loop.ts` doğrudan `new OpenAI({ apiKey })`
kurar; `OPENAI_API_KEY` yoksa çalışma `missing_api_key` / `live_mode_unavailable` ile başarısız olur.
Yapılandırılabilir olan şeyleri **somut sayarsak**: model adı (string; `CUA_DEFAULT_MODEL`, varsayılan
`gpt-5.4`), tur bütçesi (`maxResponseTurns`, 4–50, varsayılan 24), mod (`code`/`native`), tarayıcı
(`headless`/`headful`), doğrulama açık/kapalı, ve `CUA_RESPONSES_MODE` (`auto`/`fallback`/`live`).
Toplam **altı**. Bunun dışında her şey sabittir: `reasoning: { effort: "low" }` iki döngüde de
**hard-coded**, `parallel_tool_calls: false` sabit, `truncation: "auto"` sabit, sıcaklık/top-p yok,
yerel model yok, fallback sağlayıcı yok, maliyet tavanı yok (yalnız `describeUsage` ile token sayısı
loglanır).

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, `responseFormat:'json'`'da GBNF gramer zorlaması). Hepsi tek
`CanonRequest`/`CanonResponse` şemasına normalize; `ModelGateway.complete()` her çağrıda **`maxTokens` ve
`timeoutMs` zorunlu** kılar (kaynakta doğrulandı — ikisi de tamsayı ve pozitif olmak zorunda, değilse
reddediliyor); `ModelRouter` yeteneği (plan/exec/classify) tier + effort'a eşler (planlama `xhigh`'a
gider); 5 effort seviyesi (`low|medium|high|xhigh|max`); `TokenLedger`; DPAPI/safeStorage'lı BYO-key kasası.
Dürüstlük payı: adaptörlerden yalnız **Anthropic** resmi SDK kullanıyor; OpenAI, Gemini, Kimi, Nova ve
DeepSeek/xAI/Groq (ortak `OpenAICompatibleProvider` üzerinden) **ham REST**'tir — merkezî axios seam'i
(`@tepegoz/http`) üzerinden, satıcı SDK'sı olmadan. Bunlardan yalnız üçü (anthropic/openai/gemini) native
tool-calling destekliyor. Buna karşılık **hiçbiri atıl stub değil**: sekizi de
`agent-runtime-providers.ts`'te örnekleniyor ve `RUNNABLE_AI_PROVIDERS` listesinde. `local` bu listenin
dışında — anahtarsız yol olduğu için bilerek ayrı; ve S12'nin yerel-tier sahiplik tablosu **boş**,
indirilmiş ağırlıklara takılı.

**Kim daha iyi:** **Tepegöz**, kıyas kabul etmez. CUA Sample tek bir satıcının tek bir modeline
kablolanmıştır — bu bir kusur değil, örneğin _amacı_ odur; ama karşılaştırma ekseninde sonuç değişmiyor.

### Aksiyon repertuvarı — CUA dar ve ham, Tepegöz geniş ve tipli

CUA `native` modunda **9 aksiyon tipi** vardır ve hepsi koordinat/klavye seviyesindedir: `click`,
`double_click`, `drag` (nokta dizisi), `move`, `scroll`, `type`, `keypress`, `wait`, `screenshot`.
Tanınmayan bir tip `Unsupported computer action` ile atılır. Sekme yönetimi yok, indirme/yükleme yok,
pano yok, dosya sistemi yok, arama yok, gezinme aracı yok (URL'ye gitmek için ya adres çubuğuna koordinatla
tıklamak ya da `exec_js` gerekir). `code` modunda ise araç sayısı **tek**tir — `exec_js` — ama gücü
sınırsızdır: modelin yazdığı JavaScript, runner'ın Node süreci içinde gerçek `browser`/`context`/`page`
tutamaçlarıyla çalışır.

Tepegöz'de **~49 built-in araç, 10 aile** var (kaynakta `CapabilityRegistry.register(` çağrıları sayıldı:
browser-tools 11, file-operations 14, tab-engine 5, tasks 5, downloads 4, uploads 4, clipboard 2, web-tools 2,
journal-tools 1, screenshots 1, artı MCP'nin dinamik geçişi) ve hepsi **tek kapıdan** (ToolGateway PEP) geçer:
lookup → idempotency → zod doğrulama → PolicyKernel → HITL → execute → audit. Registry ad şemasını
(`{domain}_{verb}_{noun}`) zorlar ve **eksik ya da fazla müsamahakâr bir validator'ı reddeder** (çöp-prob
testiyle).

Kod çalıştırma tarafında ise iki taraf arasındaki fark bir "var/yok" değil, bir **kapsam** farkıdır — ve bu
Tepegöz lehinedir ama mutlak değildir. ADR-0026, önerilen izole-dünya sandbox'ını **ölçümle çürüttü**
("recorded as a NO-GO" — izole dünya bir JS-principal sınırıdır, ağ sınırı değil). Sevk edilen şey bunun
yerine dar bir araçtır: `browser_analyze_page` (`capability: 'code_exec_read'`), sayfanın **bir kopyası**
üzerinde küçük bir JavaScript ifadesi çalıştırıp sonucu döndürür — kopya gizli bir pencerede, oturum
seviyesinde istek iptali ve `default-src 'none'` CSP altında, HTML `innerHTML` ile taşınıp asla
yüklenmeden. Sandbox yoksa **araç hiç kayıt olmaz**. `code_exec_write` bir sınıf olarak vardır ve
**koşulsuz reddedilir**. Yani: canlı sayfada `execute_js` yok, ağa çıkabilen kod yok, yazma yok — ama
"kod çalıştırma hiç yok" demek de yanlış olur; ve ADR'nin kendi ifadesiyle adversaryal batarya koşana dek
**RISK GATE duruyor**. ADR-0029 ayrıca DevTools'u kullanıcı-only ilan eder, asla ajan aracı değil.

**Kim daha iyi:** Ham *genellik*te `exec_js` her şeyi yener — bir tek araçla tarayıcının tamamına erişir.
Ama tam da bu yüzden **denetlenemez**: argümanı serbest JavaScript olan bir aracı politika ile
sınıflandıramazsınız, ve CUA'nınki gerçek `page` tutamacıyla canlı oturumda koşar. Tepegöz'ün tipli, dar,
argümanı zod'lanmış araç seti ve salt-okunur kopya-sandbox'ı güvenlik ekseninde belirgin biçimde üstün;
CUA'nın seti bir laboratuvar için yeterli, bir kullanıcı hesabı için değil.

### Ajan döngüsü / orkestrasyon — CUA basit, Tepegöz yapılandırılmış (ama dayanıksız)

CUA'nın döngüsü **düz bir `for`**'dur: `for (turn = 1; turn <= maxResponseTurns; turn++)` → Responses API
çağır → çıktıda tool-call var mı → varsa çalıştır, sonucu geri besle → yoksa son mesajı al ve çık. Plan
yok, planlayıcı yok, replan yok, retry yok, döngü dedektörü yok, kendini düzeltme yok. Bütçe tükenirse
`… exhausted the configured 24-turn budget without producing a final assistant message` diye **sert hata**
atılır. Konuşma durumu `previous_response_id` ile **sunucu tarafında** tutulur; harness'ta mesaj listesi
bile yoktur. Bir seferde **tek çalışma** (`run_already_active`, HTTP 409).

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`), `CompletionEvidence`, navigation-grounding, vision-trigger,
cache-window (lag-2 breakpoint), iki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe (yanıt
yok = deny). Eşzamanlılıkta Tepegöz bir adım önde ama tam değil: kod artık **sekme-grubu başına bir run**
tutuyor (`ipc-agent-run.ts`: _"ONE run per tab group, not one per process"_ — her run kendi çalışma sekmesini,
CDP bağlantısını, girdi adaptörünü, token ledger'ını ve olay kanalını taşıdığı için süreç-geneli kapı
kaldırılmış), oysa ADR-0013 hâlâ "süreç başına tek run" yazıyor ve onu geçersiz kılan bir ADR yok — yani
**belge kodun gerisinde**. Dayanıklı checkpoint/resume ise **yok**: `AgentRunCheckpoint`, faz makinesi ve
`resumeCheckpoint()` gerçek kod, checkpoint'ler `CheckpointWritten` olarak journal'a yazılıyor — ama hiçbir
yer onları **geri okumuyor**. Yani çökme sonrası kaldığı yerden devam etmek mümkün değil; çalışma-içi
pause/resume çalışıyor.

**Kim daha iyi:** **Tepegöz**, mimari olarak — tipli kararlar, replan, kanıt kapısı, insan onayı, ve
grup-başı eşzamanlılık. CUA'nın döngüsü kasıtlı olarak minimaldir (öğretici olmak istiyor) ve bunu iyi
yapar; ama bir görev başarısız olduğunda yapabileceği tek şey turu yakmaktır. Dayanıklı resume ekseninde
**hiçbiri** yok.

### Context yönetimi — ikisi de zayıf, farklı sebeplerle

CUA'da context yönetimi **tamamen satıcıya devredilmiştir**: `previous_response_id` zinciri + `truncation:
"auto"`. Harness ne mesaj sayar, ne sıkıştırır, ne özetler, ne de görüntü budar — üstelik `native` modda her
turda tam çözünürlüklü bir PNG ekler. Kırpma gördüğümüz tek yer **event log'udur**
(`formatActionBatchDetail` 2.000 karakterde keser) ve o modele hiç gitmez. Araç çıktısı için 20 saniyelik
bir yürütme zaman aşımı var, ama çıktı **boyutu** için tavan yok.

Tepegöz: değişen-only diff + unchanged elision, cache-window (lag-2 breakpoint), `TokenLedger`, çağrı
başına zorunlu `maxTokens`. Yani tasarımda daha agresif token kesiyor — **ama bu ölçülmedi.**

**Kim daha iyi:** **Tepegöz, tasarımda.** CUA'nınki bir strateji değil, bir devretmedir; frontier bir modelde
işe yarar ama harness'a hiçbir kontrol bırakmaz — ve maliyeti görünmez kılar.

### Güvenlik: `pending_safety_checks` vs model-öncesi PolicyKernel — en derin fark

Bu ekseni ayrıntısıyla açmaya değer, çünkü iki tarafın **güvenliği nereye koyduğu** burada görünür.

**CUA tarafı: güvenlik modelin içinde, harness'ta post-hoc bir çıkış.** OpenAI'ın computer-use API'si
riskli görünen bir aksiyondan önce `computer_call` çıktısına `pending_safety_checks` iliştirir; sözleşme
gereği istemcinin bunu operatöre göstermesi, onay alması ve `acknowledged_safety_checks` ile geri
göndermesi beklenir. **Bu örnek uygulama bunu uygulamıyor.** `buildComputerCallOutput` içinde:

```ts
const pendingSafetyChecks = computerCall.pending_safety_checks ?? [];
if (pendingSafetyChecks.length > 0) {
  … emitEvent({ level: "warn", … })
  throw new RunnerCoreError(
    "Pending computer use safety checks require explicit operator acknowledgement, which is not implemented in this harness yet.",
    { code: "unsupported_safety_acknowledgement", … },
  );
}
```

README bunu dürüstçe kabul ediyor: _"Pending computer-use safety acknowledgements are not implemented in
this sample yet. Runs fail with the stable code `unsupported_safety_acknowledgement`."_ Konsolda bu kod
"Safety acknowledgement unavailable" başlığına eşleniyor ve bir test onu sabitliyor.

Ama asıl mesele bu eksiklik değil — **sıralamadır**. `runResponsesNativeComputerLoop` içinde:

```ts
const actions = outputItem.actions ?? [];
…
for (const action of actions) {
  await executeComputerAction(input, action);      // ← aksiyonlar ZATEN çalıştı
}
…
toolOutputs.push(await buildComputerCallOutput(input, outputItem, …));  // ← güvenlik kontrolü BURADA
```

Yani güvenlik kapısı, o batch'in tıklamaları/yazmaları **tarayıcıda gerçekleştikten sonra** açılıyor.
Örnek uygulama bir safety-check gördüğünde çalışmayı durdurabilir, ama **o adımı engelleyemez** —
"onay bekleyen" aksiyon çoktan uygulanmıştır. Bu, harness'ın hatasından çok paradigmanın doğal sonucudur:
harness modelin ne yapacağını **anlamadığı** için (elinde yalnız `{type:"click", x:412, y:318}` var, hangi
elemana, hangi origin'de, ne amaçla tıklandığı bilgisi yok), riski _kendisi_ sınıflandıramaz; yalnızca
modelin/satıcının söylediğini bekleyebilir. Ve bu eksende harness'ta **başka hiçbir şey yoktur**: izin
modeli yok, origin kapısı yok, tehlike sınıfı yok, otonomi seviyesi yok, araç-başı onay yok, hassas-site
listesi yok, egress denetimi yok, taint yok, prompt-injection savunması yok. Depo genelinde `sanitize`
yalnızca dosya adı temizlemede, `untrusted` hiç geçmiyor. Enjeksiyona karşı tek "savunma" sistem
prompt'undaki bir cümledir: _"Use only the operator prompt as the source of truth."_ Bu bir cümle, bir
kontrol değil. Operatörün çalışma başladıktan sonraki tek kontrolü **Stop** düğmesidir.

**Tepegöz tarafı: güvenlik modelin önünde, deterministik kod olarak.** ADR-0006 tam da bunun karşıtı bir
bahis: _"Security is enforced by a deterministic Policy Kernel that runs BEFORE the model, not by model
guardrails."_ Araç çağrıları `read`/`state_changing`/`destructive`/`financial` olarak **beyan edilir**, sonra
main süreçte argümanları ve hedefi görülerek altı **türetilmiş risk tier**'ına (`read`/`ui-write`/
`data-egress`/`financial`/`credential`/`destructive`) sınıflandırılır — beyan edilen sınıf yalnızca
**taban**dır, kural onu ancak yükseltebilir; böylece sınıfı hakkında yalan söyleyen bir araç yine davranışına
göre sınıflanır. Web'den gelen veri **tainted**'dır; tainted + state-changing → zorunlu HITL; yüksek risk →
biyometrik (Windows Hello). `EgressFirewall` (`inspectEgress`, Shannon entropisi ile sır/yüksek-entropi blob
sızıntı denetimi) çıkışı denetler. Hassas site kategorileri (banking/government/crypto/password-manager/
health) varsayılan olarak kapalı gelir; ADR-0039 bunu mutlak deny'dan kategori-başı **kullanıcı grant**'ına
çevirdi, ama değişmeyen değişmez şudur ve ADR bunu birebir yazıyor: **otonomi bir `deny`'ı asla
çeviremez** — yalnızca bant-dışı bir kullanıcı grant'ı çevirebilir ve **ajan bir grant üretemez**. Plan
onayı bir grant üretir ama üç eksende dar (kayıtlanabilir alan adı / planın gerçekten içerdiği tier'lar /
`runId`) ve `financial`/`credential`/`destructive`'i **asla** kapsayamaz.

Aynı ADR ayrıca **kendi düzelttiği bir açığı kayda geçiriyor**: bir dönem otonomi cevabı renderer'da
veriliyordu (`autoApprovesTool`), yani bozulmuş bir renderer kendi `financial`/`credential`/`destructive`
çağrılarını onaylayabilirdi. Kural şimdi açıkça yazılı: renderer bir onayı **gösterebilir** ve bir insanın
tıklamasını **iletebilir**, ama asla **karar veremez**.

**Kim daha iyi:** **Tepegöz**, ve fark kozmetik değil kategoriktir. CUA Sample'ın modeli şudur: _riski model
bilir, harness sorar_. Tepegöz'ünki: _riski deterministik kod bilir, model hiç sorulmadan durdurulur_. Birincisi
modelin doğru sınıflandırmasına ve satıcının API'sinin doğru zamanda bayrak kaldırmasına bağımlıdır; üstelik
bu örnekte kapı aksiyondan **sonra** çalışır. İkincisi modelden bağımsızdır.

Dürüst pay, iki yönlü. Olumlu yönde: bu katman Notary'nin aksine **gerçekten bağlı**. `PolicyKernel` çağrı
yolundadır, `EgressFirewall` `ModelGateway.setEgressInspector(inspectEgress, …)` ile takılıdır ve gateway
her çağrıda uygular, `TaintTracker` run başına örneklenir. Olumsuz yönde: her biri kendi sınırını yazıyor —
`TaintTracker` başlığı kendini _"v1 data-flow heuristic"_ diye tanımlıyor (bir argüman, kaydedilmiş
güvenilmez içeriğin içinde birebir geçen ≥12 karakterlik bir dilim taşıyorsa tainted sayılıyor; hassas
per-değer yayılımı sonraki faza bırakılmış), `EgressFirewall` _"TypeScript v1 — moves to Rust in Phase 1b"_
diyor. Ve en önemlisi: **claim-grade bir ASR (attack success rate) bataryası hâlâ borçlu** — 24 adversaryal
senaryo yazılmış ama canlı ölçülmemiş; credential-broker gibi bazı yetenekler atıl sevk ediliyor. Yani
Tepegöz'ün üstünlüğü bugün mimaridedir, kanıtta değil. Ama CUA Sample tarafında kıyaslanacak bir mimari
**hiç yok**.

### Doğrulanmış sonuç / "yalan başarı" savunması — ilginç biçimde ikisi de ciddiye almış

CUA Sample'ın en güçlü tarafı burası. Her senaryonun bir **verifier**'ı var ve bunlar modelin transkriptine
değil, **son lab durumuna** bakıyor (`docs/scenarios.md`: _"Verification is the same either way because it
reads the final lab state, not the agent transcript."_). Booking için `assertBookingOutcome` operatör
prompt'unu parse edip beklenen kaydı üretiyor, sonra lab'ın açtığı `__bookingReadConfirmation` /
`__bookingReadFilters` erişimcilerinden gerçek durumu okuyup **alan alan** karşılaştırıyor (otel, misafir,
e-posta, tarihler, özel istek), uygulanan filtreleri ayrıca doğruluyor, ve durum çipinin metninin tam olarak
`"Reservation recorded"` olmasını şart koşuyor. Paint labında kaydedilen checksum ile canlı canvas checksum'ı
karşılaştırılıyor ve boş sonuç reddediliyor. Bu, "model başardım dedi" ile yetinmeyen gerçek bir oracle.

İki ciddi kayıt düşmek gerekiyor. Birincisi: **varsayılan olarak kapalı.** `runner-manager.ts`
`verificationEnabled: request.verificationEnabled ?? false` diyor ve konsoldaki yardım metni bunu itiraf
ediyor: _"Leave this off to treat the model's completed action loop as the success condition."_ Yani kutu
işaretlenmezse başarı ölçütü yine modelin durmasıdır. İkincisi: bu doğrulama **yalnız laboratuvarda
çalışır**, çünkü lab kendisi doğrulanmak için yazılmıştır (`window.__bookingReadConfirmation = …`). Gerçek
bir otel sitesinde böyle bir erişimci yoktur. README bunu zaten söylüyor.

Tepegöz'ün S4'ü aynı problemi **lab'sız** çözmeye çalışıyor: `CompletionEvidence` + deterministik düşürme
(model, sayfanın çürüttüğü bir iddiayı `done`'a konuşturamaz), "Saved!" yazan ama 5xx dönen tuzak
fixture'ları, UI'da kanıt rozetleri (Checked / Unconfirmed / Contradicted), mutasyon öncesi deterministik
origin kapısı, ve `@tepegoz/recipe-compiler`'ın `evaluateAssertion` success oracle'ı. Kuzey-yıldızı
koşullarından biri _"fabricated-success ≈ 0"_.

**Kim daha iyi:** **Bugün ölçülmüş sonuç veren taraf CUA Sample** — verifier'ları gerçekten koşuyor ve
gerçekten geçiyor/kalıyor. **Genelleşebilirlikte Tepegöz** — çünkü CUA'nın oracle'ı lab'a kablolanmıştır ve
gerçek web'e taşınamaz, Tepegöz'ünki sayfanın kendi kanıtından türetilmek üzere tasarlanmıştır. Tepegöz'ün
tarafında bu tasarım henüz ölçülmemiş durumda, dolayısıyla eksen bölünüyor: **kanıtlı ama dar** vs
**geniş ama kanıtsız**.

### Hesap verebilirlik / denetlenebilirlik — replay bundle vs imzalı makbuz

CUA Sample gerçek bir gözlemlenebilirlik katmanı sevk ediyor: her çalışma için mutable bir workspace, bir
`events.jsonl` (append-only), bir `run.json`, bir `replay.json` (`version: 1`, çalışma kaydı + senaryo +
tarayıcı durumu + tüm eventler + artefakt dizinleri), ve numaralı screenshot dosyaları. **16 event tipi** var
(`run_started`, `workspace_prepared`, `lab_started`, `browser_session_started`, `browser_navigated`,
`function_call_requested/completed`, `computer_call_requested`, `computer_actions_executed`,
`computer_call_output_recorded`, `screenshot_captured`, `run_progress`, `verification_completed`,
`run_completed/failed/cancelled`), hepsi zod ile doğrulanıp SSE üzerinden konsola akıyor. Konsol bunları
insan okunur hale getiriyor: `Click @ 412,318`, `Scroll 240 px down`, `Type "Ada Lovelace"`, `Wait 1.0 s`.

Eksik olan şey **bütünlüktür**. `replay.json` düz JSON'dur: hash zinciri yok, imza yok, tampering tespiti yok,
bağımsız doğrulayıcı yok. Runner CORS'u `Access-Control-Allow-Origin: *` ile açar (yerel demo için makul,
ama makbuz üretmez). Bir replay bundle "bu çalışma gerçekten böyle geçti" diye **kanıtlamaz**; yalnızca
runner'ın o an ne yazdığını gösterir.

Tepegöz'ün `@tepegoz/notary`'si (ADR-0030) tam bu boşluğu hedefliyor ve **algoritmik çekirdeği gerçekten
yazılmış**: `hash-chain.ts`, `checkpoint.ts` (cihazda tutulan Ed25519 anahtarı zincir kökünü imzalar),
`replay-receipt.ts` (tek bir `correlationId`'nin olay alt-ağacı + onu çapalayan checkpoint, kendi kendine
yeten tek bir JSON belgesi), ve `cli.ts` → `tepegoz-verify` binary'si (`PASS`/`TAMPERED`/`INVALID` için ayrı
çıkış kodları), hepsi birim testli.

**Ama bugün hiçbir gerçek çalışma bir makbuz üretmiyor.** `@tepegoz/notary` repodaki başka **hiçbir**
`package.json`'da bağımlılık olarak geçmiyor; `apps/desktop` onu hiç import etmiyor. ADR-0030 bunu
saklamak yerine yazıyor: _"Nothing in `apps/desktop` calls this package yet: no migration adds chain columns
to the `events` table, `EventJournal.append` does not compute a `selfHash`, and no key is generated or
stored via `safeStorage`. The algorithmic core is proven; the wiring that would let a real run produce a
real receipt is not."_ Ayrıca zincir **redaksiyon sonrası** yük üzerinde kuruluyor; redaksiyon öncesi bir
özet mühürlemek inşa edilmemiş.

**Kim daha iyi:** **Bugün sevk edilmiş gözlemlenebilirlikte CUA Sample, net biçimde** — konsolu gerçekten
çalışıyor, event taksonomisi temiz, hata mesajları eyleme dönük, ve replay bundle'ı her çalışmada gerçekten
üretiliyor. Tepegöz'ün ürettiği bir makbuz **yok**. **Kriptografik hesap verebilirliğin mimarisinde
Tepegöz** — imzalı, zincirlenmiş, üçüncü tarafça doğrulanabilir bir makbuz fikri CUA Sample'da hiç yok ve
olması da amaçlanmamış; ama bu, kanıtlanmış bir kütüphane ile bağlanmamış bir kablonun toplamıdır, çalışan
bir özellik değil.

### Sandbox / izolasyon — CUA'nın en zayıf yeri

CUA Sample'da izolasyon adına iki iyi şey var: her çalışma için lab şablonu **mutable bir workspace'e
kopyalanıyor** (`prepareRunWorkspace`, sonra `resetScenario` ile sıfırlanabiliyor), ve
`workspace-lab-server.ts` yol-kaçışına karşı gerçek bir kontrol yapıyor (`candidate.startsWith(workspacePath + sep)`
değilse "Requested asset path escapes the workspace root"). Lab sunucusu `127.0.0.1`'de rastgele porta bağlanıyor.

Ama `code` modunun sandbox'ı **sandbox değildir**. `vm.createContext` bir güvenlik sınırı değil, bir global
ayrımıdır; ve verilen bağlam içine `browser`, `context`, `page` (gerçek Playwright tutamaçları) ve `Buffer`
konuyor. Model'in yazdığı kod runner'ın Node süreci içinde çalışır, `page.goto` ile **istediği yere
gidebilir**, `globalThis` üzerinden turlar arası durum taşıyabilir. Tek sınır 20 saniyelik yürütme zaman
aşımıdır. Bu bir demo için savunulabilir (README zaten "yüksek riskli ortamlara doğrultmayın" diyor), ama
üretim mimarisi olarak alınamaz.

Tepegöz'de renderer **güvenilmez** kabul edilir, tek bir güvenli `createWindow()` fabrikası vardır, tipli
`contextBridge` dışında köprü yoktur, ajan dosya sistemi `file_*` ile tam sandbox'lıdır (ADR-0022), ve
**ajan için kod çalıştırma yoktur** (ADR-0026 çürütüldü; ADR-0029 DevTools kullanıcı-only).

**Kim daha iyi:** **Tepegöz**, açık farkla. Aynı zamanda bu, iki deponun _niyet_ farkının en net göründüğü
yer: biri bir gösteri tezgâhı, diğeri bir güven sınırı inşa ediyor.

### Otonomi / onay modeli — CUA'da yok

CUA Sample'da otonomi seviyesi kavramı yoktur. Operatör senaryoyu seçer, prompt'u yazar, gelişmiş panelden
motor / tarayıcı / tur bütçesi / doğrulama ayarlarını yapar, **Start Run** der. Ondan sonra tek müdahale
yolu **Stop**'tur (ve senaryo sıfırlama). Plan önizlemesi, araç-başı onay, risk uyarısı, çift-onay kapısı,
scope grant, çalışırken yönlendirme (steer), pause/resume — hiçbiri yok. `pending_safety_checks` geldiğinde
bile operatöre sorulmuyor, çalışma düşürülüyor.

Tepegöz: `ask`/`act`/`auto` (+ rezerve `dangerous`, `ask` gibi davranılır), iki-aşamalı HITL (plan önizleme

- araç-başı), kademeli otonomi + amber risk banner, ticaret çift-onay kapısı, scope grant, çalışırken steer,
  pause/resume, arka-plana devam + tepsi göstergesi, Human Handoff Controller (CAPTCHA/2FA'yı kullanıcıya geri
  verme). HITL id'leri `randomUUID`, main'de birebir korele ediliyor ve tam bir kez sonuçlandırılıyor.

**Kim daha iyi:** **Tepegöz**, karşılaştırma bile zor. CUA Sample'da onay modeli bir eksiklik değil, kapsam
dışılıktır — ama gerçek bir hesaba doğrultulduğu an bu bir eksikliğe dönüşür.

### Asistan / operatör UX — CUA'nın gerçek gücü

CUA Sample'ın konsolu (~2.450 satır TSX/TS) sevk edilmiş ve cilalı: senaryo seçici, prompt alanı, katlanır
"Advanced settings" (motor segment kontrolü, headless/visible, 4–50 tur kaydıracı, doğrulama anahtarı),
canlı SSE aktivite akışı, **kaydırılabilir screenshot scrubber + filmstrip**, aksiyonların insan-okunur
özeti, ve özellikle iyi bir **hata rehberliği** katmanı: her `RunnerCoreError` bir `code` + `hint` taşıyor,
konsol bunları başlığa çeviriyor (`Runner unavailable`, `Runner missing API key`, `Live mode unavailable`,
`Safety acknowledgement unavailable`, `Run already active`), ve runner kapalıyken bile arayüz anlamlı
kalıyor — README'nin açık hedeflerinden biri bu.

Tepegöz'ün Agent Console'u daha geniş: komut paleti (Chat/Do/Make/Tasks), plan önizleme (adım seçimiyle),
kademeli otonomi + amber risk banner, effort ön-ayarları, kaydırılabilir replay timeline, kanıt rozetleri,
çalışırken steer, pause/resume, arka-plan çalıştırma + tepsi, sekme-grubu-başı oturum, sohbet geçmişi + arama,
composer ekleri (seçim/dosya/screenshot), ticaret çift-onay, scope grant. Ama streaming (ADR-0025) dahil
birçoğu "measurement-owed".

**Kim daha iyi:** **Dar kapsamda cila ve hata-yolu netliğinde CUA Sample** — az şey yapıyor ve onu düzgün
yapıyor. **Kapsam, rıza granülerliği ve ajan kontrolünde Tepegöz.**

### Prompt yapımı / sistem-prompt — ikisi de sade, biri fazla sade

CUA'da prompt inşası birkaç satırdır. `buildBookingNativeInstructions` şunu üretiyor: "You are controlling a
browser-based booking app through the built-in computer tool." + mevcut URL + "Use only the operator prompt
as the source of truth." + görev cümlesi + "Only stop requesting computer actions once the reservation panel
shows the booking as confirmed." + "Reply briefly once the booking is confirmed." Toplam **altı satır**,
senaryo başına elle yazılmış, mod başına ikiye ayrılmış. Şablon motoru yok, kural dosyası yok, dinamik
context enjeksiyonu yok, güvenilmez içerik sarmalaması yok. Operatör prompt'u ayrıca **makine tarafından
parse ediliyor** (`readPromptField` ile `hotel:` / `check_in:` / `guest_name:` satırları), ki bu doğrulamayı
mümkün kılan zekice bir hile ama aynı zamanda prompt'u yarı-yapılandırılmış bir forma dönüştürüyor.

Tepegöz tarafında prompt yüzeyi `@tepegoz/orchestrator`'da yaşıyor ve bir **PROSE-LEDGER** disiplinine bağlı:
bir prompt steer'ı ancak eşli bir sweep onun gereksiz olduğunu kanıtlarsa silinebiliyor. Güvenilmez içerik
`wrapUntrustedContent` ile sarılıyor, `sanitizeText`'ten geçiyor.

**Kim daha iyi:** **Tepegöz** — özellikle güvenilmez içerik sarmalaması ve prompt değişikliklerinin kanıta
bağlanması bakımından. CUA'nınki bir örnek için doğru boyutta; gerçek web için değil.

### Ölçüm / dürüstlük kültürü — farklı ölçekler, ikisi de dürüst

CUA Sample'ın ölçümü küçük ama namuslu: **~27 test** (runner-core 10, runner 5, browser-runtime 2,
scenario-kit 2, demo-web 2, artı 6 opt-in canlı smoke), `pnpm check` kapısı (lint + typecheck + test + build),
ve README'de bir **"Release Validation Checklist"** (temiz klon, sadece README ile kurulum, bir headless
çalışma, bir headful çalışma, ve **bilerek bir başarısızlık** — yeni runner rehberliğinin temiz göründüğünü
görmek için). "Safety And Limitations" bölümü uygulanmamış safety-acknowledgement'ı, yüksek-risk ortam
yasağını ve labların genel web otonomisi kanıtı **olmadığını** açıkça söylüyor. Benchmark yok, enjeksiyon
korpusu yok, ASR ölçümü yok — ama hiçbiri iddia da edilmiyor.

Tepegöz'de aygıt çok daha büyük: `@tepegoz/agent-eval` (dev-only, `private`, asla uygulamayla sevk edilmez)
gerçek app'i `_electron` ile başlatıp gerçek fixture sitelerine sürüyor; ground-truth-önce skorlama,
LLM-judge ikincil ve **25 insan etiketinin altında iddia-yasaklı**, judge↔insan kalibrasyonu kayıtlı,
Wilson CI'lı raporlama, SHA-256'lı donmuş fixture registry'leri, anti-debt kuralı, PROSE-LEDGER,
ön-kayıtlı H2H protokolü. **18 senaryo registry'sinde toplam 122 senaryo** duruyor (adversaryal batarya 24,
Mind2Web köprüsü 30, web-patterns 9, …).

Madalyonun öbür yüzü sert: **52 senaryonun yalnızca 5'i şimdiye dek canlı ölçüldü** (kaçış ailesi); 24
`atk_*` adversaryal senaryonun, 9 web-pattern'in ve geri kalan her şeyin **geçerli güncel sayısı yok**.
Faz tablosunda S0–S12'nin **12'si 🟠 measurement-owed**, S6 karışık (🟡 PR0–PR3 + 🟠 PR4–PR6), ve README
bunu birebir yazıyor: _"no phase reads ✅"_. Kuzey-yıldızı dört koşul (≥20 gerçek-site H2H görevi, **≥10'u
Türkçe web**; ASR ≤%5; fabricated-success ≈ 0; maliyet dürüstlüğü) ve bütçe notu da açık: _"No north-star
condition gets a publishable number for $50."_ Sahibin kendi verdiği not zaten roadmap'in ilk sayfasında:
_"hâlâ istediğim gibi çalışmıyor."_

**Kim daha iyi:** **Ölçüm makinesi olarak Tepegöz**, açık farkla — araştırma-sınıfı bir aygıt, ve 122
senaryoluk bir batarya CUA Sample'ın 27 testiyle aynı kategoride bile değil. **Ölçtüğünün gerçekten
geçtiğini gösterme bakımından CUA Sample** — 27 testi geçiyor, bir çalışma gerçekten tamamlanıyor, verifier
gerçekten karar veriyor; Tepegöz'ün bataryasının %90'ı hiç koşmadı. İkisi de kendi eksiğini yazılı olarak
kabul ediyor; bu, iki depoyu da bu alandaki ortalamanın üstüne çıkarıyor.

---

## Örtüşmeyen alanlar

**Yalnızca OpenAI CUA Sample App'te var (Tepegöz'de karşılığı yok):**

- **Birinci-taraf `computer` aracı**: Responses API'nin yerleşik computer-use aracına doğrudan bağlanma;
  frontier bir CUA modelinin piksel-koordinat çıktısını Playwright olaylarına çeviren referans kod.
- **`exec_js` Playwright REPL**: modelin serbest JavaScript yazıp **canlı oturumda** kalıcı bir bağlamda
  çalıştırması, gerçek `page`/`context`/`browser` tutamaçlarıyla. Tepegöz'ün bunun kısıtlı bir akrabası var
  (`browser_analyze_page`, salt-okunur kopya üzerinde) ama canlı sayfada eşdeğeri kasıtlı olarak **yok** —
  ADR-0026 önerilen tasarımı NO-GO olarak kaydetti.
- **Senaryo/lab kit'i**: manifest + varsayılan prompt + sıfırlanabilir mutable workspace + senaryo-başı
  deterministik verifier; yeni senaryo eklemek için belgelenmiş 6 adımlı uzantı noktası.
- **Headless servis formu**: HTTP runner (Fastify) + SSE + artefakt servisi + ayrı bir web konsolu; yani
  tarayıcısız, sunucu-tarafı, çok-istemcili bir dağıtım şekli (Render deploy script'leri dahil).
- **headful/headless anahtarı** ve prompt'tan süre okuyan "operatör inceleme penceresi" tutma davranışı.
- **Tur bütçesi kaydıracı** (4–50) — açık, kullanıcı-ayarlı bir adım tavanı.
- Referans-implementasyon rolünün kendisi: `responses-loop.ts`'in "tek kanonik yer" olarak konumlandırılması.

**Yalnızca Tepegöz'de var (CUA Sample'da karşılığı yok):**

- **Tam tarayıcı**: out-of-process CDP, kendi sekme modeli, pencere fabrikası, indirme/yükleme, pano,
  yer imleri/geçmiş, reader, çeviri/yazım/adblock eklentileri.
- **Model-öncesi deterministik PolicyKernel** + türetilmiş risk tier'ları + hassas-site kategori haritası +
  `TaintTracker` + `EgressFirewall` + biyometrik yüksek-risk kapısı.
- **Tek ToolGateway PEP**: built-in / MCP / eklenti araçları ayrımsız aynı hattan (zod → policy → HITL →
  execute → audit).
- **İki-aşamalı HITL + otonomi seviyeleri + scope grant + steer/pause/resume.**
- **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız
  `tepegoz-verify` CLI — kod ve testler gerçek, **ama uygulamaya hiç bağlanmamış** (ADR-0030'un kendi
  kaydı).
- **Sağlayıcı-agnostisizm**: 8 bulut sağlayıcı + `local` (node-llama-cpp + GBNF), `CanonRequest/Response`,
  `ModelRouter`, `TokenLedger`, sha256'lı model kataloğu.
- **MCP istemcisi** (ADR-0018) + `McpSupervisor` + bilinmeyen annotation → en kısıtlı sınıf.
- **Model-free deterministik şerit**: `@tepegoz/macro-engine` (iMacros halefi) + `@tepegoz/recipe-compiler`
  (imzalı tekrar-oynatma + `evaluateAssertion` oracle) + `@tepegoz/tasks` (kayıtlı görev/tetikleyici).
- **Bellek** (ADR-0027: advisory / tainted / re-validated) + skill kütüphanesi (saklı prompt şablonları).
- **`@tepegoz/human-input`** (Catmull-Rom fare eğrileri + Gaussian jitter), `@tepegoz/credential-vault`,
  `@tepegoz/agent-eval`, per-paket EN+TR i18n parity (ADR-0016), event-sourced journal.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

| #   | Boyut                                | OpenAI CUA Sample App                                                                                                                                                                                      | Tepegöz                                                                                                                                                                                                                                                              | Kim daha iyi + neden                                                                                                                                   |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Ürün formu / dağıtım**             | Örnek uygulama: `pnpm dev` ile iki yerel servis; `0.0.0`, private paketler, yayımlanmış binary yok                                                                                                         | Tam Electron tarayıcı, kendi süreç/pencere modeli; henüz 1.0 öncesi                                                                                                                                                                                                  | **Tepegöz** — ama eşit olmayan kıyas: CUA Sample ürün olmayı hiç hedeflemiyor                                                                          |
| 2   | **Sağlayıcı genişliği**              | **1** (`new OpenAI(...)`, hard-coded); anahtarsız çalışmıyor                                                                                                                                               | **8** çalıştırılabilir bulut sağlayıcı (hiçbiri stub değil; yalnız Anthropic resmi SDK, diğerleri ham REST) + `local` (GGUF + GBNF, ownership tablosu boş), tek `Canon*` şeması, `ModelRouter`, `TokenLedger`                                                        | **Tepegöz** — kıyas kabul etmez (ADR-0005)                                                                                                             |
| 3   | **Model yapılandırılabilirliği**     | Somut olarak **6**: model adı, tur bütçesi, mod, headless/headful, doğrulama, `CUA_RESPONSES_MODE`. `effort: "low"` **hard-coded**, `parallel_tool_calls:false` sabit                                      | 5 effort seviyesi + capability→tier router + çağrı başına **zorunlu** `maxTokens`/`timeoutMs`                                                                                                                                                                        | **Tepegöz** — CUA'da akıl yürütme bütçesi kullanıcıya hiç açılmıyor                                                                                    |
| 4   | **Algı paradigması**                 | `native`: saf vision + piksel koordinat, sabit 1440×900, **her turda tam PNG**. `code`: modelin yazdığı Playwright kodu; yapılandırılmış algı katmanı yok                                                  | DOM/a11y-önce (ADR-0008) + kimlik-kararlı ref + diff/elision; vision yalnız eskalasyon — tetikleyici + bütçe/set-of-marks kodu var ama `captureVision`'ı üretimde kimse sağlamıyor, yani **atıl**                                                                    | **Duruma göre** — genellikte (canvas, shadow DOM, DOM'suz yüzey) CUA; temiz DOM'da hız/kesinlik/denetlenebilirlikte Tepegöz tasarımı, **ama kanıtsız** |
| 5   | **Algı ekonomisi (token)**           | Strateji yok: `truncation:"auto"` + `previous_response_id`, üstüne her turda görüntü                                                                                                                       | Değişen-only diff + unchanged elision + cache-window (lag-2) + `TokenLedger`                                                                                                                                                                                         | **Tepegöz** (tasarımda) — CUA maliyeti satıcıya devrediyor ve görünmez kılıyor                                                                         |
| 6   | **Girdi sanitizasyonu**              | **Yok** — depo genelinde `sanitize` yalnız dosya adında; modele giden şey zaten bir resim                                                                                                                  | `sanitizeText` (gizli/zero-width/bidi/homoglyph) + `wrapUntrustedContent` ayrı pakette                                                                                                                                                                               | **Tepegöz** — CUA'da bu yüzey hiç yok                                                                                                                  |
| 7   | **Aksiyon repertuvarı**              | `native`: **9** koordinat aksiyonu (click/double_click/drag/move/scroll/type/keypress/wait/screenshot). `code`: **1** araç (`exec_js`), sınırsız güç. Sekme/indirme/pano/dosya yok                         | **~49 built-in araç, 10 aile**: `browser_*` 11, `file_*` 14, `tab_*` 5, `task_*` 5, `download_*` 4, `upload_*` 4, `clipboard_*` 2, `web_*` 2, `journal_*` 1, `screenshot` 1 + dinamik MCP                                                                            | **Tepegöz** — ham genellikte `exec_js` önde ama denetlenemez; kapsam ve tiplilikte Tepegöz                                                             |
| 7b  | **Kod çalıştırma**                   | `exec_js`: **canlı** `page`/`context`/`browser` tutamaçları, `vm.createContext` (güvenlik sınırı değil), tek sınır 20 sn                                                                                   | Canlı sayfada `execute_js` **yok**; yerine `browser_analyze_page` (`code_exec_read`) — sayfanın **kopyası** üzerinde, `default-src 'none'` CSP + istek iptali; sandbox yoksa araç kayıt olmaz; `code_exec_write` **koşulsuz deny**; ADR-0026 RISK GATE açık          | **Tepegöz** — aynı yeteneği denetlenebilir bir kapsamda veriyor; ama "kod çalıştırma hiç yok" demek de doğru değil                                     |
| 8   | **Araç çağırma disiplini**           | Yok: `exec_js` argümanı serbest JavaScript; `computer` aksiyonları politika görmeden çalışıyor                                                                                                             | **Tek PEP**: lookup → idempotency → zod → PolicyKernel → HITL → execute → audit; MCP/eklenti/builtin ayrımsız                                                                                                                                                        | **Tepegöz** — ADR-0007; CUA'da kıyaslanacak hat yok                                                                                                    |
| 9   | **Ajan döngüsü**                     | Düz `for` (4–50 tur); plan/replan/retry/loop-dedektörü yok; bütçe tükenirse sert hata                                                                                                                      | Planner (Intent→DAG) → Executor → Reactor (tipli `Decision`: continue/retry/replan/stop) + navigation-grounding                                                                                                                                                      | **Tepegöz** — yapı ve kurtarma; CUA'nın tek kurtarma stratejisi turu yakmak                                                                            |
| 9b  | **Eşzamanlılık & dayanıklılık**      | Süreç başına **tek run** (HTTP 409 `run_already_active`); crash-resume yok                                                                                                                                 | Kodda **sekme-grubu başına bir run** (ADR-0013 hâlâ "süreç başına tek" diyor — belge kodun gerisinde). Checkpoint tipleri + faz makinesi var, `CheckpointWritten` journal'a yazılıyor ama **hiç geri okunmuyor** → dayanıklı resume yok                              | **Tepegöz** eşzamanlılıkta; **dayanıklı resume'da ikisinde de yok**                                                                                    |
| 10  | **Güvenlik mimarisi (yer)**          | Güvenlik **modelin içinde**: `pending_safety_checks`. Harness'ta izin/politika/otonomi/origin/taint/egress **hiç yok**                                                                                     | Güvenlik **modelin önünde**: deterministik PolicyKernel (ADR-0006), 6 risk tier, taint, EgressFirewall, biyometrik                                                                                                                                                   | **Tepegöz** — kategorik fark; CUA'da mimari yok, devretme var                                                                                          |
| 11  | **Safety acknowledgement akışı**     | `pending_safety_checks` **uygulanmamış**: çalışma `unsupported_safety_acknowledgement` ile düşüyor — ve kapı, batch'in aksiyonları **çalıştıktan sonra** işliyor                                           | Kapı her zaman **yürütmeden önce**; `deny` mutlak, otonomi onu asla çeviremez; fail-safe (yanıt yok = deny)                                                                                                                                                          | **Tepegöz** — CUA'nın kapısı post-hoc; engellemesi gereken tıklama zaten olmuş                                                                         |
| 12  | **Prompt-injection savunması**       | **Hiçbiri.** Tek "savunma" sistem prompt'undaki bir cümle: _"Use only the operator prompt as the source of truth."_ Labları sentetik ve güvenilir                                                          | Model-öncesi kernel + taint provenance + sanitizer + `wrapUntrustedContent` + EgressFirewall (Shannon entropisi)                                                                                                                                                     | **Tepegöz** — mimaride tek taraflı. Kanıt tarafında Tepegöz'ün ASR bataryası da **borçlu**; ama CUA'nın savunacak bir şeyi yok                         |
| 13  | **Otonomi / onay modeli**            | Yok. Start → (Stop). Plan önizleme, araç-başı onay, risk sınıfı, çift-onay, scope grant yok                                                                                                                | `ask`/`act`/`auto` (+rezerve `dangerous`), 2-aşamalı HITL, amber risk banner, ticaret çift-onay, scope grant, steer/pause/resume                                                                                                                                     | **Tepegöz** — CUA'da kapsam dışı                                                                                                                       |
| 14  | **Doğrulanmış sonuç**                | Senaryo-başı gerçek verifier'lar, **son lab durumunu** okuyor, alan-alan karşılaştırıyor — ama **varsayılan kapalı** ve lab'ın enjekte ettiği `window.__*` erişimcilerine bağlı                            | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + `evaluateAssertion`                                                                                                                                  | **Bölünüyor**: bugün **kanıtlı ama dar** CUA; **genelleşebilir ama kanıtsız** Tepegöz                                                                  |
| 15  | **Replay & gözlemlenebilirlik**      | `replay.json` (v1) + `events.jsonl` + numaralı screenshot'lar + 16 tipli SSE event + scrubber/filmstrip; **imzasız, zincirsiz** — ama her çalışmada **gerçekten üretiliyor**                               | **Notary** (hash-zinciri + Ed25519 + Replay Receipt + `tepegoz-verify` CLI) birim-testli gerçek kod, **ama `apps/desktop` onu hiç import etmiyor** — ADR-0030 bunu yazılı kabul ediyor; bugün hiçbir çalışma makbuz üretmiyor. Event-sourced journal ise çalışıyor   | **Bugün CUA** — üreten taraf o. **Mimaride Tepegöz** — ama bağlanmamış bir kütüphane çalışan bir özellik değil                                         |
| 16  | **Sandbox / izolasyon**              | `vm.createContext` **güvenlik sınırı değil** ve içine gerçek `browser`/`context`/`page` konuyor; tek sınır 20 sn zaman aşımı. İyi taraf: run-scoped mutable workspace + lab sunucusunda yol-kaçış kontrolü | Renderer güvenilmez, tek `createWindow()` fabrikası, tipli `contextBridge`, `file_*` tam sandbox (ADR-0022), kod çalıştırma yalnız kopya-sayfa + CSP'li gizli pencere, DevTools kullanıcı-only (ADR-0029)                                                            | **Tepegöz** — açık farkla                                                                                                                              |
| 17  | **Kimlik bilgisi / sır işleme**      | Yok. `OPENAI_API_KEY` repo kökünde `.env`; README yüksek-riskli/oturum-açık ortamları **açıkça yasaklıyor**                                                                                                | `credential-vault` (BYO-key, DPAPI/safeStorage) + Credential Broker (sırrın ajana ulaşacağı şekil yok) — **atıl sevk**                                                                                                                                               | **Tepegöz** kavramsal olarak; pratikte ikisinde de bugün çalışan bir sır akışı yok                                                                     |
| 18  | **Gerçek web'e uygunluk**            | Hiç hedeflenmemiş: üç sentetik lab, `127.0.0.1`, dış ağ yok; README "genel web otonomisi kanıtı değildir" diyor                                                                                            | Gerçek web hedefi; site adaptörü **yok**, Safe Browsing (ADR-0043) ve hassas-site kategori haritası var                                                                                                                                                              | **Tepegöz** — tek gerçek web hedefleyen taraf (ve orada da henüz kanıtlanmadı)                                                                         |
| 19  | **MCP**                              | Ne istemci ne sunucu — hiç yok                                                                                                                                                                             | MCP **istemcisi** (ADR-0018), dış araçlar aynı PEP'ten; sunucu yüzeyi yok (Phase 1b)                                                                                                                                                                                 | **Tepegöz** — CUA'da eksen boş                                                                                                                         |
| 20  | **Bellek & skill / tekrar kullanım** | Yok. Çalışmalar arası hiçbir şey taşınmıyor; senaryo manifestleri elle yazılıyor                                                                                                                           | Advisory bellek (ADR-0027, poison-filtreli karantina), prompt-şablonu skill'leri, `recipe-compiler` + `macro-engine` + `tasks`                                                                                                                                       | **Tepegöz** — CUA'da eksen boş                                                                                                                         |
| 21  | **Çevrimdışı / egemenlik**           | Yok: anahtar yoksa çalışma başarısız; her tur buluta gidiyor                                                                                                                                               | `local-inference` seam + sha256'lı GGUF kataloğu + "basit adımlar cihazda"; S12 ağırlıklara takılı                                                                                                                                                                   | **Tepegöz** — ama Tepegöz'ün de bu tarafı büyük ölçüde inşa edilmemiş                                                                                  |
| 22  | **Türkçe / bölgesel**                | Yok — İngilizce, i18n katmanı yok                                                                                                                                                                          | EN+TR parity zorunlu (ADR-0016), ≥10 TR-web H2H şartı, hassas-site haritası TR bankaları/kamu için özellikle düzeltildi                                                                                                                                              | **Tepegöz** — eksen tek taraflı                                                                                                                        |
| 23  | **Operatör UX cilası**               | Konsol ~2.450 satır: SSE akışı, scrubber+filmstrip, insan-okunur aksiyon özeti (`Click @ 412,318`), `code`+`hint` taşıyan eyleme-dönük hata rehberliği, runner kapalıyken bile anlamlı arayüz              | Agent Console: palet, plan önizleme, kanıt rozetleri, replay timeline, steer, arka-plan run, tepsi; çoğu "measurement-owed"                                                                                                                                          | **Dar kapsamda cila ve hata-yolunda CUA**; kapsam ve rıza granülerliğinde **Tepegöz**                                                                  |
| 24  | **Ölçüm / dürüstlük kültürü**        | ~27 test + `pnpm check` + release validation checklist + açık "Safety And Limitations"; benchmark/enjeksiyon korpusu yok (iddia da edilmiyor)                                                              | `agent-eval`: gerçek app'i `_electron` ile süren harness, **18 registry / 122 senaryo**, ground-truth-önce skorlama, 25 etiket altında iddia-yasaklı judge, Wilson CI, donmuş fixture'lar, anti-debt, PROSE-LEDGER — **ama 52 senaryodan yalnız 5'i canlı ölçülmüş** | **Aygıt olarak Tepegöz** (kıyas kabul etmez); **geçtiğini gösterme bakımından CUA**. İkisi de eksiğini yazıyor                                         |
| 25  | **"Bugün çalışıyor mu"**             | Evet — kendi kapsamında: temiz klon → `pnpm dev` → bir headless çalışma tamamlanıyor, verifier geçiyor. Kapsam üç sentetik lab                                                                             | Kısmen — iskelet bağlı ama S0–S12'nin **12'si 🟠, hiçbiri ✅**; vision/credential/Notary bağlanmamış, dayanıklı resume yok, site adaptörü yok                                                                                                                        | **CUA Sample** — kendi dar kapsamında kesin çalışıyor; Tepegöz'ün geniş kapsamı henüz kanıtlanmadı                                                     |

---

## Sonuç

**Bugün "çalışıyor mu" ekseninde CUA Sample kendi kapsamında kazanıyor** — ama o kapsam üç sentetik yerel
lab'dan ibaret. Temiz bir klon, `pnpm dev`, bir prompt, ve `gpt-5.4` gerçekten kanban kartlarını sürüklüyor,
formu dolduruyor, verifier gerçekten geçiyor ya da kalıyor. Kod temiz, tipli, sınırlarda zod'lu, testli;
operatör konsolu cilalı ve hata yolları düşünülmüş. Bir referans implementasyonun yapması gereken her şeyi
yapıyor. Tepegöz'ün bu ölçekte "işte, geçti" diyebileceği bir şeyi bugün yok: S0–S12'nin 12'si 🟠 ve hiçbiri ✅
değil, 52 senaryodan yalnız 5'i canlı ölçülmüş, vision yakalama katmanı ile Notary üretime hiç
bağlanmamış, dayanıklı resume yok, site adaptörü yok.

**Mimari ve bahis ekseninde Tepegöz kazanıyor, ve fark üç yerde kategoriktir.** Birincisi algı: CUA piksel
koordinatına ve her adım görüntüsüne bağlıdır — bu daha genel ama daha pahalı, daha yavaş ve _sanitize
edilemez_; Tepegöz DOM/a11y-önce algıya bahis koymuş, vision'ı yedeğe indirmiş ve girdi yüzeyini
temizlenebilir tutmuş (ADR-0008) — kanıtlanmamış ama tutarlı bir bahis. İkincisi güvenlik: CUA'da güvenlik
modelin içindedir ve bu örnekte kapı, engellemesi gereken tıklama **çalıştıktan sonra** işler; Tepegöz'de
güvenlik modelin önünde deterministik koddur, `deny` mutlaktır ve otonomi onu çeviremez (ADR-0006/0039).
Üçüncüsü hesap verebilirlik: CUA'nın replay bundle'ı okunabilir ama imzasızdır — "böyle oldu" demez, "runner
böyle yazdı" der; Tepegöz'ün Notary'si hash-zinciri + Ed25519 + bağımsız `tepegoz-verify` ile satıcıdan
bağımsız doğrulanabilir bir makbuz hedefler — **ama bu üçüncü eksende Tepegöz'ün üstünlüğü bugün yalnızca
niyettir**: kütüphane yazılmış ve test edilmiş, uygulamaya hiç bağlanmamış, ve ADR-0030 bunu itiraf ediyor.
CUA bugün bir bundle üretiyor, Tepegöz hiçbir şey üretmiyor. Üstüne sağlayıcı-agnostisizm gelir: CUA tek satıcının tek
modeline kablolanmıştır (amacı odur), Tepegöz 8 sağlayıcı + yerel modelle aynı `Canon*` şemasına oynar.

Dürüst özet: **CUA Sample kapalı bir modelin en temiz kablosudur; Tepegöz o modelin önüne konacak
altyapıdır — ve o altyapı henüz kanıtlanmadı.** Kategori farkının tek cümlesi: biri bir satıcının computer-use
API'sini üç sentetik lab üzerinde gösteren bir referans implementasyon, diğeri gerçek web'de gerçek hesapla
çalışması hedeflenen bir tarayıcı ürünü — dolayısıyla kıyas "hangisi daha iyi ajan" değil, "hangi mimari
gerçek web'de ayakta kalır" sorusudur. `gpt-5.4`'ün computer-use aracını nasıl bağlayacağını öğrenmek
istiyorsan → CUA Sample, ve muhtemelen mevcut en iyi kaynak. Oturum-açık bir hesabı emanet edebileceğin,
modelden bağımsız durduran, ne yaptığının kriptografik kanıtını üreten, Türkçe bir ajan istiyorsan → o
Tepegöz'ün oyunu, hâlâ tezgâhta.
</content>
</invoke>
