# Research — tarayıcı parmak izi: bileşenler ve karşı önlemler

> **Ne bu?** Parmak izi yüzeyinin **bileşen bileşen** teknik analizi ve önceliklendirilmiş azaltım
> tablosu (efor × kullanıcı etkisi × etkinlik). Ürün araştırması değil, alan araştırması.
>
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sahibi faz:** [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) →
> `#### Fingerprinting protection — component detail and the measurement gate`. Faz 5, IP'yi gizleyen
> tünelin bu katman olmadan **anlamını yitirdiği** yerde buna bağlanıyor.

---

## Ne söylüyor

Bileşenler: canvas, WebGL/GPU, font listesi, audio, ekran/pencere ölçüleri, `navigator` yüzeyi, saat
dilimi ve dil, donanım eşzamanlılığı, medya cihazları. Her biri için tespit yöntemi + koruma stratejisi
ayrı ayrı veriliyor; kapanışta bir **önceliklendirme tablosu** ve bir **test/doğrulama kontrol listesi**
var.

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Bileşen-başına azaltım tablosu ve ölçüm kapısı.** Faz 2'nin fingerprinting bölümü bunun üstüne
  kurulu; ADR'nin talep ettiği **≥%30 entropi düşüşü** ölçüm kapısı buradan.
- **⚠️ Strateji sırası: normalize / null / partition **önce**, rastgeleleştirme sonra.** W3C rehberi ve
  Firefox pratiği bu yönde; rastgeleleştirme zayıf varsayılan, çünkü **tutarsızlığın kendisi bir
  sinyal**. Faz 2'nin görev satırı hâlâ "noise on canvas/WebGL/font/audio" diye açılıyor — ADR bunu ya
  bilinçli yeniden sıralamalı ya da farbling'in neden kazandığını yazmalı. Karşı örnek:
  [`research-brave.md`](research-brave.md).
- **Normalize tarafına ait, fazda henüz adı geçmeyen iki teknik:** pencere/ekran boyutu **kovalama**
  (Tor Browser'ın letterboxing'i) ve **dil listesi daraltma**.
- **Determinizm/replay etkisi.** Koşudan koşuya değişen gürültü, Event Journal'ın "bu koşu tekrar
  oynatılabilir" sözüyle çakışır — bu yüzden ajanın kendi koşuları `standard` profile sabit.
- **Test/doğrulama kontrol listesi** — korumanın çalıştığını iddia etmek değil, ölçmek.

**Alınmayacak:**

- **Her şeyi rastgeleleştirmek.** Yukarıdaki sıralama prensibinin doğrudan sonucu.
- Kırılganlığı kullanıcıya ödeten katı homojenleştirme (Tor Browser ucu) — Faz 2 `strict`/`standard`
  ayrımını bu yüzden koruyor.

## Kaynaklar

W3C anti-fingerprinting rehberi, Firefox `privacy.resistFingerprinting` dokümantasyonu ve tasarım
notları, Tor Browser tasarım belgesi, akademik parmak izi literatürü ve `browserleaks`-sınıfı test
araçları.
