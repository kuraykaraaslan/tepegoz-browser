# Tepegöz vs OpenHands — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **OpenHands Agent Canvas** (`@openhands/agent-canvas`
> `v1.16.0`, MIT lisanslı; "kodlama ajanları ve otomasyonlar için kendi-barındırılan geliştirici
> kontrol merkezi") arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir
> karşılaştırma. Agent Canvas tek başına bir ajan **değildir**: OpenHands'in kendi ajanını (Python
> `software-agent-sdk` + Agent Server) ya da harici bir **ACP ajanını** (Claude Code, Codex, Gemini
> CLI, veya herhangi bir Agent-Client-Protocol sunucusu) yerel / Docker / VM / bulut arka uçlarında
> çalıştırıp yönetir.
>
> **Yöntem.** `.junk/openhands` deposunun (`README.md`, `README.windows.md`, `AGENTS.md`,
> `docs/architecture.md`, `docs/ACP_AGENTS.md`, `docs/DefenseClaw.md`, `docs/SELF_HOSTING.md`,
> `specs/{llm-defaults,mcp-settings,backend-management,canvas-extensions}.md`, `config/defaults.json`,
> `.env.sample`, `package.json`, `src/api/{agent-server-adapter,canvas-ui-client-tool,
launch-child-conversation-client-tool,skills-service}.ts`, `src/api/option-service/`,
> `src/constants/{acp-providers,canvas-ui}.ts`, `src/components/features/{settings/llm-profiles,
settings/mcp-settings,browser,chat}/`, `src/stores/{browser-store,goal-store}.ts`,
> `tools/canvas_ui_tool.py`, `electron/`) ve bu reponun AI yüzeyinin (`phases/ai-agent/`,
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
> **Kategori uyarısı.** Bunlar **farklı ürün kategorileri** — ve buradaki asimetri Kilo Code
> karşılaştırmasından bile daha keskin. Agent Canvas bir **kodlama-ajanı kontrol merkezi / host**:
> kendisi LLM'e konuşmaz, tarayıcı sürmez, araç yürütmez. Bir sohbet paneli + sağda sekmeli bir panel
> (dosyalar, terminal, tarayıcı-anlık-görüntüsü, VS Code, planner, tasklist) sunar; bir veya birden çok
> **Agent Server**'a bağlanır; hangi ajanın (OpenHands / Claude Code / Codex / Gemini / özel ACP),
> hangi modelle, hangi arka uçta koşacağını ayarlar; zamanlanmış/olay-tetikli **otomasyonlar** kurar;
> ve alt/paralel konuşmalar başlatır. Ajan döngüsü, araç yürütücü, sistem-prompt'u, context sıkıştırma
> ve prompt-injection savunması bu depoda **yoktur** — `software-agent-sdk`'de (ayrı repo) veya
> takılan ACP ajanının kendi içinde yaşar (`AGENTS.md` bunu açıkça söylüyor: "bu repo yalnızca
> agent-canvas frontend'i"). Tepegöz ise bir **güvenlik-önce native tarayıcı + tarayıcı ajanı**:
> sayfayı okur, tıklar/yazar, form gönderir, model-öncesi deterministik bir Policy Kernel'den geçer,
> tamamlamayı kanıta atıfla imzalar. Bu belge önce bu asimetriyi söyler, sonra **örtüşen eksenlerde**
> (çok-model/çok-sağlayıcı, MCP, ajan modları, araç/izin/onay modeli, otonomi, context yönetimi, prompt
> mimarisi, checkpoint, maliyet şeffaflığı, yerel model, ölçüm kültürü) iş-iş kıyaslar. Örtüşmeyenler
> de dürüstçe belirtilir.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | OpenHands Agent Canvas                                                                                                                                                                                                          | Tepegöz                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | React/TypeScript **frontend + yerel yığın başlatıcı** (`npm i -g @openhands/agent-canvas`), opsiyonel Electron paketi; bir veya çok Agent Server'a bağlanan **kontrol merkezi**                                                 | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — npm'de `v1.16.0`, GitHub Actions CI, Docker imajı, self-hosting kılavuzu, "beta" rozeti, Slack topluluğu; ama "incubator/beta" olarak işaretli                                                                    | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | TypeScript, React Router 7 SPA, `npm` + Vite, `zustand` + React Query; ~tek paket (frontend) + `electron/` alt-paketi; ajan mantığı **başka repolarda** (`software-agent-sdk`, `typescript-client`, `automation`, `extensions`) | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her güven sınırında                                          |
| Felsefe     | "Kendi-barındırılan, her-zaman-açık mühendislik ekibi"; ajan-agnostik, arka-uç-agnostik, entegrasyon-önce; yerelde çalışan ajanın _"onaya takılma, güvenlik/geri-alınamazlık engellemedikçe yürüt"_ eğilimi                     | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | Kodlama ajanlarını **barındırmak / çoğullamak / otomatikleştirmek**: konuşma başlat, GitHub issue'sunu göreve böl, rapor üretip Slack'e yayınla, ajanı laptop/VM/bulut arasında taşı                                            | Web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu                                        |

Yani: **olgun, ajan-agnostik bir orkestrasyon/host katmanı** vs. **erken, mimari ağırlıklı, güvenlik-önce
bir tarayıcı ajanı**. Agent Canvas'ın "ajanı" ne taktığınızsa odur (OpenHands SDK ajanı veya Claude
Code/Codex/Gemini); dolayısıyla "ajan döngüsü kimde daha iyi" sorusu Canvas için doğrudan yanıtlanamaz —
o döngü Canvas'ın kapsamında değil. Örtüşen eksen, ikisinin de dokunduğu "LLM seçimi + araç/onay modeli +
MCP + context + otonomi + maliyet + ölçüm" iskeletidir.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Model / sağlayıcı desteği — Canvas açık ara (dolaylı yoldan)

Canvas: model listesi **agent-server üzerinden LiteLLM'den** geliyor — `LLMMetadataClient.getModels()` +
`getProviders()` + `getVerifiedModels()`; bulut arka ucunda sağlayıcı araması sayfalanıyor (kod yorumu
_"~150 entry from litellm"_ diyor) ve bir "verified models" alt kümesi öne çıkarılıyor. Üstüne:
**LLM profilleri** (isimli, aktif-edilebilir config setleri), **provider connections** (OAuth ile
sağlayıcı bağlama), **LLM subscription** auth tipi (ör. OpenAI abonelik oturumu), **LLM balance**
servisi. Canvas'ın kurulumsuz ücretsiz varsayılanı `openai/gpt-5.6-sol` (OpenHands'in kendi barındırılan
sağlayıcısı). Ayrıca **ACP tarafında** ajan olarak Claude Code / Codex / Gemini CLI takılabiliyor —
bunlar kendi LLM'lerini yönetiyor; yani Canvas'ın efektif tavanı "hangi kodlama ajanı en iyisiyse odur".
Yerel model: LiteLLM `base_url` ile Ollama / LM Studio / vLLM / LocalAI (`llm-settings-local-view`) —
"herhangi bir LLM ile kullan".

