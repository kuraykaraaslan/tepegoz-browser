# Research — "partial-open" computer-use / browser-agent SDKs

> **Ne bu?** `docs/others/`'daki rakip listesinin **"SDK açık, servis kapalı"** kısmının
> incelemesi: kod tarafı GitHub'da (indirip okunabilir) ama ajanın çekirdek zekâsı
> (model / API / bulut servisi) kapalı olan projeler. `.junk/` altına indirildiler.
> Amaç: Tepegöz için öğrenilecek somut desenler + neyin kopyalanamayacağını netleştirmek.
>
> **Kapsanan:** AgentQL (`.junk/agentql`), Amazon Nova Act (`.junk/nova-act`),
> OpenAI CUA sample (`.junk/openai-cua-sample`), Anthropic Computer Use / Browser Use
> demoları (`.junk/anthropic-quickstarts`).
>
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe tutuluyor (proje eserleri İngilizce-önce;
> bu yazıldığı haliyle korunan bir kayıt).

---

## Özet tablo — ne açık, ne kapalı

| Proje                                    | Açık olan                                                                                                                                          | Kapalı olan                                                                                          | Lisans (açık kısım)       | Tepegöz'e alaka                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------- |
| **AgentQL**                              | Python/JS SDK, sorgu dili grameri, Playwright entegrasyonu, örnekler, MCP sunucusu                                                                 | Doğal-dil sorguyu element/veri'ye çeviren **AI servisi** (REST API, API key zorunlu)                 | (SDK açık; servis SaaS)   | Orta — "element-by-prompt" + kendini-iyileştiren seçici deseni; ama çekirdek servise bağımlı        |
| **Amazon Nova Act**                      | Python SDK (constructor, `act()`, `act_get()`, HITL arayüzleri, hata taksonomisi, oturum kalıcılığı, paralel çalışma, `@tool`, Strands MCP client) | **Nova Act modeli + AWS servisi** (`nova.amazon.com/act` API key ya da IAM); RAI guardrails sunucuda | Apache-2.0 (SDK)          | Yüksek — HITL desen tasarımı, hata taksonomisi, "actuator lock" fikri, oturum sağlayıcı soyutlaması |
| **OpenAI CUA sample**                    | TS örnek uygulama: Next.js operatör konsolu + Fastify runner, replay şeması, senaryo manifesti, `native` vs `code` mod, doğrulama pipeline'ı       | **`computer` tool + CUA modeli** (Responses API, `gpt-5.x`)                                          | (sample app; MIT-benzeri) | Yüksek — replay/artifact pipeline'ı, `native` vs `code` mod ayrımı, senaryo-doğrulama deseni        |
| **Anthropic Computer Use / Browser Use** | Docker referans loop'ları (`computer-use-demo`, `browser-use-demo`, `computer-use-best-practices`), araç şemaları, streamlit UI                    | **Claude modeli** (API/Bedrock/Vertex) — `computer` toolset ve düşünme sunucuda                      | (quickstart; MIT-benzeri) | **En yüksek** — "best practices" repo'su Tepegöz'ün S1/S2/S7 için birebir referans                  |

**Genel sonuç:** Bunların hiçbiri Tepegöz'e "rakip ürün" değil; hepsi **ajan iskeleti +
model API'si** kalıbı. Model API'si kapalı, iskelet açık. Tepegöz için değeri: iskelet
desenlerini görmek (HITL, replay, mod ayrımı, context ekonomisi) — model tarafı zaten
`@tepegoz/model-gateway`'in kendi işi.

---

## AgentQL — "element-by-prompt" + kendini-iyileştiren seçici

