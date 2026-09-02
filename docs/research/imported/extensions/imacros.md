# **iMacros Otomasyon Platformu: Kullanıcı Şikayetleri, Teknik Kısıtlamalar, Kurumsal Entegrasyon Sorunları ve Web Otomasyonunun Geleceğine Yönelik Geliştirme Önerileri**

Web otomasyonu, veri çekme (web scraping), form doldurma ve yazılım testi alanlarında yirmi yılı aşkın süredir pazarın öncü çözümlerinden biri olarak kabul edilen iMacros, modern web mimarilerinin gelişmesi ve tarayıcı güvenlik politikalarının evrimi ile birlikte ciddi operasyonel ve teknik darboğazlarla karşı karşıya kalmıştır. İlk olarak 2001 yılında Mathias Roth tarafından web tarayıcıları ve form doldurma işlemleri için optimize edilmiş ilk makro kaydedici olarak piyasaya sürülen yazılım, 2012 yılında Ipswitch ve ardından 2019 yılında Progress yazılım şirketi tarafından satın alınmıştır1. İki on yıl boyunca Amazon, eBay veya Salesforce gibi platformlarla arayüz oluşturmak, Excel tabloları ile web siteleri arasında iki yönlü veri aktarımı sağlamak ve rakiplerin fiyatlandırma verilerini çekmek gibi sayısız görev için kurumsal bir omurga olarak kullanılmıştır3.
Ancak, 30 Kasım 2023 tarihi itibarıyla Progress tarafından ürünün resmi olarak kullanımdan kaldırılacağının (End-of-Life) ve hiçbir yeni özellik geliştirilmeyeceğinin duyurulması5, geniş bir kullanıcı tabanını teknik, operasyonel ve lisanslama bağlamında derin bir krize sürüklemiştir. Bu kapsamlı araştırma raporu, iMacros kullanıcılarının yıllar içinde resmi forumlarda, topluluk platformlarında ve Reddit gibi ağlarda biriktirdiği şikayetleri, platformun teknik mimarisinden kaynaklanan mantıksal kısıtlamaları, kurumsal düzeyde yaşanan entegrasyon hatalarını ve sektörün gelecekteki Robotik Süreç Otomasyonu (RPA) araçları için sunduğu geliştirme önerilerini derinlemesine incelemektedir. Analiz, veri noktalarının ötesine geçerek tarayıcı uzantılarının evrimi, kodsuz (no-code) otomasyonun sınırları ve bir yazılımın yaşam döngüsü yönetiminin küresel iş akışları üzerindeki zincirleme etkilerini ortaya koymayı amaçlamaktadır.

## **Temel Mimari Altyapı ve Tarayıcı Ekosisteminden Kaynaklanan Şikayetler**

iMacros'un teknik çöküşünün temelinde yatan en belirleyici faktör, aracın üzerine inşa edildiği eski tarayıcı uzantı mimarisinin modern tarayıcı güvenlik standartları ve Tek Sayfa Uygulamaları (Single Page Applications \- SPA) ile yapısal uyuşmazlığıdır.

### **Manifest V3 Geçişi ve Tarayıcı Uzantılarının Fonksiyonel Çöküşü**

Google Chrome ve diğer Chromium tabanlı tarayıcıların Manifest V2 standardını terk ederek Manifest V3'e geçiş yapma kararı, iMacros gibi eski nesil arka plan komut dosyalarına (background scripts) dayanan eklentiler için yıkıcı bir dönüm noktası olmuştur7. Manifest V3, tarayıcı uzantılarının arka planda sürekli çalışmasını engelleyerek, kaynak tüketimini azaltmak amacıyla geçici "Service Worker" mantığına geçişi zorunlu kılmıştır11. iMacros'un çekirdek mimarisi, uzun süreli döngüler ve makro yürütme işlemleri için kesintisiz bir arka plan işlemine ihtiyaç duyduğundan, bu güncelleme eklentinin stabilitesini tamamen yok etmiştir.
Geri bildirimler ve topluluk şikayetleri incelendiğinde, kullanıcıların bu teknik engeli aşmak için son derece güvensiz geçici çözümlere (workarounds) başvurduğu görülmektedir. Kurumsal ağlarda ve kişisel cihazlarda, kullanıcılar Chrome'un otomatik güncellemelerini kapatarak v126 sürümünde kalmaya çalışmış veya "Portable" (taşınabilir) Chrome kurulumları yaparak Manifest V3 güncellemesini reddetme yoluna gitmişlerdir10. Progress şirketinin uzantıyı Manifest V3'e uyumlu hale getirecek temel bir mühendislik yatırımı yapmak yerine yazılımın fişini çekmesi, yirmi yıllık makro arşivlerine sahip kullanıcıları mağdur etmiştir6.

### **Mozilla Firefox Ekosistemindeki Çıkmazlar ve Güvenlik Zafiyetleri**

Sadece Chromium tabanlı tarayıcılarda değil, Mozilla Firefox cephesinde de benzer bir kaos yaşanmıştır. iMacros'un eski mimarisinde en güçlü olduğu dönem, JavaScript desteğinin doğrudan makrolara entegre edilebildiği Firefox Quantum (v57) öncesi XUL (XML User Interface Language) mimarisi dönemidir1. Progress ve Ipswitch'in daha yeni uzantı sürümlerinde katı JavaScript tabanlı makroların çalıştırılmasını kaldırması1, kullanıcıları eski sürümlere mahkum etmiştir.
Rapor edilen vakalarda, kullanıcıların gelişmiş otomasyon yeteneklerini kaybetmemek adına, yıllar öncesine ait Firefox v48, v52 (LTS) ve v55.0.3 sürümlerinde kalmakta ısrar ettikleri, hatta Waterfox, Pale Moon ve Basilisk gibi eski altyapıları destekleyen alternatif tarayıcı çatallarına (fork) yöneldikleri belgelenmiştir12. Kurumsal bilgi güvenliği açısından değerlendirildiğinde, bir RPA aracının çalışması için kurum ağında yaması yapılmamış (unpatched) tarayıcıların barındırılması, çapraz site betik çalıştırma (XSS) ve diğer siber güvenlik zafiyetlerine zemin hazırlamaktadır15. Ayrıca, iMacros'un güncellenmemesi sonucunda kullanıcıların geçersiz SSL sertifikalarına (Self-Signed SSL) sahip iç ağ projelerinde veya bozuk HTTPS protokollerinde şifre kaydetme ve form otomasyonu yaparken tarayıcı engellerine takıldıkları, bu durumun ancak işletim sistemi düzeyindeki sertifika yöneticilerine (Windows Certificate Store) müdahale edilerek aşılabildiği görülmüştür16.

