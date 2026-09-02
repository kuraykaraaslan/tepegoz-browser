# Research — Tor Browser: güvenlik tasarımı ve kullanıcı şikâyetleri

> **Ne bu?** İki içe aktarımın birleşimi: Tor Browser'ın **tehdit modeli ve sertleştirme** analizi ile
> **kullanıcı şikâyeti korpusu**. Kod okunmadı.
>
> **Durum:** açık kaynak · Firefox ESR tabanlı · Tor Project.
> **Tarih.** Derlemeler 2026-07/08 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi faz:** [phase-5](../../phases/product/phase-5-vpn-network-privacy.md) → `### Tor integration`
> ve `### Network-privacy onboarding & health`.

---

## Bölüm A — güvenlik tasarımı

**Tehdit modeli.** Tor, giriş ve çıkışı **aynı anda** gözleyen küresel pasif saldırgana karşı koruma
sunmaz (trafik korelasyonu). Ayrıca kötü niyetli düğüm yerleştirme (Sybil), yerel saldırgan (DNS/WebRTC
sızıntısı), ve zamanlama/parmak izi tabanlı ilişkilendirme.

**Tasarım.** Üç düğümlü soğan yönlendirme; **guard düğümler** kasten uzun ömürlü (~3), çünkü giriş
noktasını döndürmek düşman guard'a denk gelme olasılığını artırır. Devre rotasyonu ve **New Identity**
(çerez + IP sıfırlama). Tarayıcı tarafında: NoScript, güvenlik seviyeleri (Standard/Safer/Safest),
**letterboxing** (pencere boyutu kovalama), UA standardizasyonu, eklenti yüklemenin caydırılması.

**Sansür aşma.** Köprüler (bridges) ve **pluggable transport**'lar — obfs4, meek, Snowflake. Köprüler
dizin sunucularında listelenmez, bu yüzden engellenmeleri zor; bedeli hız.

**VPN ile birlikte kullanım genelde önerilmiyor** — Tor'dan önceki durak sizi Tor kullanıcısı olarak
görür, ve düzenleme güveni VPN operatörüne kaydırır.

**Davranışsal kural:** Tor ile normal tarayıcıyı **aynı anda** kullanmayın — korelasyon riski.

## Bölüm B — kullanıcı şikâyetleri

En ağır kullanıcı acısı **anonimlik teorisi değil, çalıştırabilme ve istikrarlı bağlanabilme**.

| Kategori           | Öz                                                                              |
| ------------------ | ------------------------------------------------------------------------------- |
| Uyumluluk          | **CAPTCHA döngüleri, hesap kilitleri, Cloudflare engelleri** — en görünür küme  |
| Performans         | "Çok yavaş açılıyor", bağlantı kurulumu uzun                                    |
| Kurulum/güncelleme | Windows'ta non-ASCII yol, eski OS, güncelleme sonrası bozulma                   |
| Arayüz             | Letterboxing şeritleri, yeniden başlatma isteyen güvenlik seviyesi değişimi     |
| Mobil              | Android'de New Identity / devre görünürlüğü eksik; iOS'ta resmî Tor Browser yok |
| Eklenti            | Kullanıcı adblock istiyor; Tor "parmak izini bozar" diyor                       |

**Kısa vadeli öneriler:** Android daemon sağlık denetimi · **köprü yapıştırma sanitizasyonu ve boşluk
normalizasyonu** (DNSTT satır biçimi hatası sansür aşmayı doğrudan kırıyor) · **uyumluluk açıklama
katmanı** · **Türkçe ve bölgesel bağlantı yardımının güçlendirilmesi**.

## Alınacaklar / Alınmayacaklar

**Alınacak** — hepsi Faz 5'te satır:

- **Köprüler ve pluggable transport'lar.** Bugün Faz 5'te **hiç yok**; `TorProvider` zaten bir `tor`
  süreci yönetiyor, yani bu sevk edilmiş makineye bir yapılandırma yüzeyi. Onsuz "Tor çalışıyor"
  yalnızca Tor'un engellenmediği yerde doğru — **birincil pazar için yanlış varsayım.**
- **Yapıştırılan köprü satırını temizle** — Unicode boşluk, soft hyphen, kaçak satır sonu. Belgelenmiş
  gerçek bir kırılma.
- **Türkçe bağlantı yardımı** — TR şikâyetleri kriptografide değil, *paneli bulma ve seçenek seçme*de
  kümeleniyor. Türkçe-önce olmanın işlevsel avantaja döndüğü yer.
- **"Yeni kimlik" affordance'ı** — devre + site verisi birlikte sıfırlanır.
- **Guard maliyetini yaz.** Bağlantı-başına `DataDirectory` = bağlantı-başına guard seti; her silip
  yeniden kurma bir guard rotasyonu. İzolasyon için seçilmiş bir tasarımın anonimlik bedeli — ADR-0011'e.
- **Uyumluluk açıklama katmanı** — CAPTCHA/kilit/Cloudflare duvarına çarpıldığında "bu site çıkış
  adresini sorguluyor, seni değil" ve ADR-0039 Human Handoff'a bağlanmak. **Ajan bunlara insandan çok
  daha sık çarpar.**
- **"Yavaş"ın nedeni** — relay mi, köprü mü, çıkış engeli mi, tünel mi.
- **Letterboxing** normalize tarafında bir parmak izi tekniği olarak → Faz 2
  ([`research-fingerprinting.md`](research-fingerprinting.md)).

**⚠️ İki açıklama yükümlülüğü** — sevk edilmiş davranış araştırmayla çelişiyor:

- **Zincirli VPN → Tor** Faz 5'te `[x]` olarak sevk edildi, rehber ise birleştirmeyi önermiyor.
- **Sekme-başına yönlendirme, Tor ve doğrudan trafiği aynı tarayıcıda aynı anda çalıştırıyor** — tam
  olarak kaçınılması söylenen desen. İkisi de savunulabilir ürün kararı; **sessiz kaldıkları sürece
  değil.** Tor'a yönlendirilmiş bir sekme, bir Tor Browser oturumu değildir.

**Alınmayacak:**

- **Tor Browser'ı taklit etmek** — güvenlik seviyeleri, NoScript, katı homojenleştirme. Tepegöz'ün modeli
  sekme-başına rota; farklı bir üründür ve öyle olduğunu söylemelidir.
- **Eklenti yüklemeyi yasaklamak.**

## Kaynaklar

Tor Project destek sayfaları, blog ve sürüm notları, Tor forumu ve GitLab konuları, CVE kayıtları
(CVE-2024-9680, CVE-2026-6770, CVE-2026-44601/44597), akademik korelasyon ve web-site-fingerprinting
literatürü.