**Ne yapıyor.** Doğal dille yazılmış bir sorgu (`{ login_button, search_box }` gibi) alıp
canlı sayfada o elementleri/veriyi bulan bir AI servisi + onun etrafında Playwright SDK'sı.
"XPath'e AI-destekli alternatif": UI değişince sorgu kendini iyileştiriyor, aynı sorgu
benzer içerikli farklı sitelerde çalışıyor, auth arkasındaki sayfalarda da iş görüyor.
Ayrıca: stealth mod, insan-benzeri anti-bot davranışı, sonsuz-kaydırma, çerez-diyalog
kapatma, oturum kaydet/yükle örnekleri, resmi bir **MCP sunucusu**.

**Kapalı olan.** Sorguyu element'e çeviren model/servis. SDK API key ister; her sorgu
AgentQL API'sine gider.

**Tepegöz'e ne öğretir.**

- **`browser_get_elements` / locator seam için bir "prompt ile element bul" katmanı fikri.**
  Tepegöz'ün `@tepegoz/browser-tools` algısı bugün DOM/a11y ağacı + `ref` veriyor; model
  ağacı okuyup `ref` seçiyor. AgentQL'in yaptığı, o seçimi ayrı bir küçük model çağrısına
  devretmek (WebBrain karşılaştırmasındaki `find` tool fikriyle aynı). Tepegöz'de bu
  **S2 perception-v2'nin ref-çözümü sürtünme yaratırsa** düşünülebilir — ama determinism-first
  kuralı gereği önce deterministik ref eşleştirme denenir, model'e ancak belirsizlikte gidilir.
- **Kendini-iyileştiren seçici** = Tepegöz'ün Phase 6 `recipe-compiler` "self-healing
  selectors" + S9 "selector hints re-resolved against S2 identity refs" ile aynı hedef;
  AgentQL bunu model-çağrısıyla, Tepegöz deterministik yeniden-çözümle yapıyor.
- **Kopyalanmaz:** çekirdek servis. Tepegöz'ün bir AgentQL-API bağımlılığı ekleme gereği yok.

---

## Amazon Nova Act — HITL desen kataloğu + hata taksonomisi

**Ne yapıyor.** UI iş akışlarını tarayıcıda tamamlayan, gerektiğinde insana yükselen bir
ajan. Doğal dil + Python kodu karışımı ile iş akışı tanımlanıyor. AWS servisi olarak
"güvenilir ajan filoları" yönetiliyor.

**SDK'da açık ve Tepegöz için ilginç olanlar:**

1. **İki HITL deseni, isimlendirilmiş:**
   - **Human approval** — karar noktasında ekran görüntüsü + tarayıcı-tabanlı arayüzle
     insana ikili/çoklu seçim sorulur (Approve/Reject). Asenkron.
   - **UI takeover** — canlı-yayınlı arayüzle tarayıcının kontrolü gerçek zamanlı insana
     devredilir (operatör fare+klavye kullanır). **CAPTCHA çözümü bu desene yönlendiriliyor.**
   - SDK'da `HumanInputCallbacksBase` sınıfı: `approve()` ve `ui_takeover()` implemente
     edilip constructor'a veriliyor.
   - **Tepegöz karşılığı:** `extensions/ext-agent` Human Handoff Controller (CAPTCHA/2FA
     = kullanıcıya geri ver) + araç-başı HITL onayı. Nova Act'in ayrımı temiz: "approval"
     (asenkron, ekran-görüntülü, çoktan-seçmeli) vs "takeover" (senkron, tam kontrol
     devri). Tepegöz'ün iki-aşamalı HITL'i "approval" tarafını kapsıyor; **"UI takeover"
     bir referans** — CAPTCHA'da Tepegöz zaten kullanıcıya devrediyor ama "canlı-yayın +
     operatör kontrolü + sonra ajana geri dönüş" akışı S8 assistant-ux için bir desen.

