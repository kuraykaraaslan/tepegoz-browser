# Özet (Executive Summary)

Tarayıcı parmakizi, ziyaret edilen sitelerin kullanıcının tarayıcı ve cihaz ayarlarından benzersiz bir imza oluşturmasına dayanır. EFF verilerine göre, **tarayıcıların %94’ü benzersiz şekilde tanımlanabilir** hale gelmiş durumdadır. Parmakizi bileşenlerinin birleşimi genellikle 20-30 bit’in üzerinde bilgi içerir, bu da milyarlarca farklı kombinasyon anlamına gelir. Bu rapor, ağ seviyesinden (IP, TLS el sıkışması) tarayıcı API’lerine (Canvas, WebGL, donanım bilgileri, sensörler vb.) kadar kapsamlı bir parmakizi envanteri sunar. Her bileşen için tespit yöntemleri (JS örnekleri, HTTP/TLS komutları), tahmini entropi değeri, benzersizlik etkisi ve azaltım kolaylığı tartışılmıştır. Ek olarak, her bileşene yönelik somut azaltım stratejileri (bloklama, değer standartlaştırma/sahteleme, izin isteme, API kaldırma, gürültü ekleme, depolama bölümlendirme vb.) önerilmiştir. Mimari bazda uygulanabilecek değişiklikler (API düzeyinde kanca kullanımı, yamalar, testler) ile gizliliği artıran tasarım desenleri (Tor/Brave yaklaşımları, site izolasyonu, ağ önlemleri) detaylandırılmıştır. Son olarak, öncelikli azaltımlar için bir yol haritası tablolaştırılmış, test kontrol listesi ve araçlar (EFF Panopticlick, AmIUnique vb.) ile örnek sonuç yorumlama yöntemleri sunulmuştur. Kaynakların güncel, birincil (EFF, akademik makaleler, Mozilla/Chromium belgeleri, W3C kılavuzları) olmasına özen gösterilmiştir.

## Parmakizleme Bileşenleri ve Tespit Yöntemleri

Tarayıcı parmakizi, pasif (HTTP/TLS istekleri) ve aktif (JavaScript/uygulama kodu) yollarla elde edilebilen çok sayıda özelliğin birleşimidir. Aşağıda bu bileşenler kategoriler halinde verilmiştir. Her özellik için tespit yöntemi, örnek kod/komut, (mevcutsa) entropi tahmini, benzersizlik ve koruma zorluğu kısaca açıklanacaktır.

- **Ağ ve TLS Özellikleri:** 
  - **IP Adresi:** Sunucu tarafından görülen istemci IP’si. IPv4/IPv6 adresleri oldukça tanımlayıcıdır. Örneğin `curl ifconfig.me` komutu IP’yi döndürür. IP adresinin güvenilirliği yüksek olup tarayıcıdan bağımsızdır (sadece ağ bağlatısı değiştirilebilir). Korunma: VPN/proxy kullanımı, ancak bunlar da kendi parmakizlerini oluşturabilir.
  - **TLS Müzakere Parmakizi (JA3/JA3S):** İstemcinin **TLS ClientHello** paketindeki şifre takımları ve uzantılar kümesiyle hash oluşturulur. Örnek: `openssl s_client -connect example.com:443` ile ClientHello yakalanıp alanlar MD5 ile özetlenebilir. Entropisi yüksektir; Tor istemcisi JA3 = `e7d705...` gibi sabit bir imza üretir. Koruma: Tarayıcıda TLS kütüphanelerini görece standart hale getirmek veya her oturumda rastgele JA3 kullanmak gerekir.
  - **TCP/IP Tanıtımı:** TCP zaman damgaları, başlık desenleri gibi pasif parmakizler. Örneğin, *p0f* aracı TCP/IP seviyesinde işletim sistemi ve sistem zamanı gibi bilgileri çıkarır. Bunlar tipik olarak tarayıcı düzeyinde engellenemez.

- **HTTP Başlıkları:** 
  - **User-Agent:** Tarayıcı ve işletim sistemi bilgisi içeren başlık. Tespiti basit: `navigator.userAgent` JS ile elde edilebilir. Kullanımı yaygındır (Acar’ın çalışması liste, en yüksek entropili öğelerden biri olarak belirtmiştir). Kolaylıkla taklit edilebilir ama taklit edenler de aykırı duruma düşebilir. 
  - **Accept ve Accept-Language:** Tarayıcının kabul ettiği veri türleri ve dil tercihleri. Örneğin `fetch` isteğinin yanıt başlıklarında görülür veya `navigator.language`/`navigator.languages` ile alınır. Dil (`en-US` vb.) düşük entropiye sahiptir, ancak benzersiz kombinasyonlar oluşturabilir. Mozilla, tarayıcıda daha genel bir dil seti kullanmayı öneriyor. 
  - **DNT, Sec-Fetch, Referer:** Gizlilik için tasarlanmış olsa da parmakiz oluşturabilecek ek başlıklar. Örneğin `DNT:1` kullanan çok az kullanıcı olunca ayırt edici olabilir. Koruma: Bu başlıkları toplu olarak kapatmak veya standart değerler döndürmek.
  - **Cookie ve Diğer Durum:** Çerezler pasif takip için kullanılır. ETag/If-None-Match başlıkları, cache metadata olarak benzersiz kimlik bırakabilir (örn. etiketli kaynaklar). Örnek: `curl -I` komutu ile sunucunun ETag/Last-Modified header’larına bakılabilir. Koruma: ETag takibi için `no-cache` politikası veya her site için farklı profil.

