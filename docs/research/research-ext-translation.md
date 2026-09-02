# Research — tarayıcı içi sayfa çevirisi

> **Ne bu?** Tepegöz'ün `ext-translate`'i için yapılan **kategori araştırması**: Chrome/Edge'in yerleşik
> sayfa çevirisine yönelik kullanıcı şikâyetleri. Kod okunmadı. Türkiye pazarı ayrıca temsil ediliyor.
>
> **Durum:** tarayıcıya gömülü özellik (Chrome/Edge) + üçüncü-taraf uzantılar.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sonuç:** karşılığı **sevk edildi** — `extensions/ext-translate`; raporun teknik çekirdeğine
> (yıkıcı DOM değişimi) doğrudan cevap veriyor.

---

## Şikâyetler

**1 · Zorunlu çeviri dayatması.** En yaygın şikâyet: tarayıcının sormadan çevirmesi. Özellikle **arama
sonuçlarını bozması** — kullanıcı Türkçe bir arama yapıyor, sonuçlar çevrilince site adları ve terimler
tanınmaz hâle geliyor.

**2 · Seçim ve vurgu bozuluyor.** Çeviri sonrası metin seçme, arama (Ctrl+F) ve diğer çeviri
uzantılarının işlevsizleşmesi.

**3 · Orijinali görme (hover) özelliğinin kaldırılması.** Kullanıcı çeviriye güvenmediğinde kaynağı
göremiyor — güven kaybının doğrudan sebebi.

**4 · Türkiye'ye özgü tutarsızlıklar.** Terim çevirileri tutarsız; teknik metinlerde anlam kayması.

**5 · Teknik çekirdek — yıkıcı DOM manipülasyonu.** Raporun en değerli kısmı: yerleşik çeviri, sayfanın
DOM'unu **yerinde değiştiriyor**. SPA'larda bu ölümcül: framework kendi tuttuğu ağaçla gerçek DOM'un
uyuşmadığını görünce çöküyor. Rapor çökme mekanizmalarını ayrı ayrı gösteriyor.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Yıkıcı olmayan çeviri.** Raporun teknik çekirdeği bu ve `ext-translate` buna göre tasarlandı —
  DOM'u yerinde parçalamadan çalışmak, SPA çökmesini yapısal olarak önlüyor. **Sevk edildi ve bu belge o
  kararın gerekçesi.**
- **Asla sormadan çevirme.** Varsayılan opt-in; kullanıcı istemeden sayfa değişmez.
- **Orijinali görebilme.** Çevrilmiş metnin kaynağına erişim, güvenin ön koşulu.
- **Arama sonuçlarını ve seçimi bozmama** — çeviri sonrası Ctrl+F ve metin seçimi çalışmaya devam etmeli.
- **Tercih edilen diller listesi.** Tek bir görüntü dili yerine sıralı dil tercihi; captured in
  [`../tracks/browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) §12 ve
  [phase-8](../../phases/product/phase-8-local-intelligence-sovereignty.md)'in Türkçe-önce katmanının
  doğal eşi.
- **Türkçe terim tutarlılığı** — sözlük/terim tabanı, ADR-0042'nin sağlayıcı sınırının üstünde.

**Alınmayacak:**

- **Sayfayı sormadan, geri alınamaz biçimde değiştirmek.**
- Çeviriyi tek bir kapalı sağlayıcıya sabitlemek — ADR-0042 sağlayıcı sınırını zaten çiziyor.

## Kaynaklar

Chrome/Edge destek forumları ve sürüm notları, Reddit, Türkiye kullanıcı forumları, SPA çökme
raporlarına ilişkin geliştirici konuları.
