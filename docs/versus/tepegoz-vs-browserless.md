# Tepegöz vs Browserless — AI/ajan fonksiyonları karşılaştırması

> **Ne bu?** Tepegöz'ün AI/ajan katmanı ile **Browserless** (v2.56, Docker'da headless
> tarayıcı çalıştıran altyapı; kendi bulutu ya da self-host) arasında bir karşılaştırma.
>
> **Yöntem.** `.junk/browserless` deposunun (`README.md`, `LICENSE`, `src/` — `router.ts`,
> `limiter.ts`, `token.ts`, `network-security.ts`, `webhooks.ts`, `monitoring.ts`,
> `src/routes/{chrome,chromium,edge,firefox,webkit,management}`) ve bu reponun AI yüzeyinin
> (`packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|
browser-tools`, `apps/desktop/src/main/agent/cdp-driver*`, `extensions/ext-agent`,
> `docs/adr/*`) aynı oturumda okunmasından çıkarıldı.
>
> **Tarih.** 2026-09-01. **Dil notu.** Türkçe tutuluyor (proje eserleri İngilizce-önce;
> bu yazıldığı haliyle korunan bir kayıt).
>
> **Kategori uyarısı.** Bunlar **farklı ürünler.** Browserless bir _tarayıcı-altyapısı_
> (Browser-as-a-Service): Puppeteer/Playwright script'lerinin bağlandığı, Docker'da koşan,
> kuyruklu-eşzamanlı headless tarayıcı havuzu. Model yok, planlayıcı yok, politika çekirdeği
> yok — ajan zekâsı **onu kullanan** script'in içinde. Tepegöz bir _güvenlik-önce native
> tarayıcı + ajan._ Örtüşme yalnızca "tarayıcıyı programatik sürme altyapısı" ekseninde.
>
> **Lisans notu.** Browserless **SSPL-1.0 VEYA ticari lisans** ile dağıtılıyor. SSPL
> OSI-onaylı açık kaynak değil ("source-available"); kapalı-kaynak ticari kullanım ya da
> CI ortamı için **ücretli ticari lisans** gerekir. Bu yüzden "b) açık kaynak ama
> otomatik indirmedim" listesinde kalıyordu; incelemek için indirildi.

---

## Önce çerçeve: bunlar farklı ürünler

|             | Browserless                                                                                   | Tepegöz                                                       |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Ne          | Docker'da headless tarayıcı havuzu (BaaS); `ws://`/CDP üstünden Puppeteer/Playwright bağlanır | Tam Electron tarayıcı + "Do modu" ajan                        |
| Birincil iş | _Script'e_ güvenilir, ölçeklenen, izlenen bir tarayıcı **sağlamak**                           | _Kullanıcıya_ güvenle otonom görev yürüten bir ajan **olmak** |
| Zekâ nerede | Yok — Browserless'ı çağıran kodda                                                             | Planner→Executor→Reactor + `@tepegoz/model-gateway`           |
| Olgunluk    | Yayında, ~10 yıl, yaygın Docker kullanımı, trendshift #4378                                   | 1.0 öncesi; AI fazları hepsi 🟠 measurement-owed              |
| Lisans      | SSPL-1.0 / ticari (dual)                                                                      | (repo iç)                                                     |
| Dağıtım     | Docker imajı / bulut                                                                          | Native masaüstü uygulaması                                    |

Karşılaştırma: Browserless'ın _açık çekirdeği_ (kuyruk, oturum, CDP proxy, ağ güvenliği,
webhook, izleme) vs Tepegöz'ün _tarayıcı sürüş + ajan_ katmanı. "Kim daha iyi ajan" sorusu
Browserless için anlamsız (ajan değil); soru "Tepegöz'ün altyapı katmanı Browserless'ın
çözdüğü problemleri nasıl çözüyor / neyi öğrenebilir".

---

## Derinlemesine: iş iş kim ne yapıyor

### Ne için var — temel ayrım