- **Tarayıcı Nesneleri (Navigator vs. diğ.):** 
  - **navigator.platform, vendor, appVersion, product, doNotTrack, cookieEnabled, language:** JS ile `navigator` alt özellikleri şeklinde okunur. Tarihsel olarak `platform` ve `vendor` işletim sistemine işaret eder, `doNotTrack` ayarı etkinlik hakkında ipucu verir. Entropisi moderate (özellikle nadir sistemlerde). Koruma: Tor/Firefox, `navigator` bilgilerini standartlaştırarak (ör. `navigator.platform="Linux x86_64"` gibi sabit değerler) parmakiz yüzeyini daraltır. 

- **Grafik API’leri (Canvas, WebGL, DOM Resimleri):** 
  - **Canvas:** HTML5 Canvas ile çizilen görüntünün pixel verisi donanım ve sürücü farkları nedeniyle değişir. Örneğin:
    ```js
    let c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = "14px 'Arial'"; ctx.textBaseline = "top";
    ctx.fillStyle = "#f60"; ctx.fillRect(125,1,62,20);
    ctx.fillStyle = "#069"; ctx.fillText("Test", 2, 15);
    let sig = c.toDataURL(); // Canvas fingerprint
    ```
    Bu yöntem genellikle MD5/CRC hash ile imzalanır. Entropisi yüksektir; Acar çalışması da yaygın kullanıldığını gösterir (neredeyse tüm parmakizciler canvas sorar). Kolay mitigasyon: API’yi devre dışı bırakmak veya rastgeleleştirmek. Örneğin Firefox, canvas çıktılarına rastgele gürültü ekleyebilir; Tor ise gerçek uçlar yerine sabit boş görüntü döndürür.
  - **WebGL:** WebGL bağlamı ile GPU bilgisi alınabilir. Örnek kod:
    ```js
    let c = document.createElement('canvas'), gl = c.getContext('webgl');
    let vendor = gl.getParameter(gl.VENDOR), renderer = gl.getParameter(gl.RENDERER);
    ```
    Ayrıca `gl.getParameter` ile uzantılar, maksimum çözünürlükler vb. çıkarılabilir. Özgüllüğü yüksektir. Korumada tarayıcıda WebGL’i tamamen kapatmak veya `UNMASKED_VENDOR_WEBGL` vb. bilgileri sansürlemek mümkündür; örneğin Chrome'da `--disable-webgl` bayrağı kullanılabilir. Firefox’tan itibaren bazı debug özellikleri (e.g. `webgl.sanitize-unmasked-renderer`) sunulur.
  - **DOM Resimleri (SVG/Canvas):** `<canvas>` dışında `<image>` veya `<video>` öğeleriyle CSS görüntü işleme bilgileri de sızabilir. Örneğin CSS `transform: none;` ile DOM genişlik bilgisi ölçümü (CanvasBlocker’da DOMRect blokajı).

- **Yazı Tipleri (Fonts):** 
  - **Yüklü Fontlar:** JS/CSS kullanarak sistemde yüklü fontlar keşfedilebilir. Örneğin Lalit Patel font algılama tekniği (CSS ile gizli `<span>` kullanarak fark ölçer). Otomatik deneme/yanılma (`font-family` listesinden deneme) yolu da kullanılır. Entropisi çok yüksektir (200-500 font içeren sistemler). Kolay mitigasyon: Tarayıcıya sadece belirli bir font listesi göstererek beyaz listeye alma. Tor, işletim sistemine göre sabit font listeleri kullanır ve kalanları yok sayar. Ayrıca font sorgu sayısını sınırlamak da bir tekniktir (ör. site başına azami N sorgu).
  - **Font Ölçüleri (Metrics):** Fontların gliflerinin boyutları sistemden sisteme küçük farklılıklar gösterir. Örneğin Elevenster & Egelman gösterdi ki glif kutuları ölçülerek parmakiz yapılabilir. Yine korumada Whitelist veya ölçü sonuçlarını bulanıklaştırma stratejileri (rastgele yükseklik/satır aralığı ayarı gibi) kullanılabilir.