2. **"Actuator lock" fikri.** Bir custom tool tarayıcıyı doğrudan sürmesi gerekiyorsa
   `requires_unlocked_actuator_context = True` ile işaretleniyor; ajanın iç kancaları
   geçici olarak askıya alınıyor, tool bitince otomatik yeniden kilitleniyor. **Tepegöz'e
   alaka:** `@tepegoz/human-input` / CDP driver'ın sürüş kontrolünü bir tool'a geçici
   devretmesi gerekirse (ör. bir MCP tool'u tarayıcıyı sürmek isterse) bu "kilitle/aç"
   deseni ToolGateway PEP seviyesinde temiz bir sınır olur.

3. **Hata taksonomisi (4 sınıf):** `ActAgentError` (görev imkânsız / model çıktısı
   yorumlanamadı / max-step aşıldı — kullanıcı farklı istekle retry edebilir),
   `ActExecutionError` (geçerli çıktıyı çalıştırırken yerel hata — actuation hatası /
   iptal), `ActClientError` (istek geçersiz — RAI guardrails bloğu / rate-limit),
   `ActServerError` (servis hatası). **Tepegöz karşılığı:** `@tepegoz/orchestrator` Reactor'ın
   `Decision` tipleri (continue/retry/replan/stop) + code-claude fold'undaki retry/recovery
   taksonomisi (policy denial / stale selector / page change / nav timeout / auth handoff /
   transient / malformed model output). Nova Act'in kırılımı "kim retry edebilir" eksenli;
   Tepegöz'ünki "ne yapılmalı" eksenli — ikisi bir arada faydalı bir çapraz-kontrol.

4. **Oturum kalıcılığı sağlayıcı soyutlaması:** `browser_auth` parametresi → Local file
   (`~/.nova-act/sessions/<profile>.json`, 0o600 izinli, cookie kaydet/yükle, localStorage
   opt-in) / S3 (SSE-KMS şifreli) / AgentCore / Chromium persistent profile. **Tepegöz'e
   alaka:** düşük — Tepegöz native tarayıcı, oturum zaten profilde; ama "localStorage
   geri-yükleme varsayılan KAPALI" kararı (fingerprint/tracking riski) Tepegöz'ün
   multi-profile track'iyle örtüşen bir hijyen detayı.

5. **`@tool` decorator + Strands MCP client:** Python fonksiyonu tool olarak işaretleniyor;
   MCP sunucularından da tool alınabiliyor. **Tepegöz karşılığı:** `@tepegoz/mcp-client`
   zaten dış MCP tool'larını tek PEP'ten geçiriyor — Nova Act'in modeli aynı, sadece
   Tepegöz'de her tool ayrıca deterministik PolicyKernel'den geçiyor.

6. **Paralel çalışma:** "bir NovaAct instance = bir tarayıcı"; birden fazla instance ile
   "internet için browser-use map-reduce". **Tepegöz karşılığı:** Phase 1b paralel DAG
   (henüz sevk edilmedi — aynı anda tek run).

**Kopyalanmaz:** Nova Act modeli + AWS servisi + RAI guardrails (sunucu-taraflı). Tepegöz'ün
guardrail'i zaten model-öncesi deterministik PolicyKernel (daha güçlü konum).

---

## OpenAI CUA sample — replay/artifact pipeline + `native` vs `code` mod

**Ne yapıyor.** GPT-5.4 `computer` tool'unu tarayıcı-odaklı iş akışlarında kullanmayı
gösteren bir **örnek uygulama** (ürün değil): Next.js operatör konsolu (run başlat,
ekran görüntüsü/olay/replay incele) + Fastify runner (workspace, tarayıcı oturumu, SSE,
replay bundle). Python sürümü bu dalda yok, ayrı `legacy` dalında.

**Tepegöz için ilginç desenler:**

1. **`native` vs `code` execution modu, aynı laboratuvara karşı.**
   - `native`: Responses API `computer` tool'u doğrudan — model click/drag/type/wait/
     screenshot ister.
   - `code`: kalıcı bir Playwright JS REPL (`exec_js`) — model ham aksiyon yerine tarayıcıyı
     **scriptler**.
   - **Tepegöz'e alaka:** Tepegöz `execute_js`'i bilerek reddetti (ADR-0026 izole-dünya
     ÇÜRÜTÜLDÜ, salt-okunur; ADR-0029 DevTools kullanıcı-only). Yani `code` modunu
     **almıyoruz** — ama "aynı senaryo manifesti + aynı doğrulama pipeline'ı, iki farklı
     yürütme yolu" fikri `@tepegoz/agent-eval` için değerli: aynı fixture'a karşı
     deterministik-script vs model-sürüşü koşup karşılaştırmak (Tepegöz'ün `agent-eval`
     "scripted tier" vs "live tier" ayrımı zaten buna yakın).

2. **Replay şeması ilk-sınıf.** `packages/replay-schema`: paylaşılan request/response/replay/
   error kontratları. Her run izole bir workspace'te; artifact'lar (ekran görüntüleri,
   olaylar) sunuluyor; konsol "runner offline ya da run başarısız olsa bile anlaşılır"
   olacak şekilde tasarlanmış. **Tepegöz karşılığı:** `@tepegoz/agent-runtime` run-lifecycle
   checkpoint'leri + `ext-agent` replay timeline (+ `@tepegoz/notary` Replay Receipt —
   **yazılmış ve testli ama `apps/desktop` onu import etmiyor; bugün hiçbir çalışma makbuz
   üretmiyor**). OpenAI
   sample'ın "artifact'lar runner çökse bile okunur" ilkesi, Tepegöz'ün "shown = recorded"
   (ADR-0004 event journal) ilkesiyle aynı.

