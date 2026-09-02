# Reusable prompt — "compare a rival's AI/agent features to Tepegöz"

Run this **once per rival** (fresh session or a subagent). It reads the rival's checkout
under `.junk/<rival>/` + Tepegöz's AI surface, and produces a
`docs/versus/tepegoz-vs-<rival>.md` deep comparison — same structure as the already-written
`docs/versus/tepegoz-vs-webbrain.md`.

**Run this BEFORE** [`rival-agent-parity-track.md`](rival-agent-parity-track.md) — that
prompt consumes the `docs/versus/tepegoz-vs-<rival>.md` this one produces.

## Placeholders — fill before running

| Token          | Meaning                | Values                                              |
| -------------- | ---------------------- | ------------------------------------------------- |
| `{RAKİP}`      | slug (files)           | `nanobrowser` · `kilocode` · `aipex` · `webbrain` |
| `{RAKİP_ADI}`  | human-readable name    | `Nanobrowser` · `Kilo Code` · `AIPex` · `WebBrain` |
| `{TARİH}`      | today's date           | e.g. `2026-09-01`                                 |

## Preconditions

- `.junk/{RAKİP}/` is checked out (`git clone --depth 1 <repo-url> .junk/{RAKİP}`).
- `docs/versus/tepegoz-vs-webbrain.md` exists as the structural reference.
- For `webbrain` the output already exists — use that slug only to sanity-check the template.

---

## The prompt