- **Medya API’leri:** 
  - **Ses (AudioContext):** Web Audio API ile ses işleme zincirinden alınan işlenmiş sinyal farklılıkları tanımlayıcıdır. Örnek: bir osilatör çalıştırıp `AnalyserNode` çıktısı veya `getChannelData` ölçümü alınabilir. Entropisi yüksek sayılmaz, ama Canvas gibi desteklenir. Mitigasyon: AudioContext’ı engellemek veya rastgele gürültü eklemek (CanvasBlocker gibi eklentiler canvas/Audio kancalar). 
  - **Kamera/Mikrofon (MediaDevices):** `navigator.mediaDevices.enumerateDevices()` ile bağlı kamera/mikrofon listesi elde edilir. Her cihazın benzersiz ID’si (Permissions istemiyorsa) veya etiketleri gizlilik risklidir. Örneğin:
    ```js
    navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    navigator.mediaDevices.enumerateDevices().then(devices => console.log(devices));
    ```
    Genellikle izin istemez ama enumerate aşamasında izin soruşturulabilir. Koruma: Cihaz listesine erişim için kullanıcı onayı veya tarayıcı sınırlandırması (örneğin id’leri rastgeleleştirme) getirilebilir.

- **Donanım ve Sistem Bilgileri:** 
  - **Ekran (Screen):** `screen.width`, `screen.height`, `colorDepth`, `pixelDepth` gibi özellikler kolayca elde edilir. Bunlar yüksek entropili sayılabilir (benzersiz çözünürlükler). Firefox bu değerleri birkaç yaygın boyuta sabitleyebilir. Tor Browser’da ekran pikselleri (pixel ratio) sabit değerdedir. Korumada bu değerler yuvarlanabilir veya sayısı azaltılabilir (örneğin pencere boyutu bloklama).
  - **Cihaz Belleği:** `navigator.deviceMemory` (GB cinsinden RAM) ve `navigator.hardwareConcurrency` (mantıksal çekirdek sayısı) sistem konfigürasyonu hakkında bilgi verir. Örnek: 4, 8, 16 GB gibi. Bireysel entropisi düşük (kısıtlı değerler), ama diğer donanım verileriyle birleştirildiğinde etkili olur. Mitigasyon: Belleği “orta” bir değere sabitleme veya tamamen gizleme (Heroku, Brave gibi bazı tarayıcılar halihazırda kısıtlama getiriyor). 
  - **GPU Bilgisi:** WebGL dışında `navigator.gpu` (WebGPU API) da gelecek parmakizlere yol açabilir. Mevcut bir standart olmadığı için kısıtlanması önerilir.
  - **Pil (Battery API):** `navigator.getBattery()` ile batarya seviyesi ve şarj durumu elde edilir. Bu değerler zaman içinde değiştiğinden sabit fingerprint sağlamaz ama belirli cihaz bilgisi sızdırabilir. Pek çok tarayıcıda bu API kapatılabilir veya tek tip sabit değer döndürebilir (örneğin Tor “constant full” döndürüyor). CanvasBlocker listesinde batarya API engellenmiş görünüyor.
  - **FPS ve Grafik Performansı:** Bazı saldırılar `requestAnimationFrame` aralıklarını ölçerek cihazın GPU/ekran performansı üzerinden tahmin yapar. Tarayıcı hızını standartlara çekmek (raflimiti 30 fps gibi) azaltabilir.

- **Giriş ve Sensörler:** 
  - **Dokunmatik ve Kalem Desteği:** `navigator.maxTouchPoints`, `matchMedia("(pointer: coarse)")` gibi API’lerle cihaz tipi (dokunmatik/keskin) anlaşılabilir. Örneğin `navigator.maxTouchPoints>0` mobil demektir. Düşük entropi ama dâhili veri. Koruma: Tüm cihazlarda tek değer döndürme veya API’yi kaldırma.
  - **Kalıbı/Ağırlığı Ölçümler (Pointer Events):** CSS ile `window.matchMedia("(any-pointer: fine)")` gibi sorgular da parmakiz oluşturabilir. Çoğunlukla düşük risk, ama bilinçli olarak hepsini “none” yapabilir.
  - **Hareket/Gyro/Ortam Sensörleri:** `DeviceOrientationEvent` (`ondeviceorientation`) gibi olaylarla döndürme ekseni, ivme ölçer gibi sensör verileri alınabilir. Normal cihazda bu değerler rastlantısal değildir ve kişiye özgü kalıplar içerebilir. Örneğin sarsıntı ve titreşim farklılıkları. Koruma: Bu API’lere izin istemek veya tamamen devre dışı bırakmak.
  - **Konum (Geolocation):** Kullanıcı onayı olmadan verilemediğinden, harici IP üzerinden kaba konum alınır. Tarayıcı içi olarak genellikle izin gerektirir.

