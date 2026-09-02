# Reusable prompt — "add a rival's good features to the phases, the Tepegöz way"

Run this **once per rival** (fresh session or a subagent). It reads an existing
`docs/versus/tepegoz-vs-<rival>.md` comparison + the rival's checkout under `.junk/<rival>/`
+ Tepegöz's AI surface, and produces a `docs/parities/<rival>-agent-parity.md` proposal
track that maps the rival's genuinely-good-but-missing capabilities to a Tepegöz-conformant
approach + a suggested phase/ADR home + a draft DoD — the same shape as the already-written
`docs/parities/webbrain-agent-parity.md`.

## Placeholders — fill before running

| Token          | Meaning                | Values                                                    |
| -------------- | ---------------------- | -------------------------------------------------------- |
| `{RAKİP}`      | slug (files)           | `nanobrowser` · `kilocode` · `aipex` · `webbrain`        |
| `{RAKİP_ADI}`  | human-readable name    | `Nanobrowser` · `Kilo Code` · `AIPex` · `WebBrain`       |
| `{TARİH}`      | today's date           | e.g. `2026-09-01`                                        |

## Preconditions

- `docs/versus/tepegoz-vs-{RAKİP}.md` already exists (run the comparison first).
- `.junk/{RAKİP}/` is checked out.
- `docs/parities/webbrain-agent-parity.md` exists as the structural reference.
- For `webbrain` the output already exists — use that slug only to sanity-check the template.

---

## The prompt