Browserless: _"script'ime bir tarayıcı ver, ölçekle, çökerse ayakta kal."_ Kendi
sözleriyle: parallelism + queueing (yapılandırılabilir eşzamanlılık), "Chrome çökerse
Browserless çökmez", debug viewer, yapılandırılabilir timeout'lar, çatallanmamış
Puppeteer/Playwright ile çalışır. Tepegöz: _"kullanıcının yerine görevi yap, ama önce
politika çekirdeğinden geçir, kanıtla, denetlenebilir bırak."_ İki ürün birbirinin
alternatifi değil — Browserless bir agent framework'ünün (browser-use, Stagehand)
**altına** kurulur; Tepegöz kendi tarayıcısını kendi out-of-process CDP driver'ıyla
(`apps/desktop/src/main/agent/cdp-driver*`) sürer, harici bir tarayıcı havuzuna ihtiyaç
duymaz.

### Tarayıcı sürüş altyapısı

Browserless: `ws://localhost:3000` — Puppeteer `puppeteer.connect()` ya da Playwright
`pw.firefox.connect()` doğrudan bağlanır; browser başına ayrı Docker imajı
(chrome/chromium/edge/firefox/webkit/multi), ARM64 desteği. CDP proxy'si + oturum
yönetimi + `limiter.ts` ile kuyruk. Tepegöz: `@tepegoz/browser-tools` `BrowserHost` seam

- desktop `cdp-driver` (session/dom/input/network/snapshot/dialogs modülleri) — kendi
  `WebContentsView`'larını out-of-process CDP ile sürüyor, `@tepegoz/human-input`
  (Catmull-Rom fare eğrileri + Gaussian jitter) ile insan-benzeri hareket. **Browserless'ın
  kazandığı:** çoklu-tarayıcı-motoru (webkit/firefox), Docker'da yatay ölçek, olgun kuyruk.
  **Tepegöz'ün farkı:** tek motor (Chromium/Electron) ama sürüş ajan-döngüsüyle bütünleşik
  ve her aksiyon ToolGateway PEP'ten geçiyor.

### Eşzamanlılık & kuyruk

Browserless: `limiter.ts` — yapılandırılabilir eşzamanlılık limiti, kuyruk, kuyruk-dolu
reddi, webhook ile kuyruk-uyarısı/red/timeout/health-failure bildirimi. Bu, "ajan
filoları" ölçeğinin çözülmüş hali. Tepegöz: **aynı anda tek run** (ADR-0013), Phase 1b
paralel DAG henüz sevk edilmedi; `@tepegoz/agent-run-lock` var. **Browserless burada net
önde** — ama farklı problem: Browserless N bağımsız script'i sıraya koyuyor, Tepegöz tek
kullanıcının tek görevini güvenle yürütüyor. Yine de Phase 1b paralel-DAG çalışması
başladığında `limiter.ts`'in kuyruk/geri-basınç/webhook deseni **referans**.

### Güvenlik / izin modeli

