# Research — Brave

> **Ne bu?** Gizlilik-öncelikli bir Chromium rakibinin (Brave) dış kaynaklardan derlenmiş
> incelemesi — ağırlıklı olarak **kullanıcı şikâyeti** tabanlı. **Kod okunmadı.** Brave'in
> kendisi açık kaynak (Chromium fork'u), ama çok-GB'lık bir fork olduğu için `.junk`'a
> çekilmedi; bu yüzden `docs/versus/` değil, `docs/research/` altında.
>
> **Durum:** açık kaynak (Chromium fork) · cross-platform · ücretsiz.
> **Tarih.** 2026-09-02. **Dil notu.** Türkçe.
> **Köken:** 2026-08-21'de içe aktarılan bir LLM derin-araştırma çıktısının damıtılmış hâli
> (özgün dosya 2026-09-02'de bu belgeye katlandı — ayrı bir kopya tutulmuyor).

---

## Ne

Chromium tabanlı, gizliliği varsayılan yapan tarayıcı: yerleşik reklam/izleyici engelleme
(Shields), BAT tabanlı ödül sistemi, entegre kripto cüzdanı, yerleşik Tor sekmesi, kendi arama
motoru, yerleşik VPN ve Leo asistanı. Tepegöz açısından önemi iki yönlü: **en yakın "gizlilik
tarayıcısı" konumlandırma rakibi**, ve aynı anda **kendi kararlarımızın karşı örneği** — çünkü
Brave'in en çok şikâyet aldığı üç alan Tepegöz'ün de aynı riski taşıdığı üç alan.

## Şikâyet yoğunluğu (rapordan)

| Kategori                                                          | En yoğun olduğu yer    | Tepegöz'de karşılığı          |
| ----------------------------------------------------------------- | ---------------------- | ----------------------------- |
| **Senkronizasyon** — "sildiklerim geri geliyor", zincir bozuluyor | Windows yüksek         | Faz 3 (E2EE sync) — henüz yok |
| **Performans / RAM** — filtre motorunun bellek maliyeti           | Windows/Linux yüksek   | Faz 2 adblock motoru          |
| Arayüz ölçekleme (4K'da küçük öğeler)                             | tüm masaüstü           | Faz 10b                       |
| Brave Rewards / BAT bölge kısıtı                                  | Android/Windows yüksek | **kapsam dışı**               |
| Çökme / güncelleme                                                | Windows                | Faz 0 dağıtım                 |

Gizlilik/veri koruma şikâyeti **her platformda "düşük"** — yani Brave'in tezi tutuyor,
zayıfladığı yer _mühendislik kalitesi_, gizlilik iddiası değil. Tepegöz için ders bu:
gizlilik tarayıcısı olmak sizi senkronizasyon hatasından ya da 1.8 GB RAM'den korumuyor.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Sync doğruluk çıtası — "silmeler dirilmemeli."** Brave'in en tekrarlanan şikâyeti bu ve
  CRDT tabanlı bir sync'te tombstone'ların yanlış ele alınmasının klasik sonucu. Zaten
  [phase-3](../../phases/product/phase-3-backend-cloud-extensions.md) `#### Sync correctness bar`
  bölümünde bir çıta olarak duruyor — bu belge o satırın kaynağı.
- **Filtre motorunun bellek maliyetini ölçülür tut.** Brave'in performans şikâyetlerinin
  merkezinde adblock filtre listeleri var. Zaten
  [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) `#### Filter-engine cost`
  bölümünde. Raporun somut önerisi: **filtre listelerini dile/bölgeye göre daralt** — Türkçe
  odaklı bir üründe doğrudan uygulanabilir.
- **4K/yüksek-DPI arayüz ölçekleme.** [phase-10b](../../phases/product/phase-10b-accessibility-voice-reach.md)
  L9'da mevcut.
- **⚠️ Parmak izi stratejisi — Brave'i _karşı örnek_ olarak al.** Brave her yeniden başlatmada
  parmak izini **rastgeleleştiriyor** (farbling). W3C'nin kendi rehberi ve Firefox'un pratiği
  bunun tersini söylüyor: **normalize / null / partition, rastgeleleştirmeden daha güvenlidir**;
  doğru sıra önce **entropi bütçesini küçültmek**, sonra gerçekten gereken yerde kontrollü
  gürültü eklemek. Rastgeleleştirme, tutarsızlığın kendisi bir sinyal olduğu için ters
  tepebilir. Faz 2'nin fingerprinting ADR'si (zaten "ADR required" işaretli) bu kararı
  vermeden yazılmamalı. Kaynak:
  [`research-vpn-security.md`](research-vpn-security.md) §WebRTC/ECH/QUIC.

**Alınmayacak:**

- **BAT / Brave Rewards ve kripto cüzdan.** Ürün kapsamı dışı; üstelik raporun en yoğun
  şikâyet kümesi (bölge kısıtı, kaybolan token) tam olarak bu ekonomiden geliyor. Tepegöz'ün
  gelir modeli Faz 3'ün yönetilen aboneliği.
- **Kendi arama motoru.** Rapor sonuç kalitesinin "ortalama" bulunduğunu kaydediyor; motor
  işletmek bu ürünün işi değil.
- **Dikey sekmeler.** [phase-2b](../../phases/product/phase-2b-daily-driver-ux.md) bunu açıkça
  kapsam dışı bırakmış.
- **Speedreader** — karşılığı zaten sevk edildi (`@tepegoz/reader` + Reading View,
  [phase-2c](../../phases/product/phase-2c-classic-browser-essentials.md)).

## Kaynaklar

Brave resmî dokümantasyonu (web sitesi, blog, destek), topluluk forumları (Reddit, Ekşi Sözlük),
uygulama mağazası değerlendirmeleri ve GitHub konuları. Mağaza puanları derleme tarihinde
Google Play 4.7★ (3.4M oy), App Store 4.8★ (622K oy).