Tepegöz: **8 sağlayıcı** (`anthropic`, `openai`, `gemini`, `kimi`, `nova`, `deepseek`, `xai`, `groq`) +
`local` (node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u **GBNF gramerle** zorlayan). Hepsi tek
`CanonRequest`/`CanonResponse` şemasına normalize; `ModelRouter` yeteneği (`plan`/`exec`/`classify`) →
tier + yerel/bulut'a eşliyor; her `ModelGateway.complete()` çağrısı **`maxTokens` + `timeoutMs` zorunlu**;
`TokenLedger` her çağrının token/maliyetini işliyor; DPAPI'li BYO-key kasası. **Ama** yalnız Anthropic
resmi SDK kullanıyor, OpenAI ham REST, birkaç sağlayıcı stub; sıfır-kurulum bulut yok; markup-suz
gateway yok.

Örtüşen eksende **Canvas net önde**: LiteLLM köprüsü sayesinde yüzlerce sağlayıcı/model, LLM profilleri,
OAuth bağlantıları, abonelik-oturumu auth'u, bakiye takibi — hepsi sevk edilmiş. Tepegöz'ün mimarisi
(tek Canon şema, zorunlu bütçe alanları, capability router, GBNF) daha temiz ve tipli ama yüzeyi dar ve
kısmen stub.

### "Ajan modları" — Canvas'ta bu = hangi ajanı çalıştırdığın

Canvas: bir mod sistemi yerine bir **agent_kind** ayarı var: `openhands` (yerleşik SDK ajanı) veya `acp`
(harici ajan). ACP tarafında **preset**: Claude Code (`npx -y @agentclientprotocol/claude-agent-acp`),
Codex (`@agentclientprotocol/codex-acp`), Gemini CLI (`@google/gemini-cli --acp`) veya **Custom** (stdio
ACP sunucusu için serbest komut). Ek olarak **agent profiles** (`/api/agent-profiles`) — yeniden
kullanılabilir ajan editör + kütüphanesi, "default" adlı seed'li baz profil. Seçim arka-uç-başına
saklanıyor; arka-uç değiştirince ajan da değişebiliyor. Onay davranışı bir mod değil, ayrı bir ayar
(aşağıda).

Tepegöz: **Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor** (tipli `Decision`:
`continue`/`retry`/`replan`/`stop`; `completion-evidence`, `navigation-grounding`, `vision-trigger`,
`cache-window` lag-2 breakpoint). UI paleti: **Chat / Do / Make / Tasks**. Kademeli otonomi
(`ask`/`act`/`auto`) + effort ön-ayarları. **Ama** aynı anda **tek çalışma** (ADR-0013).

Bu eksen **kavramsal olarak örtüşmüyor**: Canvas'ın "modu" takılan ajanın kimliği; Tepegöz'ün fazları
tek görevin zorunlu iç aşamaları. Canvas kullanıcıya "hangi ajan motoru" esnekliği verir (ve Claude Code
gibi olgun bir ajanı takabilmek gerçek bir avantaj); Tepegöz tek, kendi orkestratörünü sunar.

### Ajan döngüsü & orkestrasyon — Canvas'ta bu = arka-uç + konuşma orkestrasyonu

Canvas: gerçek ajan döngüsü (ReAct, adım tavanı, loop-dedektör, araç seçimi) **bu depoda yok** —
`software-agent-sdk`'de veya ACP ajanında. Canvas'ın orkestrasyonu bir kademe yukarıda:
**backend registry** (birden çok Agent Server kaydet, sağlık-probu, aralarında geçiş),
**child/paralel konuşmalar** (`launch_child_conversation` client-tool'u — `target="local"` aynı makinede
git worktree ya da shared dizinde, `target="cloud"` OpenHands Cloud izole sandbox'ında; ebeveyn-çocuk
ilişkisi kaydediliyor), ve **automations** (ayrı Automation Server; cron ya da webhook ile tetiklenen
ajan koşuları). `agent-server-adapter.ts` konuşma-başlatma payload'ını kuruyor: araç seti,
`agent_context` (skills, runtime-services URL'leri), ilk mesaj, onay politikası.

Tepegöz: yukarıdaki Planner→Executor→Reactor + iki-aşamalı HITL (plan önizleme + araç-başı), her ikisi
de fail-safe; streaming sınırı ADR-0025.

**Örtüşme kısmi.** "Bir görevin içinde nasıl adım atılır" ekseninde Canvas'ın söyleyecek bir şeyi yok
(SDK/ACP'nin işi). "Birden çok ajanı/konuşmayı/arka-ucu nasıl yönetirim" ekseninde **Canvas belirgin
şekilde önde** — çoklu arka uç, paralel çocuk konuşmalar, zamanlanmış otomasyonlar Tepegöz'de yok
(Tepegöz tek eşzamanlı run). Tepegöz'ün kozu tek-görev döngüsünün **tipli ve denetlenebilir** olması,
ama o döngü henüz kanıtsız.

### Araç & onay / izin modeli — farklı katmanlar, ikisi de LLM-sonrası değil

Canvas: araç **seti** SDK'de tanımlı; Canvas yalnızca hangi araç ailelerinin gönderileceğini seçiyor —
`browser_tool_set` (`VITE_ENABLE_BROWSER_TOOLS` ile), `task_tool_set` (`enable_sub_agents` ile), artı
`agentSettings.tools`. Onay modeli iki ayardan türüyor: **`confirmation_mode`** (bool) +
**`security_analyzer`** (`llm` / `pattern` / `policy_rail`). Bunlar SDK'nin `ConfirmationPolicy`'sine
eşleniyor: kapalı → `NeverConfirm`; açık + analyzer yok → `AlwaysConfirm`; açık + `llm` →
`ConfirmRisky{threshold: HIGH, confirm_unknown: true}`. Kullanıcı onayı
`/events/respond_to_confirmation` ile dönüyor. Ayrıca **client-tool'lar** (`canvas_ui_control`,
`launch_child_conversation`) SDK'ye "her çağrıdan önce bir güvenlik riski tahmin et" (`readOnlyHint` /
`destructiveHint` / `openWorldHint` annotasyonları) diye işaretli. `bash` / dosya yazma gibi araçların
asıl kapısı SDK'nin `SecurityAnalyzer`'ında; opsiyonel **DefenseClaw** entegrasyonu (harici, kod
değişikliği gerektirmeyen overlay) araç çağrılarını dört-aşamalı bir boru hattından geçirmeyi öneriyor
ama bu "future work" olarak işaretli.

