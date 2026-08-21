# Tepegöz Özellik Ayrımı: Tarayıcı, AI ve Eklenti Haritası

## Yönetici Özeti

Bu doküman, Tepegöz için önerilen "extreme browser" yeteneklerini üç ana eksende ayırır:
tarayıcı çekirdeği, AI yetenekleri ve hibrit ürün yüzeyleri. Amaç, hangi fikrin güvenlik ve yürütme
yetkisi nedeniyle çekirdekte kalması gerektiğini, hangisinin AI tabanlı bir deneyim olduğunu ve
hangisinin dahili ya da marketplace eklentisi olarak paketlenebileceğini netleştirmektir.

Tepegöz'ün temel ürün çizgisi şu olmalıdır: AI hedefi anlar, planlar, özetler ve önerir; tarayıcı
çekirdeği izinleri uygular, işlemleri yürütür, sınırları korur, kanıt üretir ve geri alma/denetim
kabiliyetini sağlar. Bu ayrım özellikle agentic browser güvenliği için kritiktir; eklentiler ve AI
modelleri hiçbir zaman policy enforcement, credential, sandbox veya onay mekanizmasının sahibi
olmamalıdır.

## Sınıflandırma Kuralı

- **Tarayıcı:** Sekme, profil, izin, güvenlik, izolasyon, indirme, dosya erişimi, kayıt, yürütme,
  geri alma ve kanıt üretme gibi AI kapalıyken de çalışması gereken yetenekler.
- **AI:** Anlama, planlama, özetleme, sınıflandırma, üretme, önerme, görsel/semantik arama ve
  kişiselleştirilmiş çıkarım gerektiren yetenekler.
- **Hibrit:** AI bir öneri, yorum veya plan üretir; tarayıcı çekirdeği ise bunu policy, HITL,
  sandbox, journal ve izin kontrolleri altında uygular.
- **AI altyapısı:** Kullanıcıya doğrudan tek bir özellik gibi görünmeyen; model seçimi, Türkçe motor,
  yerel çıkarım veya routing gibi birçok özelliği besleyen temel AI platform yetenekleri.
- **Core:** Enforcement veya platform temeli olduğu için tarayıcı çekirdeğinde kalması gereken bölüm.
- **Dahili eklenti:** Tepegöz ile gelen first-party extension; core yetkileri kullanır ama enforcement
  sahibi değildir.
- **Marketplace/ekip eklentisi:** Kullanıcı, ekip veya üçüncü tarafça kurulabilen; imza, scope review
  ve policy gate arkasında çalışan paket.

## Açıklamalı Özellik Tablosu

