# Tepegöz Özellik Ayrımı P3: Ürünleşme, Operasyon ve Trust Readiness

## Yönetici Özeti

Bu doküman, `tarayici-ai-eklenti-ozellik-ayrimi.md` ve
`tarayici-ai-eklenti-ozellik-ayrimi-p2.md` dosyalarının devamıdır. P1/P2 özellikleri Tepegöz'ü
rakip AI browser'lardan ayıracak ürün kabiliyetlerini tarif ederken, P3 odağı bu kabiliyetleri gerçek
kullanıcıya ve kuruma güvenle dağıtmak, işletmek, ölçmek ve bozulduğunda onarmaktır.

Phases 0-12 büyük ürün vizyonunu büyük ölçüde kapsıyor: agentic core, deterministic automation,
verifiable accountability, local-first intelligence, safe autonomy, regional trust pack ve marketplace.
Bunlar bittikten sonra eksik kalacak ana alan yeni bir "havalı AI düğmesi" değil; release güvenliği,
uyumluluk laboratuvarı, eval/red-team sistemi, health diagnostics, performans bütçeleri, yedekleme,
fleet yönetimi ve kullanıcı eğitimi gibi ürünleşme katmanlarıdır.

Tepegöz'ün uzun vadeli farkı, sadece agent'ın daha çok şey yapması değil; yaptığı şeylerin test
edilebilir, desteklenebilir, kanıtlanabilir, geri alınabilir ve güvenli şekilde güncellenebilir olmasıdır.

## Sınıflandırma Kuralı

- **Ürünleşme:** Kullanıcıya dağıtım, onboarding, destek, teşhis, release ve bakım kalitesini artıran
  yetenekler.
- **Operasyon:** Sürekli test, güvenlik müdahalesi, CVE takibi, crash/health sinyali, rollback ve
  incident response gibi işletim süreçleri.
- **Platform:** Developer ecosystem, standartlaşma, SDK, compatibility lab ve marketplace güvenilirliği.
- **Enterprise:** Kurumsal dağıtım, policy, audit, fleet management, SIEM ve compliance ihtiyaçları.
- **Core:** Enforcement, update, telemetry, backup, profile, diagnostics veya security owner olduğu için
  çekirdekte kalması gereken yetenek.
- **Dahili araç/eklenti:** Tepegöz ile gelen first-party operasyon, admin, geliştirici veya kullanıcı
  yüzeyi.

## Açıklamalı İhtiyaç Tablosu

| Alan                                      | Açıklama                                                                                                                                           | Sınıf      | Paketleme                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------- |
| Release & Security Ops Phase              | Kod imzalama, auto-update güvenliği, Chromium/Electron CVE SLA, rollback, release checklist, bug bounty ve incident response süreçlerini kapsar.   | Operasyon  | Core + release pipeline               |
| Compatibility Lab                         | Banka, kamu, e-ticaret, video/DRM, PWA, service worker, popup, login, CAPTCHA ve extension uyumluluğunu sürekli test eder.                         | Platform   | Dahili test lab + CI                  |
| Eval & Red-Team Center                    | Prompt injection ASR, task completion, recipe breakage, model-router maliyet/başarı ve regression fixture zoo metriklerini toplar.                 | Operasyon  | Core eval harness + dahili dashboard  |
| Tepegöz Doctor / Health Panel             | Model key, MCP, safeStorage, DB, GPU/local model, policy block, izin, extension, network, update ve profil bozulmasını tek panelde teşhis eder.    | Ürünleşme  | Dahili UI + core diagnostics          |
| Performance & Resource Budgets            | Cold start, RAM/tab, agent latency, token cost, disk/journal büyümesi, battery ve background task limitleri için ölçülebilir bütçeler koyar.       | Operasyon  | Core metrics + CI gates               |
| Backup / Disaster Recovery                | Encrypted local backup, profile repair, corrupted SQLite recovery, journal compaction, recipe rollback ve son sağlam noktaya dönüş sağlar.         | Ürünleşme  | Core + dahili recovery UI             |
| Admin & Fleet Management                  | Org policy rollout, policy drift detection, SIEM schema, audit retention, role templates, managed extension allowlist ve offline installer sağlar. | Enterprise | Core admin plane + dahili admin UI    |
| User Education / Trust Onboarding         | Kullanıcıya agent'ın neyi görebileceğini, neyi yapamayacağını, neden onay istediğini ve güven modelini canlı sandbox ile öğretir.                  | Ürünleşme  | Dahili onboarding/tour                |
| Developer Relations / Web Standardization | Site Agent Manifest, recipe SDK, WebMCP fast-path, örnek adaptörler, test harness ve public recipe health index üretir.                            | Platform   | SDK/docs + marketplace                |
| Support Bundle Export                     | Kullanıcı izin verirse log, config, health, version, policy ve crash özetlerini redakte edilmiş destek paketine çevirir.                           | Ürünleşme  | Core redaction + dahili support UI    |
| Migration & Import Center                 | Chrome/Edge/Firefox/Brave'den bookmark, history, password, profile, extensions ve workspace aktarımını güvenli wizard ile yapar.                   | Ürünleşme  | Core importers + dahili onboarding UI |
| Privacy-Preserving Product Telemetry      | Varsayılan kapalı veya açık rızalı, yerel özetli, PII'siz ürün metrikleri toplar; neyin gönderildiğini kullanıcıya gösterir.                       | Operasyon  | Core telemetry policy + settings UI   |
| Documentation Quality Gate                | Her özellik için kullanıcı dokümanı, admin dokümanı, threat note, troubleshooting ve known-limitations yazılmadan phase kapanmasını engeller.      | Operasyon  | CI/checklist                          |
| Long-Term Maintenance Index               | Her phase/feature için bakım sahibi, test kapsamı, risk seviyesi, dependency freshness ve kırılma geçmişi puanı tutar.                             | Operasyon  | Dahili maintainer dashboard           |
| Legal & Compliance Readiness              | KVKK/GDPR, EU AI Act, telemetry consent, export controls, marketplace ToS, liability ve model-provider data terms için canlı checklist üretir.     | Enterprise | Core compliance data + dahili UI      |
| Offline Installer & Recovery Media        | Kurumsal/air-gapped ortamlarda kurulabilir offline paket, model bundle, policy bundle ve recovery image üretir.                                    | Enterprise | Release pipeline + admin tooling      |
| Abuse & Marketplace Moderation            | Marketplace recipe/adapter kötüye kullanımını, sahte publisher'ı, scope mismatch'i ve zararlı automation paketlerini yönetir.                      | Platform   | Marketplace ops + SupplyChainGate     |
| Public Trust Status Page                  | Chromium patch seviyesi, prompt-injection ASR, marketplace signing durumu, incident geçmişi ve servis kesintilerini şeffaf yayımlar.               | Ürünleşme  | Web/status + release metadata         |