Tepegöz: **tek kapı — `ToolGateway` PEP** (`capability-plane`): `lookup → idempotency → zod →
PolicyKernel → HITL → execute → audit`. Built-in / MCP / extension aracı ayrımsız aynı hattan geçer.
Karar **model-ÖNCESİ deterministik `PolicyKernel`** (ADR-0006): danger class
(`read`/`state_changing`/`destructive`/`financial`) + taint + hedef site → `allow`/`deny`/`ask` +
makine-okunur reason code + biyometrik (Windows Hello) gereksinimi. `isSensitiveSite` (banka / kripto /
sağlık / kamu / parola yöneticisi) = **her otonomi seviyesinde sert `deny`**. `EgressFirewall`
(`inspectEgress` + Shannon entropi), `TaintTracker` provenance, `detectHandoff` (captcha/2FA). Araç
sayısı ~30; **`execute_js` / terminal / kod-editleme YOK** (ADR-0026/0029).

Örtüşen eksende **Tepegöz mimari olarak daha derin**: model argümanını görmeden karar veren deterministik
kernel, kategori bazlı sert deny, çıkış-sızıntı denetimi Canvas'ta doğrudan yok. Canvas'ın modeli
pragmatik ve konfigüre-edilebilir (üç analyzer stratejisi, per-tool risk tahmini, DefenseClaw overlay)
ama asıl uygulaması SDK'de ve varsayılan felsefe "engellenmedikçe yürüt". Not: Canvas hiç terminal/bash
yürütmez demek yanlış olur — yürüten ajan bunu **tam host erişimiyle** yapabilir (local backend uyarısı:
_"ajan bu makinenin dosya sistemine tam erişebilir"_), izolasyon Docker/VM sandbox seçmeye bağlı.

### Otonomi — Canvas'ta bu = zamanlanmış/olaya-bağlı koşu + alt-ajanlar

Canvas: **automations** (Automation Server) — bir ajanı cron ile ya da Slack/GitHub/Linear webhook'una
karşılık çalıştır; çalışma geçmişi, dispatch. **Sub-agents** (`enable_sub_agents` → `task_tool_set`) ve
**child conversations** (yerel worktree ya da bulut sandbox). OpenHands ajanının sistem eğilimi
_"onay isteme, engellenmedikçe yürüt"_; local backend'de ajan makineye tam erişimli.

Tepegöz: otonomi `ask` / `act` / `auto` (+ rezerve `dangerous` = `ask` gibi); `deny` sınıfı her seviyede
sert bloke; ticaret çift-onay kapısı; scope-grant UX; Human Handoff Controller (CAPTCHA/2FA → kullanıcıya
geri ver). `@tepegoz/tasks` kayıtlı görev + interval/page-change/external tetikleyici (Canvas
automations'a en yakın Tepegöz eşleniği, ama tek-run sınırıyla). Aynı anda tek çalışma.

Örtüşen eksende **Canvas bugün daha ileri sevk edilmiş** (gerçek zamanlanmış/webhook otomasyonları,
paralel izole çocuk konuşmalar); Tepegöz'ün otonomi **taksonomisi daha ince ve daha güvenli** (kategori
sert deny, biyometrik, ticaret kapısı) ama tek-run ve çoğu measurement-owed.

### MCP — ikisi de istemci tarafında; Canvas'ta zengin bir yapılandırma + marketplace var

Canvas: **MCP istemci yapılandırma UI'si** — `stdio` / `sse` / `shttp` sunucuları, auth modları
`none` / `bearer` / `header` / **`oauth2`** (client-auth-method seçimi dahil), sağlık-probu
(`mcp-health`), kimlik-bilgisi redaksiyonu, seyrek (sparse) mutasyonlar (sibling sunucuları koru —
`specs/mcp-settings.md`), bir MCP **marketplace / installed-servers** yüzeyi. Bu yapılandırma
agent-server'a geçiyor; **MCP istemcisi olan agent-server**, Canvas değil. Ters yön: Canvas kendi
agent-server'ına **client-tool** olarak `canvas_ui_control` (sağ paneli sür) ve
`launch_child_conversation` sunuyor — yani Canvas ajana araç sağlayan taraf da olabiliyor, ama bu ACP/SDK
`client_tools` JSON API'si üzerinden, MCP değil. Dış ajanların Canvas'ı sürmesi için bir **MCP server
yüzeyi yok**.

Tepegöz: **MCP istemcisi** (ADR-0018, `mcp-client`). Dış araçlar Capability Plane'e girer ve **aynı
PEP'ten** geçer; `McpSupervisor` (reconnect, `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen
annotation → en kısıtlı sınıf, fail-safe). MCP **sunucu** yüzeyi yok (Phase 1b planlı), marketplace yok.

Örtüşen eksende **kabaca eşit, farklı vurgular**: Canvas'ın MCP yapılandırma UX'i (OAuth2, health, sparse
patch, marketplace) daha zengin ve sevk edilmiş; Tepegöz'ün katkısı mimari — her dış araç istisnasız aynı
deterministik kernel + audit hattından geçiyor.

### Context yönetimi — Canvas ölçer + tetikler, mantık SDK'de

Canvas: bir **context-meter** (dolum yüzdesi, uyarı eşiği) + **"Compact context"** butonu →
`POST /api/conversations/{id}/condense` (serbest kalan token'ları toast'lar; ajan koşarken devre-dışı).
Sıkıştırmanın kendisi (özetleme, turn budama, managed tool-output) **SDK'de**. Sistem-prompt olayı
frontend'e `SystemPromptEvent` olarak akıyor ve salt-okunur gösteriliyor; `dynamic_context` (datetime,
skills) `redactCustomSecrets`'tan geçiriliyor.