### **Dinamik Web Mimarileri Karşısında Katı Konumlandırma**

Modern web geliştirme çerçevelerinin (React, Angular, Vue.js) yaygınlaşması, iMacros'un TAG POS tabanlı element seçim mantığını işlevsiz hale getirmiştir. iMacros, web elementlerini tanımlamak için statik HTML niteliklerini (örneğin ATTR=ID:username veya TXT:Giriş) kullanacak şekilde tasarlanmıştır17. Oysa modern web uygulamaları, DOM ağacındaki ID'leri ve sınıfları her oturumda veya sayfa yenilemesinde dinamik olarak rastgele karakter dizileriyle yeniden üretmektedir19.
Bu yapısal değişim, kullanıcıların makrolarında sürekli "Element Bulunamadı" (Error code: \-921) hataları almasına neden olmuştur20. Ayrıca iMacros, asenkron (AJAX) sayfa yüklemelerinde elementlerin varlığını dinamik olarak bekleyebilecek akıllı bekleme (auto-wait) özelliklerinden yoksun olduğundan, kullanıcılar WAIT SECONDS=10 gibi ilkel ve performansı düşüren sabit bekleme komutlarına mecbur bırakılmıştır17. Alternatif araçların (UI.Vision, Selenium) XPath ve CSS Seçicileri ile bu sorunu kökünden çözmüş olması, iMacros'un teknolojik borcunun (technical debt) ne kadar büyüdüğünü kanıtlamaktadır21.

## **Betik (Script) Dili, Algoritma ve Mantıksal Sınırlandırmalara Yönelik Şikayetler**

Kodlama bilmeyen kullanıcılar için kolay bir başlangıç sunan iMacros'un kendi .iim makro dili, karmaşık süreçleri otomatize etmek isteyen ileri düzey kullanıcılar için katlanılmaz kısıtlamalar barındırmaktadır. Bu kısıtlamalar, basit bir otomasyon aracının kurumsal bir RPA aracına dönüşmesinin önündeki en büyük engel olmuştur.

### **Koşullu İfadelerin (If/Else) ve Algoritmik Esnekliğin Eksikliği**

Bir programlama dilinin en temel unsuru olan koşullu karar verme mekanizmaları (if/else blokları), iMacros'un yerleşik .iim sözdiziminde kesinlikle bulunmamaktadır24. Otomasyon süreçlerinde karşılaşılan "Eğer ekranda '1 YENİ MESAJ' ibaresi varsa makroyu durdur, yoksa devam et" gibi hayati kararlar, doğrudan bir komutla uygulanamamaktadır20.
Kullanıcılar bu kısıtlamayı aşmak için akıl almaz derecede karmaşık geçici çözümler (workarounds) geliştirmiştir. Bunların başında EVAL komutu içine satır içi (inline) JavaScript kodları gömmek gelmektedir26. Ancak, iMacros'un geliştiricilerinin yeni sürümlerde iimPlay() ve saf JavaScript dosya desteklerini kısıtlaması, topluluk içinde büyük bir hayal kırıklığına yol açmıştır1. Bu kısıtlama nedeniyle, kullanıcıların belirli bir öğe bulunduğunda (FAIL\_IF\_FOUND) işlemi iptal etmeye çalıştığı, ancak sistemin aynı anda \!ERRORIGNORE YES komutu kullanıldığında bu iptal isteğini de görmezden gelerek hatalı döngüye devam ettiği belgelenmiştir20.

### **Katı Değişken (Variable) Sınırlandırmaları ve Veri Taşıma Problemleri**

Kullanıcıların forum platformlarında en çok eleştirdiği teknik engellerden biri, ücretsiz iMacros sürümlerinde kullanıcı tanımlı değişken sayısının keyfi olarak sadece 3 adet ile (\!VAR1, \!VAR2, \!VAR3) sınırlandırılmasıdır28. Bir e-ticaret platformundan ürün adı, fiyatı, stok durumu ve ürün kodunu aynı anda kazımak (scraping) isteyen bir kullanıcının dört farklı geçici hafıza birimine ihtiyacı varken, sistemin üç değişkenle kısıtlanması mantıksal bir kilitlenme yaratmıştır29.
Dizi (Array) desteğinin yerleşik olmaması nedeniyle, WhatsApp API üzerinden binlerce numaraya toplu mesaj göndermek isteyen veya karmaşık formlar dolduran kullanıcılar, Javascript'in rastgele sayı üretme algoritmalarını EVAL ile enjekte etmek, verileri tek bir string içinde birleştirip daha sonra parçalamak gibi bakım maliyetini ve kod karmaşıklığını olağanüstü artıran yöntemlere başvurmak zorunda bırakılmıştır18.

### **CSV Veri Kaynakları ve Gelişmiş Döngü (Loop) Çıkmazları**