## Çekirdekte Kalması Gerekenler

Bu P3 alanlarında UI eklenti veya dashboard olabilir; fakat aşağıdaki kontroller çekirdekten
ayrılmamalıdır:

- Auto-update doğrulaması, code-signing kontrolü, anti-rollback, CVE patch seviyesi ve release channel
  enforcement.
- Diagnostics verisinin redaction kuralları, support bundle üretimi, privacy-preserving telemetry
  policy'si ve kullanıcı rızası.
- Backup, restore, profile repair, SQLite recovery, journal compaction ve encrypted export/import.
- Performance budget ölçümü, crash metadata, resource accounting ve background task limit enforcement.
- Admin policy, managed extension allowlist, SIEM/audit export, org policy pinning ve fleet kill-switch.
- Marketplace signing, SBOM/provenance doğrulaması, scope review, quarantine tier ve abuse moderation
  kararları.

## Eklenti veya Dahili Araç Olarak Paketlenebilecekler

First-party dahili araç adayları:

- **Tepegöz Doctor:** Settings veya ayrı `tepegoz://doctor` sayfası olarak sunulabilir.
- **Eval & Red-Team Center:** Geliştirici/maintainer odaklı dahili dashboard olabilir; core eval harness
  ile beslenir.
- **Compatibility Lab UI:** CI çıktıları ve site uyumluluk matrisini gösteren dahili geliştirici aracı
  olabilir.
- **Recovery Center:** Backup, restore, profile repair ve journal maintenance için kullanıcı dostu
  dahili yüzey olabilir.
- **Trust Onboarding:** İlk açılış wizard'ı ve `Güven Turu` gibi sandbox demo yüzeyi olarak
  paketlenebilir.
- **Admin Console:** Kurumsal sürümde org policy, fleet, audit export ve allowlist yönetimi için ayrı
  dahili yüzey olabilir.

Marketplace veya public platform adayları:

- **Developer Relations / Web Standardization:** SDK, example recipes, manifest docs ve recipe health
  index public dokümantasyon/portal olarak yaşamalıdır.
- **Public Trust Status Page:** Build, patch, marketplace ve red-team durumunu kullanıcıya açık web
  sayfasında yayımlayabilir.
- **Abuse & Marketplace Moderation:** Marketplace operasyonu olarak çalışır, fakat enforcement
  SupplyChainGate ve Policy Kernel üzerinden core'da kalır.

## Öncelik Önerisi

P3 için en doğru sıralama:

1. **Release & Security Ops + Known Issues closure:** Code signing, prod CSP, coverage gates, update
   güvenliği ve Chromium/Electron patch SLA dağıtıma çıkmadan önce kapanmalı.
2. **Tepegöz Doctor + Support Bundle Export:** Kullanıcı ve geliştirici "neden çalışmıyor?" sorusuna
   tek yerden cevap almalı.
3. **Eval & Red-Team Center + Compatibility Lab:** Güvenli agent iddiası ölçülebilir hale gelmeli;
   site uyumluluğu sürekli regression testine bağlanmalı.
4. **Performance & Resource Budgets:** Extreme özellikler tarayıcıyı ağırlaştırmadan önce bütçe ve gate
   konmalı.
5. **Backup / Disaster Recovery + Migration Center:** Kullanıcı veri kaybetmeden geçebilmeli,
   bozulduğunda tamir edebilmeli.
6. **Admin & Fleet Management + Legal/Compliance Readiness:** Kurumsal ve regüle pazar için policy,
   audit, SIEM ve compliance yüzeyleri tamamlanmalı.
7. **Developer Relations / Web Standardization:** Tepegöz ekosistemi büyüyecekse recipe, manifest,
   SDK ve marketplace kalite standardı erken anlatılmalı.

P3, Tepegöz'e yeni bir ana ürün vaadi eklemekten çok şu soruyu cevaplar: "Bu kadar güçlü bir agentic
browser gerçek dünyada güvenle dağıtılıp, yıllarca bakımı yapılabilir mi?" Cevap evet olacaksa bu
katman şarttır.