```
GÖREV: {RAKİP_ADI} ({RAKİP}) ile Tepegöz arasında zaten yapılmış olan karşılaştırmayı
(`docs/versus/tepegoz-vs-{RAKİP}.md`) al; {RAKİP_ADI}'nın GERÇEKTEN İYİ YAPTIĞI ve
Tepegöz'de EKSİK olan yetenekleri "Tepegöz'ün yapacağı şekilde" fazlara/ADR'lere
yönlendiren ayrıntılı bir öneri track'i yaz.

ÇIKTI: TEK bir yeni dosya  ->  `docs/parities/{RAKİP}-agent-parity.md`
       + TEK bir düzenleme  ->  `docs/parities/README.md` (indekse satır ekle)
Repoda BAŞKA HİÇBİR ŞEYE dokunma. Branch açma, commit etme.
Referans şablon: `docs/parities/webbrain-agent-parity.md` — yapısını ve DİLİNİ
(İngilizce) birebir taklit et. Karşılaştırma dosyası Türkçe olsa da bu track
dosyası İngilizce yazılır (tracks/ klasör konvansiyonu + referans şablonla tutarlılık).

═══════════════════════════════════════════════════════════════════════════════
1) ÖNCE OKU (derinlemesine, göz gezdirme değil)
═══════════════════════════════════════════════════════════════════════════════
a) `docs/versus/tepegoz-vs-{RAKİP}.md` — TAMAMINI. Bu dosyanın "kim daha iyi + neden"
   tablosundaki "{RAKİP_ADI}" lehine çıkan satırlar = ham aday listen.
b) `docs/parities/webbrain-agent-parity.md` — TAMAMINI. Üreteceğin dosyanın kalıbı bu.
c) `phases/README.md` — klasör haritası, v1 ship line, cross-cutting compliance
   gate'leri, "Already planned — do NOT re-propose" listesi, Phase Status Report kuralı.
d) `phases/ai-agent/README.md` — S0–S12 faz indeksi + durumları, "Never" listesi,
   "Routing — what stays out" tablosu, anti-debt kuralı.
e) `.junk/{RAKİP}/` — rakibin deposu. README('lar), mimari/ajan dokümanları, kaynak
   ağacı, ve KİLİT kaynak dosyaları (ajan döngüsü, araç/aksiyon seti, sağlayıcı
   katmanı, prompt yapımı, güvenlik/izin, prompt-injection ele alışı). grep/glob ile
   `agent`, `tool`, `action`, `provider`, `prompt`, `inject`, `permission`, `mcp`,
   `snapshot`, `skill` ara. Rakibin GERÇEKTE ne yaptığını somut çıkar — karşılaştırma
   dosyasındaki iddiaları kaynaktan doğrula, sadece ona güvenme.
f) Şüpheye düştüğün her Tepegöz iddiasını ilgili `@tepegoz/*` paketinden / ADR'den doğrula.

═══════════════════════════════════════════════════════════════════════════════
2) TEPEGÖZ AI YÜZEYİ — hazır bilgi (şüphede kaynaktan doğrula)
═══════════════════════════════════════════════════════════════════════════════
Tam Electron tarayıcı, strict TS, ~70 `@tepegoz/*` paket monorepo, ADR güdümlü, 1.0
öncesi. AI roadmap `phases/ai-agent/` (S0–S12, HEPSİ 🟠 measurement-owed, hiçbiri
✅; sahip notu "hâlâ istediğim gibi çalışmıyor"). Ajan "gerçekten bağlanmış iskelet,
ince ölçülmüş". Vision/credential-broker/memory ATIL sevk; aynı anda tek run; site
adaptörü yok; 8 sağlayıcı (bazıları stub); çevrimdışı RAG yok.

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
- `@tepegoz/model-catalog` — GGUF kataloğu, ZORUNLU sha256, resumable indirme
  (`downloadStream` HTTP Range resume + `sha256OfStream` + lenient install-state).
- `@tepegoz/mcp-client` — MCP **istemcisi** (ADR-0018); dış MCP araçları
  CapabilityRegistry'ye girip AYNI PEP'ten geçer. `McpSupervisor` (reconnect,
  `MAX_TOOLS_PER_SERVER`), `dangerClassFor` (bilinmeyen annotation → en kısıtlı sınıf).
- `@tepegoz/recipe-compiler` (Phase 6, model-free imzalı replay + `evaluateAssertion`
  success oracle) · `@tepegoz/macro-engine` (iMacros halefi, model-free, oto-bekleme)
  · `@tepegoz/notary` (Phase 7: hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir
  Replay Receipt + bağımsız `tepegoz-verify` CLI) · `@tepegoz/credential-vault`
  (BYO-key, DPAPI/safeStorage) · `@tepegoz/human-input` (Catmull-Rom fare eğrileri,
  Gaussian jitter) · `@tepegoz/tasks` (kayıtlı görev, interval/page-change/external
  tetikleyici, `task_*` araçları) · `@tepegoz/reader` (makale çıkarımı, HTML'siz
  tipli bloklar).

Sağlayıcılar (8): anthropic, openai, gemini, kimi, nova, deepseek, xai, groq + `local`.
Modeller: claude-opus-5/sonnet-5/haiku-4-5, gpt-5/gpt-5-mini, gemini-3-pro/flash/
flash-lite. Effort: low/medium/high/xhigh/max. Otonomi: `ask`/`act`/`auto` (+ rezerve
`dangerous` = `ask` gibi davranılır). deny sınıfı her seviyede SERT bloke.

Araçlar (~30): `browser_*` (get_page, get_elements, get_article, click, type,
update_location/history/page, validate_page/form/condition, analyze_page, get_screenshot),
`tab_*` (create/list/get/update/delete/spawn/egress_blocked), `web_*` (search, get_page,
send_form), `file_*` (TAM sandbox'lı dosya sistemi), `clipboard_*`, `download_*`,
`upload_*`, `journal_search_events`, `task_*`, `extension_*`. **`execute_js`/terminal/
kod-editleme YOK** (ADR-0026 izole-dünya sandbox ölçümle ÇÜRÜTÜLDÜ, salt-okunur;
ADR-0029 DevTools kullanıcı-only, asla agent aracı değil).

`extensions/ext-agent` — Agent Console, komut paleti Chat/Do/Make/Tasks, plan önizleme
(adım seç), kademeli otonomi + amber risk banner, effort ön-ayarları, kaydırılabilir
replay timeline, kanıt rozetleri (Checked/Unconfirmed/Contradicted), çalışırken steer,
pause/resume, arka-plana devam + tepsi, sekme-grubu-başı oturum, sohbet geçmişi+arama,
composer ekleri (seçim/dosya/screenshot), ticaret çift-onay, scope grant, Human Handoff
Controller (CAPTCHA/2FA = kullanıcıya geri ver, çözme). Diğer eklentiler: `ext-translate`
(yerel-önce seçim+sayfa çeviri), `ext-typo` (yazım), `ext-macros`, `ext-tasks`,
`ext-adblock`.

Kilit ADR'ler: 0005 sağlayıcı-agnostik, 0006 policy kernel pre-model, 0007 tek tool
plane, 0008 DOM/a11y-önce algı + vision fallback, 0013 orkestrasyon + 2-aşama HITL,
0016 per-paket i18n, 0018 MCP client, 0025 streaming sınırı, 0026 agent code-exec
(izole-dünya ÇÜRÜTÜLDÜ), 0027 agent memory (advisory/tainted/re-validated), 0029
DevTools kullanıcı-only, 0030 Notary, 0031-0037 recipe/mandate/policy-bundle/endpoint/
kamu/supply-chain, 0039 CAPTCHA/2FA auto-clear broker ile, 0040 download trust, 0042
sayfa çevirisi, 0043 safe browsing. En yüksek ADR = 0044.

═══════════════════════════════════════════════════════════════════════════════
3) BAĞLAYICI KURALLAR — track'in her satırı bunlara uymalı
═══════════════════════════════════════════════════════════════════════════════
- Kod/JS deseni PORT ETME. Her yetenek "mevcut kernel/PEP/i18n/coverage disiplini
  içinde yeniden türetilir" diye yazılır.
- Yeni özellik `apps/desktop` büyüterek değil, bir `@tepegoz/*` PAKETİNDE yaşar
  (+ dependency-cruiser layer rule). Paketler mümkünse Electron-free (host seam
  enjekte edilir).
- Her güven sınırında zod `safeParse` (IPC, LLM tool-call args, MCP, Skills,
  adapters, Journal, Policy).
- `AppError(message, statusCode)` sözleşmesi.
- Her yeni kullanıcı-görülür string per-paket `src/i18n/{en,tr,index}.ts` +
  co-located parity testiyle, EN+TR AYNI PR'da (ADR-0016). Hardcoded string yok.
- Determinism-first: model yalnızca anlama/belirsizlik için; güvenlik kararı ASLA
  modele devredilmez.
- DoD gate'leri: self-review/code-review + coverage (S80/B85/F86/L80) + migration-safe
  DB + UAT + "NO AI attribution trailer".
- Anti-debt: yeni bir yetenek, üzerine kurulduğu faz hâlâ measurement-owed iken
  açılmaz — böyle bir bağımlılık varsa satırda AÇIKÇA "gated behind X reaching ✅"
  yaz.
- Tracks "not roadmap"tır: hiçbir şeyi "committed" gibi yazma; her satır "önerilen
  ev" + "en yakın mevcut seam" taşır. ADR NUMARASI REZERVE ETME (multi-profile
  track'inin ADR-çakışması dersi) — numara iş gerçekten başlarken atanır.

"NEVER" listesi (ai-agent) — bunları ÖNERME, "Ground rules"ta AÇIKÇA REDDET:
- her-adım (screenshots-every-step) vision — vision YALNIZCA eskalasyon (ADR-0008/S10).
- Python sidecar / ikinci Chromium / satıcı ajan SDK'ları (browser-use/nanobrowser =
  "tekniği çal, asla adapte etme").
- renderer-güvenilir güvenlik kararları.
- ağırlıkları repoya koymak (modeller indirilen artefakt).
- auto-judge headline sayılar / çift-haneli denemeden "ASR ≤1%".

"Already planned — do NOT re-propose" (bunları YENİDEN ÖNERME, mevcut seam'e ATIF ver):
- local-SLM / per-task memory / HybridRetriever / cost-saver toggle / vision fallback /
  MCP SERVER surface / cross-model Context Package  → Phase 1b.
- managed-proxy / sıfır-kurulum bulut varsayılanı / E2EE CloudSync / MV3 allowlist  → Phase 3–4.
- WebAuthn-passkey / built-in password manager  → Phase 2.
- VPN/Tor/kill-switch  → Phase 5.
- deterministik model-free signed recipes ("model replay'den çıkarılabiliyorsa Phase 6").
- provider trust mesh / learned ModelRouter / KG  → Phase 8.
- transaction mandates / signed policy bundles / governed endpoints  → Phase 9.

═══════════════════════════════════════════════════════════════════════════════
4) ANALİZ YÖNTEMİ
═══════════════════════════════════════════════════════════════════════════════
Rakibin her "kazandığı" yeteneğini ÜÇE ayır:
  (a) GERÇEKTEN İYİ + Tepegöz'de EKSİK  → envanter satırı + bir workstream.
  (b) Zaten var / mevcut faz-ADR-paket kapsıyor  → CITE et, yeniden önerme; "Routing"
      tablosuna ya da "X'in DoD'unu şu detayla keskinleştir" satırına koy.
  (c) Standing bir ADR kararıyla ÇELİŞİYOR  → "Ground rules — parity, not imitation"
      bölümünde ADR atıfıyla reddet, gerekçesiyle.
Her envanter satırı EN YAKIN mevcut Tepegöz seam'ini (paket/araç/ADR) İSİMLE anar,
ki ileride bir oturum yeniden türetmeden iş yapabilsin.
Rakip FARKLI ÜRÜN KATEGORİSİYSE (ör. kodlama ajanı): yalnızca örtüşen-eksen
yeteneklerini taşı, kategoriye özgü olanları AÇIKÇA kapsam dışı bırak.
Her workstream bir `ai-agent` faz bölümü gibi yazılır ki gerçek bir faz
dosyasına kaldırılabilsin.

═══════════════════════════════════════════════════════════════════════════════
5) ÜRETİLECEK DOSYA — `docs/parities/{RAKİP}-agent-parity.md` (İngilizce)
   `webbrain-agent-parity.md` yapısını birebir izle:
═══════════════════════════════════════════════════════════════════════════════
1. `# Track — {RAKİP_ADI} agent-capability parity`
2. `**Status:** 📋 Proposed — not scheduled ({TARİH}).` + 1 paragraf: bu bir
   yakalanmış boşluk listesi, `browser-settings-feature-gap.md` /
   `omnibox-competitive-parity.md` şeklinde; branch/ADR/owner yok.
3. `**Source:**` — hangi karşılaştırma dosyası + hangi repo + yöntem (kaynak okuması).
4. `## Why this track exists` — 1 paragraf: karşılaştırmanın vardığı asimetri;
   rakibin genişlikte önde olması bir yüzey-alanı sorunu, mimari sorun değil;
   bu track her rakip-yeteneği için "Tepegöz'de seam var mı, yoksa Tepegöz-uyumlu
   hali nedir" sorusunu yanıtlar.
5. `## How to read this` — her workstream bir faz bölümü kalıbında; hiçbir şey
   committed roadmap değil; zaten evi olanlar sadece keskinleştirilir.
6. `## Ground rules — parity, not imitation` — bilerek EŞLENMEYENLER: rakibin
   hangi özelliği hangi ADR'yle çelişiyor (madde madde, ADR numarası + gerekçe).
   En az: rakibin bir çözücü/execute_js/her-adım-screenshot/renderer-içi-runtime
   benzeri varsa bunları burada reddet.
7. `## Capability inventory` — büyük tablo:
   `# | {RAKİP_ADI} capability | Nearest Tepegöz behaviour today | Gap | Home`
   Home = mevcut faz/ADR adı ("sharpen, no new phase") VEYA "NEW (extends X)".
8. `## P1 … Pn` — her workstream: **Goal** / **Approach** (Tepegöz-uyumlu, adım
   adım) / **New/changed packages** / **ADR** (owed / addendum to X) / **DoD shape
   (draft)** — `- [ ]` maddeleri, deterministik olanlar test-edilebilir, sweep
   isteyenler açıkça işaretli.
9. `## Backlog (named, not written up)` — gerçek ama düşük-çekişli olanlar, ev önerisiyle.
10. `## Routing — what this track does not own` — tablo: `Stays with | Material`
    (Phase 1b / 2 / 3 / 6 / 8 / 9 / ilgili ADR'ler / S-fazları).
11. `## ADRs owed` — başlıkla (numara YOK), her biri "addendum to ADR-XXXX" ya da
    "new ADR"; kapanışta multi-profile ADR-çakışması dersine atıf.

Sonra `docs/parities/README.md`:
- Giriş paragrafındaki "... unscheduled proposals" sayısını +1 güncelle.
- Tabloya bir satır ekle: `[{RAKİP}-agent-parity.md](...)` | `📋 Proposed — not
  scheduled ({TARİH})` | 2-3 cümlelik kapsam (kaç workstream, hangileri "sharpen
  existing" hangileri "NEW", ve bilerek eşlenmeyenler).

═══════════════════════════════════════════════════════════════════════════════
6) BİTİRDİĞİNDE — kısa rapor
═══════════════════════════════════════════════════════════════════════════════
- Kaç workstream; kaçı "mevcut fazı keskinleştir" kaçı "NEW".
- Bilerek eşlenmeyen yetenekler + hangi ADR gereği.
- Dosya yolu.
- Faz durumu notu: hiçbir product/ai-agent faz durumu değişmedi (yalnız
  tracks/ önerisi eklendi) — "Kapanan: hiçbiri".
```