Veri odaklı otomasyonun temeli olan harici veri okuma (CSV entegrasyonu) özelliklerinde yaşanan kısıtlamalar, iMacros şikayetlerinin büyük bir bölümünü oluşturmaktadır. İç içe geçmiş döngülerin (nested loops) desteklenmemesi, kategori bazlı gezintileri olanaksız kılmıştır18.
Ayrıca, kullanıcıların belirli bir satır sayısına sahip (örneğin 10 satırlık) bir CSV dosyasının sonuna gelindiğinde, betiğin durmak veya hata vermek yerine 1\. satırdan yeniden başlayarak sonsuz bir döngü oluşturmasını talep ettiği durumlarda sistem çaresiz kalmaktadır27. Kullanıcılar bu açığı kapatmak için SET Modulo\_10 EVAL("var n='{{\!LOOP}}'; var x,y,z; x=n%10; if(x==0){z=10;} else{z=x;}; z;") formülü ile modüler aritmetik kullanarak sahte bir döngü yeniden başlatma mantığı icat etmek zorunda kalmışlardır27. Kullanıcı deneyimi açısından bu durum, "kodlama bilmeden web otomasyonu" misyonuyla yola çıkan bir aracın amacından tamamen saptığını göstermektedir.

### **Spesifik Hata Kodları ve Güvenilmez Zamanlama Çözümleri**

iMacros'un arka planda ürettiği hatalar, kullanıcılar tarafından sıkça analiz edilmiş ve platformun stabilitesinin ne kadar kırılgan olduğu ortaya konmuştur. Toplanan verilerde göze çarpan başlıca hatalar ve sonuçları şöyledir:

| Hata Kodu / Parametre | Kullanıcı Geri Bildirimi ve Şikayet İçeriği | Sistem Üzerindeki Olumsuz Etkisi |
| :---- | :---- | :---- |
| **Error Code: 8011** | "Failed to initialize iMacros Browser." (iMacros Tarayıcısı Başlatılamadı)30. | Özellikle sunucu ortamlarında Antivirüs müdahalesi, kayıt defteri lisans sorunları veya hedef HTML'nin değişmesinden kaynaklı tam sistem çöküşü30. |
| **Error Code: \-910** | "SyntaxError: unknown command: IF" (Bilinmeyen komut: IF)25. | Kullanıcıların mantıksal karar ağaçları kuramaması; sadece düz bir çizgide ilerleyen, esneklikten yoksun aptal botlar oluşturulmasına neden olması25. |
| **Error Code: \-921** | Dinamik sayfalarda aranan elementin bulunamaması20. | TAG yapısının modern web sitelerinde (React vb.) çalışmaması ve tüm döngünün çökerek makronun durması20. |
| **\!ERRORIGNORE Sorunu** | Kullanıcılar hataları yoksaymak için bu komutu kullandığında, FAIL\_IF\_FOUND gibi kritik güvenlik/durdurma komutlarının da yoksayılması20. | İstenmeyen mesajlar geldiğinde veya sayfa hatalı yüklendiğinde makronun farkında olmadan yanlış işlemler yapmaya devam etmesi20. |
| **\!TIMEOUT\_STEP 0 Bug** | Elementin sayfada olmadığı durumlarda sıfır bekleme süresi verilmesine rağmen sistemin 0.5 saniye beklemesi31. | Binlerce satırlık web kazıma (scraping) işlemlerinde toplamda saatler süren gereksiz gecikme ve performans kaybı31. |

## **Kurumsal Entegrasyonlarda Yaşanan Çöküşler ve Sektörel Kullanım Senaryoları**

iMacros sadece bireysel form doldurma işlemleri için değil, aynı zamanda devasa kurumsal ağlarda, eğitim sistemlerinde ve siber güvenlik platformlarında arka plan otomasyon motoru olarak kullanılmıştır. Bu ortamlarda karşılaşılan şikayetler, yazılımın kurumsal kullanıma uygun olmadığını kanıtlamıştır.

### **CyberArk ve Ayrıcalıklı Erişim Yönetimi (PAM) Krizleri**

İleri düzey kurumsal sistemlerde iMacros'un en büyük çöküşlerinden biri, dünya çapında binlerce büyük organizasyon tarafından kullanılan siber güvenlik platformu CyberArk entegrasyonunda yaşanmıştır32. CyberArk'ın Central Policy Manager (CPM) bileşeni, ağ cihazlarında ve web portallarında şifre değiştirme/doğrulama işlemlerini otomatize etmek için iMacros uzantısını kullanmaktaydı30.
Ancak sunucu sıkılaştırma (hardening) politikaları uygulandığında, iMacros'un mimari bir tasarım hatası olan lisans kontrol mekanizması devreye girmiştir. iMacros lisans bilgisi Windows kayıt defterinde (Registry) doğrudan SYSTEM adlı yerel kullanıcı profiline sabitlenmişti (hardcoded)33. CPM aracı güvenlik gereği görevleri SYSTEM kullanıcısından alıp yeni bir yerel kullanıcıya atadığında, iMacros lisans bulamayarak PMTerminal.exe üzerinden 0xc0000005 bellek erişim ihlali ile çökmüştür33. Kurumsal mimari standartlarına tamamen aykırı olan bu lisanslama tasarımı, CyberArk'ın iMacros altyapısını 2023'ün 2\. çeyreğinde (Q2 2023\) sisteminden tamamen kaldırmasıyla sonuçlanmıştır32.

### **Öğrenim Yönetim Sistemleri (LMS), Çekiliş Botları ve Güvenlik Eğitimleri**

Farklı sektörlerdeki kullanım kısıtlamalarına dair veriler, iMacros'un yapısal zorluklarını netleştirmektedir:

* **Eğitim/LMS (Instructure Canvas):** Eğitmenler, tek seferde onlarca ödev modülü oluşturmak için Canvas sistemine API entegrasyonu olmadan iMacros ile müdahale etmeye çalışmışlardır. Süreç, karmaşık CSV dosyalarının bağlanmasını gerektirdiği ve tarayıcı performansına bağımlı olduğu için ciddi vakit kaybına neden olmuştur34.
* **Ağ Güvenliği Testleri (F5 ASM):** F5'in Uygulama Güvenlik Yöneticisi (ASM) modülünün makine öğrenimi modellerini eğitmek amacıyla, zararsız ve gerçek kullanıcı (legitimate traffic) simülasyonları yaratmak için iMacros kullanılmış, ancak makroların statik yapısı nedeniyle sahte pozitif (false positive) sonuçlardan kaçınmanın çok zor olduğu tespit edilmiştir35.
* **E-Ticaret ve Çekiliş Otomasyonları:** Kullanıcıların Lazada gibi platformlarda "Flash Sale" indirimlerini yakalamak için yazdığı botlar36, veya otomatik çekiliş formlarını (Sweepstakes) binlerce kez doldurmaya çalışan scriptler, modern sitelerin CAPTCHA bariyerlerine ve dinamik element yapılarına takılarak işlevsiz hale gelmiştir37.

