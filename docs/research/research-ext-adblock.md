# Research — uBlock Origin ve içerik filtreleme

> **Ne bu?** Tepegöz'ün `ext-adblock`'u için yapılan **kategori araştırması**: uBlock Origin'in MV3
> krizi ve YouTube anti-adblock savaşı. Kod okunmadı.
>
> **Durum:** açık kaynak (GPL) uzantı · MV2 kaldırılmasıyla Chromium'da işlevsiz kaldı.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sonuç:** karşılığı **sevk edildi** — `extensions/ext-adblock` tam bir `webRequest`-sınıfı motor
> çalıştırıyor, ki raporun merkezî şikâyetinin cevabı tam olarak budur.

---

## İki kriz

**1 · MV2 → MV3: `webRequest`'ten `declarativeNetRequest`'e.** Paradigma değişimi filtrelemeyi
_bildirimsel_ ve **kural sayısı sınırlı** hâle getirdi. Sonuç: uBlock Origin'in Chromium'daki tam sürümü
çalışamaz oldu, "Lite" sürüme düşüldü. Kullanıcı tepkisi büyük ve ölçülebilirdi — **Firefox, LibreWolf ve
Chromium alternatiflerine göç** bu raporun en somut davranışsal bulgusu.

**2 · YouTube anti-adblock — kedi-fare.** Tespit mekanizmaları, A/B testleri ve **sunucu taraflı reklam
enjeksiyonu (SSAI)**: reklam akışın içine gömüldüğünde ağ katmanında engellenecek ayrı bir istek
kalmıyor. uBlock'un karşı hamlesi **diferansiyel/sık filtre güncellemesi** oldu; yan etkisi, kullanıcıların
"engelleyici bozuldu" deneyimi ve yanlış alışkanlıklar (rastgele ayar kapatma).

## Alınacaklar / Alınmayacaklar

**Alınacak:**

- **Tam `webRequest`-sınıfı motor, kural sayısı tavanı olmadan.** Bu raporun merkezî şikâyeti MV3'ün
  dayattığı tavandı; Tepegöz tarayıcının kendisi olduğu için o tavan yok. **Sevk edildi.**
- **Filtre listesi maliyeti ölçülür olmalı.** Sık ve büyük listeler bellek ve başlangıç süresi demek —
  [phase-2](../../phases/product/phase-2-adapters-safe-browsing.md) `#### Filter-engine cost` bölümü bu
  eksenin sahibi; [`research-brave.md`](research-brave.md) aynı maliyeti şikâyet tarafından doğruluyor ve
  **listeleri dile/bölgeye göre daraltmayı** öneriyor.
- **Sık, küçük, güvenilir filtre güncellemesi** — diferansiyel güncelleme deseni.
- **Bozulmayı kullanıcıya açıkla.** "Engelleyici çalışmıyor" deneyiminin cevabı sessizlik değil; hangi
  listenin ne zaman güncellendiğini ve sitenin karşı-önlem aldığını söylemek.
- **Per-partition filtreleme** — Faz 2'nin adblock satırı bunu zaten şart koşuyor ve üçüncü-taraf çerez
  bölümlemesiyle tutarlı olmak zorunda.

**Alınmayacak:**

- **SSAI'ye karşı içerik-içi müdahale.** Sunucu tarafında akışa gömülmüş reklamı sökmek, ağ filtresinin
  işi değil; oraya girmek hem kırılgan hem de hukuken bulanık. Rapor bunu bir sınır olarak kaydediyor.
- **`declarativeNetRequest`-benzeri bir tavanı gönüllü olarak benimsemek.**

## Kaynaklar

uBlock Origin deposu ve wiki'si, Chromium MV3 kaldırma duyuruları, Reddit ve HN tartışmaları, YouTube
anti-adblock dalgalarına ait kullanıcı raporları.