| Özellik                         | Açıklama                                                                                                       | Sınıf        | Paketleme                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| Project Capsules                | Bir proje için sekmeleri, notları, dosyaları, görevleri, izinleri ve hafızayı tek çalışma alanında toplar.     | Tarayıcı     | Core                                |
| Disposable Browsing Rooms       | Şüpheli linkleri izole, tek kullanımlık çerez/depolama alanında açar.                                          | Tarayıcı     | Core                                |
| Persona Profiles                | İş, kişisel, test veya müşteri gibi ayrı çerez/geçmiş/izin/hafıza profilleri sunar.                            | Tarayıcı     | Core                                |
| Autopilot Profilleri            | Güvenli, asistan, otomasyon, kamu/finans gibi yetki seviyeleri tanımlar.                                       | Tarayıcı     | Core                                |
| Sovereign / Air-Gapped Mode     | Cloud ve dış model çağrılarını kernel seviyesinde kapatıp tamamen yerel çalışma sağlar.                        | Tarayıcı     | Core                                |
| Web X-Ray                       | Sayfadaki tracker, script, çerez, endpoint, fingerprint ve gizli içerikleri gösterir.                          | Tarayıcı     | Core + dahili UI eklentisi          |
| Trust Lens                      | Agent'ın sayfada ne gördüğünü, neyi redakte ettiğini ve modele ne gideceğini gösterir.                         | Tarayıcı     | Core + dahili UI eklentisi          |
| Privacy Budget Meter            | Site veya görev bazında ne kadar kişisel/veri bağlamı paylaşıldığını ölçer.                                    | Tarayıcı     | Core                                |
| Permission Receipts             | Site, agent, makro veya eklentilere verilen izinleri fiş gibi kayıt altına alır.                               | Tarayıcı     | Core                                |
| Proof Receipts                  | Yapılan işlemlerin URL, zaman, onay, veri ve aksiyon kanıtını üretir.                                          | Tarayıcı     | Core                                |
| Undo the Web / Time-Travel Tabs | Sekme gruplarını, workspace durumunu ve bazı tarayıcı işlemlerini geçmiş noktaya döndürür.                     | Tarayıcı     | Core                                |
| Smart Downloads                 | İndirmeleri kategorize eder, karantinaya alır, tekrarları bulur ve dosyaları düzenler.                         | Tarayıcı     | Core                                |
| Form History Replay             | Daha önce doldurulan karmaşık formları güvenli şekilde tekrar doldurmaya hazırlar.                             | Tarayıcı     | Core                                |
| Site Memory                     | Her site için tercihleri, son akışları, hataları ve tekrar eden davranışları hatırlar.                         | Tarayıcı     | Core                                |
| Daily Driver Özellikleri        | Sekmeler, workspaces, split view, reader, çeviri, PWA, şifre/passkey ve izin yönetimini kapsar.                | Tarayıcı     | Core                                |
| Personal Web API / MCP Server   | Kullanıcının web işlerini yerel araç/API olarak dış LLM veya scriptlere açar.                                  | Tarayıcı     | Core platform                       |
| Task Marketplace                | Hazır otomasyon, adaptör ve recipe paketlerinin keşfedilip kurulmasını sağlar.                                 | Tarayıcı     | Core platform + marketplace         |
| Shared Team Recipes             | Ekiplerin imzalı ve izin kontrollü otomasyon tarifleri paylaşmasını sağlar.                                    | Tarayıcı     | Marketplace/ekip eklentisi          |
| Macro / Recipe Sistemi          | Kayıt, düzenleme ve deterministic tekrar çalıştırma altyapısıdır.                                              | Tarayıcı     | Dahili eklenti: `ext-macros`        |
| Demonstrate Once, Run Forever   | Bir kez yapılan işi modele ihtiyaç duymadan tekrar çalışacak recipe'ye dönüştürür.                             | Hibrit       | `ext-macros` + core RecipeCompiler  |
| Web Radar / Watchers            | Sayfa, fiyat, stok, randevu veya tablo değişikliklerini arka planda izler.                                     | Hibrit       | Dahili eklenti: `ext-tasks`         |
| Subscription Hunter             | Deneme süreleri, abonelikler, yenilemeler ve iptal linklerini takip eder.                                      | Hibrit       | Dahili eklenti                      |
| Universal Extractor             | Sayfa, PDF veya tablolardan CSV/JSON/Excel gibi yapılandırılmış veri çıkarır.                                  | Hibrit       | Dahili eklenti                      |
| Local File Workflow Bridge      | İndirilen dosyaları sandbox içinde özetler, adlandırır, klasörler ve rapora bağlar.                            | Hibrit       | Core sandbox + dahili eklenti       |
| Türkiye / Kamu Adaptörleri      | e-Devlet, GİB, SGK, MHRS, e-fatura gibi yerel portallara özel güvenli akışlar sunar.                           | Hibrit       | Dahili adaptör/eklenti              |
| Website Autopsy                 | Bozuk sitelerde DNS, SSL, JS, CORS, login, rate limit ve extension çakışmalarını analiz eder.                  | Hibrit       | Dahili geliştirici eklentisi        |
| Web Dev / QA Super Mode         | Form akışları, console/network hataları, performans ve regression testleri için tarayıcıyı QA aracına çevirir. | Hibrit       | Dahili geliştirici eklentisi        |
| Mission Control                 | Kullanıcının hedefini plana çevirir, riskleri gösterir ve görev yürütmeyi yönetir.                             | AI           | Dahili eklenti: `ext-agent`         |
| Dry Run Simülasyonu             | Gerçek işlem yapmadan önce agent planını, risklerini ve onay noktalarını simüle eder.                          | Hibrit       | `ext-agent` + Policy Kernel         |
| Smart Form Engine               | Form alanlarını anlayıp uygun bilgileri hazırlar; gönderim öncesi kullanıcı onayı ister.                       | Hibrit       | Dahili eklenti                      |
| Research Canvas                 | Çok sekmeli araştırmaları not, kaynak, alıntı, özet ve export panosuna dönüştürür.                             | Hibrit       | Dahili eklenti                      |
| Personal Knowledge Graph        | Geçmiş ve kayıtlı içeriklerden kişi, şirket, ürün ve konu ilişkileri çıkarır.                                  | AI           | Core memory/search                  |
| Visual Memory                   | Kullanıcının görsel olarak hatırladığı sayfaları düzen, ekran ve bağlam üzerinden bulur.                       | AI           | Core memory/search                  |
| Video Intelligence              | Video ve toplantı kayıtlarını özetler, bölümlere ayırır ve aksiyon maddeleri çıkarır.                          | AI           | Dahili eklenti                      |
| Shopping Strategist             | Ürünleri karşılaştırır, fiyat geçmişi izler, sahte yorum ve dark pattern sinyalleri verir.                     | AI           | Dahili veya marketplace eklentisi   |
| Anti-Scam / Anti-Manipülasyon   | Phishing, sahte ödeme, gizli prompt, dark pattern ve manipülasyon sinyallerini yorumlar.                       | Hibrit       | Core security + dahili eklenti      |
| Scam Sandbox                    | Şüpheli e-posta/SMS/linkleri güvenli odada açıp risklerini açıklar.                                            | Hibrit       | Core isolation + dahili security UI |
| Contract / Terms Reader         | Şartlar, gizlilik politikası, abonelik ve iade koşullarını risk odaklı özetler.                                | AI           | Dahili eklenti                      |
| Explain This UI Mode            | Karmaşık web uygulamalarında panel, buton ve iş akışlarının ne yaptığını açıklar.                              | AI           | `ext-agent`                         |
| Creator Mode                    | Araştırmadan blog, sunum, video script, rapor veya paylaşılabilir çıktı üretir.                                | AI           | Dahili eklenti                      |
| Browser-to-Report Pipeline      | Bir araştırma sürecini kaynaklı, ekran görüntülü ve alıntılı rapora dönüştürür.                                | Hibrit       | Dahili eklenti                      |
| Failure Learning                | Bozulan otomasyonlarda selector, site değişikliği veya eksik bekleme nedenini önerir.                          | Hibrit       | Core automation + `ext-macros`      |
| Agent Training Mode             | Tekrar eden işleri fark edip kullanıcıya otomasyona çevirme önerisi yapar.                                     | Hibrit       | `ext-agent` + core suggestions      |
| Natural Language Firewall       | Kullanıcının doğal dille yazdığı güvenlik kurallarını enforce edilebilir policy'ye çevirir.                    | Hibrit       | Core Policy Kernel + AI parser      |
| Local AI Tab Janitor            | Açık sekmeleri konu, tekrar, eskime ve kaynak tüketimine göre gruplama/kapatma önerisi yapar.                  | Hibrit       | Core tab engine + dahili eklenti    |
| Turkish Engine                  | Türkçe niyet, ek, büyük/küçük harf, i/İ/ı/I ve resmiyet farklarını motor seviyesinde işler.                    | AI altyapısı | Core                                |
| Learned Model Router            | Görev, risk, maliyet ve başarı geçmişine göre hangi modelin kullanılacağını seçer.                             | AI altyapısı | Core                                |

