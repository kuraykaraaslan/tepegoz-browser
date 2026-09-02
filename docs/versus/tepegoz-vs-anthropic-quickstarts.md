# Tepegöz vs Anthropic Quickstarts — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Anthropic Quickstarts** (model satıcısının kendi MIT
> lisanslı referans-örnek koleksiyonu) arasında, yalnızca örtüşen eksenlerde iş-iş kimin neyi daha iyi
> yaptığını tabloya döken kısa bir karşılaştırma.
>
> **Yöntem.** `.junk/anthropic-quickstarts` deposunun (`README.md`, `CLAUDE.md`; `browser-use-demo`'nun
> `tools/browser.py` + `loop.py` + `CHANGELOG.md`; `computer-use-demo`'nun `loop.py` + `tools/groups.py`;
> `computer-use-best-practices`'in `README.md` + `constants.py` + `sandbox/default.sb` +
> `computer_use/{loop,image,trajectory}.py` + `tools/{base,browser,computer,batch,shell}.py`;
> `agents/{agent.py,utils/connections.py}`; `autonomous-coding/security.py`;
> `managed-agents/{README.md,chat-sdk/skill.md,copilot-kit-ag-ui/server/src/setup.ts}`) ve bu reponun
> AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|tool-executor|mcp-client|notary|agent-eval`,
> `extensions/ext-agent`, `docs/adr/{0005,0006,0008,0013,0018,0026,0029,0030,0039}`) aynı oturumda
> okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur (`phases/tracks/README.md`'deki
> "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri İngilizce-öncedir; bu, yazıldığı
> haliyle korunan bir kayıttır.
>
> **İlgili:** [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md).
> Bu rakip için ayrı bir parity track'i yok ve olmamalı da — aşağıdaki kategori uyarısına bakın.
>
> **Kategori uyarısı.** Bu bir **ürün değil**. Anthropic Quickstarts, model satıcısının "bu API'yi böyle
> kullanırsınız" diyen **referans-örnek koleksiyonu**dur; her demo _kasten minimaldir_ ve
> `computer-use-best-practices/README.md` bunu kendisi yazar: _"This is a reference implementation for
> instructional purposes only… There are **no safeguards**."_ Dolayısıyla "hangisi daha iyi" sorusu bu
> kıyasta **kısmen anlamsızdır**: bir tarayıcı ürününü bir öğretim iskeletiyle genişlik ekseninde
> yarıştırmak ikisine de haksızlıktır. Gerçekten değerli üç eksen şudur ve belge bunlara odaklanır:
> **(a)** satıcının kanonik computer-use / browser-use **döngü şekli** vs Tepegöz'ün
> Planner→Executor→Reactor'ü; **(b)** `computer-use-best-practices`'in satıcının **kendi ağzından
> güvenlik rehberi** (prompt-injection, sandbox, insan gözetimi) karşısında Tepegöz'ün
> PolicyKernel/HITL/ADR-0026 karnesi — bu kıyasın tek gerçekten faydalı çıktısı budur; **(c)**
> **vision/koordinat** paradigması vs Tepegöz'ün DOM/a11y-önce algısı (ADR-0008). Kalan her şey
> "Örtüşmeyen alanlar" başlığındadır ve belge kasten kısa tutulmuştur.

---

## Önce çerçeve: bunlar aynı türden şeyler değil

|             | Anthropic Quickstarts                                                                                                       | Tepegöz                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne          | Satıcının **örnek deposu**: 8 quickstart, her biri kendi başına; ajan-ilgili Python toplamı ~11k satır (testler dahil)      | Tam **Electron tarayıcı**, ~70 `@tepegoz/*` paket; ajan alt sistemlerden biri                                                                |
| Olgunluk    | Yayında ve bakımda — ama **referans olgunluğu**; her README "production için değil" der ve kullanıcıyı Cowork'e yönlendirir | **1.0 öncesi**; S0–S12'nin **hiçbiri ✅ değil** (S6 kısmen 🟡, kalanlar 🟠 measurement-owed); sahip notu: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod         | Python (+ birkaç Next.js/TS demo), ruff/pyright/pytest; **kasten az soyutlama**                                             | Strict TS, pnpm+turbo monorepo, ADR güdümlü, zod `safeParse` her güven sınırında                                                             |
| Felsefe     | "Okunsun, anlaşılsın, kopyalansın"; güvenlik sorumluluğu açıkça **entegratöre devredilir** (izole VM önerisi)               | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik                                     |
| Birincil iş | Claude'un tool-use döngüsünü, araç şekillerini ve token ekonomisini **öğretmek**                                            | Kullanıcının **kendi oturum-açık tarayıcısında** güvenle görev yürütmek                                                                      |

Kıyaslanan şey: **satıcının kanonik döngü ve araç şekli** ile **onun etrafına bir ürünün inşa ettiği
yönetişim katmanı**. Quickstarts'ın kasten yapmadığını "eksik" saymak yanlış olur; tersine, onun
_yaptığı ve Tepegöz'ün yapmadığı_ şeyler doğrudan çalınabilir tekniklerdir.

---

## (a) Ajan döngüsünün şekli — satıcı düz, Tepegöz katmanlı; ve bu bir kanıt değil, bir bahis

Her üç ajan demosu da **tek düz sampling loop**: `while True` → `messages.create/stream` → dönen
`tool_use` bloklarını sırayla çalıştır → `tool_result`'ları tek user mesajı olarak ekle → tekrar.
Planner yok, reactor yok, tipli karar yok, mod yok. `browser-use-demo/loop.py` en çıplak hali — adım
sınırı bile yok, `_maybe_filter_to_n_most_recent_images` tanımlı ama döngüde **hiç çağrılmıyor**.
`computer-use-best-practices/loop.py` aynı düz döngüye üretim reflekslerini ekler: `max_iters=200`,
üstel geri-çekilmeli retry, boş-yanıt kurtarma, Ctrl-C'de mesaj listesini API-geçerli bırakan kesme,
toolset üye çağrılarında "ilk hatadan sonra kalanları çalıştırma" sözleşmesi.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş) → Reactor** (continue/retry/
replan/stop, tipli `Decision`), iki aşamalı HITL, `CompletionEvidence`, navigation-grounding.

Dürüst okuma: satıcının kendi referansı bu ayrımı **kullanmıyor** — yani ayrım modelin gerektirdiği bir
şey değil, Tepegöz'ün aldığı bir bahis. Tepegöz'ün yapısı daha açık ve denetlenebilir; satıcının düz
döngüsü ise ucuz ve kanıtlı. **Bugün Quickstarts, mimari olarak Tepegöz** — koşuluyla ki S-fazları
ölçümle kapansın. İlginç ara-form: best-practices'in **advisor** aracı (üretim ortasında daha güçlü bir
modele — varsayılan Opus — sunucu tarafında danışma), Reactor'ün işini _tavsiye_ seviyesinde yapıyor ve
deneysel olduğu açıkça yazılmış.

---

## (b) Satıcının kendi güvenlik rehberi karşısında Tepegöz'ün karnesi — kıyasın asıl faydalı kısmı

Anthropic her computer/browser README'sinde aynı **dört maddeyi** tekrarlıyor ve prompt-injection'ı
çözülmemiş sayıyor (_"Claude will follow commands found in content even if it conflicts with the user's
instructions"_).

| Satıcı rehberi                     | Quickstarts'ın kendi uygulaması                                                                                                                                                                             | Tepegöz                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. **İzole VM/konteyner**          | Uygulanıyor: iki demo Docker, best-practices "atılabilir macOS VM'de çalıştır" diye bağırıyor                                                                                                               | **Bilerek uygulanmıyor.** Ajan normal gezinme partition'ında (`persist:tepegoz-web`), kullanıcının gerçek oturum-açık sekmelerinde çalışır; ajan sekme-grubu ADR-0020'ye göre yalnız _organizasyonel_ bir etiket. İzole partition sadece `browser_analyze_page` sandbox'ında ve eval harness'inde var. Tepegöz'ün sınırı **süreç/profil değil, politika** sınırı — farklı bir bahis, kanıtlanmış üstünlük değil                                                 |
| 2. **Modele hassas veri verme**    | Uygulanıyor: sandbox profili `~/.ssh`, `~/.aws`, `~/.gnupg`, `.env*` okumasını **deny** ediyor; `first-run` skill'i "`.env`'i asla okuma" diyor                                                             | Mekanizma daha ileri: **Credential Broker** — ajanda sırrın gireceği bir şekil yok. **Ama atıl sevk.** Bugün pratikte satıcının basit "verme" kuralı çalışıyor, Tepegöz'ünki kâğıtta                                                                                                                                                                                                                                                                            |
| 3. **Alan adı allowlist'i**        | Browser/computer demolarında **yok** (yalnız prose). Managed Agents'ta var: `networking: { type: 'limited', allowed_hosts: [] }`                                                                            | Daha zengin: `isSensitiveSite` kategorik sert deny (banka/kripto/sağlık/kamu/parola-yön.) — `resolveAutonomy` bir `deny`'ı hiç görmez, `auto` dahil hiçbir seviye kaldıramaz — + `EgressFirewall` (Shannon entropisi ≥4.0 & ≥24 karakter → `high_entropy`; sağlayıcı anahtar regex'leri, JWT, IBAN/Luhn) + `tab_egress_blocked`. **Tepegöz açık ara** (ADR-0039 bu kilidi kategori-başı izne çevirmeye karar verdi ama **bağlanmadı**; bugünkü kod mutlak deny) |
| 4. **Anlamlı sonuçta insan onayı** | Browser/computer demolarında **hiç yok** — Streamlit her aracı sorgusuz çalıştırır. Managed Agents'ta var: `permission_policy: always_ask` + `user.tool_confirmation`; MCP araçları varsayılan `always_ask` | İki aşamalı HITL, ikisi de fail-safe: plan önizleme (120 s'de yanıt yoksa **reddet**) + araç-başı onay (handler yok / yanıt yok = **`FORBIDDEN`**), biyometrik yüksek-risk kapısı, ticaret çift-onayı, kademeli otonomi. **Tepegöz, satıcının 4. maddesini satıcının kendi tarayıcı demosundan çok daha ciddiye alıyor** — çekince: plan onayı yalnız `ask` otonomisinde sorulur, üst seviyelerde plan otomatik onaylanır (araç-başı kapı yine işler)           |

İki nokta bu tabloyu dengeliyor ve dürüstlük gereği yazılmalı:

**Satıcının Tepegöz'ün sahip olamayacağı bir kolu var.** `computer-use-best-practices/README.md` açıkça
söylüyor: API'nin computer-use'a özgü güvenlik sınıflandırıcıları — **ekran görüntüsü içeriğinde
prompt-injection tespiti dahil** — yalnızca istek **Anthropic-tanımlı** computer aracını (hosted
toolset) beyan ettiğinde çalışır; kendi şemanı yazarsan "generic safety path"e düşer ve kendi savunmana
kalırsın. Tepegöz 8 sağlayıcıya normalize eden kendi `CanonRequest` şemasını kullandığı için **yapısal
olarak generic path'te**. Bu, ADR-0005'in (sağlayıcı-agnostiklik) somut ve şimdiye dek hiçbir yere
bedel olarak yazılmamış maliyetidir.

**Satıcının referansı kendi rehberinden daha gevşek.** `browser-use-demo` `execute_js`'i araç setine
koyuyor _ve sistem prompt'unda teşvik ediyor_ (_"Use execute_js to extract data from JavaScript
variables, localStorage…"_) — canlı sayfada, `page.evaluate` ile, oturum çerezleri yerinde; Chromium
ayrıca `--no-sandbox --disable-blink-features=AutomationControlled` ve sahte macOS user-agent'ı ile
açılıyor. Tepegöz'de canlı sayfada script çalıştıran araç **yok**: ADR-0026'nın önerdiği izole-dünya
sandbox'ı `e2e/spike-code-exec-sandbox.spec.ts` canary'siyle **ilk denemede çürütüldü** (izole dünya bir
JS-principal sınırıdır, ağ sınırı değil) ve NO-GO olarak kayda geçti. Bugün sevk edilen
`browser_analyze_page` yalnız **`code_exec_read`**: sayfanın `innerHTML` **kopyası**, kalıcı-olmayan ayrı
bir partition'da, `about:`/`data:` dışındaki her isteği iptal eden oturumda, `default-src 'none'` CSP
altında, çerezsiz — script gövdesi değil 16-hex hash'i journal'lanır; **`code_exec_write` koşulsuz
reddedilir**. Terminal/bash aracı repoda hiç yok; DevTools ajan aracı değil (ADR-0029). Bu kalemde
Tepegöz satıcının _referansından_ belirgin katı, _rehberiyle_ aynı hizada. (Not: `atk_code_exec_*`
bataryası koşulana dek ADR-0026 üzerinde bir RISK GATE duruyor — bu da ölçüm borçlu.)

Karşılıklı ders: Quickstarts'ın Tepegöz'e verebileceği en somut güvenlik parçası
`computer-use-best-practices/sandbox/default.sb` — `deny default` + `deny network*` + yalnız scratch'e
yazma + sır-yolu okuma reddi, 30 s timeout, 64 KB çıktı tavanı; okunmaya değer bir asgari SBPL örneği.
Tepegöz'ün satıcıya verebileceği ise `EgressFirewall` ve `TaintTracker` gibi model-öncesi deterministik
denetim katmanları — Quickstarts'ta karşılığı yok.

---

## (c) Algı: koordinat/vision vs DOM/a11y-önce — satıcı kendi içinde ikiye bölünmüş

`computer-use-demo` ve `computer-use-best-practices`'in `computer` aracı **saf ekran görüntüsü +
koordinat** (19 aksiyon: tıklamalar, `type`, `key`, `hold_key`, `scroll`, `zoom`, pano, `cursor_position`…).
best-practices'in `browser` aracı da **koordinat tabanlı** (15 aksiyon; `ref` **yok**).

Buna karşılık `browser-use-demo` tam tersini savunuyor ve README'sinde başlık atıyor: _"Advantages Over
Coordinate-Based Automation"_ — `ref` ile eleman hedefleme ekran boyutundan bağımsız ve dinamik içerikte
güvenilir. `read_page` bir **erişilebilirlik ağacı** döndürüyor; kaynağı da açıkça yazılmış: Playwright'ın
`ariaSnapshot.ts`'inden uyarlanmış (`CHANGELOG.md`). Bu, ADR-0008'le **aynı tez**. Yani satıcının browser
demosu Tepegöz'ün tarafını tutuyor; satıcının en yeni "best practices" browser aracı ise sadeliği tercih
edip koordinata dönüyor.

Tepegöz'ün ek olarak yaptıkları: kimlik-kararlı ref'ler + diff/dedupe/elision, `aria-labelledby`/
`label[for]` çözümü, `browser_get_article`, ve `@tepegoz/tool-executor`'ın gizli/zero-width/bidi/
homoglyph enjeksiyon vektörü temizliği (`sanitizeText`, `wrapUntrustedContent`) — Quickstarts'ın
hiçbirinde güvenilmez içerik sarma/temizleme **yok**.

Tepegöz'ün buradan alacağı asıl parça algı değil, **görüntü boyutlandırma**:
`computer-use-best-practices/computer_use/image.py`, API'nin resize algoritmasının birebir portu
(`target_image_size`), ve gerekçesini rakamla veriyor — yanlış boyutta görüntü gönderirsen sunucu yeniden
boyutlandırır, model hiç görmediğin bir uzayda koordinat üretir, 16:10 bir MacBook ekranında **~%14
tıklama kayması** olur. Tepegöz'ün vision fallback'i (S10) bugün **bağlanmamış** — Reactor'ın opsiyonel
`captureVision` geri-çağrısını üretimde geçen bir çağıran yok — ve bağlandığı gün bu dosya doğrudan işe yarar.

---

## Kalan örtüşen eksenler — kısa

**Araç doğrulama.** Quickstarts'ın sözleşmesi zarif ama minimal: `name`/`description`/`input_schema`
ClassVar'ları + `__init_subclass__` ile **import zamanı** şema-imza drift kontrolü. **Çalışma zamanı
doğrulaması yok** (`execute(**tool_input)`). Tepegöz'de her çağrı tek kapıdan: lookup → idempotency →
zod `safeParse` → `PolicyKernel.evaluate` → `classifyRisk` → tavsiye niteliğinde `critiqueIntent`
(engelleyemez, argüman **değerlerini görmez**) → audit → deny kısa-devresi → HITL + biyometrik → ikinci
audit → handler; sınırdan istisna taşmaz. **Tepegöz** — ama drift kontrolü Tepegöz'de olmayan, ucuz ve
iyi bir fikir.

**Context / maliyet ekonomisi — Quickstarts, ve fark ciddi.** best-practices şunları _çalışır ve
gerekçeli_ sevk ediyor: sistem bloğunda 1 + gövdede 3 cache breakpoint merdiveni; **cache-dostu aralıklı
görüntü budama** (naif "son N görüntüyü tut"un her turda prefix'i bozup cache'i ıskaladığını gösterip
prefix'i N tur sabit tutan şema); sunucu-taraflı **autocompaction** (`compact_20260112`, 150k eşik);
sağlayıcı-başı istek boyutu tavanları (Vertex 18 MB, Bedrock 11 MB); tur başına `cache_eff` satırı.
README'nin "budama mı özetleme mi" analizi bedava bulunabilecek en iyi metinlerden biri. Tepegöz'de
karşılık `cache-window` (lag-2), diff/elision, `TokenLedger`, zorunlu `maxTokens`+`timeoutMs` — ama
**compaction yok** ve yayımlanmış maliyet analizi yok.

**Batch / gecikme — Quickstarts.** `computer_batch`/`browser_batch` + toolset'in tek turda çok üye
çağrısı, üstelik tek başına aksiyon çağrıldığında modele "batch kullan" hatırlatması iliştiriliyor.
Tepegöz her aracı PEP'ten **tek tek** geçiriyor; batch, araç-başı HITL ile mimari gerilimde. Bu,
Tepegöz'ün bilinçli ödediği bir hız bedeli ve bedel olarak durmalı.

**İzlenebilirlik — tür olarak Tepegöz, bugün satıcı.** Quickstarts: `runs/<ts>/` altında `meta.json` +
`transcript.jsonl` + `system_prompt.txt` + `images/NNN.jpg` + Streamlit trajectory viewer; ~60 satır,
çalışıyor. Tepegöz: journal + replay timeline + **Notary** (hash-zinciri, Ed25519, Replay Receipt,
`tepegoz-verify`) — ama ADR-0030 kendisi not düşüyor: `apps/desktop` içinde Notary'yi çağıran **hiçbir
şey yok**. Algoritmik çekirdek kanıtlı, kablolama değil.

**Tamamlama kanıtı — Tepegöz.** Quickstarts'ta kavram yok; model araç çağırmayı bırakınca tur biter,
"doğrula" tavsiyesi prompt seviyesinde kalır. Tepegöz'de `CompletionEvidence` + deterministik düşürme +
tuzak fixture'lar + Checked/Unconfirmed/Contradicted rozetleri + mutasyon öncesi origin kapısı. Mekanizma
farkı büyük; ölçümü hâlâ borçlu.

**MCP — aynı yön, farklı derinlik.** `agents/utils/connections.py` bir MCP **istemcisi** (stdio + SSE);
Managed Agents'ta MCP araçları varsayılan `always_ask`. Tepegöz de istemci (ADR-0018) ama daha derin:
`McpSupervisor`, `dangerClassFor` (bilinmeyen hint → en kısıtlı sınıf), aynı PEP; ayrıca Anthropic'in
native `mcp_servers` konnektörünü **bilerek reddediyor**, çünkü araçları sunucu tarafında çalıştırıp
yerel kernel'i atlardı. İki tarafta da **MCP sunucu yüzeyi yok**.

**Sağlayıcı — farklı hedefler, ve Tepegöz'ün bedeli.** Quickstarts tek aileyi (Claude) üç yüzeyden
sunuyor (first-party / Bedrock / Vertex) ve karşılığında ailenin derinliğine erişiyor: dated computer
araçları + GA `computer_toolset_20260801`, `output_config.effort`, adaptive thinking, advisor,
autocompaction — README dürüstçe advisor ve autocompaction'ın **yalnız first-party** olduğunu yazıyor.
Tepegöz: 8 sağlayıcı + `local`, tek Canon şeması, `ModelRouter`, DPAPI'li BYO-key kasası. **Genişlikte
Tepegöz, tek-aile derinliğinde Quickstarts** — birbirini dışlayan iki tercih.

**Yerelleştirme — Tepegöz (rakipte konu yok).** Quickstarts tamamen İngilizce, i18n katmanı yok. (Dikkat:
best-practices'teki "localization demo" **çeviri değil**, bir görüntüde eleman konumu bulma demosu.)
Tepegöz'de her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır (ADR-0016).

**Ölçüm — kategori hatası, ama söylenmeli.** Quickstarts'ta ajan başarı metriği, injection ASR bataryası
veya benchmark yok; olan şey birim testleri ve "demo bozulmadı mı" `verify` skill'i. Tepegöz'de
`@tepegoz/agent-eval` (ground-truth-önce skorlama, donmuş SHA-256'lı fixture'lar, Wilson CI,
`bridgeClaim` ile reddedilebilir iddia). Bir örnek deposundan benchmark beklemek haksızlık; ve Tepegöz'ün
bu disiplini kısmen yeteneğin henüz orada olmamasının sonucu.

---

## Örtüşmeyen alanlar

**Yalnızca Quickstarts'ta (Tepegöz'de karşılığı yok, çoğunda olmamalı da):** masaüstü/OS seviyesi computer
use (`pyautogui`/X11, `open_application`, pano, `cursor_position`) · konteynerli masaüstü imajı (Xvfb +
mutter + x11vnc + noVNC + Streamlit) · `sandbox-exec`'li `bash`+`python` ve `editor` aracı · hosted
computer toolset ve ona bağlı **satıcı-taraflı güvenlik sınıflandırıcıları** · **advisor** aracı ·
sunucu-taraflı **autocompaction** · Claude Agent SDK ile otonom kodlama harness'i (initializer + coding
agent, bash allowlist hook'u, git ile kalıcı ilerleme) · **Managed Agents** ekosistemi (sunucu-taraflı
oturum/ortam, `always_ask`, memory-store bilgi wiki'si + `beta.dreams`, self-hosted sandbox worker'ları,
AG-UI/CopilotKit/assistant-ui/Chat SDK, Slack/Teams/WhatsApp) · iki Next.js uygulaması · geliştirici
yüzeyleri (trajectory viewer, tool panel, localization demo).

**Yalnızca Tepegöz'de (Quickstarts'ta karşılığı yok):** native tarayıcının kendisi (sekme/pencere,
indirme/yükleme, yer imi/geçmiş, omnibox, reader, eklenti platformu, adblock, Safe Browsing, sayfa
çevirisi) · model-öncesi deterministik **PolicyKernel** + hassas-site kategorik deny · **EgressFirewall**,
**TaintTracker**, **`detectHandoff`** (CAPTCHA/2FA → kullanıcıya devret, çözme), **Credential Broker**
(atıl) · **Notary** (paket var, uygulamaya bağlı değil) · model-free deterministik şerit (`macro-engine`,
`recipe-compiler`, `human-input`) · yerel çıkarım + sha256'lı GGUF kataloğu + 8 sağlayıcı · gerçek `file_*`
sandbox'ı (`assertMembership`, symlink-çözümlü kanonikleştirme sonrası; kökler kullanıcının
`fileAccessGrants` beyaz listesi) · per-paket EN+TR i18n parity · `@tepegoz/agent-eval` · `tasks` ·
ext-agent'ın onay/otonomi/steer/replay UX'i.

---

## Ayrıntılı tablo — örtüşen eksenlerde kim daha iyi

| #   | Boyut                                   | Anthropic Quickstarts                                                                                                                                      | Tepegöz                                                                                                                                          | Kim daha iyi + neden                                                                                                                        |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Kategori / amaç**                     | Öğretici referans; "production için değil" diye yazıyor                                                                                                    | Sevk edilecek bir ürün                                                                                                                           | **Kıyas dışı** — biri diğerinin yerine geçmez                                                                                               |
| 2   | **Ajan döngüsü şekli**                  | Tek düz sampling loop + max_iters, retry, boş-yanıt kurtarma, güvenli kesme                                                                                | Planner→Executor→Reactor, tipli `Decision`, 2-aşama HITL; tek eşzamanlı run                                                                      | **Bugün Quickstarts** (ucuz, kanıtlı). **Mimari olarak Tepegöz**, ama ayrımın faydası ölçülmedi                                             |
| 3   | **Araç yüzeyi**                         | browser-demo: 1 araç × 23 aksiyon. best-practices: 8 araç (computer 19, browser 15, batch'ler, bash, python, editor, open_app)                             | ~30 araç: `browser_*`, `tab_*`, `web_*`, `file_*`, `clipboard_*`, `download_*`, `task_*`…                                                        | **Farklı hedefler** — Tepegöz tarayıcı alanında geniş, Quickstarts OS alanında                                                              |
| 4   | **Araç girdisi doğrulama**              | İmport-zamanı drift kontrolü; **çalışma zamanı doğrulaması yok**                                                                                           | Her araçta zod `safeParse`, tek PEP, çift audit                                                                                                  | **Tepegöz** — güven sınırında gerçek doğrulama                                                                                              |
| 5   | **İzin / onay**                         | Browser/computer demolarında **hiç yok**; Managed Agents'ta `always_ask`                                                                                   | 2-aşama fail-safe HITL, kademeli otonomi, biyometrik, ticaret çift-onayı; plan onayı yalnız `ask`'te sorulur                                     | **Tepegöz** — satıcının 4. maddesini satıcı demosundan iyi uyguluyor                                                                        |
| 6   | **Model-öncesi deterministik politika** | Yok (Managed Agents'ta araç-adı bazlı politika var)                                                                                                        | PolicyKernel: danger class + taint + site → deny/ask, argümanı görmeden, kapalı reason-code birliği                                              | **Tepegöz** — Quickstarts'ta kavram bile yok                                                                                                |
| 7   | **Prompt-injection (mimari)**           | Kabul edilen, çözülmemiş risk; savunma = izolasyon + prose. Ek koz: hosted toolset ile **satıcı-taraflı ekran-görüntüsü injection sınıflandırıcısı**       | Model-öncesi kernel + EgressFirewall + taint + `sanitizeText`/`wrapUntrustedContent`                                                             | **Tepegöz** (istemci-taraflı mimari), **ama** satıcının sunucu-taraflı sınıflandırıcısı Tepegöz'ün kanonik-şema tercihi yüzünden erişilemez |
| 8   | **Prompt-injection (bugünkü kanıt)**    | Ölçüm yayımlamıyor; yerine "izole VM'de çalıştır" diyor                                                                                                    | Redteam + korpus var, claim-grade **ASR bataryası measurement-owed**                                                                             | **Berabere, ikisi de kanıtsız** — biri ölçmeyi hedeflemiyor, diğeri henüz ölçmedi                                                           |
| 9   | **Sandbox / izolasyon**                 | Docker (2 demo), `sandbox-exec` profili (no-network + scratch-only write + sır-yolu deny), "atılabilir VM"                                                 | Ajan **gerçek gezinme partition'ında**; süreç/profil değil politika sınırı. `file_*` gerçek sandbox'lı                                           | **Quickstarts** — izolasyon basit ve işe yarıyor; Tepegöz'ün alternatifi daha iddialı ama kanıtsız                                          |
| 10  | **Sır işleme**                          | "Verme" + sandbox'ta sır-yolu okuma reddi + `.env`'i asla okuma kuralı                                                                                     | Credential Broker (sırrın gireceği şekil yok) — **atıl sevk**                                                                                    | **Bugün Quickstarts** (basit, çalışıyor). **Kavramsal olarak Tepegöz**                                                                      |
| 11  | **Egress / ağ kontrolü**                | Demolarda yok; Managed Agents'ta `networking: limited` + allowlist                                                                                         | `EgressFirewall` + entropi + `tab_egress_blocked` + SSRF-güvenli okuyucular                                                                      | **Tepegöz**                                                                                                                                 |
| 12  | **Algı paradigması**                    | İkiye bölünmüş: `computer` saf koordinat; `browser-use-demo` a11y ağacı + `ref` (Playwright `ariaSnapshot` portu); best-practices `browser` yine koordinat | DOM/a11y-önce (ADR-0008) + diff/elision; vision yalnız eskalasyon ve **atıl**                                                                    | **Tepegöz** (tutarlılık) — satıcının kendi browser demosu aynı tezi savunuyor                                                               |
| 13  | **Görüntü/koordinat kalibrasyonu**      | `target_image_size` = API resize algoritmasının birebir portu; yanlış boyutun **~%14 tıklama kayması** yarattığını rakamla yazıyor                         | Vision şeridi atıl; böyle bir kalibrasyon yok                                                                                                    | **Quickstarts** — doğrudan çalınabilir bir parça                                                                                            |
| 14  | **Context / cache ekonomisi**           | 4 breakpoint merdiveni, cache-dostu aralıklı budama, sunucu-taraflı compaction, boyut tavanları, tur-başı `cache_eff`                                      | cache-window (lag-2), diff/elision, TokenLedger; **compaction yok**                                                                              | **Quickstarts** — açık ara, üstelik gerekçesi yazılı                                                                                        |
| 15  | **Batch / gecikme**                     | `computer_batch`/`browser_batch` + toolset çok-üye turu + "batch kullan" hatırlatması                                                                      | Her araç PEP'ten tek tek; batch araç-başı HITL ile gerilimde                                                                                     | **Quickstarts** (hız). Tepegöz'ünki bilinçli bir bedel                                                                                      |
| 16  | **İzlenebilirlik**                      | `runs/<ts>/transcript.jsonl` + görüntüler + system_prompt + Streamlit viewer                                                                               | Journal + replay timeline; **Notary paket olarak var ama uygulamaya bağlı değil** (ADR-0030 kendisi yazıyor)                                     | **Tür olarak Tepegöz, bugün Quickstarts**                                                                                                   |
| 17  | **Tamamlama kanıtı / yalan başarı**     | Yok; prompt seviyesinde "doğrula" tavsiyesi                                                                                                                | `CompletionEvidence` + deterministik düşürme + kanıt rozetleri + origin kapısı                                                                   | **Tepegöz**                                                                                                                                 |
| 18  | **Canlı sayfada kod çalıştırma**        | `execute_js` var, canlı sayfada, sistem prompt'unda **teşvik ediliyor**                                                                                    | Yok. `code_exec_read` yalnız ağsız/çerezsiz anlık-görüntü sandbox'ında; `code_exec_write` koşulsuz deny (ADR-0026 izole-dünya ölçümle çürütüldü) | **Tepegöz** — ve satıcının kendi rehberiyle de aynı hizada                                                                                  |
| 19  | **MCP**                                 | İstemci (stdio + SSE); Managed Agents'ta MCP varsayılan `always_ask`                                                                                       | İstemci (ADR-0018) + supervisor + `dangerClassFor` + aynı PEP; native konnektör bilerek reddedilmiş                                              | **Tepegöz** (derinlik); yön aynı, iki tarafta da sunucu yok                                                                                 |
| 20  | **Sağlayıcı**                           | Tek aile × 3 yüzey; karşılığında toolset/effort/advisor/compaction derinliği                                                                               | 8 sağlayıcı + `local`, tek Canon şeması                                                                                                          | **Tepegöz** (seçim), **Quickstarts** (tek ailenin derinliği)                                                                                |
| 21  | **Bellek / skill**                      | `.claude/skills` = _depo geliştirme_ skill'leri, ajan skill'i değil; Managed Agents'ta provenance'lı memory-store wiki'si                                  | Advisory bellek (ADR-0027, zehir filtresi + karantina); skill = prompt şablonu (çalıştırmaz)                                                     | **Berabere** — ikisinde de "iş yapan skill" yok; knowledge-wiki'nin provenance modeli fikir verir                                           |
| 22  | **"Bugün çalışıyor mu"**                | Evet, amacı için: kur, çalıştır, döngüyü gör                                                                                                               | Kısmen: iskelet bağlı, S0–S12'nin hiçbiri ✅ değil, vision/credential-broker/Notary-kablolaması atıl, tek run                                    | **Quickstarts** — ama "amacı" farklı bir amaç                                                                                               |

---

## Sonuç

**Genişlik/çalışırlık ekseninde kazanan ilan etmek anlamsız**, çünkü Quickstarts bir ürün değil. Yine de
örtüşen eksenlerde satıcı iki yerde net önde ve bunlar Tepegöz için **doğrudan iş kalemi**: **token/cache
ekonomisi** (cache-dostu aralıklı budama, breakpoint merdiveni, sunucu-taraflı compaction, budama-vs-özetleme
maliyet analizi) ve **görüntü boyutlandırma kalibrasyonu** (`target_image_size`; yanlış boyutun ~%14 tıklama
kayması ürettiğini rakamla söyleyen tek kaynak). Üçüncüsü, satıcının erişip Tepegöz'ün erişemediği
**sunucu-taraflı computer-use güvenlik sınıflandırıcıları** — bu, ADR-0005'in sağlayıcı-agnostiklik
tercihinin şimdiye dek yazılmamış somut bedelidir ve bir yere yazılmalıdır.

**Mimari/yönetişim ekseninde Tepegöz önde ve fark büyük** — ama karşısındaki kasten yönetişim içermeyen bir
öğretim iskeleti olduğu için bu üstünlük ucuz kazanılmıştır. Anlamlı kıyas şu: satıcının **kendi rehberi**
(izole VM, sır verme, alan allowlist'i, anlamlı sonuçta insan onayı) alınıp Tepegöz'e karne çıkarıldığında,
Tepegöz 3. ve 4. maddeleri satıcının kendi tarayıcı/computer demolarından **belirgin biçimde daha ciddiye
alıyor**; 2. maddede kavramsal olarak daha ileri ama **atıl**; 1. maddeyi ise **bilerek reddediyor** —
Tepegöz'ün tezi tam da izolasyonu bırakıp kullanıcının gerçek, oturum-açık tarayıcısında güvenli olmaktır.
Bu, satıcının önerdiğinden daha zor bir problemdir ve Tepegöz onu **henüz çözdüğünü gösterememiştir**:
S0–S12'nin hiçbiri ✅ değil, ASR bataryası ve `atk_code_exec_*` RISK GATE'i measurement-owed,
vision/credential-broker/memory atıl, Notary uygulamaya bağlanmamış, ADR-0039 karar verilmiş ama
kablolanmamış, aynı anda tek run.

Tek cümlelik ayrım: **Claude ile computer/browser-use'un doğru şeklini öğrenmek, ölçmek ve kopyalamak
istiyorsan → Anthropic Quickstarts** (özellikle `computer-use-best-practices`, hem kod hem README olarak);
**oturum-açık gerçek tarayıcında ne yaptığının deterministik olarak sınırlandığı ve kanıtlanabildiği bir
ajan istiyorsan → Tepegöz'ün oyunu bu, hâlâ tezgâhta**.
