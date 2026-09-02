# Tepegöz vs WebBrain — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **WebBrain** (yayında olan, GPL-3.0 lisanslı
> Chrome/Firefox/Edge AI-tarayıcı-ajan eklentisi, v33.6.0) arasında, iş-iş kimin neyi daha iyi yaptığını
> tabloya döken derinlemesine bir karşılaştırma.
>
> **Yöntem.** `.junk/webbrain` deposunun (README, `docs/architecture.md`, `docs/agent-tools.md`,
> `docs/providers-and-models.md`, `docs/prompt-injection-defense.md`, `docs/security-model.md`,
> `docs/offline-rag.md`, `docs/apocalypse-mode.md`, `docs/skills.md`, `docs/slash-commands.md`,
> `docs/THREAT-MODEL.md`, `docs/claude-chrome-comparison.md`, `src/chrome/…` ağaç yapısı) ve bu reponun
> AI yüzeyinin (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|
mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`,
> `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01.
>
> **Dil notu.** Bu belge, sahibe sunulduğu haliyle Türkçe tutulmuştur
> (`phases/tracks/README.md`'deki "orijinal dilinde tutulur" kaydıyla aynı gerekçe). Proje eserleri
> İngilizce-öncedir; bu, yazıldığı haliyle korunan bir kayıttır.
>
> **İlgili:** [`phases/tracks/webbrain-agent-parity.md`](../parities/webbrain-agent-parity.md) —
> bu karşılaştırmanın "WebBrain'in yaptığı her şeyi Tepegöz de yapabilsin" tarafını fazlara/ADR'lere
> yönlendiren öneri track'i.

---

## Önce çerçeve: bu asimetrik bir karşılaştırma

|          | WebBrain                                                                                 | Tepegöz                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ne       | Chrome MV3 + Firefox MV2 + Edge **eklentisi**, yan panelde ajan                          | Tam **Electron tarayıcı**; ajan ("Do modu" / Agent Console) alt sistemlerden biri                                                                 |
| Olgunluk | **Yayında** — 3 mağazada, 176 KB'lik CHANGELOG, gerçek kullanıcılar, katkıcılar, Discord | **1.0 öncesi**; roadmap'in kendi ifadesi: ajan "gerçekten bağlanmış iskelet, ölçümü zayıf", sahip verdiği not: _"hâlâ istediğim gibi çalışmıyor"_ |
| Kod      | Vanilla JS, framework yok, build yok; `chrome/`+`firefox/` iki ayna kopya                | Strict TS, pnpm+turbo monorepo, ~70 paket, ADR güdümlü                                                                                            |
| Felsefe  | "Görünür kullanıcı otomasyonu + güçlü güvenlik sınırları", pratik, ürün-önce             | "Security-by-design, local-first"; model-öncesi deterministik çekirdek + kriptografik hesap verebilirlik                                          |

Yani: **olgun, geniş, çalışan bir eklenti-ajan** vs. **erken, mimari ağırlıklı, güvenlik-önce bir
native-tarayıcı ajanı**. Bugünkü "işi yapıyor mu" ile "doğru inşa edilmiş mi" farklı eksenler.

---

## Derinlemesine: iş iş kim ne yapıyor

### Model / sağlayıcı desteği — WebBrain açık ara

WebBrain: **106–108 hazır sağlayıcı kartı**, kurulum gerektirmeyen WebBrain Cloud varsayılanı, 10 yerel
endpoint (llama.cpp/Ollama/LM Studio/Jan/vLLM/SGLang/LocalAI/GPT4All/proxy/Unsloth), tarayıcı-içi
**WebGPU** (LFM2.5 2.6B, Bonsai 27B), ayrı vision sağlayıcı, Whisper transkripsiyon zinciri. Yerel
modeller için context penceresini sunucu metadata'sından otomatik okuyor, otomatik sıkıştırıyor.

Tepegöz: **8 sağlayıcı** (anthropic, openai, gemini, kimi, nova, deepseek, xai, groq) + `local`
(node-llama-cpp, sha256'lı GGUF kataloğu, JSON'u GBNF gramerle zorlayan). Hepsi tek
`CanonRequest/CanonResponse` şemasına normalize; `ModelRouter` yeteneği (plan/exec/classify)
tier+yerel/bulut'a eşliyor; DPAPI'li BYO-key kasası. Ama: yalnız Anthropic gerçek SDK kullanıyor,
birkaç sağlayıcı "henüz bağlanmadı", sıfır-kurulum bulut yok.

### Algı (sayfayı okuma) — bugün WebBrain, tasarımda Tepegöz

WebBrain: `ref_id`'li erişilebilirlik ağacı, `read_page` (metin), **`read_pdf`**, `read_page_source`
(Dev), adaptif okuma pencereleri (6k/8k → büyük-context modelde 12k/16k), sayfalama +
`continuationArgs`, Gmail konu çapası, **shadow DOM delme** (CDP), iframe araçları. Vision: ilk mesajda
ekran görüntüsü + aksiyon sonrası oto-screenshot (tier'e göre opt-in), token tasarrufu için ayrı vision
modeli metin betimlemesi üretiyor.

Tepegöz: DOM/a11y-önce (ADR-0008), kimlik-kararlı ref'ler + **diff/dedupe/elision** (token kesmek
için), `aria-labelledby`/`label[for]` çözümü, `browser_get_article`.
`@tepegoz/tool-executor` gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini ayrı bir pakette
temizliyor. Vision **yalnızca eskalasyon** (ADR-0008/S10) — ve bugün **atıl, çünkü hiç bağlanmamış**:
Reactor'ın `captureVision` geri-çağrısı opsiyonel (`reactor-types.ts`), üretimde onu geçen tek bir
çağıran yok (yalnız testler geçiyor), yani eskalasyon hiçbir zaman tetiklenmiyor. Set-of-marks +
bütçeli küçültme tasarlanmış ama ölçülmemiş.

### Aksiyon repertuvarı — WebBrain nicelik, Tepegöz disiplin

WebBrain: **62 çekirdek araç (Chrome) / 53 (Firefox)** + dinamik skill araçları. Dar ve denetlenebilir:
ayrı AX click/type/set_field/set_checked/hover/drag_drop, iframe seti (`promote_iframe` dahil), ağ
(`fetch_url`/`research_url`), 5 indirme aracı, `upload_file`, **`solve_captcha` (CapSolver)**,
`download_social_media`, scheduler araçları, scratchpad/progress, `verify_form`, Dev araçları
(`execute_js`, `inject_css`/`patch_element` + geri-alları, `read_console`, `inspect_network_requests`,
`inspect_event_listeners`), deneysel **WebMCP**.

Tepegöz: ~30 araç ama hepsi **tek kapıdan** (ToolGateway PEP): lookup → idempotency → zod doğrulama →
PolicyKernel → HITL → execute → audit. `browser_*`, `tab_*` (spawn + egress_blocked dahil), `web_*`
(search/get_page/send_form), **`file_*`** (tam sandbox'lı dosya sistemi), `clipboard_*`,
`journal_search_events`. Ayrıca **model-free deterministik şerit**: `@tepegoz/macro-engine` (iMacros
halefi, kontrol akışı + oto-bekleme) ve `@tepegoz/recipe-compiler` (imzalı, kendini iyileştiren
seçicili tekrar-oynatma). `@tepegoz/human-input` insan-benzeri fare eğrileri/jitter (bot-tespiti
karşıtı hareket profili).

### Ajan döngüsü

WebBrain: tek `agent.js` döngüsü, **≤195 adım (varsayılan 130)**, Plan-before-Act (Off/Try/Strict), 3
bağımsız loop dedektörü, döngü-içi oto-sıkıştırma (mesaj sayısı / ham karakter / token bütçesi), acil
kırpma, görüntü budama, 8k araç-sonucu tavanı, panel kapansa da süren "detached run" journal'ı.

Tepegöz: **Planner (Intent→DAG) → Executor (PEP üzerinden serileştirilmiş) → Reactor**
(continue/retry/replan/stop, tipli `Decision`). İki-aşamalı HITL (plan önizleme + araç-başı), her ikisi
de fail-safe. Native tool-calling anthropic/openai/gemini'de; streaming sınırı ADR-0025
(`generateStream`→renderer). `CompletionEvidence`, navigation-grounding, cache-window (lag-2
breakpoint). Ama **aynı anda tek çalışma** (ADR-0013); paralel/dayanıklı checkpoint-resume roadmap'te,
sevk edilmedi.

### Doğrulanmış sonuç / "yalan başarı" savunması — Tepegöz'ün asıl kozu

WebBrain: `done()` engelleme — açık dialog/form yoklaması; özet "kaydedildi" derken modal açıksa devam
ettirir. Esasen bu kadar.

Tepegöz: **S4** — `CompletionEvidence` + **deterministik düşürme**: model, sayfanın çürüttüğü bir
iddiayı `done`'a konuşturamaz; "Saved!" yazan ama 5xx dönen tuzak fixture'ları; UI'da kanıt rozetleri
(**Checked / Unconfirmed / Contradicted**); mutasyon öncesi deterministik origin kapısı (URL yeniden
doğrulama); recipe-compiler'ın `evaluateAssertion`'ı "sondan bir önceki adımı bırakıp başarı bildirme"yi
yakalıyor. Kuzey-yıldızı koşulu #3: _"fabricated-success ≈ 0 — hiçbir rakibin yayımlamadığı metrik."_

### Prompt-injection savunması

WebBrain — **4 katman**: nonce'lu `<untrusted_page_content>` sarma + breakout-strip, sistem-prompt
sözleşmesi, **yetenek×origin izin kapısı** (Allow once/Always/Deny, deterministik, LLM yok), çıktı
sanitizer'ı. Ek: strict-secret + bulut redaksiyon katmanı, credential-field tespiti, çift-submit
koruması, tıklama-örtüşme testi, finans adaptörleri, yerel-ağ engeli (RFC1918 + 169.254.169.254).
**Kanıt var**: 27 payload × 2 build adversaryal korpus + ablasyon. **Dürüst THREAT-MODEL.md** açık
boşlukları isimlendiriyor: G1 ambient çapraz-site çerezleri, G2 origin-scoping yok, G4 CDP fazla geniş.

Tepegöz — **model-ÖNCESİ deterministik Policy Kernel** (ADR-0006): danger class + taint + hedef site →
allow/deny/ask + makine-okunur reason code + biyometrik (Windows Hello) gereksinimi. Hassas-site kilidi
(banka/kripto/sağlık/kamu/parola yöneticisi) = **her otonomi seviyesinde sert deny**; otonomi yalnız
kernel'in sorduğu prompt'u atlayabilir, deny'ı bozamaz. **EgressFirewall** (`inspectEgress`, Shannon
entropisi — sızıntı/yüksek-entropi blob tespiti — WebBrain'de yok). TaintTracker provenance seviyeleri.
Credential Broker (ajanda sırrın gireceği bir şekil yok; OS-auth kapısı olana dek her dolgu reddedilir —
**atıl sevk**). Advisory critic (kernel-sonrası, engelleyemez, argüman değerini görmez). **Notary**:
hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir **Replay Receipt** + bağımsız `tepegoz-verify`
CLI — mimari olarak WebBrain'de eşi yok, **ama paket bugün bağlanmamış**: `@tepegoz/notary`
`apps/desktop` içinde hiçbir yerden import edilmiyor, yani **hiçbir çalışma receipt üretmiyor**
(ADR-0030 bunu kendisi kaydediyor). **Ayrıca** ASR bataryası "measurement-owed"; roadmap `auto` otonomisinin finans
katmanını koşulsuz onayladığı bir hatayı açıkça itiraf ediyor (okuyarak bulundu, düzeltildi).

### Çevrimdışı / egemenlik — WebBrain ezici

WebBrain: **Apocalypse Mode** — Kiwix/ZIM Wikipedia arşivleri (openZIM okuyucu + Xapian tam-metin),
Emergency Box korpusu (~502 MB, 570 kamu-malı saha dokümanı), **çevrimdışı RAG** (SQLite FTS5 BM25 +
int8 E5 vektörleri + reciprocal rank fusion + E5 yeniden-sıralama), tarayıcı-içi WebGPU LLM, yerel
vision (VL 2 450M). Xapian/libzim WASM'ı gömdüğü için GPL'e geçmiş — yani ciddi, tam bir
çevrimdışı-bilgi yığını.

Tepegöz: `local-inference` seam'i + sha256'lı model kataloğu + "basit adımlar cihazda" maliyet-tasarrufu
düğmesi. Phase 8 / S12: **çoğu inşa edilmemiş**, S12 indirilmiş ağırlıklara takılı, sahiplik tablosu
BOŞ.

### Asistan UX

WebBrain: okuma-önce panel, **streaming Ask**, "Follow/Jump/Back to question" yüzen kontrol, kopya
butonları, mid-run stop, sekme-başı sohbet, plan kartları, **slash komutları** (`/ask /act /dev /plan
/schedule /watch /workflow /teach /memory /screenshot /record /export /compact /reset /allow-api …`),
seçim okuyucuları (Summarize/Explain/Quiz/Proofread/Translate/Humanize).

Tepegöz: Agent Console (Chat/Do/Make/Tasks paleti), plan önizleme (adım seç), kademeli otonomi + amber
risk banner, effort ön-ayarları, **kaydırılabilir replay timeline**, kanıt rozetleri, çalışırken
**steer**, pause/resume, arka-plana devam + tepsi göstergesi, sekme-grubu-başı oturum, sohbet geçmişi +
arama, **ticaret çift-onay kapısı**, scope-grant UX. Streaming ADR-0025 ile bağlı ama
"measurement-owed".

### Bellek & skill'ler

WebBrain: yerel `user-memory` (opsiyonel oto-öğrenme, kapalı), **saved workflows**
(`webbrain-workflow/1` — değer-siz derlenmiş izler, semantik hedef + postcondition + locator
iyileştirme), **Teacher mode** (gösterilen tıklamalardan öğren), **skill'ler** (güvenilir markdown +
`webbrain-tools` HTTP manifesti; FreeSkillz/OTP/Humanizer + opt-in Mail.tm/Litterbox/Open-Meteo/Open
Library/Wikipedia/Türkçe deasciifier), planner ile semantik yönlendirme.

Tepegöz: S9 — alan-başı **advisory bellek** + yazma-tarafı zehir filtresi + sil-değil-karantina +
görev-çiti dışında yalnız-tavsiye recall (ADR-0027); skill kütüphanesi = **saklı prompt şablonları**
(seçince kutuyu doldurur, **çalıştırmaz** — bilerek muhafazakâr); skill-kapsamlı hatırlanan izinler
model-öncesi danışılır; ayrıca deterministik recipe/macro şeridi.

### MCP — ters yönler

WebBrain: **MCP sunucusu** (`@webbrain/mcp-server`) — Claude Code/Codex/Cursor senin oturum-açık
tarayıcına görev delege eder (6 görev-seviyesi araç). LM Studio eklentisi de var.

Tepegöz: **MCP istemcisi** (ADR-0018) — dış MCP sunucularının araçları Capability Plane'e girer ve
**aynı PEP'ten** geçer. MCP sunucu yüzeyi henüz yok (Phase 1b DoD maddesi, tamamlanmadı).

### Site adaptörleri — WebBrain

WebBrain: **58+ gerçek adaptör** (github, gmail, slack, notion, jira, stripe, coinbase, robinhood,
amazon, booking, **sahibinden, trendyol** …) — ilk mesaja sayfa-şekli rehberi enjekte, navigasyonda
yeniden, tek seferde bir tane, finans adaptörleri ekstra onay taşır.

Tepegöz: agent için site-adaptör sistemi **yok**. Phase 2 "adapters" daha çok içerik/reklam engelleme +
Safe Browsing (ADR-0043). Hassas-site yalnızca _kategori_ (kilit için).

### Türkçe / bölgesel — Tepegöz

WebBrain: UI ~25 dile çevrili (tr dahil), Türkçe deasciifier skill'i, sahibinden/trendyol adaptörleri.
Türkçe "birçoktan biri".

Tepegöz: Türkçe **birinci sınıf** — her paket EN+TR sözlüğünü aynı PR'da parity testiyle taşır
(ADR-0016), `ai-agent` kuzey-yıldızı **≥10 Türkçe-web H2H görevi** şart koşuyor, Phase 11
"regional-trust-kamu" (e-Devlet, KVKK, ADR-0036 kamu adaptör güven modeli). Şirket Türk
(roltek.com.tr).

### Ölçüm / dürüstlük kültürü — Tepegöz (ve fark büyük)

WebBrain: injection korpusu, LLM senaryo benchmark'ları, cloud eval, vision eval — sağlam. THREAT-MODEL
[built]/[planned]/[gap] etiketliyor.

Tepegöz: `@tepegoz/agent-eval` (gerçek app, gerçek sayfa, **ground-truth-önce** skorlama, LLM-judge
ikincil, judge↔insan kalibrasyonu kayıtlı), SHA-256'lı donmuş fixture registry'leri, istatistiksel
anayasa (Wilson CI, havuzlanmış aile agregaları, iddia için N≥10), **anti-debt kuralı**, PROSE-LEDGER
(bir prompt steer'ı ancak eşli sweep kanıtlayınca sil), kuzey-yıldızı iddiası **reddedilebilir**
(`bridgeClaim` 25 insan etiketinin altında `publishable:false`), ön-kayıtlı H2H protokolü. Madalyonun
öbür yüzü: bu disiplin kısmen yetenek henüz orada olmadığı için var — her S-fazı 🟠, hiçbiri ✅ değil.

> Not: Tepegöz'ün roadmap'i `browser-use`/`nanobrowser` ailesini _"tekniği çal, asla benimseme"_ diye
> listeliyor — WebBrain bu aileyle akraba görünüyor (`__wbElementMap`, `wb_` önekleri, deobfuscated
> Claude-Chrome karşılaştırması repo içinde). Yani Tepegöz ekibi bu tarz ajanları inceleyip bilinçli
> farklı yol seçmiş.

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

Legend — **Home** yok; bu tablo yalnızca "kim daha iyi + neden".

| #   | Boyut                                      | WebBrain                                                                                                     | Tepegöz                                                                                                                                                                                                                                 | Kim daha iyi + neden                                                                                                                                                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Dağıtım / form**                         | Eklenti — mevcut tarayıcıda, sıfır göç, ama eklenti API + `chrome.debugger` ile sınırlı                      | Tam tarayıcı — out-of-process CDP, kendi sekme modeli, kendi pencere fabrikası; ama tarayıcı değiştirmen gerek + henüz yayında değil                                                                                                    | **Bugün WebBrain** (erişim). **Yapısal olarak Tepegöz** (kontrol derinliği, origin-izolasyonunu ancak native tarayıcı kapatabilir)                                                    |
| 2   | **Sağlayıcı genişliği + sıfır-kurulum**    | 106–108 kart, Cloud varsayılanı, 10 yerel endpoint, WebGPU                                                   | 8 sağlayıcı (bazıları stub) + `local`; sıfır-kurulum bulut yok                                                                                                                                                                          | **WebBrain** — kıyas kabul etmez                                                                                                                                                      |
| 3   | **Sağlayıcı mimarisi**                     | Provider abstraction, `{content,toolCalls,usage}` normalizasyonu                                             | Tek `Canon*` şeması, capability→tier router, DPAPI key kasası, GBNF JSON zorlaması                                                                                                                                                      | **Tepegöz** — daha temiz, tipli, tek kaynak                                                                                                                                           |
| 4   | **Sayfa algısı (bugün)**                   | AX ağacı + PDF + page-source + shadow DOM + iframe + sayfalama                                               | DOM/a11y + diff/elision + article; PDF/shadow yok, v2 flag-gated                                                                                                                                                                        | **WebBrain** — daha çok sayfa türünü bugün okuyor                                                                                                                                     |
| 5   | **Algı ekonomisi (token)**                 | Adaptif pencere + görüntü budama + 8k tavan                                                                  | Değişen-only diff + unchanged elision + sanitizer paketi                                                                                                                                                                                | **Tepegöz** — tasarım daha agresif token kesiyor (ama ölçülmemiş)                                                                                                                     |
| 6   | **Aksiyon repertuvarı genişliği**          | 62/53 araç + CAPTCHA + medya indirme + iframe + Dev editing/diagnostics + WebMCP                             | ~30 araç + tam dosya-sistemi + clipboard + journal                                                                                                                                                                                      | **WebBrain** — CAPTCHA, medya, iframe, Dev pratik kapsama                                                                                                                             |
| 7   | **Araç çağırma disiplini**                 | Yetenek×origin kapısı araç-başı                                                                              | **Tek PEP**: zod→policy→HITL→execute→audit, MCP/eklenti/builtin ayrımsız                                                                                                                                                                | **Tepegöz** — her araç istisnasız aynı denetim hattından                                                                                                                              |
| 8   | **Deterministik (model-free) otomasyon**   | "Workflows" = derlenmiş izler + healing; Teacher mode                                                        | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, oracle'lı)                                                                                                                                                                 | **Tepegöz** — gerçek model-siz yorumlayıcı + imzalı tarif                                                                                                                             |
| 9   | **Ajan döngüsü olgunluğu**                 | ≤195 adım, 3 loop dedektörü, döngü-içi oto-sıkıştırma, detached-run                                          | Planner→Executor→Reactor, tipli kararlar, 2-aşama HITL; **tek eşzamanlı run**, checkpoint-resume yok                                                                                                                                    | **WebBrain** (savaş-test, uzun run, UI-teardown'a dayanıklı). Tepegöz yapı olarak daha açık ama serileştirilmiş + kanıtsız                                                            |
| 10  | **Doğrulanmış sonuç / yalan-başarı**       | `done()` dialog yoklaması                                                                                    | `CompletionEvidence` + deterministik düşürme + tuzak fixture'lar + Checked/Contradicted rozetleri + origin kapısı                                                                                                                       | **Tepegöz** — belirgin fark; mekanizma bile WebBrain'inkini aşıyor (ölçüm borçlu ama)                                                                                                 |
| 11  | **Prompt-injection savunması (mimari)**    | 4 katman, deterministik izin kapısı, LLM gate'te yok                                                         | Model-ÖNCESİ Policy Kernel + EgressFirewall + taint provenance + biyometrik yüksek-risk                                                                                                                                                 | **Tepegöz** — pre-model kernel + çıkış-sızıntı denetimi + entropi analizi                                                                                                             |
| 12  | **Prompt-injection (kanıt bugün)**         | 27 payload × 2 build korpus + ablasyon sayıları var; dürüst gap listesi                                      | Redteam + injection-corpus var ama claim-grade **ASR bataryası measurement-owed**                                                                                                                                                       | **WebBrain** — bugün ölçülü kanıtı olan taraf                                                                                                                                         |
| 13  | **Hesap verebilirlik / denetlenebilirlik** | Yerel IndexedDB trace (opt-in), telemetri yok                                                                | Sevk edilmiş: event-sourced journal. **Notary** (hash-zinciri + Ed25519 imzalı checkpoint + taşınabilir Replay Receipt + bağımsız `tepegoz-verify` CLI) yazılı ve testli ama `apps/desktop`'a **bağlanmamış** — bugün receipt üretmiyor | **Mimaride Tepegöz** — kriptografik, satıcıdan bağımsız doğrulanabilir tasarım; WebBrain'de eşi yok. **Bugün berabere**: iki tarafta da sevk edilmiş olan yalnızca yerel bir iz kaydı |
| 14  | **Kimlik bilgisi / sır işleme**            | strict-secret + bulut redaksiyon + credential-field tespiti (prompt-seviye + redaktör)                       | Credential Broker: sırrın gireceği şekil yok, OS-auth olana dek reddeder (**atıl**) + strictGuard "hardened reading"                                                                                                                    | **Kavramsal Tepegöz** (sır ajana hiç ulaşmıyor) ama **atıl** — **bugün pratikte WebBrain** çalışıyor                                                                                  |
| 15  | **Çevrimdışı / egemenlik**                 | Apocalypse Mode: ZIM Wikipedia + Xapian + Emergency Box + FTS5/E5 çevrimdışı RAG + WebGPU LLM + yerel vision | `local-inference` seam + model kataloğu + maliyet-tasarrufu düğmesi; RAG yok, S12 ağırlıklara takılı                                                                                                                                    | **WebBrain** — ezici; tam bir çevrimdışı-bilgi yığını sevk ediyor                                                                                                                     |
| 16  | **Asistan UX (sevk edilmiş cila)**         | Streaming, okuma-önce scroll, slash komut derinliği, seçim okuyucuları, watch/schedule                       | Replay timeline, kanıt rozetleri, risk-sınıfı isimlendirme, scope-grant, steer, arka-plan run, ticaret kapısı                                                                                                                           | **Kıl payı WebBrain** (kanıtlı + slash derinliği). **Tepegöz** rıza-granülerliğinde daha iyi                                                                                          |
| 17  | **Bellek & skill'ler (pratik fayda)**      | Gerçek skill'ler (HTTP araçları), Teacher mode, workflow derleyici + healing, oto-öğrenen bellek             | Skill = yalnız prompt şablonu (bilerek); poison-filtreli karantina belleği; recipe/macro                                                                                                                                                | **WebBrain** (skill'ler _iş yapıyor_). **Tepegöz** "silahlandırılamaz" tarafta                                                                                                        |
| 18  | **MCP**                                    | MCP **sunucusu** (başka ajanlar senin tarayıcını kullanır) + LM Studio eklentisi                             | MCP **istemcisi** — dış araçlar tek PEP altında; sunucu yüzeyi yok                                                                                                                                                                      | Farklı yönler; **WebBrain** farklılaşmış sevk edilmiş özellik olarak, **Tepegöz** mimari temizlikte                                                                                   |
| 19  | **Site adaptörleri**                       | 58+ gerçek adaptör (sahibinden/trendyol dahil)                                                               | Yok                                                                                                                                                                                                                                     | **WebBrain** — net                                                                                                                                                                    |
| 20  | **Türkçe / bölgesel derinlik**             | tr locale + deasciifier + 2 TR adaptör (birçok dilden biri)                                                  | Parity-zorunlu EN+TR i18n, TR-web benchmark şartı, Phase 11 kamu/e-Devlet güven modeli                                                                                                                                                  | **Tepegöz** — Türkiye pazarı için taahhüt derinliği                                                                                                                                   |
| 21  | **Ölçüm / dürüstlük kültürü**              | injection korpusu + senaryo benchmark'ları + [built]/[gap] etiketleri                                        | Ground-truth eval harness + istatistiksel anayasa + anti-debt + reddedilebilir iddia + donmuş fixture'lar                                                                                                                               | **Tepegöz** — araştırma-sınıfı disiplin (ama bu, yeteneğin henüz orada olmadığının da işareti)                                                                                        |
| 22  | **"Bugün çalışıyor mu"**                   | Evet — v33.6.0, 3 mağaza, gerçek kullanıcılar                                                                | Kısmen — iskelet bağlı, çoğu faz measurement-owed, 3 yetenek atıl, tek run, adaptör yok                                                                                                                                                 | **WebBrain** — kesin                                                                                                                                                                  |

---

## Sonuç

**Bugün, genişlik ve "çalışıyor" ekseninde WebBrain kazanıyor:** sağlayıcılar (108'e 8), çevrimdışı
egemenlik (tam RAG yığını vs. bir seam), site adaptörleri (58'e 0), iş yapan skill'ler,
CAPTCHA/medya/iframe/Dev araçları, MCP sunucusu, çapraz-tarayıcı — ve hepsinin üstünde, **insanların
gerçekten kullandığı olgun bir ürün**.

**Mimari ve yaptığı spesifik bahislerde Tepegöz kazanıyor:** model-öncesi deterministik policy kernel,
egress firewall, taint provenance, kriptografik replay receipt'leri (Notary — paket yazılı ve testli,
ama `apps/desktop`'a bağlanmadığı için bugün hiçbir çalışma receipt üretmiyor), kanıt-atıflı tamamlama +
yalan-başarı savunması, biyometrik yüksek-risk kapıları, model-free deterministik otomasyon şeridi,
tek-PEP araç çağrısı, araştırma-sınıfı ölçüm, ve Türkçe/kamu derinliği. Ayrıca WebBrain'in kendi
threat-model'inin "kapatamadım" dediği ambient-kimlik / origin-scoping boşluğunu **yapısal olarak
kapatabilecek tek form** native tarayıcı — yani Tepegöz.

Dürüst özet: **WebBrain şu an daha iyi bir ajan; Tepegöz daha güvenli ve daha hesap-verebilir olanı
olmak üzere tasarlanmış ve bunu henüz kanıtlamadı.** Bugün tarayıcı otomasyonu lazımsa → WebBrain. Tez
"oturum-açık banka oturumuna güvenebileceğin, ne yaptığının kriptografik kanıtı olan, Türkçe bir ajan"
ise → o Tepegöz'ün oyunu, hâlâ tezgâhta.