3. **Senaryo manifesti + hedef-durum doğrulaması.** `kanban-reprioritize-sprint` (stateful
   drag-drop'u hedef panoya karşı doğrula), `paint-draw-poster` (canvas durumu doğrula),
   `booking-complete-reservation` (yerel onay kaydına karşı doğrula). **Tepegöz karşılığı:**
   `@tepegoz/agent-eval` `scorer.ts` ground-truth doğrulama + S4 `CompletionEvidence`.
   OpenAI'nin "prompt'tan türetilen hedef pano durumu" fikri, Tepegöz'ün trap-fixture'larına
   ek bir senaryo tipi olabilir.

**Kopyalanmaz:** `computer` tool + CUA modeli (Responses API).

---

## Anthropic Computer Use / Browser Use — "best practices" repo'su birebir referans

`.junk/anthropic-quickstarts` üç ilgili şey içeriyor:

1. **`computer-use-demo`** — Docker'da Linux masaüstü (X11 + VNC), `computer` toolset,
   streamlit UI. Minimal referans loop. "Bileşenler zayıf ayrık: ajan loop'u kontrol edilen
   container'ın içinde, tek oturum, oturumlar arası restart gerekir" — Tepegöz'ün
   "aynı anda tek run" durumuyla aynı sınır, ama Tepegöz bunu bilinçli mimari kararla
   (ADR-0013) yapıyor.

2. **`browser-use-demo`** — DOM-tabanlı (screenshot-koordinat değil) tarayıcı tool'u:
   element-referanslı hedefleme (`ref` parametresi), navigasyon, form set, metin çıkarımı,
   akıllı kaydırma, sayfa-içi arama+highlight, zoom-screenshot. README açıkça
   **"koordinat-tabanlı otomasyona üstünlükleri"** sayıyor: `ref` farklı ekran/layout'ta
   çalışır, koordinat pencere yeniden boyutlanınca kırılır; DOM manipülasyonu dinamik/gizli
   içerikte kesin. **Bu, Tepegöz'ün ADR-0008 (DOM/a11y-önce, vision fallback) + "Never:
   her-adım-screenshot vision" kararının Anthropic tarafından bağımsız doğrulanması.**
   AIPex karşılaştırmasındaki "DOM snapshot before vision" yakınsamasıyla üçüncü bir örnek.

3. **`computer-use-best-practices`** — Anthropic'in kendi "üretim-hazırlık" repo'su.
   Sıraladığı desenler **Tepegöz'ün S1/S2/S7'siyle birebir örtüşüyor**:
   - explicit tool definitions → Tepegöz `CanonToolDef` + `CapabilityRegistry`
   - **image sizing & pruning** → Tepegöz S10 token-bütçeli küçültme (**tasarlandı ama ATIL**:
     Reactor'ın `captureVision` geri-çağrısı opsiyonel ve üretimde onu geçen çağıran yok)
   - **prompt caching** → Tepegöz `@tepegoz/model-gateway` `cache-window.ts` (lag-2 breakpoint)
   - **server-side compaction** → Tepegöz Reactor working-state collapse + cache-window
   - **batched tool calls** → (Tepegöz'de Executor serileştirilmiş — bir fark)
   - **sandboxed shell** → Tepegöz'de YOK (bilerek — ADR-0026/0029)
   - **trajectory recording** → Tepegöz event journal + `agent-eval` harness (`@tepegoz/notary`
     bu katmanın kriptografik hâli olacak, ama henüz `apps/desktop`'a bağlanmadı)
   - **adaptive thinking + effort level** → Tepegöz `EffortLevel` (low..max) — birebir aynı kavram

   **Aksiyon:** bu repo'nun `docs/` ve `computer_use/` altını S7 (speed) çalışması
   başladığında referans olarak oku; image-pruning ve caching parametreleri için sayısal
   başlangıç noktası verir.

4. **Güvenlik uyarıları (README CAUTION bloğu):** Anthropic'in kendi listesi — ayrılmış
   VM/container, hassas veriye erişim verme, domain allowlist, "anlamlı gerçek-dünya
   sonucu olan kararlarda insan onayı (çerez kabul, finansal işlem, ToS)". **Tepegöz'ün
   PolicyKernel'i bunların çoğunu deterministik olarak zaten yapıyor** (danger-class,
   sensitive-site lockout, biyometrik finansal kapı); Anthropic bunları "kullanıcıya öneri"
   olarak sıralıyor çünkü computer-use bir API özelliği, bir politika çekirdeği değil.
   Fark, tam da Tepegöz'ün tezini özetliyor: **öneri vs kernel-zorlaması.**

---

## Tepegöz'e somut çıkarımlar (öncelik sırasıyla)

1. **`anthropic-quickstarts/computer-use-best-practices`'i S7 başlarken oku** — image
   pruning / prompt caching / compaction için sayısal referans. (Alaka: en yüksek.)
2. **Nova Act'in HITL desen ayrımını (`approval` vs `takeover`) S8'e not düş** — CAPTCHA/
   hassas akışlarda "canlı devir + geri dönüş" bir UX deseni; Tepegöz'ün handoff'u bugün
   sadece "dur + kullanıcıya bırak".
3. **Nova Act + Tepegöz hata taksonomilerini çapraz-kontrol et** — "kim retry edebilir"
   ekseni Reactor'ın `Decision` gerekçelerine bir alt-etiket olabilir.
4. **OpenAI CUA'nın "aynı senaryo, iki yürütme yolu, tek doğrulama pipeline'ı" fikrini
   `agent-eval`'e not düş** — scripted vs live karşılaştırması zaten var, "hedef-durum
   prompt'tan türetilir" senaryo tipi eklenebilir.
5. **AgentQL'in "prompt ile element bul" katmanı** — yalnızca S2 ref-çözümü pratikte
   sürtünürse; determinism-first gereği ikincil.

**Hiçbiri bir bağımlılık ya da bir "port" gerektirmez.** Model API'leri kapalı; iskelet
desenleri zaten Tepegöz'ün mevcut paketlerinde karşılığı olan şeyler — bu belge o
eşleşmeleri kayıt altına alıyor.