### **Aşırı Yüksek Fiyatlandırma Politikası**

Ürünün güncellenmemesi bir yana, Progress firmasının uyguladığı fiyatlandırma politikası kullanıcılar tarafından mantıksız bulunmuştur. "Standard Edition" için 495 ABD Doları, API özellikli "Enterprise Edition" için 995 ABD Doları gibi kalıcı (perpetual) lisans ücretleri talep edilmesi39, ürünün arka planda çürüyen teknolojisi göz önüne alındığında "çok pahalı" ve "saçma" (ridiculous/expensive) olarak değerlendirilmiştir41. Kullanıcılar, yüzlerce dolar ödedikleri bir sistemin Microsoft Edge gibi zorunlu tarayıcı değişiklikleri karşısında hiçbir destek sunmamasını eleştirerek, firmanın "parayı alıp müşteriyi yüzüstü bıraktığını" açıkça belirtmiştir41.

## **Gelecek Nesil Araçlar İçin Geliştirme Önerileri ve Beklentiler**

Kullanıcıların forumlarda, GitHub tartışmalarında ve Reddit dizilerinde dile getirdikleri şikayetler, aynı zamanda web otomasyon sektörünün hangi yöne evrilmesi gerektiğine dair kusursuz bir ürün geliştirme haritası oluşturmuştur.

### **Kaynak Kodun Açılması (Open-Source Dönüşümü) Talebi**

Progress şirketinin iMacros'u sonlandırma kararının ardından gelen en yoğun talep, yazılımın açık kaynaklı (Open Source) hale getirilmesi olmuştur6. Kullanıcılar, iMacros'un kod tabanının topluluğa devredilmesi halinde, dünya çapındaki yetenekli geliştiricilerin aracı Manifest V3 standartlarına güncelleyebileceğini ve modern tarayıcılarda yaşatabileceğini savunmuştur6. Firmanın bu talebi reddetmesi ve bunun yerine kendi diğer çözümü olan Telerik Test Studio'yu41 satmaya çalışması, kurumsal yazılımlarda marka sadakatini zedeleyen önemli bir vaka olarak kayıtlara geçmiştir.

### **CAPTCHA Çözücü ve Anti-Detect (Kimlik Gizleme) Entegrasyonları**

Modern web siteleri, bot trafiğini engellemek için karmaşık güvenlik duvarları ve CAPTCHA mekanizmaları kullanmaktadır. iMacros'un kendi başına bu güvenlik duvarlarını aşma yeteneği bulunmadığından, kullanıcılar üçüncü parti API'lerle (2Captcha, SolveCaptcha, AntiCaptcha, DeathByCaptcha) entegrasyonu zorunlu bir özellik olarak görmektedir43. Geliştiriciler, iMacros'un bu API'lerle iletişim kurabilmesi için karmaşık JSON istekleri (/in.php, /res.php) veya iMacros için özel yazılmış eklenti köprüleri kullanmak zorunda kalmıştır44. Geleceğin RPA araçlarında, bu tür Anti-Bot ve CAPTCHA çözme algoritmalarının doğrudan platforma entegre edilmesi, kullanıcıların en temel beklentilerinden biri haline gelmiştir37.

### **Görsel Otomasyon, OCR ve Kalıcı Element Vurgulama**

Statik HTML etiketlerine bağımlı olan iMacros'un aksine, yeni nesil araçlardan beklenen en büyük donanımsal atılım Bilgisayarlı Görü (Computer Vision) ve Optik Karakter Tanıma (OCR) desteğidir21. Kullanıcılar; Canvas, Flash oyunları, video oynatıcı arayüzleri veya PDF belgeleri gibi DOM ağacında bulunmayan ögelere doğrudan ekrandaki şekillerinden veya içerdikleri metinlerden tanınarak tıklanabilmesini (XClick mantığı) talep etmiştir15. Ayrıca, hata ayıklamayı (debugging) kolaylaştırmak adına, UI.Vision'da olduğu gibi makronun etkileşime girdiği alanların kalıcı bir yeşil çerçeve ile vurgulanması (Permanent Highlighting) gibi kullanıcı deneyimi (UX) geliştirmeleri spesifik olarak talep edilmiştir46.

### **Seçici (Selector) Esnekliği: XPath, RegEx ve URL Joker Karakterleri**

Kullanıcılar, bir URL'in belirli bir kısmı değişse bile makronun çalışmaya devam edebilmesi için URL içinde veya element isimlerinde joker karakter (wildcard / \*) veya Düzenli İfadeler (RegEx) kullanılabilmesini istemektedir47. Dinamik web elementlerini bulmak için endüstri standardı olan XPath ve CSS Seçicilerinin iMacros'a yerel (native) olarak entegre edilmemiş olması, aracı çağın gerisinde bırakmıştır21. Yeni bir otomasyon aracının mutlaka XPath eksenlerini (axes) desteklemesi, örneğin "Tablodaki X kelimesini bul ve onun sağındaki butona tıkla" gibi relatif (göreceli) seçim mantığını barındırması gerektiği vurgulanmıştır48.

## **iMacros Sonrası Göç (Migration) Stratejileri ve Rakip Alternatiflerin Analizi**

iMacros'un pazar payını kaybetmesiyle birlikte oluşan vakum, web otomasyonu ve test dünyasında rekabetçi yeni alternatiflerin parlamasına olanak sağlamıştır. iMacros'tan göç etmek isteyen kullanıcıların tercih ettiği araçlar, pazarın segmentasyonunu ve ihtiyaç çeşitliliğini göstermektedir.

