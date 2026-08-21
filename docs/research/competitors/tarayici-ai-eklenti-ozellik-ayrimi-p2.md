# Tepegöz Özellik Ayrımı P2: Rakiplerden Ayrışma Haritası

## Yönetici Özeti

Bu doküman, `tarayici-ai-eklenti-ozellik-ayrimi.md` dosyasındaki ilk özellik haritasının devamıdır.
P2 odağı, piyasadaki AI browser'lardan daha zor kopyalanacak, Tepegöz'ün local-first, policy-gated,
journaled ve deterministic automation karakterini güçlendirecek özelliklerdir.

Pazardaki yaygın AI browser çizgisi; sayfa özetleme, sekmelerle sohbet, basit agent mode, e-posta/
takvim entegrasyonu ve çok sekmeli araştırma çevresinde yoğunlaşır. Tepegöz'ün ayrışması için ana
yön, daha fazla AI düğmesi eklemek değil; agent yetkisini daraltan, otomasyonu test edilebilir yapan,
kanıt üreten ve hassas veriyi modelden ayıran bir güvenli otomasyon katmanı kurmaktır.

## Sınıflandırma Kuralı

- **Tarayıcı:** AI kapalıyken de çalışması gereken izin, sandbox, journal, test, profil, ledger,
  kanıt, yürütme ve güvenlik özellikleri.
- **AI:** Anlama, önerme, karar gerekçesi oluşturma, risk yorumlama ve doğal dil üretimi gerektiren
  özellikler.
- **Hibrit:** AI bir yorum veya plan üretir; tarayıcı çekirdeği dar yetki, policy, HITL, kayıt ve
  yürütmeyi sağlar.
- **Core:** Enforcement, sandbox, credential, side-effect, policy veya audit sahibi olduğu için
  çekirdekte kalması gereken özellik.
- **Dahili eklenti:** Tepegöz ile gelen first-party ürün yüzeyi.
- **Marketplace/ekip eklentisi:** Domain veya site özelinde ekip/üçüncü taraf tarafından kurulabilen,
  imzalı ve policy-gated paket.

## Açıklamalı Özellik Tablosu

| Özellik                  | Açıklama                                                                                                                      | Sınıf    | Paketleme                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------- |
| Capability Tokens        | Agent'a görev başına tek kullanımlık, süreli ve dar kapsamlı izin token'ları verir.                                           | Tarayıcı | Core                                   |
| Data Contract Preview    | Görev başlamadan önce okunacak veri, yazılacak alan, dışarı çıkacak bağlam ve onay noktalarını sözleşme gibi gösterir.        | Hibrit   | Core + `ext-agent`                     |
| Agent Quarantine Mode    | Riskli sayfalarda agent'ı sadece okuma moduna alır; tıklama, yazma, kopyalama, dosya ve credential erişimini kapatır.         | Tarayıcı | Core                                   |
| Prompt Injection Lab     | Sayfa, recipe, eklenti ve agent akışlarını gizli prompt, görünmez metin ve veri sızdırma saldırılarıyla test eder.            | Hibrit   | Dahili security/dev eklentisi          |
| Automation Health Score  | Her makro veya recipe için son başarı, drift riski, kırılgan selector, izin riski ve bakım ihtiyacını puanlar.                | Hibrit   | `ext-macros` + core telemetry          |
| Recipe CI                | Otomasyonları model ve network olmadan fixture/journal üzerinde deterministik test eder.                                      | Tarayıcı | Core test harness + CLI                |
| Known-Site Fast Lane     | Bilinen sitelerde LLM yerine imzalı deterministic recipe veya site adaptörü kullanarak görevi hızlı ve ucuz yürütür.          | Hibrit   | Core orchestrator + marketplace recipe |
| Site Agent Manifest      | Sitelerin güvenli action schema, izin kapsamı ve a11y/selectors bilgisini yayımlayabileceği standart manifest formatı sunar.  | Tarayıcı | Core standard + marketplace            |
| Approval Inbox           | Unattended görevler onay gereken yerde durur; kullanıcı onayları tek kuyrukta toplu inceleyip cevaplar.                       | Tarayıcı | Core + dahili tasks UI                 |
| Side-Effect Firewall     | Mail gönderme, ödeme, başvuru, dosya silme ve hesap değişikliği gibi gerçek dünya etkilerini ayrı ledger'da izler.            | Tarayıcı | Core                                   |
| Context Vault            | Hassas verileri modele göstermeden placeholder olarak planlatır; gerçek değeri son anda tarayıcı güvenli biçimde forma basar. | Tarayıcı | Core                                   |
| Policy Packs             | Kamu, muhasebe, çocuk, şirket, araştırma veya düşük veri gibi hazır güvenlik ve otomasyon politikaları sağlar.                | Tarayıcı | Core + marketplace policy packs        |
| Evidence Notebook        | Bir görevin kaynaklarını, ekran görüntülerini, onaylarını, çıktısını ve veri akışını denetlenebilir deftere dönüştürür.       | Hibrit   | Core journal + dahili rapor eklentisi  |
| Compare Since Last Visit | Bir sayfada son ziyaretten bu yana değişen fiyat, metin, tablo, politika veya UI farklarını gösterir.                         | Hibrit   | Dahili eklenti                         |
| Multi-Account Run        | Aynı görevi izole profillerde farklı hesaplar için sırayla veya kontrollü paralel çalıştırır.                                 | Tarayıcı | Core profiles + dahili tasks UI        |
| Personal Web CI          | Kullanıcının kritik web işlerini düzenli test eder; login, rapor indirme veya form akışı bozulduğunda uyarır.                 | Hibrit   | Dahili dev/ops eklentisi               |
| Decision Diary           | Agent'ın önerilerini, seçmediği alternatifleri ve karar gerekçelerini sonradan denetlenebilir şekilde kaydeder.               | AI       | `ext-agent` + journal                  |
| Human Handoff Rooms      | CAPTCHA, 2FA, son onay veya hassas veri girişi için kullanıcıya sadece gerekli mini güvenli alanı açar.                       | Tarayıcı | Core + dahili handoff UI               |
| Local Redaction Studio   | Kullanıcının "bu veri asla modele gitmesin" kurallarını yerelde tanımlayıp test etmesini sağlar.                              | Hibrit   | Core redaction + dahili settings UI    |
| Trustable Output Badges  | Çıktılara kaynaklı, lokal üretildi, cloud kullandı, kişisel veri içeriyor veya denetlenebilir gibi güven rozetleri ekler.     | Hibrit   | Core provenance + dahili UI            |