Tepegöz: `cache-window` (lag-2 breakpoint, cache-uyumlu prefix) + Reactor `working-state` (tipli,
budanabilir) + `tool-executor` sanitizer'ı (gizli/zero-width/bidi/homoglyph temizliği) + perception-v2
diff/dedupe/elision (değişmeyen DOM'u kesme). Özetleme-tabanlı geçmiş sıkıştırma S-fazlarında var ama
measurement-owed.

Örtüşen eksende **berabere-benzer**: Canvas'ın kullanıcı-yüzü var (metre + tek-tık condense) ama
mekanizma SDK'de kilitli; Tepegöz'ün mekanizması repoda ve daha agresif token-kesme tasarlı ama
ölçülmemiş.

### Prompt mimarisi — Canvas skill enjekte eder, sistem-prompt'u SDK/ACP yazar

Canvas: sistem-prompt'u yazmıyor. Yaptığı: (a) **bundled skills** — `@openhands/extensions` npm
paketinden build-time katalog (`SKILL.md` + keyword trigger'ları); `agent_context.skills` ile
agent-server'a geçiriliyor, SDK trigger-eşleştirip sistem-prompt'a enjekte ediyor; (b) user/project
skills (`.agents/skills/`) ve org skills (bulut); (c) **runtime-services context suffix** — arka ucun
bildirdiği URL'leri yeni konuşmaya ajan-context eki olarak ekliyor ki ajan portları tahmin etmesin.
Skills modeli Claude Code'un skill'lerine yakın (güvenilir markdown + trigger).

Tepegöz: sistem-prompt'ları paketlerin içinde; skill kütüphanesi = **saklı prompt şablonları** (seçince
kutuyu doldurur, **çalıştırmaz** — bilerek muhafazakâr); alan-başı **advisory bellek** (ADR-0027,
yazma-tarafı zehir filtresi + karantina, ama **ATIL sevk**); PROSE-LEDGER (bir prompt steer'ı ancak eşli
sweep kanıtlayınca sil).

Örtüşen eksende **Canvas'ın skill zinciri bugün çalışıyor** (katalog + trigger + agent-server enjeksiyonu,
Claude-Code-tarzı); Tepegöz'ün skill'i bilerek "silahlandırılamaz" (yalnız şablon) ve belleği atıl.

### Checkpoint / geri-alma — ikisinde de zayıf, farklı sebeplerle

Canvas: bir checkpoint/rollback sistemi **yok**. Konuşmalar agent-server'da event-sourced kalıcı; çocuk
konuşmalar git **worktree** alıyor (izolasyon için, geri-alma için değil); "Compact context" bir
checkpoint değil. Kod değişikliklerini adım-adım geri alma (Kilo'nun shadow-git'i gibi) Canvas'ta yok —
o da SDK/ajan tarafının işi.