- **Performans ve API Sorguları:** 
  - **CSS Medya ve Özellik Sorguları:** `matchMedia` ile dark/light mode, ortalama renk derinliği, çevre ışık seviyesi (ambient light) gibi sorgular yapılabilir. CSS destek sorguları (`CSS.supports`) ile uygulanabilirlik farkları ölçülebilir. Mitigasyon: bu sorguları rastgele yanıtlamak veya sadece geniş gruplar döndürmek.
  - **JavaScript Zamanlamaları:** `performance.now()`, `performance.timing`, `PerformanceObserver` ile işlem hızları ölçülür. `performance.now()` nanosaniye hassasiyetindedir, CPU hız farklarını ortaya çıkarır. Tarayıcılar taklit saldırılara karşı genellikle zaman hassasiyetini 1ms’ye düşürür. Örneğin Chrome’un yüksek çözünürlüklü zamanlayıcı hassasiyeti kısıtlanmıştır. Tarayıcınızda zamanlayıcı Precision Control kullanabilirsiniz.
  - **Ağ Zamanlama (E.g. Fetch):** Kaynak yükleme süresi, DNS zamanlamalarıyla tarayıcı veya cihazın konfigürasyonu tahmin edilebilir. Bu alan genellikle işletim sistemine ve ağ koşullarına dayanır, sınırlı düzeyde müdahale gerekir.

- **Depolama ve Önbellek:**
  - **Çerezler ve LocalStorage:** Tarayıcıda siteye özel olarak depolanan anahtar-değerler, scripten görülebilir. Tarayıcılar storage’ı izole ederek (örn. üçüncü tarafları engelleyerek) bazen kısmi koruma sağlar. Ancak bir site kendi gözetimindeki değerleri okur. Koruma: Bu API’leri tarayıcı tarafında site başına kısıtlamak veya her site için farklı profil (dep. bölümlendirme) sağlamak.
  - **IndexedDB, Cache API:** HTML5 depolama mekanizmalarında aynı kaynaktan erişilen veriler mevcuttur. İzolasyon için her-site-onlu db’ler kullanmak gerekebilir.
  - **ETag/Cache Takibi:** Sunucular ETag başlığıyla benzersiz id’ler bırakır. Örneğin bir PNG’yi tarayıcıya `Cache-Control: public` ile verip her istekte tekrar yükletip etmeme durumuna bakmak mümkün. Çözüm: ETag kullanımını sınırlamak veya her istemci yeniden yüklediğinde ID silmek.

- **Diğer:** 
  - **Servis Worker:** Bir web sitesinin Service Worker kayıtlı olup olmadığı (background script) tespit edilebilir. Bu daha çok siteyle ilişkilidir, sistematik parmakiz etkisi azdır.
  - **Yüklü Uygulamalar (Mobile Apps):** Mobilde `getInstalledRelatedApps()` ile kullanıcının hangi uygulamalardan ilişkilendirilmiş olduğunu öğrenebilir. Kapsamlı olmayan kısıtlı senaryolarda geçerlidir. Örneğin Telegram/WhatsApp gibi uygulamalar için.

Her bir bileşenin benzersiz kimlik katkısı (entropi) ölçümleri çalışmalara göre değişse de, genelde **fontlar, eklentiler, canvas, WebGL, ekran çözünürlüğü** gibi öğeler en yüksek değeri verir. Öte yandan **zaman dilimi, dil, renk derinliği** gibi öğeler nispeten düşük entropilidir. Bir bileşenin kalıcılığı (örneğin userAgent sürüm güncellemeyle değişir, ancak zaman dilimi büyük ölçüde sabit kalır) ve benzersizlik etkisi yukarıdaki faktörlere göre değerlendirilir.

## Her Bileşen için Korumayı Ayarlama Stratejileri

Yukarıdaki her bileşeni hedef alan çeşitli azaltım yöntemleri mevcuttur. Bunlar genellikle şu kategorilerde toplanabilir: *tamamen engelleme* (örneğin API çağrısını bloklama), *değerleri standartlaştırma veya sahteleme* (sabit veya rastgele değer döndürme), *izin isteme* (uygulama bazlı kullanıcı onayı), *API kaldırma* (tarayıcı seviyesinde özellik iptali), *gürültü ekleme* (salt ekleyerek izliliksizleştirme), *depolama bölümlendirme*, *kartvizit analojisi* (parmakizi karma modunda ele alma), vb. Her bir bileşen için aşağıdaki örnek stratejiler önerilebilir:

- **User-Agent ve HTTP Başlıkları:** 
  - *Spoofing/Standartlaştırma:* Tüm istemciler için ortak, geniş kullanılan bir UA değeri döndürmek. Örneğin kullanıcı gerçek Safari yerine “Chrome” olarak görünse bile, diğer değerleri (plugin/touch/ vs.) ona uygun ayarlamak gerekir. Aksi halde tuhaf kombinasyonlar kendi parmakizinizi arttırabilir. Brave, her site için farklı ancak tutarlı sahte UA değeri üreterek (farbling) izlemeyi zorlaştırır.
  - *İzin veya Profilleme:* Tarayıcı setting’lerinde Do Not Track gibi başlıkları ya kapatarak ya da düzelterek, çerez ve kaynak siyasetiyle sınırlama getirilebilir. Ayrıca VPN/proxy gibi araçlarla gerçek IP gizlenebilir; ancak bu yalnızca ağ tarafını etkiler. 
  - *Engelleme:* İlk/üçüncü parti ayrımına göre başlıklardan bazılarını gizlemek (örn. üçüncü parti yanıtlarında popüler listeler kullanarak Accept-Language’ı genel tutmak).