## Eklenti Olarak Paketlenmesi Gerekenler

First-party eklenti adayları:

- **Prompt Injection Lab:** Security/dev odaklı ayrı bir dahili eklenti olmalı; core sinyalleri kullanır
  ama policy kararını kendisi vermez.
- **Evidence Notebook ve Trustable Output Badges:** Raporlama ve kullanıcıya görünür provenance
  yüzeyi olarak first-party extension veya mevcut agent/tasks UI içinde modül olabilir.
- **Compare Since Last Visit:** Watcher ve history altyapısını kullanan günlük kullanım eklentisi olarak
  paketlenebilir.
- **Personal Web CI:** Geliştirici/operasyon kullanıcıları için ayrı bir dev/ops eklentisi olmalı.
- **Local Redaction Studio:** Settings içinden açılan dahili güvenlik aracı olabilir; redaction
  enforcement core'da kalır.

Marketplace veya ekip eklentisi adayları:

- **Known-Site Fast Lane recipes:** Site bazlı deterministic akışlar imzalı marketplace recipe'leri
  olarak büyüyebilir.
- **Site Agent Manifest adaptörleri:** Kurum veya SaaS sağlayıcıları kendi manifest/adaptör paketlerini
  yayımlayabilir.
- **Policy Packs:** Şirket, okul, aile, muhasebe veya kamu odaklı policy paketleri ekip/marketplace
  paketi olarak dağıtılabilir.

## Çekirdekte Kalması Gerekenler

Bu P2 özelliklerinin en kritik kısmı eklentiye devredilmemelidir:

- Capability Tokens, Agent Quarantine Mode, Context Vault, Side-Effect Firewall ve Human Handoff Rooms
  doğrudan güvenlik ve yetki sınırı olduğu için core olmalıdır.
- Data Contract Preview'ın sözleşme üretimi AI destekli olabilir; fakat gerçek veri akışı, tool
  kapsamı, dış egress ve onay enforcement çekirdekte kalmalıdır.
- Recipe CI, Site Agent Manifest doğrulaması, Known-Site Fast Lane seçimi ve Automation Health Score
  sinyalleri orchestrator, journal, capability plane ve policy kernel ile birlikte core tarafından
  doğrulanmalıdır.
- Evidence Notebook, Decision Diary ve Trustable Output Badges UI olarak eklenti olabilir; provenance,
  journal event'leri ve kanıt üretimi core'da kalmalıdır.

## Öncelik Önerisi

P2 için en güçlü ayrışma sırası:

1. **Capability Tokens + Agent Quarantine Mode + Context Vault:** Prompt injection ve excessive agency
   riskine doğrudan ürün seviyesinde cevap verir.
2. **Data Contract Preview + Trustable Output Badges:** Kullanıcıya "ne olacak, hangi veri nereye
   gidecek, çıktı ne kadar güvenilir" sorularının görünür cevabını verir.
3. **Recipe CI + Automation Health Score:** Tepegöz otomasyonlarını test edilebilir ve bakım yapılabilir
   hale getirir.
4. **Known-Site Fast Lane + Site Agent Manifest:** LLM tabanlı yavaş/kararsız akışlar yerine hızlı,
   ucuz ve deterministic web görevleri sağlar.
5. **Approval Inbox + Side-Effect Firewall + Human Handoff Rooms:** Unattended autonomy'yi gerçek
   hayatta güvenli kullanılabilir hale getirir.
6. **Evidence Notebook + Decision Diary:** Tepegöz'ü sadece işi yapan değil, yaptığı işi açıklayan ve
   kanıtlayan tarayıcı konumuna taşır.

Bu P2 setinin ana iddiası: Tepegöz, rakiplerden daha fazla agent yetkisi vermekle değil; agent yetkisini
daraltıp ölçülebilir, test edilebilir ve kanıtlanabilir hale getirmekle ayrışmalıdır.