## Eklenti Olarak Paketlenmesi Gerekenler

Mevcut first-party eklenti çizgisi:

- `ext-agent`: Mission Control, Explain This UI Mode, Dry Run Simülasyonu ve Agent Training Mode gibi
  agent merkezli deneyimlerin ana yüzeyi.
- `ext-macros`: Macro / Recipe Sistemi, Demonstrate Once, Run Forever ve Failure Learning'in
  kullanıcıya görünen kayıt/düzenleme/çalıştırma yüzeyi.
- `ext-tasks`: Web Radar / Watchers, görev tetikleyicileri, zamanlanmış akışlar ve unattended task
  ürünleşmesi için doğal yüzey.

Yeni dahili eklenti adayları:

- Research Canvas, Universal Extractor, Subscription Hunter ve Smart Form Engine günlük bilgi işçiliği
  ve tekrar eden web işleri için first-party eklenti olarak paketlenebilir.
- Video Intelligence, Creator Mode, Contract / Terms Reader ve Browser-to-Report Pipeline içerik
  anlama/üretme odaklı first-party eklentiler olarak ele alınabilir.
- Website Autopsy ve Web Dev / QA Super Mode geliştirici odaklı ayrı bir first-party extension track
  olarak tasarlanabilir.
- Anti-Scam / Anti-Manipülasyon ve Scam Sandbox'ın UI/raporlama yüzeyi eklenti olabilir; risk
  sınıflandırma, izolasyon ve policy enforcement core'da kalmalıdır.