### **Doğrudan Halef: UI.Vision RPA (Eski adıyla Kantu)**

Arayüzü ve çalışma mantığı itibarıyla iMacros'a en yakın açık kaynaklı (Open-Source) alternatif olan UI.Vision, bizzat iMacros'un ilk yaratıcısı tarafından geliştirilmiştir1. Kullanıcı topluluğunun iMacros'tan UI.Vision'a geçerken kodları nasıl çevirdiklerine (convert) dair yoğun bilgi paylaşımı, göç sürecinin dinamiklerini ortaya koymaktadır22.

| iMacros (Eski Komut) | UI.Vision RPA (Yeni Karşılık) | Geçişin (Migration) Avantajları / Analizi |
| :---- | :---- | :---- |
| SAVEITEM | storeImage veya sağ tık otomasyonu49 | Görüntü kaydetme işleminin Selenium IDE standardında daha stabil gerçekleştirilmesi. |
| TAG POS=... EXTRACT=TXT | storeText \+ \!csvline \+ csvSave \[cite: 23\] | Elde edilen verinin doğrudan dinamik değişkenlere ve CSV formatına anlık olarak dökülebilmesi. |
| TAG POS=R-1 ... (Relative) | XPath ve Axes Kullanımı48 | Göreceli konumlandırma yerine evrensel XPath standartlarına geçişle dinamik elementlerin kesin tespiti. |
| \!ERRORIGNORE \+ \!TIMEOUT\_STEP | store veya executeScript \-\> \!errorIgnore \[cite: 50, 51\] | String ve Boolean veri tiplerinin doğru bir şekilde işlenerek hata kontrolünün tam anlamıyla yapılabilmesi. |

UI.Vision, iMacros'un eksik olan Görüntü İşleme, OCR ve modern Selenium komutlarını karşılarken21, ücretsiz sürümündeki günlük 25 XClick/XType komut sınırı nedeniyle bazı kullanıcılar tarafından eleştirilmektedir45. Ancak bu limitlere rağmen, Chrome'un V86 güncellemelerindeki arka plan kısma (background throttling) sorunlarını atlatabilmesi onu ön plana çıkarmaktadır53.

### **Kodsuz, Yapay Zeka Odaklı ve Bulut Tabanlı Çözümler: Axiom.ai, Bardeen ve Fill Hero**

Geleneksel tarayıcı eklentisi mantığının çöküşünü gören geliştiriciler, işlemleri buluta taşıyarak veya yapay zeka entegrasyonu ile (AI-powered) kod yazma ihtiyacını ortadan kaldırarak yeni bir yönelim yaratmıştır37.

* **Axiom.ai:** Makroların görsel yapı taşlarıyla oluşturulduğu, DOM elementlerini değil görevleri tanımlamaya odaklanan bu araç, iMacros'un bıraktığı boşluğu hedefleyen modern bir alternatif olarak öne çıkmaktadır. API etkileşimleri, webhook entegrasyonları ve Claude AI destekli kod üretim modülleri barındırmaktadır7.
* **Fill Hero:** iMacros veya Selenium gibi belirli form yapıları için komut (script) yazılması gereken araçların aksine, AI kullanarak karşısına çıkan herhangi bir formu (React, Angular vb.) anında anlayıp doldurabilen "sıfır yapılandırma" (zero configuration) prensibiyle çalışan bir yaklaşımdır19.

### **Uzmanlaşmış Test Çerçeveleri (Frameworks): Selenium, Puppeteer ve Cypress**

Daha büyük kurumsal ölçekte regresyon testleri ve performans testleri için kurumlar iMacros'u terk ederek doğrudan geliştirici tabanlı araçlara yönelmiştir.