```
GÖREV: `.junk/{RAKİP}` deposu ({RAKİP_ADI}) ile bu reponun (tepegoz-browser)
AI/ajan fonksiyonlarını DERİNLEMESİNE karşılaştıran bir belge yaz. İş iş kimin neyi
daha iyi yaptığını tabloya dök.

ÇIKTI: TEK bir dosya  ->  `docs/versus/tepegoz-vs-{RAKİP}.md`
Repoda BAŞKA HİÇBİR ŞEYE dokunma. Branch açma, commit etme.
Referans şablon: `docs/versus/tepegoz-vs-webbrain.md` — yapısını ve DİLİNİ (Türkçe)
birebir taklit et. Marketing dili yok; iki tarafı da abartma. Tepegöz'ün ajanının
HENÜZ kanıtlanmamış olduğunu dürüstçe yansıt.

═══════════════════════════════════════════════════════════════════════════════
1) {RAKİP_ADI} TARAFI — ne okuyacaksın (DERİNLEMESİNE, göz gezdirme değil)
═══════════════════════════════════════════════════════════════════════════════
`.junk/{RAKİP}/` altında:
- README('lar) (tüm diller / TR varsa ayrıca), `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`,
  `package.json` + workspace dosyası, `docs/` (varsa mimari / architecture / agent).
- Kaynak ağacı: `src/` / `packages/` / `chrome-extension/` / `pages/` / `mcp-bridge/`
  / `skill/` / `migration/` — hangileri varsa.
- KİLİT kaynak dosyaları OKU: ajan/görev döngüsü, araç & aksiyon seti (kaç araç, hangi
  aileler), LLM sağlayıcı soyutlaması (KAÇ sağlayıcı — somut say), prompt yapımı /
  sistem-prompt, context/mesaj yönetimi & sıkıştırma, prompt-injection & güvenilmez
  içerik ele alışı, izin / onay / otonomi modeli, checkpoint / geri-alma, yerel model,
  MCP (istemci mi sunucu mu — hangi yön), skill / workflow / macro, site adaptörü,
  çevrimdışı / RAG.
- grep/glob: `agent`, `Planner`, `Navigator`, `executor`, `reactor`, `Task`, `tool`,
  `action`, `provider`, `prompt`, `inject`, `sanitize`, `untrusted`, `permission`,
  `autoApprove`, `checkpoint`, `condense`, `mcp`, `bridge`, `daemon`, `snapshot`,
  `dom`, `vision`, `skill`, `mode`.
- Karşılaştırma dosyasındaki iddiaları DEĞİL, KAYNAĞI esas al. {RAKİP_ADI}'nın GERÇEKTE
  ne yaptığını somut çıkar.

KATEGORİ KONTROLÜ: {RAKİP_ADI} bir tarayıcı-ajanı mı (WebBrain/nanobrowser/AIPex gibi
head-to-head kıyaslanır) yoksa FARKLI bir kategori mi (ör. kodlama ajanı — Kilo Code)?
Farklıysa belgeye bir "Kategori uyarısı" bloğu ekle ve YALNIZCA örtüşen eksenlerde
(çok-sağlayıcı/model, MCP, ajan modları, araç/izin modeli, otonomi, maliyet şeffaflığı,
context yönetimi, prompt mimarisi, checkpoint) derinleş; kategoriye özgü olanları
"Örtüşmeyen alanlar" başlığında AÇIKÇA ayır.

═══════════════════════════════════════════════════════════════════════════════
2) TEPEGÖZ TARAFI — hazır bilgi (şüpheye düşersen paketlerden / ADR'den doğrula)
═══════════════════════════════════════════════════════════════════════════════
Tam Electron tarayıcı, strict TS, ~70 `@tepegoz/*` paket monorepo, ADR güdümlü, 1.0
öncesi. AI roadmap `phases/ai-agent/` (S0–S12, HEPSİ 🟠 measurement-owed, hiçbiri
✅; sahip notu "hâlâ istediğim gibi çalışmıyor"). Ajan "gerçekten bağlanmış iskelet,
ince ölçülmüş". Vision/credential-broker/memory ATIL sevk; aynı anda TEK run; site
adaptörü YOK; 8 sağlayıcı (bazıları stub); çevrimdışı RAG YOK.

**Vision'ın neden atıl olduğunu DOĞRU yaz — ve burada roadmap ile kod ÇELİŞİYOR.**
`phases/ai-agent/` (S10, README S10 satırı, eval-results.md) ve birkaç
`docs/parities/*-agent-parity.md` dosyası, yeteneğin `TEPEGOZ_VISION` bayrağı arkasında
(default off) atıl sevk edildiğini YAZIYORDU — hepsi 2026-09-02'de düzeltildi.
**Kodda böyle bir bayrak YOK** — `TEPEGOZ_VISION` `packages/` ve `apps/` altında hiç
geçmiyor (kaynakta 27 `TEPEGOZ_*` ortam değişkeni var, bu onlardan biri değil).
Yeni bir parity track'te bu iddiayı yine görürsen, düzeltilmemiş bir kopyadır — kaynağa bak. Kodun söylediği: Reactor'ın `captureVision?:`
geri-çağrısı opsiyoneldir ve üretimde onu geçen HİÇBİR çağıran yok, yalnız testler geçiyor.
Yani vision "yapıldı, bayrakla kapatıldı" değil, **bağlanmadı**. İkisi farklı hâllerdir.
KOD esastır: "bayrak arkasında" yazma, "bağlanmamış" yaz. (Bu tutarsızlık 2026-09-01'de
tespit edildi; roadmap düzeltilirse bu paragrafı güncelle.)

**Genel kural — Tepegöz tarafında da KAYNAĞI esas al.** Bu brifing bir başlangıç
noktasıdır, kanıt değil. Bir yetenek hakkında iddia yazmadan önce onun üretimde
gerçekten çağrıldığını grep'le doğrula; "paket var" ile "uygulamaya bağlı" ayrımını
koru. Doğrulayamadığın bir şeyi Tepegöz LEHİNE yazma.

Kilit paketler:
- `@tepegoz/orchestrator` — Planner (Intent→DAG) → Executor (PEP'ten serileştirilmiş)
  → Reactor (continue/retry/replan/stop, tipli `Decision`); completion-evidence,
  navigation-grounding, vision-trigger, cache-window (lag-2 breakpoint).
- `@tepegoz/model-gateway` — `ModelGateway.complete()` (her çağrı `maxTokens`+
  `timeoutMs` ZORUNLU), `ModelRouter` (capability plan/exec/classify → tier +
  local/cloud), `TokenLedger`; adaptörler: Anthropic (resmi SDK), OpenAI (ham REST,
  SDK yok), Mock, Local; `CanonRequest`/`CanonResponse` TEK şema; streaming ADR-0025
  (`generateStream`→renderer `onDelta`).
- `@tepegoz/capability-plane` — `CapabilityRegistry` + **ToolGateway PEP** TEK KAPI:
  lookup → idempotency → zod doğrulama → PolicyKernel → HITL → execute → audit.
  Built-in/MCP/extension araçları ayrımsız aynı hattan.
- `@tepegoz/security-policy` — **model-ÖNCESİ deterministik PolicyKernel** (ADR-0006):
  danger class (read/state_changing/destructive/financial) + taint + hedef site →
  allow/deny/ask + makine-okunur reason code + biyometrik. `isSensitiveSite`
  (banka/kripto/sağlık/kamu/parola-yön.) HER otonomi seviyesinde SERT deny; otonomi
  yalnız kernel'in sorduğu prompt'u atlayabilir, deny'ı bozamaz. `TaintTracker`
  provenance. `EgressFirewall` (`inspectEgress`, Shannon entropi — sır/yüksek-entropi
  blob sızıntı denetimi). `detectHandoff` (captcha/2FA).
- `@tepegoz/agent-runtime` — `runAgent`, `AgentRunDeps`, iki-aşamalı HITL (plan
  önizleme + araç-başı), her ikisi fail-safe (yanıt yok = deny).
- `@tepegoz/browser-tools` — `browser_*` araçları, `BrowserHost` seam, DOM/a11y-önce
  algı (ADR-0008, vision yalnızca fallback), `build-dom-tree-script`.
- `@tepegoz/tool-executor` — `sanitizeText` (gizli/zero-width/bidi/homoglyph enjeksiyon
  vektörü temizliği), `wrapUntrustedContent`, `finalizeElements`.
- `@tepegoz/web-tools` — `web_search`, `web_get_page` (salt-okunur), içerik guard,
  SSRF-güvenli sitemap reader.
- `@tepegoz/local-inference` — `LocalProvider` (node-llama-cpp `LlamaEngine` üzerine),
  `responseFormat:'json'`'da GBNF gramer zorlaması.
- `@tepegoz/model-catalog` — GGUF kataloğu, ZORUNLU sha256, resumable indirme.
- `@tepegoz/mcp-client` — MCP **istemcisi** (ADR-0018); dış MCP araçları
  CapabilityRegistry'ye girip AYNI PEP'ten geçer. `McpSupervisor` (reconnect,
  `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen annotation → en kısıtlı sınıf).
  MCP **server** yüzeyi YOK (Phase 1b planlı, yapılmamış).
- `@tepegoz/recipe-compiler` (Phase 6, model-free imzalı replay + `evaluateAssertion`
  success oracle) · `@tepegoz/macro-engine` (iMacros halefi, model-free, oto-bekleme)
  · `@tepegoz/notary` (Phase 7: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir
  Replay Receipt + bağımsız `tepegoz-verify` CLI) — **DİKKAT: paket yazılmış ve testli
  ama `apps/desktop` onu HİÇ import etmiyor; bugün hiçbir çalışma makbuz üretmiyor.
  "Notary var" diye yazma, "yazılmış ama bağlanmamış" diye yaz** · `@tepegoz/credential-vault`
  (BYO-key, DPAPI/safeStorage) · `@tepegoz/human-input` (Catmull-Rom fare eğrileri,
  Gaussian jitter — bot-tespiti karşıtı hareket) · `@tepegoz/tasks` (kayıtlı görev,
  interval/page-change/external tetikleyici, `task_*` araçları) · `@tepegoz/reader`
  (makale çıkarımı, HTML'siz tipli bloklar).

Sağlayıcılar (8): anthropic, openai, gemini, kimi, nova, deepseek, xai, groq + `local`.
Modeller: claude-opus-5/sonnet-5/haiku-4-5, gpt-5/gpt-5-mini, gemini-3-pro/flash/
flash-lite. Effort: low/medium/high/xhigh/max. Otonomi: `ask`/`act`/`auto` (+ rezerve
`dangerous` = `ask` gibi davranılır). deny sınıfı her seviyede SERT bloke.

Araçlar — **araç adlarını EZBERDEN yazma, kaynaktan say.** `CapabilityRegistry.register({
descriptor('<ad>', ...) })` çağrılarını grep'le; bu satır yazıldığında **48 araç / 11 aile**
vardı: `browser_*` (10), `file_*` (10), `fileaccess_*` (4), `tab_*` (5), `task_*` (5),
`upload_*` (4), `download_*` (4), `web_*` (2), `clipboard_*` (2), `journal_search_events` (1),
`credential_update_field` (1). `file_*` TAM sandbox'lı bir dosya sistemi — bir AJAN
sandbox'ı, IDE workspace'i değil.

**Terminal ve kod-editleme YOK; ama "hiç kod çalıştırmıyor" demek YANLIŞ.**
`browser_analyze_page` sevk ediliyor: modelin yazdığı JS ifadesini sayfanın bir KOPYASI
üzerinde, ağsız sandbox'ta, `code_exec_read` yeteneğiyle çalıştırır ve YALNIZCA host
kanıtlanmış sandbox'ı sağlıyorsa kaydedilir (sandbox yoksa araç yok). Yazma tarafı —
`code_exec_write` — PolicyKernel'de KOŞULSUZ deny (rezerve, sadece "uygulanmamış" değil).
ADR-0026 izole-dünya sandbox'ı ölçümle çürüttü; kalan yol bu salt-okunur, journal'lanan
yoldur. ADR-0029 DevTools kullanıcı-only, asla agent aracı değil.

`extensions/ext-agent` — Agent Console, komut paleti Chat/Do/Make/Tasks, plan önizleme
(adım seç), kademeli otonomi + amber risk banner, effort ön-ayarları, kaydırılabilir
replay timeline, kanıt rozetleri (Checked/Unconfirmed/Contradicted), çalışırken steer,
pause/resume, arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi+arama,
composer ekleri (seçim/dosya/screenshot), ticaret çift-onay, scope grant, Human Handoff
Controller (CAPTCHA/2FA = kullanıcıya geri ver, çözme). Diğer eklentiler: `ext-translate`
(yerel-önce seçim+sayfa çeviri), `ext-typo`, `ext-macros`, `ext-tasks`, `ext-adblock`.

Kilit ADR'ler: 0005 sağlayıcı-agnostik, 0006 policy kernel pre-model, 0007 tek tool
plane, 0008 DOM/a11y-önce algı + vision fallback, 0013 orkestrasyon + 2-aşama HITL,
0016 per-paket i18n, 0018 MCP client, 0025 streaming sınırı, 0026 agent code-exec
(izole-dünya ÇÜRÜTÜLDÜ), 0027 agent memory (advisory/tainted/re-validated), 0029
DevTools kullanıcı-only, 0030 Notary, 0031-0037 recipe/mandate/policy-bundle/endpoint/
kamu/supply-chain, 0039 CAPTCHA/2FA auto-clear broker ile, 0040 download trust, 0042
sayfa çevirisi, 0043 safe browsing.

Bağlayıcı kültür: strict TS, zod safeParse her güven sınırında, per-paket EN+TR i18n
parity, determinism-first, honest measurement / anti-debt. "Never" listesi: her-adım
screenshot vision YOK, python sidecar / ikinci chromium / satıcı ajan SDK'ları YOK,
**browser-use/nanobrowser'ı benimseme YOK ("tekniği çal, asla adapte etme")**,
renderer-güvenilir güvenlik YOK, ağırlıkları repoya koyma YOK. Not: Tepegöz'ün v1 AI
roadmap'i (AI-1…AI-8) resmen "the browser-use/nanobrowser port" idi — `phases/
ai-agent/history.md` birebir dosya-eşleme tablosu verir. Rakip bu aileyle
akrabaysa bunu belirt.

═══════════════════════════════════════════════════════════════════════════════
3) ÜRETİLECEK DOSYA — `docs/versus/tepegoz-vs-{RAKİP}.md` (Türkçe)
   `docs/versus/tepegoz-vs-webbrain.md` yapısını birebir izle:
═══════════════════════════════════════════════════════════════════════════════
1. `# Tepegöz vs {RAKİP_ADI} — AI/ajan fonksiyonları karşılaştırması`
2. Üstte alıntı bloğu (`>` ile):
   - **Ne bu?** — bir cümle.
   - **Yöntem.** — okuduğun somut dosyalar (rakip + Tepegöz tarafı).
   - **Tarih.** {TARİH}.
   - **Dil notu.** — sahibe sunulduğu haliyle Türkçe tutuluyor
     (`docs/parities/README.md`'deki "orijinal dilinde tutulur" gerekçesiyle aynı).
   - **İlgili.** — varsa `docs/parities/{RAKİP}-agent-parity.md` ve
     `docs/parities/webbrain-agent-parity.md`.
   - (Farklı kategoriyse) **Kategori uyarısı.** — ne tür bir ürün, örtüşen eksende kıyas.
3. `## Önce çerçeve: bu asimetrik bir karşılaştırma` — küçük tablo:
   satırlar `Ne` / `Olgunluk` / `Kod` / `Felsefe` (+ farklı kategoriyse `Birincil iş`),
   sütunlar `{RAKİP_ADI}` | `Tepegöz`. Altında 1 paragraf: neyin neyle kıyaslandığı.
4. `## Derinlemesine: iş iş kim ne yapıyor` — gruplu düzyazı `### ` alt-başlıklar.
   En az şunları kapsa (rakibe göre uyarlanır): model/sağlayıcı desteği · algı (sayfa
   okuma / DOM-vs-vision) · aksiyon repertuvarı · ajan döngüsü / orkestrasyon ·
   (varsa) multi-agent veya mod sistemi · doğrulanmış sonuç / "yalan başarı" savunması
   · prompt-injection savunması (mimari + bugünkü kanıt) · hesap verebilirlik /
   denetlenebilirlik · kimlik bilgisi / sır işleme · çevrimdışı / egemenlik · asistan
   UX · bellek & skill · MCP (yön!) · site adaptörleri · Türkçe / bölgesel · ölçüm /
   dürüstlük kültürü. Her alt-başlık KISA ve İDDİALI; "kim daha iyi" cümlesiyle kapat.
5. `## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor` — büyük tablo, sütunlar:
   `# | Boyut | {RAKİP_ADI} | Tepegöz | Kim daha iyi + neden`. EN AZ 18-22 satır.
   "Kim daha iyi" hücresi net taraf tutar ve tek cümle gerekçe verir; "bugün X /
   mimaride Y" ayrımı yapılabilir.
   (Farklı kategoriyse tablodan önce bir `## Örtüşmeyen alanlar` başlığı: sadece-rakip
   / sadece-Tepegöz maddeleri.)
6. `## Sonuç` — dürüst kapanış: (a) bugün genişlik/çalışırlık ekseninde kim önde ve
   neden, (b) mimari/bahis ekseninde kim önde ve neden, (c) tek cümlelik "şunu
   istiyorsan X, bunu istiyorsan Y". Tepegöz'ün ajanının henüz kanıtlanmadığını
   (S-fazları 🟠, atıl yetenekler, tek run) açıkça söyle.

═══════════════════════════════════════════════════════════════════════════════
4) BİTİRDİĞİNDE — kısa rapor (2-3 paragraf)
═══════════════════════════════════════════════════════════════════════════════
- En çarpıcı 5-6 fark.
- Bugün kim daha iyi / mimari olarak kim daha iyi.
- (Farklı kategoriyse) kategori farkının bir cümlelik özeti.
- Dosyanın tam yolu.
```