Tepegöz: `run-control` / run-lifecycle checkpoint'leri orchestrator'da var (`recovery.ts`) ama "paralel /
dayanıklı checkpoint-resume roadmap'te, sevk edilmedi" (ADR-0013). Web görevi için "geri alma" farklı bir
problem (mutasyon çoğu zaman uzak sunucuda); Tepegöz bunu **`Notary`** (hash-zinciri + Ed25519 imzalı
checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify` CLI) + origin kapısı +
completion-evidence ile ele almayı **tasarlıyor**. Notary'nin durumu dürüstçe söylenmeli: paket
yazılmış ve testli ama uygulamaya **hiç bağlanmamış** — `@tepegoz/notary`'yi kendi paketi dışında
import eden yer yok, `apps/desktop` onu tanımıyor, ve ADR-0030 bunu kendisi kaydediyor. Yani bugün
hiçbir çalışma makbuz üretmiyor; sevk edilen taraf origin kapısı + completion-evidence + journal.

Örtüşen eksende: klasik "undo" ikisinde de yok. **Denetlenebilir kayıt** ekseninde Tepegöz'ün Notary
zinciri Canvas'ta karşılığı olmayan bir **tasarım** (Canvas: PostHog telemetri + yerel event journal,
kriptografik imza yok) — ama bağlanana dek bugün üretilen bir kayıt değil; bugün ikisinin de elinde
imzasız bir event journal var.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

Canvas: bir tamamlama-oracle'ı yok. SDK'nin `FinishTool`'u (opsiyonel `TaskOutcome` response şeması) var;
`goal-store` konuşma-başına bir `GoalStatus` taşıyor (state-update event'lerinden). "Model 'kaydettim'
dedi ama sayfa 5xx döndü" tarzı bir deterministik düşürme mekanizması yok — kodlama ajanında bunun yerini
test-koşturma / self-check alır, o da SDK/ajan tarafında.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme**: model, sayfanın çürüttüğü bir iddiayı
`done`'a konuşturamaz; "Saved!" yazan ama 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı;
recipe-compiler'ın `evaluateAssertion` success oracle'ı. Kuzey-yıldızı koşulu: _"fabricated-success ≈ 0"_.
**Ama** claim-grade ölçüm henüz borçlu.

Örtüşen eksende **Tepegöz belirgin şekilde önde** — mekanizma seviyesinde Canvas'ın (ve arkasındaki
OpenHands ajanının bu depodan görünen kısmının) bir eşdeğeri yok. Ölçüm borcuyla birlikte.

### Prompt-injection & güvenilmez içerik — Canvas'ta neredeyse tamamı repo-dışı

Canvas: frontend seviyesinde tek somut şey markdown render'ında `rehype-sanitize` (script/handler/`javascript:`
strip) ve dinamik-context'te secret redaksiyonu. Ajanın güvenilmez sayfa/araç çıktısını nasıl ele aldığı
(nonce sarma, "data not instructions" etiketleri, breakout-strip) **SDK'de**. `docs/DefenseClaw.md` harici
bir governans katmanını (skill/MCP tarama, LLM trafik proxy'si, audit) _"kod değişikliği olmadan"_ yan
yana koşturmayı anlatıyor — ama bu Canvas'ın parçası değil, bir entegrasyon reçetesi, çoğu "future work".

Tepegöz: **model-öncesi deterministik Policy Kernel** kararın kendisini injection'dan bağımsız kılar
(argüman değerini görmeden deny/ask). `@tepegoz/tool-executor` gizli / zero-width / bidi / homoglyph
vektörlerini ayrı bir pakette temizler ve `wrapUntrustedContent` ile sarar. `EgressFirewall` çıkışta
entropi/sızıntı denetler. `TaintTracker` provenance. **Ama** claim-grade ASR bataryası measurement-owed
(S6).

Örtüşen eksende **Tepegöz mimari olarak çok daha derin** ve bu depoda; Canvas'ın savunması ya SDK'de
(bu karşılaştırmanın erişemediği) ya da opsiyonel bir harici overlay'de. İkisinin de bugün yayımlanmış
ASR sayısı yok.

### Kimlik bilgisi / sır işleme — Canvas'ın pratik bir modeli var

Canvas: **global secrets** — her sır, agent-server'ın ACP subprocess'ine export ettiği **çevre değişkeni
adıyla birebir aynı** isimde saklanıyor (`ANTHROPIC_API_KEY` vb.); başlatmada `LookupSecret` olarak
referanslanıp spawn anında agent-server'ın kendi store'undan çözülüyor. Konteynerize ACP için Codex
`auth.json` / Gemini Vertex SA blob'ları dosyaya materyalize ediliyor (SDK yapıyor). Çakışan
kimlik-bilgisi çiftleri (`CLAUDE_CODE_OAUTH_TOKEN` + `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`) için UI
uyarısı. Ayarlarda düzenlenebilir Secrets paneli; Fernet-token prefiksli şifreli değerler, MCP
kimlik-bilgisi redaksiyonu.

Tepegöz: **Credential Broker** — ajanda sırrın gireceği bir şekil yok; OS-auth kapısı olana dek her dolgu
reddedilir (**ATIL sevk**). `credential-vault` DPAPI/safeStorage BYO-key. Kavramsal olarak sır ajana hiç
ulaşmıyor.

Örtüşen eksende: Canvas'ın modeli **bugün çalışıyor ve pratik** (env-var eşlemesi, LookupSecret, çakışma
uyarıları) — ama sır, çalışan ajanın process'ine env-var olarak giriyor. Tepegöz'ün modeli kavramsal
olarak daha güçlü (sır ajana hiç akmıyor) ama **atıl**, yani bugün pratikte yok.

### Yerel model / egemenlik — ikisi de kısmi, Canvas "self-hosted" ekseninde güçlü

Canvas: LLM `base_url` ile yerel endpoint'ler (Ollama / LM Studio / vLLM / LocalAI); "bring your own
model". Asıl egemenlik hikâyesi **self-hosting**: agent-server'ı laptop / Mac Mini / VM / kendi
altyapında koştur, Canvas frontend'ini oraya bağla; bulut tamamen opsiyonel. Ama tarayıcı-içi WebGPU
LLM, gömülü çevrimdışı bilgi yığını, çevrimdışı RAG yok (bir kontrol merkezinin işi değil).

Tepegöz: `@tepegoz/local-inference` (`LocalProvider`, node-llama-cpp, **GBNF JSON gramer zorlaması**) +
`@tepegoz/model-catalog` (GGUF kataloğu, zorunlu sha256, resumable indirme) + "basit adımlar cihazda"
maliyet-tasarrufu düğmesi. **Ama** S12 "indirilmiş ağırlıklara takılı", sahiplik tablosu BOŞ; çevrimdışı
RAG yok.

Örtüşen eksende: **Canvas'ın self-hosted mimarisi bugün sevk edilmiş** (yerel/VM/Docker arka uç seçimi,
kendi LLM endpoint'in); Tepegöz'ün GBNF gramer-zorlamalı yerel çıkarım seam'i güvenilir-JSON için daha
sağlam bir mekanizma ama arkasındaki faz ölçülmemiş. Çevrimdışı bilgi ikisinde de yok.

### Maliyet şeffaflığı — ikisi de token/metrik, farklı vurgular

Canvas: **LLM balance** servisi (sağlayıcı bakiyesi kartı), konuşma **metrics-store** (token/maliyet
metrikleri), context-meter, LLM subscription statüsü. Kullanıcı bakiye ve konuşma-başı kullanım görüyor.

Tepegöz: `TokenLedger` her `ModelGateway.complete()` çağrısının token/maliyetini kaydeder; her çağrı
`maxTokens` + `timeoutMs` **zorunlu** (bütçesiz çağrı yok); S7 `$ / wall-clock` hedefleri ön-kayıtlı;
`ext-agent`'ta effort ön-ayarları + kaydırılabilir replay timeline.

Örtüşen eksende **kabaca eşit**: Canvas'ın kullanıcı-yüzü (bakiye + konuşma metrikleri) sevk edilmiş;
Tepegöz'ünki daha çok "hiçbir çağrı bütçesiz koşamaz" mühendislik kilidi ve ön-kayıtlı hedefler.

### Ölçüm / dürüstlük kültürü — farklı türde titizlik

Canvas: sağlam **ürün-mühendisliği** disiplini — `vitest` + Playwright (mock-LLM ve canlı e2e config'leri)

- **Stryker mutation testing** + ESLint/Prettier/typecheck + i18n tamlık kontrolü + `no-direct-agent-server-calls`
  CI guard + release-please. Ama bir **ajan-yetenek benchmark'ı / adversaryal ASR / ground-truth eval
  harness'ı bu depoda yok** (o da SDK tarafının işi olurdu).

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, kuzey-yıldızı
iddiası **reddedilebilir** (`bridgeClaim` 25 insan etiketinin altında `publishable:false`), ön-kayıtlı
H2H protokolü. Madalyonun öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var — her
S-fazı 🟠, hiçbiri ✅ değil.

Örtüşen eksende: Canvas'ın **frontend kalite guard'ları daha olgun ve gerçekten koşuyor**; Tepegöz'ün
**ajan-yetenek ölçüm çerçevesi araştırma-sınıfı** ama ölçtüğü şey henüz büyük ölçüde yok. Farklı
katmanlarda titiz iki proje.

---

## Örtüşmeyen alanlar

**Yalnızca OpenHands Agent Canvas'ta var (Tepegöz'de karşılığı yok):**

- **Ajan-agnostik host**: aynı UI'dan OpenHands SDK ajanı **veya** Claude Code / Codex / Gemini CLI /
  herhangi bir ACP sunucusu çalıştırma; ajan seçimi arka-uç-başına saklı.
- **Çoklu arka uç yönetimi**: local / Docker sandbox / VM / OpenHands Cloud & Enterprise; backend
  registry + sağlık-probu + odak kaybetmeden geçiş.
- **Automations**: ayrı Automation Server — cron ve Slack/GitHub/Linear webhook tetikleyicileri, çalışma
  geçmişi, dispatch.
- **Paralel / çocuk konuşmalar**: `launch_child_conversation` (yerel git worktree ya da bulut sandbox),
  ebeveyn-çocuk kaydı.
- **Kodlama-ajanı workspace UX'i**: dosyalar (git diff görünümü), terminal (`xterm`), gömülü **VS Code**
  (openvscode-server, path-prefix ile aynı origin'de), planner + tasklist sekmeleri, `canvas_ui_control`
  client-tool'u ile ajanın sağ paneli sürmesi.
- **ACP protokolü** entegrasyonu (JSON-RPC over stdio), ACP-Docker örneği, per-conversation izolasyon
  tartışması, ACP kimlik-bilgisi çakışma uyarıları.
- **npm ile dağıtılan kendi-barındırılan kontrol merkezi** + `--frontend-only` / `--backend-only` /
  `--public` yığın başlatıcıları + Electron paketi (aynı web UI'yi paketler, `uv` + `node` gömer).
- **LiteLLM köprüsü** üzerinden ~yüzlerce sağlayıcı/model + LLM profilleri + OAuth provider connections
  - abonelik-oturumu auth + bakiye servisi.
- Zengin **MCP yapılandırma UI'si** (stdio/sse/shttp, `oauth2` dahil, health-probe, marketplace).
- Dokümante **DefenseClaw** entegrasyon reçetesi (harici governans/audit overlay).

**Yalnızca Tepegöz'de var (Agent Canvas'ta karşılığı yok):**

- **Native tarayıcı** + out-of-process CDP + **DOM/a11y-önce algı** (ADR-0008; kimlik-kararlı ref'ler,
  diff/elision, `aria-labelledby`/`label[for]` çözümü, `browser_get_article`) + genel web otomasyonu
  (tıkla/yaz/gez/form-gönder/sekme-yönet, ~15+ `browser_*`/`tab_*`/`web_*` aracı).
  _(Canvas'taki "Browser" sekmesi yalnızca ajanın sandbox-içi tarayıcı aracının ürettiği ekran
  görüntüsü + URL'yi salt-okunur gösteren bir panel — kullanıcı süremiyor, genel otomasyon değil.)_
- `@tepegoz/human-input` — Catmull-Rom fare eğrileri + Gaussian jitter (bot-tespiti karşıtı hareket
  profili).
- **Model-öncesi deterministik Policy Kernel** (danger class + taint + site → deny/ask, argümanı
  görmeden) + hassas-site kategorik sert deny + biyometrik yüksek-risk kapısı.
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance +
  `detectHandoff` (captcha/2FA → insana devir).
- **Notary** (Phase 7): hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** +
  bağımsız `tepegoz-verify` CLI. _(Paket yazılmış ve testli, ama `apps/desktop`'a bağlanmamış —
  bugün makbuz üretmiyor; ADR-0030.)_
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme +
  tuzak fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **Model-free deterministik şerit**: `macro-engine` (iMacros halefi, kontrol akışı + oto-bekleme) +
  `recipe-compiler` (imzalı replay + `evaluateAssertion` success oracle).
- **Tek ToolGateway PEP** (built-in / MCP / extension ayrımsız) + `tool-executor` homoglyph/bidi/
  zero-width sanitizer paketi.
- **Araştırma-sınıfı `agent-eval` harness'ı** (ground-truth-önce, donmuş fixture'lar, istatistiksel
  anayasa, reddedilebilir kuzey-yıldızı iddiası, anti-debt / PROSE-LEDGER).
- GBNF gramer-zorlamalı yerel çıkarım seam'i + sha256'lı GGUF model kataloğu.
- **Türkçe/kamu derinliği**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H görev şartı,
  Phase 11 e-Devlet/KVKK güven modeli (ADR-0036), Türk şirket (roltek.com.tr).

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | OpenHands Agent Canvas                                                                                                                           | Tepegöz                                                                                                                                                                                     | Kim daha iyi + neden                                                                                                                                                                    |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi / birincil iş**          | Kodlama-ajanı **kontrol merkezi / host**: ajan çalıştır/çoğulla/otomatikleştir, çoklu arka uç                                                    | Tarayıcı ajanı + güvenlik-önce native tarayıcı: web'de çok-adımlı görev yürüt                                                                                                               | **Örtüşmüyor** — Canvas ajanın kendisi değil, onu barındıran katman; "kim iyi" ancak alt-eksenlerde anlamlı                                                                             |
| 2   | **Dağıtım / form**                         | `npm i -g` ile kontrol merkezi + opsiyonel Electron; mevcut ajanlara sıfır-göç, self-hosted                                                      | Tam Electron tarayıcı; kurulum + tarayıcı değişimi gerek, henüz yayında değil                                                                                                               | **Bugün Canvas** (erişim + olgunluk + self-host esnekliği)                                                                                                                              |
| 3   | **"Ajanın" ne olduğu**                     | Takılabilir: OpenHands SDK ajanı **veya** Claude Code / Codex / Gemini / özel ACP                                                                | Tek, kendi orkestratörü (Planner→Executor→Reactor)                                                                                                                                          | **Canvas** esneklikte — olgun bir 3P ajanı takabilmek gerçek avantaj. Tepegöz tek motor sunar                                                                                           |
| 4   | **Sağlayıcı genişliği + sıfır-kurulum**    | LiteLLM köprüsü → ~yüzlerce sağlayıcı/model + profiller + OAuth bağlantı + abonelik-auth + ücretsiz varsayılan                                   | 8 sağlayıcı (bazıları stub) + `local`; sıfır-kurulum bulut yok                                                                                                                              | **Canvas** — kıyas kabul etmez                                                                                                                                                          |
| 5   | **Sağlayıcı mimarisi**                     | LiteLLM normalizasyonu + profil/bağlantı katmanı                                                                                                 | Tek `Canon*` şeması, capability→tier router, zorunlu `maxTokens`+`timeoutMs`, GBNF JSON zorlaması, DPAPI kasa                                                                               | **Tepegöz** — daha tipli, tek kaynak, bütçesiz çağrı imkânsız                                                                                                                           |
| 6   | **Ajan döngüsü (tek görev içi)**           | Bu depoda yok — SDK'de veya ACP ajanında                                                                                                         | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL; tek eşzamanlı run                                                                                                                 | **Örtüşmüyor** — Canvas'ın kapsamı değil. Tepegöz'ün döngüsü açık ama serileştirilmiş + kanıtsız                                                                                        |
| 7   | **Çoklu-ajan / arka-uç orkestrasyonu**     | Backend registry + geçiş + paralel çocuk konuşmalar (worktree/bulut) + zamanlanmış automations                                                   | Sekme-grubu-başı oturum + arka-plan run + tepsi; **tek eşzamanlı run**                                                                                                                      | **Canvas** — gerçek paralel/izole/zamanlanmış çalışma                                                                                                                                   |
| 8   | **Onay / izin modeli**                     | `confirmation_mode` + `security_analyzer` (`llm`/`pattern`/`policy_rail`) → SDK `ConfirmationPolicy`; client-tool risk tahmini; asıl kapı SDK'de | **Tek PEP**: zod→PolicyKernel→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                                              | **Tepegöz** — her araç istisnasız aynı deterministik hattan                                                                                                                             |
| 9   | **Model-öncesi güvenlik kararı**           | Yok — analyzer stratejileri + varsayılan "engellenmedikçe yürüt"; asıl SecurityAnalyzer SDK'de                                                   | **Deterministik PolicyKernel** danger-class+taint+site, argümanı görmez; hassas-site kategorik deny; biyometrik                                                                             | **Tepegöz** — belirgin mimari fark                                                                                                                                                      |
| 10  | **İzolasyon / sandbox**                    | Seçilebilir: local (tam host erişimi — uyarılı), Docker sandbox, VM, bulut                                                                       | Renderer-untrusted + `createWindow` fabrikası; ajan dosya araçları ajan-sandbox'ında; terminal yok                                                                                          | **Canvas** "nerede koşsun" esnekliğinde; **Tepegöz** varsayılan olarak zaten komut/terminal yürütmüyor                                                                                  |
| 11  | **Web / tarayıcı otomasyonu**              | Yok — "Browser" sekmesi ajanın sandbox tarayıcısının salt-okunur ekran-görüntüsü paneli                                                          | Native CDP + DOM/a11y algı + ~15 web aracı + insan-benzeri girdi + macro/recipe                                                                                                             | **Tepegöz** — Canvas'ın problemi bu değil                                                                                                                                               |
| 12  | **Kod editleme / terminal / IDE**          | Çekirdek: files/terminal/VS Code sekmeleri, kod-ajanı workspace'i (yürüten ajan üzerinden)                                                       | **Yok** — ADR-0026/0029 (salt-okunur code-exec, DevTools kullanıcı-only)                                                                                                                    | **Canvas** — Tepegöz bunu bilerek yapmıyor                                                                                                                                              |
| 13  | **Otomasyon / zamanlama**                  | Automation Server: cron + Slack/GitHub/Linear webhook, çalışma geçmişi                                                                           | `@tepegoz/tasks`: kayıtlı görev + interval/page-change/external tetik, ama tek-run                                                                                                          | **Canvas** — gerçek zamanlanmış/webhook otomasyonu bugün çalışıyor                                                                                                                      |
| 14  | **MCP**                                    | İstemci-yapılandırma UI'si (stdio/sse/shttp + `oauth2` + health + marketplace); istemci agent-server                                             | İstemci — dış araçlar tek PEP + `McpSupervisor` + fail-safe danger sınıfı; sunucu yüzeyi yok                                                                                                | **Kıl payı Canvas** (OAuth2 + health + marketplace sevk edilmiş). **Tepegöz** mimari temizlikte                                                                                         |
| 15  | **MCP / dış-ajan yönü**                    | Canvas ajana `canvas_ui_control` + `launch_child_conversation` client-tool'u sunuyor; dış ajan için MCP server yok                               | Dış ajan için MCP server yüzeyi yok (planlı)                                                                                                                                                | **Berabere** — ikisinde de "başka ajan beni sürsün" yok                                                                                                                                 |
| 16  | **Context yönetimi**                       | Context-meter + tek-tık `/condense`; sıkıştırma mantığı SDK'de                                                                                   | cache-window (lag-2) + Reactor working-state + perception diff/elision + sanitizer                                                                                                          | **Berabere-benzer** — Canvas'ın kullanıcı-yüzü var ama mantık kilitli; Tepegöz'ünki repoda ama ölçülmemiş                                                                               |
| 17  | **Prompt mimarisi / skill**                | Bundled skill katalog (SKILL.md + trigger) + user/project/org skills + runtime-services context eki; enjeksiyon SDK'de                           | Skill = yalnız prompt şablonu (bilerek); advisory bellek **ATIL**; PROSE-LEDGER                                                                                                             | **Canvas** — skill zinciri bugün iş yapıyor (Claude-Code-tarzı)                                                                                                                         |
| 18  | **Checkpoint / geri-alma**                 | Yok — event-sourced kalıcılık + çocuk konuşma worktree'si (izolasyon, undo değil)                                                                | Run-lifecycle checkpoint var ama resume sevk edilmedi; web-undo farklı problem (Notary + origin kapısı)                                                                                     | **Berabere-zayıf** — klasik undo ikisinde de yok                                                                                                                                        |
| 19  | **Doğrulanmış sonuç / yalan-başarı**       | `FinishTool`/`TaskOutcome` şeması + `GoalStatus`; deterministik tamamlama-oracle'ı yok                                                           | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                           | **Tepegöz** — mekanizma belirgin şekilde ileri (ölçüm borçlu)                                                                                                                           |
| 20  | **Prompt-injection savunması (mimari)**    | Frontend'de yalnız markdown sanitize + secret redaksiyon; asıl savunma SDK'de / opsiyonel DefenseClaw overlay'de                                 | Pre-model kernel + `tool-executor` homoglyph/bidi/zero-width sanitizer + `EgressFirewall` entropi + taint                                                                                   | **Tepegöz** — bu depoda ve daha derin katmanlı                                                                                                                                          |
| 21  | **Prompt-injection (kanıt bugün)**         | Repoda adversaryal korpus / ASR yok (SDK tarafı)                                                                                                 | Redteam + injection-corpus var ama claim-grade ASR bataryası measurement-owed                                                                                                               | **Berabere-zayıf** — ikisinin de bugün yayımlanmış ASR sayısı yok                                                                                                                       |
| 22  | **Hesap verebilirlik / denetlenebilirlik** | PostHog telemetri (opt-out) + yerel event journal + opsiyonel DefenseClaw audit store                                                            | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` — **yazılmış ama uygulamaya bağlanmamış**; sevk edilen: event-sourced journal | **Mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir; Canvas'ta eşi yok. **Bugün berabere-zayıf** — Notary üretmediği için ikisinin de elinde imzasız bir journal var |
| 23  | **Kimlik bilgisi / sır işleme**            | Global secrets = env-var adı; `LookupSecret` ile spawn-anında çözüm; çakışma uyarıları; sır çalışan process'e env olarak girer                   | Credential Broker: sırrın gireceği şekil yok, OS-auth olana dek reddeder (**ATIL**) + DPAPI kasa                                                                                            | **Bugün pratikte Canvas** (çalışıyor); **kavramsal olarak Tepegöz** (sır ajana hiç akmıyor) ama atıl                                                                                    |
| 24  | **Yerel model**                            | LiteLLM `base_url` → Ollama/LM Studio/vLLM/LocalAI; "BYO model"                                                                                  | `local-inference` + GGUF katalog (sha256) + **GBNF JSON gramer zorlaması**                                                                                                                  | **Berabere** — Canvas ekosistem genişliğinde, Tepegöz güvenilir-JSON mekanizmasında; ikisi de kısmi                                                                                     |
| 25  | **Egemenlik / self-hosting**               | Güçlü: agent-server'ı laptop/VM/kendi altyapında koştur, bulut tamamen opsiyonel; çevrimdışı bilgi yok                                           | `local-inference` seam + maliyet-tasarrufu düğmesi; çevrimdışı RAG yok, S12 ağırlıklara takılı                                                                                              | **Canvas** — self-hosted mimari bugün sevk edilmiş                                                                                                                                      |
| 26  | **Maliyet şeffaflığı**                     | LLM balance kartı + konuşma metrics-store + context-meter + abonelik statüsü                                                                     | `TokenLedger` + zorunlu per-çağrı bütçe alanları + effort ön-ayarları + S7 ön-kayıtlı $ hedefleri                                                                                           | **Kıl payı Canvas** kullanıcı-yüzünde; **Tepegöz** "bütçesiz çağrı imkânsız" kilidinde                                                                                                  |
| 27  | **Türkçe / bölgesel derinlik**             | i18next çoklu-dil (tr muhtemelen dahil) + `check-translation-completeness` — "birçoktan biri"                                                    | Parity-zorunlu EN+TR i18n (ADR-0016), TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli, Türk şirket                                                                              | **Tepegöz** — taahhüt derinliği                                                                                                                                                         |
| 28  | **Ölçüm / dürüstlük kültürü**              | Sağlam frontend guard'ları: vitest + Playwright + **Stryker mutation** + i18n tamlık + CI guard'ları; ajan-yetenek benchmark'ı repoda yok        | Ground-truth `agent-eval` harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                           | **Farklı katmanlar** — Canvas'ın frontend kalite disiplini olgun ve koşuyor; Tepegöz'ün ajan-yetenek çerçevesi araştırma-sınıfı ama ölçtüğü şey henüz yok                               |
| 29  | **"Bugün çalışıyor mu"**                   | Evet (host olarak) — `v1.16.0`, npm + Docker, self-hosting kılavuzu, ACP entegrasyonları; ama "beta"                                             | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                | **Canvas** — bir kontrol merkezi olarak kesin; ama "ajan" onun içinde değil                                                                                                             |
| 30  | **Güvenlik felsefesi**                     | "Engellenmedikçe yürüt" + izolasyonu kullanıcının sandbox seçimine bırak; local backend'de ajan tam host erişimli (uyarılı)                      | Model-öncesi sert deny + kategori kilidi + egress denetimi + biyometrik; "asla" listesi                                                                                                     | **Tepegöz** — bahsi bu; henüz kanıtlanmadı ama mimari niyet net                                                                                                                         |

---

## Sonuç

**Bunlar farklı ürünler — hatta Kilo Code'dan bile daha uzak.** OpenHands Agent Canvas kod yazan bir ajan
bile değil: bir **kontrol merkezi** — OpenHands'in kendi ajanını ya da Claude Code / Codex / Gemini gibi
üçüncü-parti ajanları yerel / Docker / VM / bulut arka uçlarında çalıştırıp yönetir, zamanlanmış
otomasyonlar kurar, paralel konuşmalar başlatır. Ajan döngüsü, araç yürütücü, sistem-prompt'u,
context sıkıştırma ve prompt-injection savunması bu depoda **yok** (`software-agent-sdk`'de veya takılan
ACP ajanında). Tepegöz ise web'de görev yürüten güvenlik-önce bir tarayıcı ajanı + native tarayıcı.
"Hangisi daha iyi" bütün olarak yanlış soru: Canvas'ta native tarayıcı, model-öncesi Policy Kernel,
EgressFirewall, Notary replay-receipt, kanıt-atıflı tamamlama ya da genel web otomasyonu yok; Tepegöz'de
ajan-agnostik hosting, çoklu arka uç, ACP çoğullama, zamanlanmış otomasyon, kod-workspace UX'i,
gömülü VS Code ya da paralel çocuk konuşmalar yok.

**Örtüşen eksenlerde (çok-model/çok-sağlayıcı, MCP yapılandırma, otonomi/otomasyon, self-hosting,
maliyet-yüzü, skill zinciri, olgunluk) bugün Agent Canvas önde:** LiteLLM köprüsüyle yüzlerce
sağlayıcı/model + profiller + OAuth bağlantılar (8'e karşı), gerçek zamanlanmış + webhook otomasyonları,
paralel izole çocuk konuşmalar, çoklu arka uç arasında geçiş, OAuth2'li MCP yapılandırma + marketplace,
çalışan Claude-Code-tarzı skill enjeksiyonu, ve olgun frontend kalite disiplini (Stryker mutation dahil)
— ve hepsinin üstünde **npm'de yayımlanmış, self-hosting kılavuzu olan, gerçekten kurulup çalıştırılan
bir ürün**. Ek olarak, Canvas'ın en iyi 3P kodlama ajanını (Claude Code) motor olarak takabilmesi,
"ajan kalitesi" ekseninde onu tek bir orkestratöre bağlamıyor.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz önde:** tek ToolGateway PEP, model-argümanını
görmeden karar veren deterministik Policy Kernel, hassas-site kategorik deny + biyometrik, `EgressFirewall`
entropi denetimi, taint provenance, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify`
(Canvas'ta eşi yok), kanıt-atıflı tamamlama + yalan-başarı savunması, model-free deterministik
macro/recipe şeridi, homoglyph/bidi/zero-width sanitizer paketi, zorunlu per-çağrı bütçe alanları,
araştırma-sınıfı `agent-eval` + anti-debt kültürü, ve Türkçe/kamu derinliği. Ayrıca Canvas'ın kendi
`SELF_HOSTING.md`'sinin uyardığı "local backend'de ajan makineye tam erişir" riskini **yapısal olarak
farklı ele alan** taraf Tepegöz'dür (terminal/kod-exec yok, model-öncesi kernel).

Dürüst özet: **Agent Canvas bugün iş gören, olgun bir kontrol merkezi — ama barındırdığı ajan onun içinde
değil; Tepegöz'ün ajanı ise henüz kanıtlanmadı** — her S-fazı 🟠 measurement-owed, vision /
credential-broker / memory atıl sevk, Notary hiç bağlanmamış, aynı anda tek run, site adaptörü yok,
sağlayıcıların bir kısmı stub.
Bugün birden çok kodlama ajanını laptop/VM/bulutta çalıştırıp otomatikleştirecek bir merkez lazımsa →
OpenHands Agent Canvas. Tez "oturum-açık banka oturumuna güvenebileceğin, ne yaptığının kriptografik
kanıtı olan, model-öncesi deterministik bir çekirdekten geçen, Türkçe bir _tarayıcı_ ajanı" ise → o
Tepegöz'ün oyunu, hâlâ tezgâhta.