Marketplace veya ekip eklentisi adayları:

- Shared Team Recipes, site-specific recipes ve dikey sektör adaptörleri ekip içinde imzalı paketler
  olarak paylaşılabilir.
- Shopping Strategist varyantları, farklı e-ticaret siteleri veya ülke/bölge odaklı market
  eklentileri olarak çoğaltılabilir.
- Türkiye / Kamu Adaptörleri ilk aşamada first-party olmalı; ileride belediye, sektör veya kurum
  özelinde marketplace adaptörlerine ayrılabilir.

## Çekirdekte Kalması Gerekenler

Şu alanlar eklentiye devredilmemelidir; eklentiler sadece bu çekirdek yeteneklerin kontrollü
yüzeylerini kullanmalıdır:

- Policy Kernel, izin modeli, HITL, risk sınıflandırma, sensitive-site lockout ve Natural Language
  Firewall'ın enforce edilen policy çıktısı.
- Profil, sandbox, Disposable Browsing Rooms, cookie/storage izolasyonu, credential vault, dosya
  sandbox'ı ve air-gapped/sovereign egress kapıları.
- Event Journal, Proof Receipts, Permission Receipts, Time-Travel Tabs, replay/audit ve kanıt üretimi.
- MCP server, Capability Plane, ToolGateway, model routing, local inference, Turkish Engine ve Learned
  Model Router.
- Privacy Budget Meter, Trust Lens veri kaynağı, Web X-Ray sinyalleri ve security telemetry
  projeksiyonları.

Bu ayrımın nedeni basittir: eklentiler kullanıcı deneyimini ve domain bilgisini genişletir, fakat
güvenlik kararı, veri çıkışı, credential erişimi ve state-changing aksiyon yetkisi çekirdekten
ayrılmamalıdır.

## Öncelik Önerisi

İlk dalga, mevcut repo damarlarına en yakın ve demo değeri en yüksek özelliklere odaklanmalıdır:

1. **Mission Control + Dry Run + Trust Lens:** Agent'ın ne yapacağını ve ne gördüğünü kullanıcıya
   şeffaf gösterir; güven sorununu doğrudan azaltır.
2. **Macro / Recipe Sistemi + Demonstrate Once, Run Forever:** Tepegöz'ü tekrar eden web işlerinde
   model bağımlılığından çıkarır ve "bir kez göster, güvenle tekrar çalıştır" vaadini taşır.
3. **Web Radar / Watchers + Task ürünleşmesi:** Arka planda takip ve tetikleme kabiliyetiyle
   tarayıcıyı pasif tüketim aracından aktif iş asistanına dönüştürür.
4. **Research Canvas + Universal Extractor:** Araştırma, veri çıkarma ve raporlama işlerini tek akışa
   bağlar.
5. **Sovereign Mode + Privacy Budget + Proof Receipts:** Yerel-first ve denetlenebilirlik iddiasını
   özellikle Türkiye, KVKK ve kurumsal kullanım için somutlaştırır.

Bu sırayla ilerlemek, hem günlük kullanıcıya görünür değer üretir hem de Tepegöz'ün asıl farkı olan
policy-gated, journaled, local-first otomasyon omurgasını güçlendirir.
