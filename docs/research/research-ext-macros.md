# Research — iMacros ve deterministik makro kaydediciler

> **Ne bu?** Tepegöz'ün `ext-macros`'u yazılmadan önce yapılan **kategori araştırması**: iMacros'un
> (uzun süre pazarın referansı olan makro kaydedici) kullanıcı şikâyetleri. Kod okunmadı.
>
> **Durum:** kapalı/ticari · tarayıcı uzantısı · MV3 geçişiyle fiilen çöktü.
> **Tarih.** Derleme 2026-08-21 · bu formata çevirisi 2026-09-02. **Dil notu.** Türkçe.
> **Sonuç:** bu belgenin bulguları **kod olarak sevk edildi** — `extensions/ext-macros` +
> [`@tepegoz/macro-engine`](../../packages/macro-engine) + [Faz M](../../phases/product/phase-macros.md).
> Belge, o tasarımın neden böyle olduğunun yazılı gerekçesi.

---

## Şikâyetlerin dört kümesi

**1 · Mimari — MV3 uzantıları çökertti.** iMacros'un yeteneklerinin çoğu Manifest V2'nin verdiği geniş
erişime dayanıyordu; MV3 geçişi fonksiyonel bir çöküş yarattı. Firefox tarafı da ayrı bir çıkmaz ve
güvenlik zafiyeti kümesi üretti.

**2 · Dinamik web karşısında katı konumlandırma.** Kayıt sırasında yakalanan koordinat/indeks tabanlı
hedefleme, SPA'lar ve değişen düzenler karşısında kırılıyor — "kaydettiğim makro yarın çalışmıyor".

**3 · Betik dilinin mantıksal sınırları.** En tekrarlanan teknik şikâyetler:

- **`if/else` yok** — koşullu akış kurulamıyor
- **Katı değişken sınırları** — adımlar arası veri taşımak zor
- **CSV veri kaynakları ve döngüler** yetersiz
- **Güvenilmez zamanlama** — sabit `WAIT` ile senkronizasyon; belirsiz hata kodları

## Alınacaklar / Alınmayacaklar

**Alınacak — hepsi sevk edildi ya da Faz M'de açık:**

- **Gerçek kontrol akışı.** `if/else`, döngü, değişken kapsamı — iMacros'un yokluğuyla en çok şikâyet
  aldığı şey, `@tepegoz/macro-engine`'in IR'ında baştan var.
- **Kırılgan hedeflemenin yerine dayanıklı seçici.** Koordinat/indeks yerine seçici motoru + Faz 6'nın
  **kendini iyileştiren** yeniden-bağlama merdiveni. iMacros'un "yarın çalışmıyor" şikâyeti bu tasarımın
  doğrudan sebebi.
- **Adım-başına hata politikası** — `onError: stop | skip | retry` + `retries`. Bu, iMacros'un
  `!ERRORIGNORE` bayrağının `FAIL_IF_FOUND`'u da yutması probleminin **düzeltilmiş** hâli; Faz M'de
  sevk edildi ve test edildi.
- **Sabit `WAIT` yerine kararlılık bekleme.** Zamanlamayı sayıya değil, sayfanın durumuna bağlamak.
- **CSV veri kaynağı** — `attachMacroCsv` var; üstüne yükleme/önizleme/sütun eşleme UI'si Faz M'de açık.
- **Uzantı değil, tarayıcının parçası olmak.** MV3'ün iMacros'a yaptığı şey, bu yeteneğin bir uzantı
  politikasına bağlı olmasının bedeliydi. Tepegöz'de makro motoru tarayıcının kendi içinde — bu, "neden
  ayrı bir tarayıcı" sorusunun somut cevaplarından biri.

**Alınmayacak:**

- **iMacros'un kendi betik dili (`.iim`)** bir tasarım hedefi değil; Faz M yalnızca bir **içe aktarıcı**
  öngörüyor (göç kancası), kendi IR'ı kaynak biçim olarak kalıyor.
- **Serbest kod çalıştırma** — iMacros'un `EVAL`'ına karşılık gelen şey burada bilinçli olarak kapalı
  (ADR-0026 ölçülüp çürütüldü, ADR-0029 DevTools kullanıcı-only).

## Kaynaklar

iMacros resmî dokümantasyonu ve forumları, Reddit, Stack Overflow, ve MV3 geçiş dönemine ait uzantı
mağazası değerlendirmeleri.