- **Canvas ve WebGL:** 
  - *Bloklama:* Canvas ve WebGL çağrılarını engellemek (API döndürücülerini boş değer ile değiştirmek). Örneğin Firefox’ta `privacy.resistFingerprinting=true` ayarı, Canvas okumalarını %33’e kadar rastgele bozar; CanvasBlocker eklentisi ise siyah/beyaz moda geçebilir. 
  - *Spoofing/Rastgeleleştirme:* Her site veya oturum için farklı ancak site içinde tutarlı değerler kullanmak (Brave’in “farbling” yaklaşımı). CanvasBlocker’ın “fake” modu, API’leri aktif bırakır ama sonuçları rastgele değiştirir. 
  - *Soru/Karşılaştırma:* Bazı tarayıcılar (ör. Tor Browser) Canvas’ı tamamen pasif duruma alır (boş resim döner). Diğerleri kullanıcı onayı ile çalıştırma yoluna gider. (Not: tam bloklama birçok web uygulamasını bozabilir.)
  - *Performans/trade-off:* Randomize edildiğinde görüntü kalitesi bozulabilir; bloklandığında interaktif grafik içerikleri çalışmayabilir.

- **WebRTC (Yerel IP):** 
  - *Engelleme veya Sansür:* Tarayıcıda WebRTC’nin yerel IP göstergesini devre dışı bırakmak (örneğin Chrome’la `chrome://flags#disable-webrtc`), veya ICE sunucular üzerinden sadece sanal IP göstermek. Alternatif olarak IP adresini VPN/tunnel üzerinden zorunlu yönlendirmek. WebRTC kapatmak bazı video/VOIP uygulamalarını kırabilir.
  - *İzin:* WebRTC ile IP raporlama isteyen sitelere izin gerektirecek şekilde tarayıcıyı ayarlamak. 
  - *Gürültü:* IP sızma tespiti için yanıltıcı RTC yanıtları (örneğin `pc.getUserMedia` yerine sabit cevap).
  
- **Fonts (Yazı Tipleri):** 
  - *Whitelist/Beyaz Liste:* Sadece belirli bir font listesinin görünür olmasını sağlamak (Tor Browser’da uygulandığı gibi). Diğer tüm sorgulara karşılık sabit sonuç döner. 
  - *Yazı Tipi Paketleme:* Tüm sistem fontlarını tarayıcı paketine ekleyip harici font kullanımını engellemek (Linux sürümlerinde `fonts.conf` ile bundling). 
  - *Sorgu Sınırı:* Bir siteye izin verilen font sorgu sayısını sınırlamak. Çok fazla sorgu yapılamazsa, tüm font listesi keşfedilemez.
  - *Karşı-Saldırı:* CSS `font-size` veya `font-style` ayarlarında küçük farklılıklar ekleyerek ölçümlerin anlamsızlaşması (gürültü ekleme). Ancak bu performansı etkileyebilir. 
  - *Trade-off:* Sistemde eksik font nedeniyle web sayfalarının görünümü bozulabilir.

- **Ses ve Diğer API’ler:** 
  - *AudioContext:* Engelleme (API’yı global `undefined` yapmak) veya kafa karıştırıcı sahteleme (rastgeleleştirme). Brave, Web Audio API çıktısını farbling’e tabi tutuyor. 
  - *Medya Cihazları:* İzin isteme (getUserMedia ile kullanıcıdan izin almak), ya da enumerateDevices çıktısını sabit bir genel liste ile değiştirmek (her site aynı fake cihazları görsün).
  - *Battery API:* Özelliği kaldırmak veya sabit döndürmek. Örneğin Tor, batarya değerini sürekli “doluluğu %100, şarjda” vererek parmakizini sıfırlar.

- **Ekran ve Donanım:** 
  - *Ekran çözünürlüğü:* Tarayıcı pencere/panel boyutunu katlanarak (örneğin 100px çokken 10px hapseden) raporlayarak (Firefox & Tor’da olduğu gibi). Rastgele ya da ortak boyutlara sabitlemek (örn. 1920x1080). Brave bu alanda “farklı site, farklı değer” stratejisi kullanabilir.
  - *DeviceMemory ve CPU:* Sabit veya yuvarlak değer (ör. 4 veya 8 GB; 4 veya 8 çekirdek) döndürmek. Aksi bir durumda, farklı bir cihazmış gibi görünür ve tutarsızlık oluşturabilir. 
  - *Donanım Gizleme:* `navigator.hardwareConcurrency`’yi mevcut olana göre değil, tarayıcı ayarında belirtilene göre değiştirmek. 

