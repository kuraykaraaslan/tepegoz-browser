# Tepegöz vs BrowserSkill — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **BrowserSkill** (Tencent, MIT lisanslı; `bsk` Rust
> CLI + yerel daemon + MV3 Chromium/Edge eklentisi; CLI `v0.1.11`, Chrome Web Store + Edge Add-ons'ta
> yayında) arasında, iş-iş kimin neyi daha iyi yaptığını tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/browserskill` deposunun (`README.md`, `README.zh-CN.md`, `AGENT_INSTALL.md`,
> `docs/architecture.md`, `skill/SKILL.md` + `crates/bsk-cli/skill/SKILL.md`, `Cargo.toml` workspace,
> `package.json` + `pnpm-workspace.yaml`, `crates/bsk-cli/src/cli/**` + `src/daemon/**`,
> `crates/bsk-protocol/schema/**`, `apps/extension/src/tools/{dispatcher,evaluate,human-loop,tabs,
borrow-confirmation}.ts`, `apps/extension/src/session-manager/**`, `packages/vom/**`,
> `packages/dsh-plugin-browserskill/{src/tools.ts,README.md,skill/SKILL.md}`, `packages/i18n/src/locales/**`,
> `evals/browser/README.md`) ve bu reponun AI yüzeyinin (`phases/ai-agent/`,
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
> **İlgili:** [`prompts/rival-agent-parity-track.md`](../../prompts/rival-agent-parity-track.md) — bu
> karşılaştırmayı fazlara/ADR'lere yönlendiren parity track'i üreten prompt; kardeş örnek
> [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md). BrowserSkill
> için ayrı bir parity track'i **henüz yok**.
>
> **Kategori uyarısı.** Bunlar **farklı ürün kategorileri**. BrowserSkill bir _tarayıcı ajanı değil_:
> içinde **LLM yok, ajan döngüsü yok, sistem-prompt yok, sağlayıcı soyutlaması yok, context yönetimi
> yok, checkpoint yok**. BrowserSkill bir **ajan-etkinleştirme katmanı / skill runtime**: Cursor,
> Claude Code, Codex, OpenClaw, DeepSeek Harness gibi _dışarıdaki_ ajanların, kullanıcının **zaten
> oturum-açık gerçek Chromium tarayıcısını** bir `bsk` CLI + yerel daemon + eklenti köprüsü üzerinden
> sürmesini sağlar. Modeli, döngüyü, prompt'u, otonomiyi çağıran harness taşır. Tepegöz ise _ajanın
> kendisi_ + güvenlik-önce native tarayıcı: modeli çalıştırır, planlar, model-öncesi deterministik bir
> Policy Kernel'den geçer, tamamlamayı kanıta atıfla imzalar. Kabaca: **BrowserSkill, Tepegöz'ün
> `@tepegoz/browser-tools` + `BrowserHost` seam'i + eklenti sandbox'ının, _başkalarının ajanları için_
> tek başına bir ürün olarak çıkarılmış hâline** benziyor — Tepegöz bu yüzeyi bilerek dışa açmıyor
> (ADR-0018 MCP yalnız istemci; MCP sunucu yüzeyi yapılmadı). Bu belge önce bu asimetriyi söyler, sonra
> **örtüşen eksenlerde** (perde arkasındaki tarayıcı araç yüzeyi, algı, izin/onay, insan devri, sandbox,
> sır işleme, denetlenebilirlik, deterministik tekrar, çoklu-oturum, ölçüm) iş-iş kıyaslar.
> Örtüşmeyenler ayrı bir başlıkta dürüstçe listelenir.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|             | BrowserSkill                                                                                                                                                                               | Tepegöz                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | `bsk` Rust CLI + yerel daemon (loopback WS) + MV3 Chromium/Edge **eklentisi**; harness ile bir **SKILL.md** ve shell çağrısı üzerinden konuşur; DeepSeek Harness için ayrıca native plugin | Tam **Electron tarayıcı**; ajan (Agent Console / "Do modu") alt sistemlerden biri                                                                   |
| Olgunluk    | **Yayında** — Chrome Web Store + Edge Add-ons, `install.sh`/`install.ps1`, oto-güncelleme; ama erken (`v0.1.11`, 4-harfli session id "v0.1'de", Firefox "planlı")                          | **1.0 öncesi**; `phases/ai-agent` S0–S12 fazlarının **hepsi 🟠 measurement-owed**, hiçbiri ✅ değil, sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Rust workspace (2 crate: `bsk-cli`, `bsk-protocol`) + pnpm workspace (WXT/MV3 eklenti, `@browser-skill/vom`, `ui`, `i18n`, dsh-plugin); şema Rust'ta, TS ayna                              | Strict TS, pnpm + turbo monorepo, ~70 `@tepegoz/*` paket, ADR güdümlü, zod `safeParse` her sınırda                                                  |
| Felsefe     | "AI ajanlarının işini bölmeden senin tarayıcını kullanması"; görünür otomasyon (ayrı **Agent Window**), açık sandbox sınırları, harness-bağımsızlık, kilit-yok                             | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik + determinism-first                        |
| Birincil iş | _Dışarıdaki bir ajanı_ kullanıcının oturum-açık tarayıcısına bağlamak: gezinme/okuma/tıklama/form araçları + insan devri + kayıt; **karar ve model çağıran harness'ta**                    | Web'de görev yürütmek: gezinme, form doldurma, çıkarım, çok-adımlı akış; güvenli oturum-açık site otomasyonu — model dahil **uçtan uca kendisinde** |

Yani: **yayında, olgunlaşmakta olan bir ajan-etkinleştirme köprüsü** vs. **erken, mimari ağırlıklı,
güvenlik-önce bir tarayıcı ajanı**. BrowserSkill'in kıyaslanabilir yüzeyi Tepegöz'ün _tamamı_ değil,
yalnızca "tarayıcıya araç yüzeyi + sandbox + insan devri" katmanı. LLM/ajan ekseninde kıyas yok çünkü
BrowserSkill'de o eksen **yok** — onu çağıran Claude Code / Cursor / Codex taşıyor.

---

## Derinlemesine: örtüşen eksenlerde iş iş kim ne yapıyor

### Mimari / bağlanma yolu — farklı, ve BrowserSkill'inki bugün çalışıyor

BrowserSkill: `harness → shell: bsk <cmd> → yerel daemon (JSON Lines / UDS) → WebSocket (127.0.0.1:52800)
→ MV3 eklenti → CDP + WebExtension API → Agent Window`. Daemon ilk kullanımda oto-doğar, boşta 5 dk
sonra kapanır; WS handshake'te `Origin: chrome-extension://…` allowlist'i var; her şey loopback. Harness
bağlantısı iki yoldan: (1) harness'ın skill dizinine kopyalanan `SKILL.md` + `bsk` shell çağrıları;
(2) DeepSeek Harness için native plugin (`browser_*` araçlarını enjekte eder, arka planda yine `bsk`
çağırır). **MCP kullanmıyor** — ne istemci ne sunucu.

Tepegöz: native, out-of-process CDP; kendi sekme/pencere modeli; ajan aynı süreç ailesinde. Dış
ajanların Tepegöz'ü sürmesi diye bir yüzey **yok** (MCP sunucu yapılmadı).

Örtüşen eksende: BrowserSkill'in "herhangi bir shell-yetenekli ajan + senin mevcut tarayıcın" bağlanma
modeli **bugün kuruluyor ve çalışıyor**; Tepegöz'ün karşılığı yok (ve zaten hedefi de bu değil).
**Bu eksende BrowserSkill.**

### Araç & aksiyon repertuvarı — benzer büyüklük, BrowserSkill daha dar kapsamlı

BrowserSkill: ~35 `bsk` alt-komutu / eklentide **21 tool handler** / eval envanterinde **28 tarayıcı
operasyonu**. Aileler: oturum (`session start/stop/list`), pencere (`window resize`), sekme
(`tab list/create/close/select/borrow/return`), gezinme (`navigate` + `back/forward/reload`), etkileşim
(`click/hover/fill/select/press`), gözlem (`snapshot/observe/get-html/screenshot`), salt-okunur teşhis
(`console/network`), betik/zamanlama (`evaluate`, `wait-for-navigation`, `wait-ms`), cihaz emülasyonu
(`emulate` — 7 preset), insan devri (`request-help`), kayıt (`record start/stop`), teşhis
(`status/doctor/browsers`). dsh-plugin bunları modele **6 araca** katlar (`browser_session/page/inspect/
interact/tabs/assist`) — `evaluate` ve `record` bilerek dışarıda bırakılmış (biri "yüksek riskli", öbürü
"uzun-koşu, ayrı lifecycle gerek").

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): `lookup → idempotency → zod → PolicyKernel
→ HITL → execute → audit`. `browser_*`, `tab_*` (`spawn` + `egress_blocked` dahil), `web_*`
(search/get_page/send_form), **`file_*`** (tam sandbox'lı dosya sistemi), `clipboard_*`, `download_*`/
`upload_*`, `journal_search_events`, `task_*`, `extension_*`. Ayrıca **model-free deterministik şerit**:
`macro-engine` + `recipe-compiler`. `execute_js`/terminal **yok** (ADR-0026).

Örtüşen eksende: repertuvar büyüklüğü kabaca eşit. BrowserSkill'de cihaz emülasyonu, salt-okunur
console/network teşhisi ve `evaluate` var (Tepegöz'de yok); Tepegöz'de dosya sistemi, web araçları,
download/upload, task ailesi ve model-free macro/recipe var (BrowserSkill'de yok). BrowserSkill'in her
aracı harness'ın kendi izin mekanizmasına tabi; Tepegöz'ün her aracı istisnasız aynı deterministik
PEP'ten geçer. **Genişlikte berabere; çağırma disiplininde Tepegöz.**

### Algı (sayfayı okuma) — ikisi de DOM/a11y-önce, tasarım felsefesi aynı

BrowserSkill: `bsk observe` → `@browser-skill/vom` paketinin ürettiği **semantik VOM gözlemi** (roller,
durumlar, `@eN` ref'leri, koşullu hover/focus yüzeylerini açığa çıkaran sınırlı "perception probe"lar);
`bsk snapshot` → statik erişilebilirlik ağacı (fallback); `bsk get-html` → ham HTML (yüksek token
maliyeti, son çare); `bsk screenshot` → görsel, en son çare, `--ref @eN` ile tek öğeye kırpılabilir.
SKILL.md sıralamayı sertçe dayatıyor: observe → snapshot → (gerekirse) html/screenshot. `observe`/
`snapshot`'ta `--max-tokens`/`--max-depth` kırpma; `record` bundle'ında `--max-page-tokens`. **Vision
modeli BrowserSkill'de yok** — herhangi bir görsel muhakemeyi çağıran harness'ın modeli yapar.

Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision** (değişmeyen DOM'u
kesme), `aria-labelledby`/`label[for]` çözümü, `browser_get_article`. `tool-executor` gizli/zero-width/
bidi/homoglyph enjeksiyon vektörlerini ayrı pakette temizler. Vision **yalnızca eskalasyon** (ADR-0008/
S10) — ama **üretimde hiç bağlanmamış**: `captureVision` Reactor'a enjekte edilen opsiyonel bir
geri-çağrı ve onu geçen tek yer testler; yani atıl, ölçülmemiş.

Örtüşen eksende: iki taraf da aynı felsefeyi paylaşıyor (DOM/a11y-önce, screenshot son çare, token
kırpma). BrowserSkill'in VOM'u bugün gerçek kullanımda; Tepegöz'ün perception-v2 diff/elision'ı tasarım
olarak daha agresif token kesiyor ama measurement-owed. BrowserSkill'in enjeksiyon-vektörü temizliği
yok; Tepegöz'ünki var (ama ölçülmemiş). **Bugün BrowserSkill (çalışan VOM), tasarımda ~berabere.**

### İzin / onay modeli — farklı katman: BrowserSkill sandbox+borrow, Tepegöz pre-model kernel

BrowserSkill'in _kendi_ dayattığı kapılar dar ama net:

- **Sandbox**: yazma araçları yalnızca Agent Window içindeki (veya oraya _ödünç alınmış_) sekmelerde
  çalışır; kullanıcının kendi pencereleri yazmaya kapalı, sadece okunur.
- **Tab borrow onayı**: bir kullanıcı sekmesini Agent Window'a taşımak **açık kullanıcı onayı**
  gerektirir — sayfa-içi overlay + OS bildirimi (Allow/Deny butonları); **fail-closed**: zaman aşımı,
  iptal, enjekte edilemeyen pencere, bozuk yanıt → hepsi **deny**; 5 sn geri sayım sonunda oto-deny.
- **`evaluate` kapısı**: ham JS yalnızca Agent Window / ödünç sekmelerde; keyfi kullanıcı sekmesinde
  `permission_denied` (token-exfil penceresi olmasın diye).
- **Çapraz-oturum izolasyonu**: başka oturumların Agent Window'ları `tab_list`'ten filtrelenir.
- **`bsk request-help`**: ajan-başlatımlı duraklat-ve-sor; `BSK_REQUEST_HELP=off` ile gözetimsiz modda
  hiç overlay yok (`outcome="disabled"`).

BrowserSkill'de **danger-class yok, taint yok, otonomi seviyesi yok, hassas-site kategorisi yok**.
SKILL.md'deki "Red lines" (token hırsızlığı yok, uzun borrow yok, hep `session stop`) _çağıran modele
verilen talimat_, kod-zoru değil.

Tepegöz: **model-ÖNCESİ deterministik `PolicyKernel`** (ADR-0006): danger class (`read`/`state_changing`/
`destructive`/`financial`) + taint + hedef site → `allow`/`deny`/`ask` + makine-okunur reason code +
biyometrik (Windows Hello). `isSensitiveSite` (banka/kripto/sağlık/kamu/parola yön.) = **her otonomi
seviyesinde sert `deny`**; otonomi yalnız kernel'in sorduğu prompt'u atlayabilir, `deny`'ı bozamaz.
İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi fail-safe. `detectHandoff` (captcha/2FA).

Örtüşen eksende: BrowserSkill'in modeli **pratik ve sevk edilmiş** — sandbox + fail-closed borrow onayı
gerçekten çalışan, dürüst kapılar. Ama izin kararı esasen "hangi sekme" sorusuyla sınırlı; "bu aksiyon
tehlikeli mi / bu site hassas mı / bu argüman kirli mi" sorusu **çağıran harness'a** bırakılmış.
Tepegöz'ün kernel'i bu soruları model argümanını görmeden, deterministik olarak yanıtlar.
**Mekanizma derinliğinde Tepegöz; bugün-çalışırlıkta BrowserSkill'in sandbox+borrow'u somut.**

### İnsan devri (captcha / login / 2FA) — ikisi de var, olgunluk BrowserSkill'de

BrowserSkill: `bsk request-help --prompt … --target @e7 --timeout 5m [--completion-criteria {…}]` —
hedef sekme öne alınır, ajan kontrol maskesi gizlenir, sayfa etkileşimli kalır; çağrı kullanıcı "Done"
diyene, iptal edene, zaman aşımına ya da açık `completion-criteria` (url/selector/text koşulları,
`stable_for_ms`) eşleşene kadar **bloklar**. Sonuç: `continued`/`cancelled`/`timed_out`/`completed`.
`note` ile kullanıcının yazdığı metin geri döner. Sayfa yeniden yüklenmesi / SPA route değişimi tek
başına kontrolü geri vermez. Kod tarafında ciddi bir "re-arm" makinesi var (tab created/activated/
navigation complete olaylarında overlay'i yeniden kur).

Tepegöz: `detectHandoff` (captcha/2FA) + `ext-agent`'ta **Human Handoff Controller** — kontrolü
kullanıcıya geri verir, çözmez; `credential-broker` (ADR-0039) ile 2FA/parola akışları. ADR-0039 auto-
clear broker.

Örtüşen eksende: kavram aynı, BrowserSkill'in uygulaması **daha olgun ve daha çok kenar-durumu ele
alıyor** (completion-criteria, re-arm, notification fallback, unattended kill-switch). **BrowserSkill.**

### Sandbox / izolasyon modeli — farklı tehdit modelleri

BrowserSkill: ayrı **Agent Window** = görünür otomasyon; kullanıcı kendi pencerelerinde kesintisiz
çalışmaya devam eder. Çoklu oturum = çoklu Agent Window, tam izole. Daemon + WS loopback; eklenti-origin
allowlist; bsk'de kimlik bilgisi saklanmaz (çerezler kullanıcının profilinde kalır). İzolasyon
_tarayıcı-içi mantıksal_ (pencere + borrow tablosu).

Tepegöz: renderer güvenilmez, tek `createWindow()` fabrikası, typed `contextBridge`; ajan dosya
araçları bir _ajan sandbox'ında_; `EgressFirewall` çıkışta entropi/sızıntı denetler; `TaintTracker`
provenance. İzolasyon _süreç + politika + çıkış_ katmanlı.

Örtüşen eksende: BrowserSkill "kullanıcı işini bölme + agent'ı görünür tut" pratik UX bahsini iyi
çözüyor; Tepegöz süreç/çıkış izolasyonunda daha derin ama bunların çoğu ölçülmemiş. **Farklı bahisler;
UX-izolasyonunda BrowserSkill, güvenlik-izolasyonunda (tasarımda) Tepegöz.**

### Sır / kimlik bilgisi işleme — ikisi de "sır ajana ulaşmasın", farklı yoldan

BrowserSkill: bsk hiç kimlik bilgisi saklamaz; çerezler kullanıcı profilinde kalır; `evaluate` hassas
sekmelerde bloklu (Agent Window dışı) ve SKILL.md "banka/SSO/parola yöneticisi sayfalarında token/çerez
okuma yok" diyor (talimat). `record` `--redact-values` ile form değerlerini `[filled]`/`[empty]` maskeler,
ama trace yine de hassas metin taşıyabilir (dokümante uyarı).

Tepegöz: **Credential Broker** — ajanda sırrın gireceği bir _şekil_ yok; OS-auth kapısı olana dek her
dolgu reddedilir (**atıl sevk**). `strictGuard` "hardened reading". `EgressFirewall` sır/yüksek-entropi
blob sızıntısını çıkışta yakalar.

Örtüşen eksende: BrowserSkill'in yaklaşımı basit ve bugün geçerli (sır tarayıcıda kalır, bsk görmez),
ama esas koruma yine _çağıran modelin_ uslu durmasına bağlı. Tepegöz'ün kavramı daha katı (sır ajana hiç
ulaşmaz) ama **atıl**. **Bugün pratikte BrowserSkill çalışıyor; kavramsal olarak Tepegöz daha katı.**

### Hesap verebilirlik / denetlenebilirlik — BrowserSkill hafif, Tepegöz kriptografik

BrowserSkill: daemon `daemon.log` (dönen trace log) + `bsk logs`; `bsk record` **trace bundle**'ları
(v2 = aksiyon zinciri; v3 = `states/sN.txt` sayfa gözlemleri + adım zinciri) — ama bunlar "sonradan
LLM-güdümlü otomasyon" için kayıt, imzalı denetim izi değil. İmza, hash-zinciri, taşınabilir makbuz yok.

Tepegöz: **Notary** (Phase 7) — hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt**

- bağımsız `tepegoz-verify` CLI + event-sourced journal. Paket yazılmış ve testli, **ama `apps/desktop`'a
  bağlanmamış**: `@tepegoz/notary` kendi paketi dışında hiçbir yerden import edilmiyor, yani bugün hiçbir
  çalışma makbuz üretmiyor (ADR-0030 bunu kabul ediyor).

Örtüşen eksende: **bugün ikisi de kriptografik iz üretmiyor** — BrowserSkill'in trace bundle'ı bunu
hedeflemiyor, Tepegöz'ünki ise henüz kablolanmamış. **Tasarım/bahis ekseninde Tepegöz net önde**:
kriptografik, satıcıdan bağımsız doğrulanabilir bir mekanizma yazılmış ve BrowserSkill'de eşi yok.

### Deterministik tekrar / kayıttan oynatma — ikisi de kayıt alıyor, Tepegöz'ünki model-free

BrowserSkill: `bsk record` kullanıcının Agent Window'daki aksiyonlarını trace bundle'a yazar; **tekrar
oynatmayı yine bir LLM yapar** (SKILL.md: "trace, yürütmeyi yönlendirir; kontrolü hedefin ötesine
uzatmaz" — model `target` role/name/tag ve ham `value` alanlarını sırayla uygular). Yani model-siz bir
yorumlayıcı değil, model için bir rehber.

Tepegöz: `@tepegoz/macro-engine` (iMacros halefi — kontrol akışı + oto-bekleme, **model-siz**) +
`@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren seçicili, `evaluateAssertion` success-oracle'lı
tekrar-oynatma, **model-siz**).

Örtüşen eksende: BrowserSkill kayıt **alıyor** ama oynatma modele bağımlı; Tepegöz'ün model-free şeridi
gerçek bir deterministik yorumlayıcı. **Tepegöz.**

### Çoklu-oturum / eşzamanlılık — BrowserSkill bugün önde

BrowserSkill: bir harness konuşması aynı anda birden çok tarayıcı oturumu sürebilir; her biri kendi
Agent Window'unda tam izole; farklı oturumlar **paralel** koşar (aynı oturum içi RPC'ler daemon
tarafından serileştirilir, ref-store güvenliği için). dsh-plugin `maxSessions` (varsayılan 5) ile
sınırlar.

Tepegöz: aynı anda **tek çalışma** (ADR-0013); paralel / dayanıklı checkpoint-resume roadmap'te, sevk
edilmedi. Sekme-grubu-başı oturum + arka-plana devam + tepsi göstergesi var ama tek eşzamanlı run.

Örtüşen eksende: **BrowserSkill** — gerçek paralel izole oturumlar bugün var.

### Bağlam ekonomisi (harness'ın işi, ama ne veriyor?) — dar ama var

BrowserSkill'in context/prompt/checkpoint yönetimi **yok** (harness'ta). Verdiği tek şey gözlem-çıktısı
token kontrolü: `observe`/`snapshot` `--max-tokens`/`--max-depth`, `get-html` "yüksek maliyet" uyarısı,
`console`/`network` bounded buffer (`--limit` max 200, `--max-text-chars` max 4096), `record`
`--max-page-tokens`. SKILL.md ajanı kısa-yol + "başardıysan dur, doğrulama için fazladan tıklama yok"
diye eğitir.

Tepegöz: `cache-window` (lag-2 breakpoint) + Reactor `working-state` + perception diff/elision +
sanitizer; özet-tabanlı geçmiş sıkıştırma S-fazlarında, measurement-owed.

Örtüşen eksende bu neredeyse kıyas değil: BrowserSkill token-tavanı bayrakları veriyor, gerisi harness.
**Tepegöz'ün bir context modeli var (ölçülmemiş); BrowserSkill'in tasarımca yok.**

### Ölçüm / dürüstlük kültürü — ikisinin de sağlam ama farklı odaklı bir yaklaşımı var

BrowserSkill: `evals/browser/` — **ajan-nötr, deterministik yerel** değerlendirme ortamı: yerel fixture
sayfaları, veri-güdümlü otomatik keşifli case'ler, `bsk` doğrudan smoke + ajan-adaptör koşuları,
tohumlu (seeded) matrix DOM varyasyonları, **dürüst doğrulama** (site/response/adapter kanıtı ayrı
raporlanır; eksik adapter kanıtı `unverified`, asla sessizce "passed" değil). "6 stabil core + 1 seeded
matrix" case, 28 operasyonun 25'i doğrudan smoke'ta. CI guard'ları (biome/stylelint/schema-dump sync).
Ama: bu bir **yetenek/kapsam** eval'i, görev-başarı / adversaryal-ASR / ground-truth harness'ı değil
(zaten model BrowserSkill'de değil).

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER, reddedilebilir
kuzey-yıldızı iddiası, ön-kayıtlı H2H protokolü.

Örtüşen eksende: BrowserSkill'in eval'i **kendi kategorisi için doğru şey** ve gerçekten dürüst
("unverified asla passed sayılmaz"); Tepegöz'ünki araştırma-sınıfı ama daha ağır ve görev-başarı odaklı.
**Kendi kategorilerinde ikisi de sağlam; Tepegöz daha derin ama bu, yeteneğin henüz orada olmadığının
da işareti.**

### Türkçe / bölgesel — Tepegöz

BrowserSkill: UI/dokümantasyon **yalnızca İngilizce + Çince** (`packages/i18n/src/locales/{en-US,zh-CN}`).
Türkçe yok, bölgesel adaptör yok.

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır
(ADR-0016); `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor; Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036). Şirket Türk (roltek.com.tr).

Örtüşen eksende: **Tepegöz** — kıyas kabul etmez.

---

## Örtüşmeyen alanlar

**Yalnızca BrowserSkill'de var (Tepegöz'de karşılığı yok):**

- **Harness-bağımsız ajan-etkinleştirme**: herhangi bir shell-yetenekli ajanı (Cursor, Claude Code,
  Codex, OpenClaw, CodeBuddy, WorkBuddy, Pi, Hermes, DeepSeek Harness) bir `SKILL.md` + `bsk` çağrısıyla
  kullanıcının **mevcut, oturum-açık** tarayıcısına bağlamak.
- **MV3 eklenti köprüsü** — ayrı tarayıcı kurmadan gerçek profil/çerez yeniden kullanımı; ayrı **Agent
  Window** ile görünür, kesintisiz otomasyon.
- **`bsk record` trace bundle'ları** (v2/v3, `states/` sayfa gözlemleri, `--redact-values`) — sonradan
  LLM-güdümlü tekrar için.
- **DeepSeek Harness native plugin** (`@wxg-prc-cpg/browser-skill-dsh-plugin`) — `browser_*` araçları +
  canlı PiP gözlem overlay'i + progressive tool-schema disclosure (`lazyTools`).
- **`bsk evaluate`** — CDP `Runtime.evaluate` ile ham JS (Agent Window sandbox'lı).
- **Cihaz emülasyonu** (`bsk emulate` — 7 preset, viewport/UA/touch) ve **salt-okunur console/network
  teşhis** araçları.
- **Ajan-nötr, deterministik yerel eval korpusu** (`evals/browser/`) — farklı ajanları/adaptörleri aynı
  fixture'larda kıyaslamak için.
- **Bugün Cursor/Claude Code/Codex içinde çalışıyor**; çoklu paralel izole Agent Window oturumu.
- Rust CLI + yerel daemon (oto-doğ, boşta-kapan, oto-güncelle).

**Yalnızca Tepegöz'de var (BrowserSkill'de karşılığı yok):**

- **Bütün LLM/ajan yığını**: 8 sağlayıcı + `local` (`model-gateway`, tek `Canon*` şema, `ModelRouter`,
  zorunlu `maxTokens`+`timeoutMs`, `TokenLedger`, GBNF JSON zorlaması), Planner→Executor→Reactor
  orkestrasyon döngüsü, context yönetimi, effort seviyeleri, otonomi taksonomisi (`ask`/`act`/`auto`).
- **Model-öncesi deterministik Policy Kernel** (danger class + taint + site → deny/ask, argümanı
  görmeden) + hassas-site kategorik sert deny + biyometrik yüksek-risk kapısı.
- **`EgressFirewall`** (Shannon entropi ile çıkış-sızıntı denetimi) + `TaintTracker` provenance.
- **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız
  `tepegoz-verify` CLI + event-sourced journal — paket yazılmış ve testli, ama `apps/desktop`'a
  **bağlanmamış**: bugün hiçbir çalışma makbuz üretmiyor (ADR-0030).
- **Kanıt-atıflı tamamlama** + yalan-başarı savunması: `CompletionEvidence` + deterministik düşürme +
  tuzak fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon-öncesi origin kapısı.
- **Model-free deterministik şerit**: `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı replay
  - `evaluateAssertion` success oracle) + `@tepegoz/human-input` (insan-benzeri fare eğrileri/jitter).
- **Tek ToolGateway PEP** (built-in/MCP/extension ayrımsız) + `journal_search_events` + `task_*` +
  `web_*` + tam sandbox'lı `file_*` + `download_*`/`upload_*`.
- **Credential Broker** (sırrın gireceği şekil yok), **agent memory** (advisory/tainted/re-validated,
  ADR-0027), **MCP istemcisi** (dış araçlar aynı PEP'ten).
- **Yerel çıkarım seam'i** (`local-inference` + `model-catalog`, sha256'lı GGUF) + vision eskalasyon
  tasarımı.
- **Türkçe/kamu derinliği**: parity-zorunlu EN+TR i18n (ADR-0016), ≥10 Türkçe-web H2H görev şartı,
  Phase 11 e-Devlet/KVKK güven modeli.
- Araştırma-sınıfı görev-başarı `agent-eval` harness'ı + anti-debt / PROSE-LEDGER / reddedilebilir
  kuzey-yıldızı iddiası.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | BrowserSkill                                                                                                | Tepegöz                                                                                                                                                                                          | Kim daha iyi + neden                                                                                                       |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi / birincil iş**          | Ajan-etkinleştirme katmanı: dış ajanı senin tarayıcına bağlar; model/döngü/prompt yok                       | Tarayıcı ajanının kendisi + güvenlik-önce native tarayıcı                                                                                                                                        | **Örtüşmüyor** — biri altyapı, öbürü ajan; "kim iyi" ancak alt-eksenlerde anlamlı                                          |
| 2   | **Dağıtım / form**                         | Rust CLI + daemon + MV3 eklenti; mevcut tarayıcıya + mevcut ajana sıfır-göç, mağazalarda yayında            | Tam Electron tarayıcı; kurulum + tarayıcı değişimi gerek, henüz yayında değil                                                                                                                    | **Bugün BrowserSkill** (erişim + olgunluk)                                                                                 |
| 3   | **Dış ajan bağlama yolu**                  | `SKILL.md` + `bsk` shell çağrısı + native dsh-plugin; harness-agnostik, kilit yok                           | Yok — dış ajanların Tepegöz'ü sürmesi diye bir yüzey yapılmadı                                                                                                                                   | **BrowserSkill** — net (Tepegöz'ün hedefi de bu değil)                                                                     |
| 4   | **LLM / sağlayıcı desteği**                | Yok — çağıran harness taşır                                                                                 | 8 sağlayıcı + `local`, tek `Canon*` şema, router, GBNF, DPAPI kasa, zorunlu per-çağrı bütçe                                                                                                      | **Örtüşmüyor** — BrowserSkill'de eksen yok; Tepegöz'ün yığını gerçek ama yüzeyi dar/kısmen stub                            |
| 5   | **Araç repertuvarı genişliği**             | ~35 CLI verb / 21 handler / 28 operasyon; emülasyon + console/network + evaluate                            | ~30 araç + dosya sistemi + web + download/upload + task + model-free macro/recipe                                                                                                                | **Berabere** — farklı kapsama alanları                                                                                     |
| 6   | **Araç çağırma disiplini**                 | Sandbox + borrow kapısı + evaluate kapısı; danger-class/taint/otonomi yok (harness'ta)                      | **Tek PEP**: zod→PolicyKernel→HITL→execute→audit, built-in/MCP/extension ayrımsız                                                                                                                | **Tepegöz** — her araç istisnasız aynı deterministik hattan                                                                |
| 7   | **Sayfa algısı (bugün)**                   | VOM observe + aria snapshot + get-html + screenshot; DOM/a11y-önce, screenshot son çare                     | DOM/a11y + diff/elision + article; enjeksiyon-vektörü sanitizer'ı                                                                                                                                | **Bugün BrowserSkill** (çalışan VOM), **tasarımda ~berabere** (aynı felsefe)                                               |
| 8   | **Algı ekonomisi (token)**                 | `--max-tokens`/`--max-depth` kırpma + bounded buffer                                                        | Değişen-only diff + unchanged elision + sanitizer paketi                                                                                                                                         | **Tepegöz** — daha agresif kesim (ama ölçülmemiş)                                                                          |
| 9   | **Model-öncesi güvenlik kararı**           | Yok — "hangi sekme" ile sınırlı; danger/site/taint çağıran modele bırakılmış                                | **Deterministik PolicyKernel** danger-class+taint+site, argümanı görmez; hassas-site kategorik deny; biyometrik                                                                                  | **Tepegöz** — belirgin mimari fark                                                                                         |
| 10  | **Sandbox / borrow onayı (bugün)**         | Agent Window sandbox + **fail-closed** borrow onayı (overlay + OS bildirimi, 5 sn oto-deny)                 | Renderer-untrusted + `createWindow` fabrikası + `EgressFirewall` + taint                                                                                                                         | **Bugün BrowserSkill'in borrow kapısı somut ve çalışıyor**; katmanlı izolasyonda (tasarımda) Tepegöz                       |
| 11  | **İnsan devri (captcha/2FA)**              | `request-help`: bloklu overlay, `completion-criteria`, re-arm, unattended kill-switch                       | `detectHandoff` + Human Handoff Controller + `credential-broker` (ADR-0039)                                                                                                                      | **BrowserSkill** — daha olgun, daha çok kenar-durumu ele alıyor                                                            |
| 12  | **Otonomi modeli**                         | Yok — çağıran harness (`--yolo` vb.) taşır; `BSK_REQUEST_HELP=off` tek anahtar                              | `ask`/`act`/`auto` (+rezerve `dangerous`); `deny` her seviyede sert; tek eşzamanlı run                                                                                                           | **Örtüşmüyor** — BrowserSkill'de eksen yok; Tepegöz'ün taksonomisi ince ama kanıtsız                                       |
| 13  | **Çoklu-oturum / eşzamanlılık**            | Çoklu paralel izole Agent Window; oturum-içi serileştirme                                                   | Sekme-grubu-başı oturum + arka-plan run; **tek eşzamanlı run** (ADR-0013)                                                                                                                        | **BrowserSkill** — gerçek paralel izole oturumlar bugün var                                                                |
| 14  | **Deterministik tekrar**                   | `record` trace bundle (v2/v3), ama oynatmayı **LLM yapar**                                                  | `macro-engine` + `recipe-compiler` — **model-siz** yorumlayıcı + imzalı, oracle'lı tarif                                                                                                         | **Tepegöz** — gerçek deterministik oynatma                                                                                 |
| 15  | **Doğrulanmış sonuç / yalan-başarı**       | Yok (görev-completion oracle'ı çağıran modele bırakılmış)                                                   | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                                | **Tepegöz** — mekanizma belirgin şekilde ileri (ölçüm borçlu)                                                              |
| 16  | **Prompt-injection savunması (mimari)**    | Sandbox + borrow + evaluate kapısı; "data not instructions" seviyesinde bir sarma/sanitizer **yok**         | Pre-model kernel + homoglyph/bidi/zero-width sanitizer + `EgressFirewall` entropi + taint + `wrapUntrustedContent`                                                                               | **Tepegöz** — daha derin katmanlı (BrowserSkill enjeksiyonu esasen harness'a bırakıyor)                                    |
| 17  | **Prompt-injection (kanıt bugün)**         | Adversaryal korpus / ASR yok (kapsam dışı)                                                                  | Redteam + injection-corpus var ama claim-grade ASR bataryası measurement-owed                                                                                                                    | **Berabere-zayıf** — ikisinin de bugün yayımlanmış ASR sayısı yok                                                          |
| 18  | **Hesap verebilirlik / denetlenebilirlik** | `daemon.log` + `bsk logs` + `record` bundle'ları; imza/hash-zinciri yok                                     | **Notary**: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + `tepegoz-verify` CLI + event-sourced journal — ama `apps/desktop`'a **bağlanmamış** (bugün makbuz üretmiyor) | **Bugün ikisi de kriptografik iz üretmiyor**; tasarımda **Tepegöz** — satıcıdan bağımsız doğrulanabilir mekanizma yazılmış |
| 19  | **Sır / kimlik bilgisi işleme**            | bsk sır saklamaz (çerez profilde), evaluate hassas sekmede bloklu, record redaksiyon; gerisi model talimatı | Credential Broker: sırrın gireceği şekil yok, OS-auth olana dek reddeder (**atıl**) + egress denetimi                                                                                            | **Bugün pratikte BrowserSkill çalışıyor**; kavramsal olarak Tepegöz daha katı                                              |
| 20  | **MCP / dış-araç yönü**                    | Hiç MCP yok — skill-file + shell + native plugin ile bağlanır                                               | MCP **istemcisi** (ADR-0018) — dış araçlar tek PEP'ten; sunucu yüzeyi yok                                                                                                                        | **Farklı yaklaşımlar** — BrowserSkill'in skill+CLI köprüsü bugün çalışıyor; Tepegöz'ün istemcisi mimari temizlikte         |
| 21  | **Çevrimdışı / egemenlik**                 | Yok (yerel model/RAG kapsam dışı; çağıran harness yerel model kullanabilir)                                 | `local-inference` seam + GGUF katalog (sha256) + GBNF; **ama** S12 ağırlıklara takılı, RAG yok                                                                                                   | **Tepegöz** — bir seam var; ikisi de tam değil                                                                             |
| 22  | **Bağlam yönetimi**                        | Yok — token-tavanı bayrakları dışında harness'ta                                                            | cache-window (lag-2) + Reactor working-state + perception diff/elision                                                                                                                           | **Tepegöz'ün bir modeli var (ölçülmemiş); BrowserSkill'in tasarımca yok**                                                  |
| 23  | **Ölçüm / dürüstlük kültürü**              | Ajan-nötr deterministik eval korpusu; "unverified asla passed sayılmaz"                                     | Ground-truth görev-başarı harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                | **Kendi kategorilerinde ikisi de sağlam; Tepegöz daha derin** (ama bu, yeteneğin henüz olmadığının işareti)                |
| 24  | **Türkçe / bölgesel derinlik**             | Yalnızca EN + ZH; Türkçe/bölgesel yok                                                                       | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli, Türk şirket                                                                                              | **Tepegöz** — kıyas kabul etmez                                                                                            |
| 25  | **"Bugün çalışıyor mu"**                   | Evet — mağazalarda yayında, Cursor/Claude Code/Codex içinde kullanılıyor (kendi kategorisinde)              | Kısmen — iskelet bağlı, tüm S-fazları measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                     | **BrowserSkill** — kendi işini bugün yapıyor                                                                               |

---

## Sonuç

**Bunlar farklı ürünler.** BrowserSkill bir tarayıcı ajanı değil — içinde model, döngü, prompt, context
yönetimi, otonomi ya da checkpoint yok. Bir **ajan-etkinleştirme köprüsü**: Cursor / Claude Code / Codex
gibi _dışarıdaki_ ajanların, kullanıcının oturum-açık gerçek Chromium'unu bir `bsk` CLI + yerel daemon +
MV3 eklenti üzerinden, görünür bir Agent Window içinde, kullanıcı-onaylı tab-borrow ile sürmesini
sağlar. Tepegöz ise ajanın kendisi + güvenlik-önce native tarayıcı. "Hangisi daha iyi" sorusu bütün
olarak yanlış: BrowserSkill'de model-öncesi Policy Kernel, Notary replay-receipt, kanıt-atıflı tamamlama,
model-free macro/recipe ya da egress denetimi yok; Tepegöz'de ise "herhangi bir shell ajanını mevcut
tarayıcına 30 saniyede bağla" diye bir şey yok.

**Örtüşen eksenlerde bugün çalışırlık:** BrowserSkill'in kıyaslanabilir yüzeyi — tarayıcıya araç seti,
DOM/a11y-önce algı, fail-closed borrow onayı, olgun insan-devri (`request-help`), paralel izole
oturumlar, ajan-nötr deterministik eval korpusu — **yayında ve gerçekten kullanılıyor**. Tepegöz'ün
karşılık gelen alt-sistemleri (browser-tools, perception-v2, HITL, agent-eval) bağlı ama S-fazları
🟠 measurement-owed, bazı yetenekler (vision, credential-broker, memory) atıl sevk, aynı anda tek run,
site adaptörü yok. Bu eksende bugünkü avantaj BrowserSkill'de.

**Mimari ve yaptığı spesifik güvenlik bahislerinde Tepegöz önde:** tek ToolGateway PEP, model-argümanını
görmeden karar veren deterministik Policy Kernel, hassas-site kategorik deny + biyometrik, `EgressFirewall`
entropi denetimi, taint provenance, kriptografik **Replay Receipt** + bağımsız `tepegoz-verify` (yazılmış
ve testli, ama `apps/desktop`'a bağlanmamış — bugün makbuz üretmiyor), kanıt-atıflı tamamlama +
yalan-başarı savunması, model-free deterministik macro/recipe şeridi, ve Türkçe/kamu derinliği —
BrowserSkill'in hiçbirinde bunların karşılığı yok (çünkü onun işi bu değil).

Dürüst özet: **BrowserSkill bugün kendi kategorisinde iş gören, mağazalarda yayında olgunlaşan bir
altyapı; Tepegöz'ün ajanı ise henüz kanıtlanmadı** — her S-fazı 🟠, üç yetenek atıl, aynı anda tek run,
sağlayıcıların bir kısmı stub. Mevcut kodlama-ajanına (Claude Code, Cursor) tarayıcı verdirmek
istiyorsan → BrowserSkill (ya da benzeri bir MCP-sunucu / skill köprüsü). Tez "oturum-açık banka
oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, model-öncesi deterministik bir
çekirdekten geçen, Türkçe bir _tarayıcı ajanı_" ise → o Tepegöz'ün oyunu, hâlâ tezgâhta. Not: BrowserSkill,
Tepegöz'ün bilerek dışa açmadığı bir yüzeyin (dış ajanlara tarayıcı-sürme köprüsü) tek başına ürünleşmiş
hâli gibi; Tepegöz bu köprüyü kursaydı, her dış araç çağrısını yine aynı PEP'ten geçirmeyi hedeflerdi.