Browserless: `token.ts` (API token auth), `network-security.ts` (muhtemelen SSRF/özel-IP
kısıtı), timeout'lar, `NODE_ENV` sertleştirmesi. Bu bir _altyapı_ güvenliği — "kim bu
tarayıcıyı çağırabilir, nereye gidebilir". **Model-öncesi politika çekirdeği, danger-class,
taint, HITL — yok** (olması da beklenmez; script'in işi). Tepegöz: model-ÖNCESİ
deterministik `PolicyKernel` (ADR-0006, danger-class + taint + site → allow/deny/ask +
biyometrik), `isSensitiveSite` sert-deny, `EgressFirewall` (Shannon entropi sızıntı
denetimi), iki-aşamalı HITL, `@tepegoz/tool-executor` enjeksiyon-vektörü temizliği.
**Kıyas kabul etmez farklı katman** — Browserless'ın çözdüğü "altyapıya kimse kötüye
kullanmasın", Tepegöz'ünki "ajan kullanıcının otoritesiyle kandırılmasın".

### Stealth / anti-tespit / CAPTCHA

Browserless: **premium (kapalı)** — BrowserQL (BQL) ile detector-atlatma + CAPTCHA çözme,
fingerprint randomizasyonu, residential proxy rotasyonu, Chrome-extension yükleme
(reklam-engelleyici, captcha-çözücü). Açık çekirdekte bunlar yok. Tepegöz: `@tepegoz/
human-input` insan-benzeri _hareket profili_ (isTrusted olayları zaten CDP'den geliyor);
CAPTCHA'yı **bilerek çözmüyor** — ADR-0039 Human Handoff (kullanıcıya geri ver).
Fingerprint-randomizasyon Phase 2'de (frozen). **Browserless'ın premium'u burada daha
zengin**, ama Tepegöz'ün duruşu farklı bir tez (çözme değil, devret).

### "LLM-hazır veri" API'leri

Browserless premium: `/smart-scrape` (kademeli strateji: HTTP fetch → proxy → headless →
captcha), `/crawl` (tüm siteyi asenkron gezip her sayfayı yapılandırılmış LLM-hazır veriye
çevir), `/map` (sitemap + link çıkarımı + arama-tabanlı alaka sıralaması), `/search`
(web'de ara + her sonucu markdown/HTML/link/screenshot'a çevir). Bunlar Firecrawl/Crawl4AI
ile aynı kategori. **Hepsi kapalı (premium).** Tepegöz: `@tepegoz/web-tools` (`web_search`,
`web_get_page` salt-okunur, içerik guard, SSRF-güvenli sitemap reader) + `@tepegoz/reader`
(makale çıkarımı, HTML'siz tipli bloklar). Tepegöz'ün web-tools'u daha dar ama **açık ve
tek PEP'ten geçiyor**; Browserless'ın `/map` "arama-tabanlı alaka sıralaması" fikri
`web-tools` sitemap reader için bir zenginleştirme adayı (ama premium tarafta, kod yok).

### MCP

Browserless: **premium** MCP sunucusu — Claude Desktop / Cursor / VS Code / Windsurf
doğrudan Browserless otomasyonuna bağlanır (AIPex'in `mcp-bridge`'i gibi, ama bulut/self-host
altyapıya). Tepegöz: MCP **istemcisi** (ADR-0018) — dış MCP tool'ları CapabilityRegistry'ye
girip aynı PEP'ten geçer; MCP **sunucu** yüzeyi Phase 1b'de planlı, yapılmamış. Yön farkı
AIPex karşılaştırmasıyla aynı.

### Session replay / kalıcılık

Browserless: **premium** — session replay (olay yakalama + video oynatma), persistent
sessions (cookie/cache/localStorage, 90 güne kadar tutma). Tepegöz: `@tepegoz/agent-runtime`
run-lifecycle checkpoint'leri (yazılıyor, resume henüz sevk edilmedi) + `ext-agent` replay
timeline + ADR-0004 event journal. `@tepegoz/notary`'nin taşınabilir **Replay Receipt**'i
(hash-zinciri + Ed25519 imza + bağımsız `tepegoz-verify` CLI) **yazılmış ve testli, ama
`apps/desktop` içinde onu import eden hiçbir yer yok** (ADR-0030 kendisi kabul ediyor) —
bugün hiçbir koşu makbuz üretmiyor. Yani **Tepegöz'ün replay'i kriptografik ve
doğrulanabilir olmak üzere tasarlandı, henüz öyle değil**; bugün elde olan da bir olay
kaydı. Browserless'ınki debug/QA amaçlı video.

### İzleme / operasyon

Browserless: `monitoring.ts` + `metrics.ts` + `webhooks.ts` — health-check, çökme
toleransı, kuyruk metrikleri, webhook bildirimleri. Olgun bir "prod'da koşan altyapı"
paketi. Tepegöz: `TokenLedger` (maliyet/kota), `ext-agent` token göstergesi + %80 uyarısı,
event journal, diagnostic bundle export. Farklı odak: Browserless _filo sağlığı_, Tepegöz
_run maliyeti + denetim_.

### Türkçe / bölgesel

Browserless: yok (altyapı ürünü, UI minimal). Tepegöz: parity-zorunlu EN+TR i18n
(ADR-0016), TR-web benchmark şartı, Phase 11 kamu.

---

## Örtüşmeyen alanlar

**Yalnızca Browserless:** çoklu-tarayıcı-motoru (webkit/firefox/edge), Docker yatay ölçek,
olgun kuyruk/eşzamanlılık limiter'ı, `/function` `/pdf` `/screenshot` `/content` REST,
premium: BQL, residential proxy, `/crawl` `/map` `/search` `/smart-scrape`, admin UI,
Chrome-extension yükleme.

**Yalnızca Tepegöz:** model-öncesi PolicyKernel, EgressFirewall, iki-aşamalı HITL, taint
provenance, Notary kriptografik replay-receipt (paket yazılı ve testli, uygulamaya
bağlanmamış — bugün makbuz üretmiyor), `CompletionEvidence` yalan-başarı savunması,
model-free deterministik şerit (macro-engine + recipe-compiler), biyometrik kapılar,
`@tepegoz/local-inference` yerel model, kademeli otonomi, Türkçe/kamu, tam bir tarayıcı
(sekme/pencere/uzantı/indirme/çeviri).

---

## Ayrıntılı tablo — kim hangi işi daha iyi yapıyor

| #   | Boyut                                  | Browserless                                                        | Tepegöz                                                                                                                                                                                 | Kim daha iyi + neden                                                                                                                                                  |
| --- | -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ürün kategorisi**                    | Tarayıcı-altyapısı (BaaS), script'in altına kurulur                | Tam tarayıcı + ajan, kullanıcının önünde                                                                                                                                                | Farklı — kıyaslanamaz; Browserless bir agent framework'ün altına, Tepegöz uçtan uca                                                                                   |
| 2   | **Lisans / açıklık**                   | SSPL-1.0 / ticari (dual) — OSI-açık değil, ticari kullanım ücretli | (repo iç)                                                                                                                                                                               | Nötr — Browserless "source-available", tam açık değil                                                                                                                 |
| 3   | **Çoklu tarayıcı motoru**              | chrome/chromium/edge/firefox/webkit                                | Tek (Chromium/Electron)                                                                                                                                                                 | **Browserless** — cross-engine test/otomasyon                                                                                                                         |
| 4   | **Yatay ölçek / eşzamanlılık**         | Docker + `limiter.ts` kuyruk + webhook geri-basınç                 | Aynı anda tek run (ADR-0013); paralel DAG frozen                                                                                                                                        | **Browserless** — çözülmüş problem; Tepegöz için Phase 1b referansı                                                                                                   |
| 5   | **Tarayıcı sürüş yolu**                | `ws://` CDP proxy, çatallanmamış Puppeteer/Playwright              | Out-of-process CDP driver, ajan-döngüsüne gömülü, `@tepegoz/human-input`                                                                                                                | Farklı amaç; Tepegöz'ünki ajan-bütünleşik + her aksiyon PEP'ten                                                                                                       |
| 6   | **İzin / güvenlik modeli**             | Token auth + ağ güvenliği (altyapı seviyesi)                       | Model-öncesi PolicyKernel + taint + HITL + EgressFirewall + biyometrik                                                                                                                  | **Tepegöz** — farklı katman; Browserless'ta ajan-güvenliği kavramı yok (olması beklenmez)                                                                             |
| 7   | **Stealth / anti-tespit**              | Premium: BQL, fingerprint rastgeleleme, residential proxy          | `human-input` hareket profili; fingerprint Phase 2 (frozen)                                                                                                                             | **Browserless** (premium) daha zengin; Tepegöz'ün duruşu dar ama açık                                                                                                 |
| 8   | **CAPTCHA**                            | Premium: BQL ile çözer                                             | Bilerek çözmez — Human Handoff (ADR-0039)                                                                                                                                               | Farklı tez — Browserless çözer, Tepegöz devreder                                                                                                                      |
| 9   | **Crawl / map / search / scrape**      | Premium: `/crawl` `/map` `/search` `/smart-scrape` (LLM-hazır)     | `web-tools` (`web_search`/`web_get_page`) + `reader`, dar ama açık + PEP'ten                                                                                                            | **Browserless** kapsamda önde ama kapalı; Tepegöz'ünki denetlenebilir                                                                                                 |
| 10  | **MCP**                                | Premium MCP **sunucusu** (dış ajanlar Browserless'ı sürer)         | MCP **istemcisi** (ADR-0018), tek PEP; sunucu yok                                                                                                                                       | Farklı yön; ikisi de meşru                                                                                                                                            |
| 11  | **Session replay**                     | Premium: olay + video oynatma                                      | Bugün: `ext-agent` replay timeline + event journal. Notary kriptografik Replay Receipt + `tepegoz-verify` CLI **yazılı ama uygulamaya bağlanmamış** — bugün makbuz üretmiyor (ADR-0030) | **Tasarımda Tepegöz** (doğrulanabilir/hesap-verebilir bir replay hedefi; Browserless'ınki debug amaçlı); **bugün** Tepegöz'ünki de bir olay kaydı, kriptografik değil |
| 12  | **Oturum kalıcılığı**                  | Premium: cookie/cache/localStorage 90 güne kadar                   | Native profil (zaten kalıcı) + run checkpoint (resume sevk edilmedi)                                                                                                                    | Nötr — Tepegöz'de doğal, Browserless'ta ücretli özellik                                                                                                               |
| 13  | **Operasyon / izleme**                 | `monitoring`/`metrics`/`webhooks` — olgun filo-sağlığı             | `TokenLedger` + kota uyarısı + diagnostic bundle                                                                                                                                        | **Browserless** filo-operasyonunda; Tepegöz run-maliyeti + denetimde                                                                                                  |
| 14  | **Model / planlama / reasoning**       | Yok (script'in işi)                                                | Planner→Executor→Reactor + ModelRouter + effort seviyeleri                                                                                                                              | **Tepegöz** — Browserless'ta bu kavram yok                                                                                                                            |
| 15  | **Doğrulanmış sonuç / yalan-başarı**   | Yok                                                                | `CompletionEvidence` + deterministik düşürme + kanıt rozetleri                                                                                                                          | **Tepegöz** — Browserless'ın kapsamı değil                                                                                                                            |
| 16  | **Model-free deterministik otomasyon** | Puppeteer/Playwright script (kullanıcı yazar)                      | `macro-engine` (iMacros halefi) + `recipe-compiler` (imzalı, oracle'lı)                                                                                                                 | Farklı — Browserless raw script çalıştırır, Tepegöz imzalı tarif                                                                                                      |
| 17  | **Yerel / çevrimdışı**                 | Self-host Docker (ama model yok)                                   | `@tepegoz/local-inference` (node-llama-cpp) + model kataloğu                                                                                                                            | **Tepegöz** — yerel zekâ; Browserless yalnız yerel tarayıcı                                                                                                           |
| 18  | **Türkçe / bölgesel**                  | Yok                                                                | Parity-zorunlu EN+TR, TR-web benchmark, Phase 11 kamu                                                                                                                                   | **Tepegöz**                                                                                                                                                           |
| 19  | **Olgunluk / "bugün çalışıyor"**       | Evet — yaygın, yıllardır prod'da                                   | Kısmen — AI fazları 🟠, tek run, 8 sağlayıcı bazıları stub                                                                                                                              | **Browserless** kendi kategorisinde                                                                                                                                   |
| 20  | **Tam tarayıcı deneyimi**              | Yok (headless)                                                     | Sekme/pencere/uzantı/indirme/çeviri/adres çubuğu — hepsi var                                                                                                                            | **Tepegöz** — Browserless bir tarayıcı değil                                                                                                                          |

---

## Sonuç

Bunlar rakip değil, **komşu katmanlar.** Browserless, browser-use / Stagehand / Skyvern
gibi _agent framework'lerinin altına_ kurulan, headless tarayıcıyı ölçeklenebilir bir
servise çeviren, kendi kategorisinde olgun ve yaygın bir altyapı. Tepegöz kendi
tarayıcısını kendi out-of-process CDP driver'ıyla sürdüğü için böyle bir servise ihtiyaç
duymuyor; onun bahsi "altyapı sağlamak" değil, "güvenle otonom olmak".

**Browserless'ın açık çekirdeğinden Tepegöz'ün öğrenebileceği tek somut şey:** `limiter.ts`

- `webhooks.ts` deseni — kuyruk, yapılandırılabilir eşzamanlılık, geri-basınç, kuyruk-dolu
  reddi, health/timeout webhook'ları. Phase 1b paralel-DAG çalışması başladığında bu bir
  referans (Browserless N bağımsız işi sıralıyor; Tepegöz tek kullanıcının paralel
  dallarını sıralayacak — problem farklı ama mekanik benzer).

**Öğrenilemeyen / alınmayan:** BQL, residential proxy, CAPTCHA çözme, `/crawl` `/map`
`/search` — hepsi premium (kapalı kaynak) ve Tepegöz'ün tezine (CAPTCHA devret, egress
denetle, her şey tek PEP'ten) zaten aykırı ya da `@tepegoz/web-tools`'un dar-ama-açık
kapsamıyla bilinçli olarak sınırlı.

Tek cümle: script'lerine ölçeklenen bir tarayıcı havuzu lazımsa Browserless; kullanıcı
adına güvenle iş yapan, ne yaptığını kanıtlayan bir ajan istiyorsan Tepegöz — ve Tepegöz'ün
altyapı katmanı Browserless'a muhtaç değil, sadece kuyruk deseninde ondan bir sayfa
alabilir.