- **Depolama (Cookies, LocalStorage, vb.):** 
  - *Bölümlendirme (Partitioning):* Üçüncü parti cookie’leri ve site verilerini (localStorage, IndexedDB) etki alanına göre ayırmak. Böylece farklı site aynı kökten gelen veri paylaşamaz. Örneğin Safari’nin Intelligent Tracking Prevention (ITP) mekanizması ve Firefox’un “First-Party Isolation” ayarı buna örnektir.
  - *Silme/Limit:* Tarayıcı kapatıldığında otomatik temizleme, veya belirli bir siteye özgü yanıtla arka planda storage temizliği. 
  - *ETag/Cache:* Kaynakların ETag’lerini kanuni ID olarak değiştirmeyecek şekilde ayarlamak; `Cache-Control: no-cache` veya `Vary` başlıkları ekleyerek sunucu tabanlı tekrar denetim.
  - *Trade-off:* Çok agresif silme/periyodik güncelleme, offline çalışma deneyimini bozabilir.

- **Performans ve Diğer API’ler:** 
  - *Zaman ölçümleri:* `performance.now()` hassasiyetini 1 ms’ye veya daha aşağı çekmek (Firefox ve Safari bu korumayı zaten uygular). `Timing-Allow-Origin` başlığı kullanımıyla zaman içi gizliliği artırılır. 
  - *Service Worker:* Sahte servis işçi durumu göstermek veya hiç kayıtlı olmasını engellemek.
  - *Genel* (CSS queries gibi): Bazı özellik sorgularını yanıtlamadan önce kullanıcıdan onay almak veya tam çıktıları gizleyerek “bilinçli belirsizlik” bırakmak.

Tüm bu stratejiler arasında bir denge vardır: Kullanıcı deneyimi ve web uyumluluğu korunmalı, aksi halde siteler bozulabilir. Örneğin canvas tamamen kapatmak reklam bloklama performansını artırır ama birçok grafik uygulamasını öldürür. Bu yüzden genelde *azaltma* (sert önlem yerine yumuşak çözümler) ve *kullanıcı tercihine göre ayarlama* (bloklist yerine isteğe bağlı prompt) önerilir. Tor Browser çoğu riski alır ve harici görünümü standartlaştırırken, Brave/Firefox daha çok rastgeleleştirme ve izole-etme yaklaşımını benimser. Bunlar gelişmiş profil seçenekleriyle entegre edilebilir. 

## Uygulama ve Mimaride Düzenlemeler

Önerilen azaltım stratejilerinin bir özel tarayıcıya entegre edilmesi için mimari seviyede pek çok müdahale gerekir:

- **API Düzeyi Kancalar (Hooks):** Tarayıcı motorunda (ör. Blink, Gecko) ilgili web API’lerine giriş noktaları (CanvasRenderingContext2D, WebGLRenderingContext, Navigator, Performance gibi sınıflar) bulunarak, bu API çağrıları yakalanabilir. Örneğin C++/Rust kodunda:
  ```cpp
  // Örnek: WebGL getParameter() sonucunu sahteleme
  JSValue WebGLRenderingContext::GetParameter(JSContext* cx, ...){
      JSValue real = CallOriginalGetParameter(cx, ...);
      if (fingerprintProtectionEnabled) {
          // Vendor/Renderer için sabit değer ya da rastgele gürültü ekle
          if (param == UNMASKED_VENDOR || param == UNMASKED_RENDERER) {
              return JSString::encodeLatin1(cx, "VALHALLA GPU");
          }
      }
      return real;
  }
  ```
  Veya Rust/Servo tarafında benzer fonksiyonlar override edilebilir. Canvas için `toDataURL()` veya `getImageData()` fonksiyonundan önce veriye müdahale edilebilir.
- **Branşlı Projelerde Özellik Kullanımı:** Firefox’ta `privacy.resistFingerprinting` gibi tercihler sistemi, birçok API’yi azaltılmış modda sunar. Özel tarayıcı için benzer bir güvenlik/mahremiyet seviyesi ayarı sunulabilir. Chrome üzerinde ise komut satırı bayrakları (`--disable-webgl`, `--disable-audio`, `--webrtc-hide-local-ips-with-mdns` vb.) kullanılabilir.
- **Parmakiz İzolasyonu (Partitioning):** Depolama (çerez, cache, localStorage, IndexedDB, WebSQL) alanlarının domain (veya üçüncü parti context) bazında bölümlendirilmesi. Bu, siteler arası iz sürmeyi (cross-site tracking) engeller. Örneğin Chromium’un “first-party sets” veya Firefox’un “Total Cookie Protection” yaklaşımları ilham verebilir.
- **Tarayıcı Kontrolleri ve İzin Diyalogları:** Tarayıcı içine, kullanıcıya çıkmadan önce sorulacak izinler eklenebilir. Örneğin bir site kamera erişimi istemeden önce (MeidaDevices gibi) prompt göstermek veya kısmi izin modu (sadece anonim id’ler). Sensörler için güvenlik izinleri (`DeviceOrientationEvent` için onay istemek).
- **Günlük/Telemetri ve Güncelleme:** Her koruma özelliği, tarayıcı güncellemelerinde gözden geçirilmeli. Kullanıcı deneyimi için telemetri (öğrenme amaçlı olabilir) sınırlanmalı, böylece koruma ayarları parmakiz olarak kullanılmasın.
- **Test Otomasyonu:** Oluşturulan tarayıcı profilleri otomatik testlerde denenmelidir. Pyhton + Selenium/Playwright ile özelleştirilmiş testler (Canvas parmakizi hesaplama, User-Agent check, WebRTC leak testi) yapılabilir. Örneğin `playwright eval` ile `navigator.userAgent` değeri veya bir canvas hash’i ölçülebilir. Tarayıcı doğrulaması için EFF Panopticlick gibi siteler kullanılabilir. Ayrıca WPT (web platform tests) ya da tarayıcı içi test kütüphaneleriyle regression testleri yazılabilir.