* **Selenium WebDriver:** Tarayıcıyı dışarıdan bir API ile kontrol ederek Manifest V3 veya iç uzantı güvenlik engellerini (sandbox) tamamen aşar15. Çoklu dil desteği (Java, Python, C\#), paralel test yürütme (Grid) ve Jenkins entegrasyonu sunar54.
* **Puppeteer / Cypress:** Google tarafından geliştirilen Puppeteer, Chrome DevTools protokolü üzerinden "Headless" (kullanıcı arayüzü olmadan) çalışarak muazzam bir hız sağlar15. Cypress ise otomatik bekleme (auto-wait) ve anlık ekran görüntüsü/video kayıt (snapshots) yetenekleriyle iMacros'un zaman aşımı (timeout) sorunlarını tamamen tarihe gömmüştür54. Telerik Test Studio ise ücretli bir kurumsal alternatif olarak kodsuz kayıt ve Veri Odaklı (Data-Driven) test imkanı sunmaktadır42.

## **Analitik Çıkarımlar ve Sonuç**

iMacros'un yükselişi ve nihai çöküşü, yazılım endüstrisinde teknolojik borcun (technical debt) biriktirilmesinin ve kullanıcı geri bildirimlerinin göz ardı edilmesinin nasıl ölümcül sonuçlar doğurabileceğine dair kusursuz bir vaka çalışmasıdır. Verilerden elde edilen temel analiz sonuçları şunlardır:

1. **Tarayıcı Uzantısı Tabanlı Otomasyon Paradigmasının Sonu:** Google'ın Manifest V3 hamlesi, arka planda ağır algoritmik işlemler yapan eklentilerin devrini kapatmıştır9. iMacros'un çöküşü, profesyonel web otomasyonunun tarayıcıya bağımlı eklentilerle (extension) değil; WebDriver, işletim sistemi düzeyinde masaüstü RPA (Power Automate vb.) veya doğrudan bulut API'leri üzerinden yapılması gerektiğini kanıtlamıştır.
2. **Statik Element Seçiminin Modası Geçmiştir:** React ve Angular gibi dinamik SPA'ların (Single Page Applications) yaygınlaşması, iMacros'un sabit TAG mantığını işlevsiz kılmıştır19. Günümüzün otomasyon ekosisteminde XPath, CSS Seçicileri, OCR ve Yapay Zeka tabanlı görsel tanıma sistemleri (Computer Vision) birer lüks değil, temel zorunluluktur15.
3. **Kapalı Kaynak Kodlu Mülki Yazılımlara (Proprietary) Olan Güvenin Zedeenmesi:** Yüksek lisans ücretleri ödeyen kurumsal müşterilerin ürünün sonlandırılmasıyla ortada bırakılması ve kaynak kodun topluluğa açılması (open-source) yönündeki taleplerin reddedilmesi6, sektörde kapalı kaynak araçlara olan güveni kırmıştır. CyberArk örneğinde görüldüğü gibi, basit bir kayıt defteri lisans denetiminin tüm güvenlik altyapısını çökertmesi33, modern işletmelerin esnek olmayan mimarilerden hızla uzaklaştığını göstermektedir.
4. **No-Code (Kodsuz) Mantığının Sınırları ve İhtiyacı:** Kullanıcılar iMacros'un basitliğini sevmiş, ancak mantıksal karar verme (if/else), esnek döngüler (loops) ve gelişmiş değişken (variable/array) yönetiminin yokluğunda tıkanmışlardır18. "Kod bilmeden otomasyon" vaadi, Axiom.ai veya Fill Hero gibi yapay zeka modellerinin (AI/LLM) doğal dille talimat alabilme yeteneği kazanmasıyla ancak bugün gerçek anlamına ulaşabilmektedir11.

Sonuç olarak; iMacros, iki on yıl boyunca web veri çekme ve otomasyonunun kurallarını belirleyen bir mihenk taşı olmuştur1. Ancak değişen web mimarisine adaptasyon sağlayamaması, esneklikten yoksun betik dili, zayıf hata yakalama (\!ERRORIGNORE) algoritmaları ve müşteri odaklılıktan uzak lisanslama politikaları nedeniyle kendi sonunu hazırlamıştır20. Günümüzde güvenilir ve sürdürülebilir web otomasyonu stratejileri kurgulayan kurumların, iMacros'un düştüğü teknolojik hatalardan ders çıkararak; yapay zeka destekli, tarayıcı kısıtlamalarından bağımsız, API entegrasyonlarına açık (CAPTCHA çözücüler vb.) ve modüler mantıksal çerçevelere sahip modern RPA platformlarına yatırım yapması kritik bir zorunluluktur.

#### **Works cited**

1. iMacros \- Wikipedia, [https://en.wikipedia.org/wiki/IMacros](https://en.wikipedia.org/wiki/IMacros)
2. iMacros: Web Automation & Scripting Tool | PDF | Computing \- Scribd, [https://www.scribd.com/document/660421535/IMacros](https://www.scribd.com/document/660421535/IMacros)
3. Progress iMacros | IpswitchWorks.com, [https://www.ipswitchworks.com/imacros.asp](https://www.ipswitchworks.com/imacros.asp)
4. Who is Fiddling with Prices?: Building and Deploying a Watchdog Service for E-commerce, [https://www.researchgate.net/publication/318915407\_Who\_is\_Fiddling\_with\_Prices\_Building\_and\_Deploying\_a\_Watchdog\_Service\_for\_E-commerce](https://www.researchgate.net/publication/318915407_Who_is_Fiddling_with_Prices_Building_and_Deploying_a_Watchdog_Service_for_E-commerce)
5. iMacros Updates on Purchasing New Licenses \- Progress Community, [https://community.progress.com/s/question/0D54Q00009wwb2fSAA/imacros-updates-on-purchasing-new-licenses](https://community.progress.com/s/question/0D54Q00009wwb2fSAA/imacros-updates-on-purchasing-new-licenses)
6. Important Progress iMacros Product Update, [https://community.progress.com/s/question/0D54Q00009tXmG6SAK/important-progress-imacros-product-update](https://community.progress.com/s/question/0D54Q00009tXmG6SAK/important-progress-imacros-product-update)
7. Saying goodbye to iMacros : r/axiom\_ai \- Reddit, [https://www.reddit.com/r/axiom\_ai/comments/1j8p302/saying\_goodbye\_to\_imacros/](https://www.reddit.com/r/axiom_ai/comments/1j8p302/saying_goodbye_to_imacros/)
8. Imacros Alternative For Chrome Jun 2026, [http://3.27.170.36/seeking-pasture/crest/imacros-alternative-for-chrome](http://3.27.170.36/seeking-pasture/crest/imacros-alternative-for-chrome)
9. Looking for iMacros extension alternatives for Google Chrome's browser since in June 2024 they will update to manifest 3.0 and iMacros is with manifest 2.0 is no longer supported to be updated? \- Reddit, [https://www.reddit.com/r/webdev/comments/1axd7jc/looking\_for\_imacros\_extension\_alternatives\_for/](https://www.reddit.com/r/webdev/comments/1axd7jc/looking_for_imacros_extension_alternatives_for/)
10. iMacros add-on alternative for Google Chrome's browser since in June 2024 they will update to Manifest 3.0 and (and iMacros with manigest 2.0 is no longer supported to be updated)? \- Reddit, [https://www.reddit.com/r/chrome/comments/1awt0dz/imacros\_addon\_alternative\_for\_google\_chromes/](https://www.reddit.com/r/chrome/comments/1awt0dz/imacros_addon_alternative_for_google_chromes/)
11. Browser macro recorder and iMacros alternative \- Axiom.ai, [https://axiom.ai/automate/like-a-macro-recorder/](https://axiom.ai/automate/like-a-macro-recorder/)
12. iMacros version 8.9.7 not working anymore on FF 48 \[closed\] \- Stack Overflow, [https://stackoverflow.com/questions/79514448/imacros-version-8-9-7-not-working-anymore-on-ff-48](https://stackoverflow.com/questions/79514448/imacros-version-8-9-7-not-working-anymore-on-ff-48)
13. Alternative to iMacros? : r/firefox \- Reddit, [https://www.reddit.com/r/firefox/comments/7mzfk4/alternative\_to\_imacros/](https://www.reddit.com/r/firefox/comments/7mzfk4/alternative_to_imacros/)
14. How to Use the Imacros Auto Follow Shopee Malaysia? \- Ginee, [https://ginee.com/my/insights/imacros-auto-follow-shopee/](https://ginee.com/my/insights/imacros-auto-follow-shopee/)
15. Best iMacros Alternatives \- UI.Vision, [https://ui.vision/blog/imacros-alternatives/](https://ui.vision/blog/imacros-alternatives/)
16. How to force Chrome to save passwords on self-signed or broken SSL? \- Super User, [https://superuser.com/questions/1241132/how-to-force-chrome-to-save-passwords-on-self-signed-or-broken-ssl](https://superuser.com/questions/1241132/how-to-force-chrome-to-save-passwords-on-self-signed-or-broken-ssl)
17. Currents of Change: IMacros Kiev: A Comprehensive Guide, [https://wrasse.plymouth.ac.uk/ac-news/imacros-kiev-a-comprehensive-guide-1764798686](https://wrasse.plymouth.ac.uk/ac-news/imacros-kiev-a-comprehensive-guide-1764798686)
18. How to use Array Loop in iMacros? \- Stack Overflow, [https://stackoverflow.com/questions/52672376/how-to-use-array-loop-in-imacros](https://stackoverflow.com/questions/52672376/how-to-use-array-loop-in-imacros)
19. AI Form Automation — Fill Any Web Form Automatically \- Fill Hero, [https://fillhero.com/autofill/form-automation](https://fillhero.com/autofill/form-automation)
20. How do I abort when value is present in iMacro? \- Stack Overflow, [https://stackoverflow.com/questions/44013633/how-do-i-abort-when-value-is-present-in-imacro](https://stackoverflow.com/questions/44013633/how-do-i-abort-when-value-is-present-in-imacro)
21. Exploring Automation Tools: Glasp, UI.Vision/Kantu, and iMacros | Glasp, [https://glasp.co/hatch/57iv7qNkN2fVEnibn5IgvAOeE3S2/p/zRUT4DeY2zmO44We2v2N](https://glasp.co/hatch/57iv7qNkN2fVEnibn5IgvAOeE3S2/p/zRUT4DeY2zmO44We2v2N)
22. Converting iMacros to UIVision \- HowTo \- Ui.Vision, AI & OCR Community Forums, [https://forum.ui.vision/t/converting-imacros-to-uivision/11609](https://forum.ui.vision/t/converting-imacros-to-uivision/11609)
23. Converting from IMacros to UIVision \- Ui.Vision, [https://forum.ui.vision/t/converting-from-imacros-to-uivision/14276](https://forum.ui.vision/t/converting-from-imacros-to-uivision/14276)
24. There is a solution to write scripts for FireFox \- Ask for Help \- AutoHotkey, [https://www.autohotkey.com/board/topic/49036-there-is-a-solution-to-write-scripts-for-firefox/](https://www.autohotkey.com/board/topic/49036-there-is-a-solution-to-write-scripts-for-firefox/)
25. IF Statements and Conditions for iMacros Firefox \- Stack Overflow, [https://stackoverflow.com/questions/18835745/if-statements-and-conditions-for-imacros-firefox](https://stackoverflow.com/questions/18835745/if-statements-and-conditions-for-imacros-firefox)
26. need help for If else staement in Imacro \- Stack Overflow, [https://stackoverflow.com/questions/41589361/need-help-for-if-else-staement-in-imacro](https://stackoverflow.com/questions/41589361/need-help-for-if-else-staement-in-imacro)
27. How to restart CSV with iMacros \- Infinite loop? \- Stack Overflow, [https://stackoverflow.com/questions/57155153/how-to-restart-csv-with-imacros-infinite-loop](https://stackoverflow.com/questions/57155153/how-to-restart-csv-with-imacros-infinite-loop)
28. iMacros Tag Line properties \- Stack Overflow, [https://stackoverflow.com/questions/51847638/imacros-tag-line-properties](https://stackoverflow.com/questions/51847638/imacros-tag-line-properties)
29. Convert iMacros script into another free automation tool like Kantu or Selenium?, [https://stackoverflow.com/questions/55212324/convert-imacros-script-into-another-free-automation-tool-like-kantu-or-selenium](https://stackoverflow.com/questions/55212324/convert-imacros-script-into-another-free-automation-tool-like-kantu-or-selenium)
30. Common iMacro Errors \- CyberArk, [https://community.cyberark.com/s/article/00004230](https://community.cyberark.com/s/article/00004230)
31. iMacros for Chrome \!Timeout\_Step 0 not working \- Progress Community, [https://community.progress.com/s/question/0D54Q0000AWC3IPSQ1/imacros-for-chrome-timeoutstep-0-not-working](https://community.progress.com/s/question/0D54Q0000AWC3IPSQ1/imacros-for-chrome-timeoutstep-0-not-working)
32. 12.1.7 Release notes | Idira Docs \- CyberArk Docs, [https://docs.cyberark.com/privilege-cloud-shared-services/latest/en/content/privilege%20cloud/privcloud-rns-2022-v12.1.7.htm](https://docs.cyberark.com/privilege-cloud-shared-services/latest/en/content/privilege%20cloud/privcloud-rns-2022-v12.1.7.htm)
33. iMacros does not work after hardening \- CyberArk, [https://community.cyberark.com/s/article/iMacros-does-not-work-after-hardening](https://community.cyberark.com/s/article/iMacros-does-not-work-after-hardening)
34. Creating Multiple Assignments in Canvas at the Same Time Using iMacros, [https://community.instructure.com/en/discussion/266289/creating-multiple-assignments-in-canvas-at-the-same-time-using-imacros](https://community.instructure.com/en/discussion/266289/creating-multiple-assignments-in-canvas-at-the-same-time-using-imacros)
35. Using iMacros to Expedite ASM Policy Traffic Learning \- DevCentral, [https://community.f5.com/discussions/technicalforum/using-imacros-to-expedite-asm-policy-traffic-learning/130616](https://community.f5.com/discussions/technicalforum/using-imacros-to-expedite-asm-policy-traffic-learning/130616)
36. Imacros Script for Lazada Flash Sales | PDF \- Scribd, [https://www.scribd.com/document/387041671/Script-Imacros-Flash-Sale-Lazada](https://www.scribd.com/document/387041671/Script-Imacros-Flash-Sale-Lazada)
37. Automatic Sweepstakes Entry Software | Expert Picks 2026 \- WifiTalents, [https://wifitalents.com/best/automatic-sweepstakes-entry-software/](https://wifitalents.com/best/automatic-sweepstakes-entry-software/)
38. Top 10 Best Automatic Sweepstakes Entry Software of | 2026 \- ZipDo, [https://zipdo.co/best/automatic-sweepstakes-entry-software/](https://zipdo.co/best/automatic-sweepstakes-entry-software/)
39. Review: IPSwitch iMacros \- Review Central Middle East, [https://reviewcentralme.com/2014/09/01/review-ipswitch-imacros/](https://reviewcentralme.com/2014/09/01/review-ipswitch-imacros/)
40. Automating and Scraping Like a Growth Hacker | by Julien Le Coupanec \- Medium, [https://medium.com/hackisition/automating-and-scraping-like-a-growth-hacker-d48863a5d42a](https://medium.com/hackisition/automating-and-scraping-like-a-growth-hacker-d48863a5d42a)
41. A Message to the iMacros Community: Have You Heard of Telerik Test Studio?, [https://community.progress.com/s/question/0D54Q0000A6O6BTSQ0/a-message-to-the-imacros-community-have-you-heard-of-telerik-test-studio](https://community.progress.com/s/question/0D54Q0000A6O6BTSQ0/a-message-to-the-imacros-community-have-you-heard-of-telerik-test-studio)
42. iMacros Automation Scripting with Test Studio \- Telerik.com, [https://www.telerik.com/blogs/imacros-automation-scripting-test-studio](https://www.telerik.com/blogs/imacros-automation-scripting-test-studio)
43. Anti-Captcha vs. BypassCaptcha.com Comparison \- SourceForge, [https://sourceforge.net/software/compare/Anti-Captcha-vs-BypassCaptcha.com/](https://sourceforge.net/software/compare/Anti-Captcha-vs-BypassCaptcha.com/)
44. Comparison of CAPTCHA‑Solving Services: A Peek Under the Hood and a Look at the Numbers | by Kentavr | Medium, [https://medium.com/@kentavr00000009/comparison-of-captcha-solving-services-a-peek-under-the-hood-and-a-look-at-the-numbers-9b3ecc04e07d](https://medium.com/@kentavr00000009/comparison-of-captcha-solving-services-a-peek-under-the-hood-and-a-look-at-the-numbers-9b3ecc04e07d)
45. Limit of 25 XClick / XType / XMove commands for free Users of Kantu \- UI.Vision forums, [https://forum.ui.vision/t/limit-of-25-xclick-xtype-xmove-commands-for-free-users-of-kantu/2191](https://forum.ui.vision/t/limit-of-25-xclick-xtype-xmove-commands-for-free-users-of-kantu/2191)
46. \[Feature Request\] Permanent Highlighting \- UI.Vision forums, [https://forum.ui.vision/t/feature-request-permanent-highlighting/4858](https://forum.ui.vision/t/feature-request-permanent-highlighting/4858)
47. Reviews for SiteMacro – Add-ons for Firefox (en-US), [https://addons.mozilla.org/en-US/firefox/addon/sitemacro/reviews/](https://addons.mozilla.org/en-US/firefox/addon/sitemacro/reviews/)
48. Imacros to ui vision, [https://forum.ui.vision/t/imacros-to-ui-vision/14213](https://forum.ui.vision/t/imacros-to-ui-vision/14213)
49. Starting to convert our imacros macros collection \- HowTo \- UI.Vision forums, [https://forum.ui.vision/t/starting-to-convert-our-imacros-macros-collection/11442](https://forum.ui.vision/t/starting-to-convert-our-imacros-macros-collection/11442)
50. Simple script from imacros \- General Discussion \- Ui.Vision, AI & OCR Community Forums, [https://forum.ui.vision/t/simple-script-from-imacros/12169](https://forum.ui.vision/t/simple-script-from-imacros/12169)
51. Doc Bug? Use store or executeScript to set value of \!ErrorIgnore \- UI.Vision forums, [https://forum.ui.vision/t/doc-bug-use-store-or-executescript-to-set-value-of-errorignore/4226](https://forum.ui.vision/t/doc-bug-use-store-or-executescript-to-set-value-of-errorignore/4226)
52. Selenium IDE rises like a phoenix from the ashes \- UI Vision, [https://ui.vision/blog/selenium-ide-2018/](https://ui.vision/blog/selenium-ide-2018/)
53. UIV as iMacros alternative: Can UI.Vision RPA run as fast as iMacros 8.9.7? \- Ui.Vision, [https://forum.ui.vision/t/uiv-as-imacros-alternative-can-ui-vision-rpa-run-as-fast-as-imacros-8-9-7/6338](https://forum.ui.vision/t/uiv-as-imacros-alternative-can-ui-vision-rpa-run-as-fast-as-imacros-8-9-7/6338)
54. 10 Best iMacros Alternatives in 2026 \- Guru99, [https://www.guru99.com/imacros-alternative.html](https://www.guru99.com/imacros-alternative.html)
55. Compare TestProject vs. iMacros \- G2, [https://www.g2.com/compare/testproject-vs-imacros](https://www.g2.com/compare/testproject-vs-imacros)
56. Compare Test Studio vs. iMacros \- G2, [https://www.g2.com/compare/telerik-test-studio-vs-imacros](https://www.g2.com/compare/telerik-test-studio-vs-imacros)