Örnek bazı kod/düzenleme fikirleri:
```js
// JS tarafı: CanvasRenderingContext2D.getImageData() koruması
const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
CanvasRenderingContext2D.prototype.getImageData = function(x,y,w,h) {
    let data = origGetImageData.call(this, x, y, w, h);
    if (window.fingerprintDefenseEnabled) {
        // Rastgele gürültü ekle
        for(let i = 0; i < data.data.length; i+=4) {
            data.data[i+2] ^= Math.floor(Math.random()*16); // mavi kanala küçük değişiklik
        }
    }
    return data;
};
```
```cpp
// C++ (Chromium) örneği: WebGLVendor sabitleme
void WebGLRenderingContext::GetParameter(GLenum pname, JS::MutableHandleValue ret) {
    if (pname == GL_UNMASKED_VENDOR_WEBGL && fingerprinting_protection) {
        // Sabitlenmiş GPU adı döndür
        *ret = JS_NewStringCopyN(cx, "Intel Open Source Technology Center");
        return;
    }
    // Yoksa normal işlemi yap
    callOriginalGetParameter(pname, ret);
}
```

## Gizlilik Odaklı Tasarım Desenleri

Parmakizleme dirençli tarayıcılar ve profiller için bazı genel desenler vardır:

- **Tor Tarayıcı Yaklaşımı (Homojen Profil):** Tüm kullanıcıları büyük bir anonim setine sokmak için varsayılan değerleri aşırı derecede standartlaştırmak. Örneğin, Tor Browser tüm font listelerini eşitleyip, canvas çıktısını tamamen engeller ve grafik/bellek bilgilerini sabit değerlerle sunar. Yani herkes benzer parmakize sahip olup birbirine karışır.
- **Brave/Farbling Yaklaşımı (Heterojen Profil):** Her siteye farklı kimlik bilgisi döndürecek şekilde rastgeleleştirme (farbling). Brave, her site ve oturum için farklı ama tutarlı değer üretir; böylece bir site içinde benzeriz, fakat siteler arası farklılık gösterir. Bu yöntem, “çok fazla birbirine benzemek yerine her yerde değişmek” stratejisidir. Hem kullanıcı gizliliğini artırır hem de meşru siteleri bozmamaya çalışır.
- **Site İzolasyonu ve Bezelyeleme:** Üçüncü taraf izinleri kısıtlamak, bir site içinde tüm popüler data erişimlerini engellemek (örn. Chrome ETP/Firefox ETP). İçerikleri iframelarda izole etmek, site örneklerini konteynerle bölümlendirmek (Tor Browser’ın konteyner profilleri).
- **Ağ Seviyesi Korunma:** Yerel ağdan (Local IP) parmakiz sızmasını önlemek için VPN/Onion routing kullanmak. HSTS / TLS parmakizini azaltmak için TLS parametrelerini standartlaştırmak. Tor ağında yerel IP gizlenir; HSTS durumunda Tor, her domain için ayrı tarayıcı kullanır (Lockdown).
- **Güncellemeler ve Telemetri:** Tarayıcının güncellemeleri de kullanıcı parmakizini etkiler. Güncelleme kontrolü (auto-update) gizlilik politikalarına uygun olmalı, ham veri toplamayacak şekilde tasarlanmalıdır. Örneğin Mozilla’nın Firefox Telemetry verileri anonimleştirilerek toplanır.

## Önceliklendirme Tablosu

Aşağıdaki tablo, temel azaltım önlemlerini geliştirme yükü, kullanıcı etkisi ve etkinlik açısından karşılaştırır:

| **Azaltım Stratejisi**       | **Hedef Özellik(ler)**           | **Geliştirme Çabası** | **Kullanıcı Etkisi**      | **Etkililik**            |
|------------------------------|----------------------------------|----------------------|--------------------------|---------------------------|
| Canvas çıktısına gürültü     | Canvas API, WebGL                | Orta-Yüksek          | Orta (grafik bozulabilir)| Yüksek                   |
| Canvas/WebGL API engelleme   | Canvas, WebGL API’leri           | Yüksek               | Yüksek (çok site bozulur)| Yüksek                   |
| Font beyaz liste uygulama    | Yazı Tipi Parçalama              | Yüksek               | Düşük-Orta (bazı yazı bozulur) | Yüksek            |
| GPU Vendor gizleme/sapma     | WebGL Unmasked Vendor            | Orta                 | Düşük (kaynak tespiti zorlaşır) | Orta-Yüksek     |
| WebRTC IP sızdırma engelleme | WebRTC (STUN)                   | Orta                 | Orta (video erişimleri etkilenir) | Orta             |
| Depolama izolasyonu          | localStorage, IndexedDB, Cache   | Orta                 | Düşük (sayfa veri yönetimi) | Yüksek               |
| DeviceMemory/Concurrency stun| donanım concurrency              | Orta                 | Düşük (bazı webapp performansı)| Orta            |
| Performance.now hassasiyeti  | JS Zamanlayıcı                  | Düşük                | Düşük (hassas zamanlayıcılar)    | Orta            |
| Medya cihazı izin/prompt     | Kamera/Mikrofon                 | Orta                 | Yüksek (izin diyaloğu)    | Orta-Yüksek     |
| Sensör API’si kaldırma       | DeviceOrientation vb.            | Düşük                | Orta (web oyunları etkilenir)  | Orta            |
| DNS/HTTP başlık gizleme      | Accept-Language, UA vb.          | Düşük                | Düşük (bazen site tercihleri kaybolur)| Orta    |
| Parmakizme dir. proxy entegr.| Ağ düzeyinde IP/TLS             | Yüksek               | Orta (performans etkiler) | Yüksek         |

*(Tabloyu genel bir değerlendirme olarak alın; proje gereksinimlerine göre uyarlanmalıdır.)*

## Test ve Doğrulama Kontrol Listesi

Koruma mekanizmalarının etkinliğini test etmek için aşağıdaki adımlar önerilir:

1. **Panopticlick/Cover Your Tracks:** [EFF’nin Panopticlick](https://panopticlick.eff.org/) ya da [Cover Your Tracks](https://coveryourtracks.eff.org/) ile tarayıcınızı test edin. Önce korumasız profilde çıktı alın (bits, sıra değeri), sonra korumaları aktif edip tekrar test ederek düşüşü gözlemleyin. %30’dan fazla azalma iyi sayılır.
2. **AmIUnique:** [AmIUnique.org](https://amiunique.org) sitesine gidip fingerprint analiz araçlarını kullanın. Farklı tarayıcılar/profiller karşılaştırması yapabilir.
3. **OpenWPM/FP-Inspector:** Otomatik tarayıcı test platformlarıyla (ör. [OpenWPM](https://github.com/mozilla/OpenWPM)) popüler 1000 site üzerinde tarayıcı profilinizi test edin. Hangi özelliklerin toplandığını raporlar.
4. **Yerel Kod Testleri:** Örneğin JS konsolundan `navigator` ve `screen` değerlerini kontrol edin. Canvas hash’i JS ile oluşturup kaydedin. Aynı adımları birden çok kez yapın; idealde her siteye farklı sonuç çıkmalı.
5. **Performans İncelemesi:** Yavaşlama, çökme riski testleri yapın. Büyük grafik uygulamaları, WebGL gerektiren sitelerden test isteyin.
6. **Örnek Sonuç Yorumlama:** Diyelim *Panopticlick* 25 bit eskiye düşmüşse, artık 33 bit yerine 8 bit değer aldığınız anlamına gelir. Bu ciddi bir azalmadır (entropide 2^25→2^8). *AmIUnique*’te rank’ınız artarsa, iz bırakma oranınız düşmüştür. Test sonuçları her zaman %100 güven vermez; birden fazla araç ve senaryo kullanmak en iyisidir.

Örnek: Eğer tarayıcı ilk testte *41 bit* entropi (çok ayırt edici) ve 1 kişi ile eşleşme gösterirken, önlemler sonrası *22 bit* ve 10.000 kişi/benzer profile bağlanıyorsa, hedefe yaklaşılmış demektir.

## Kaynaklar

Bu raporda EFF, panopticlick, W3C, academic yayınlar ve tarayıcı belgeleri kullanılmıştır. Özellikle Mayer/Eckersley’in Panopticlick çalışması, FP-tracer , BrowserLeaks testleri, Tor Project belgeleri ve Brave’ın farbling yaklaşımı yol gösterici olmuştur. Birincil kaynaklar (EFF, W3C, tarayıcı teknik dökümanları, 2018 sonrası araştırmalar) referanslarda belirtilmiştir. Herhangi bir değerin belirtilmemesi durumunda (ör. kesin entropi) “belirtilmemiş” olarak bırakılmıştır.