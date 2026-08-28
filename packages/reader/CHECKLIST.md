# reader — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Web sayfalarından makale çıkaran ve bunu güvenilir app chrome'u içinde HTML yerine yapılandırılmış tipli bloklar olarak render eden okuma görünümü paketi.

## Kesinlikle olmalı

- [ ] Makale içeriğini yalnızca yapılandırılmış tipli blok listesi (`ReaderBlock[]`) olarak modellemeli; hiçbir yerde `html` alanı bulunmamalı.
- [ ] Render katmanı `dangerouslySetInnerHTML` kullanmamalı; injection filtrelemeyle değil yapısal olarak imkânsız olmalı.
- [ ] `ReaderArticle` tipi ve model API'si (`ReaderArticle`, `ReaderBlock`, `READER_LIMITS`, `readingMinutes`) `lib.dom` veya React bağımlılığı olmadan import edilebilmeli.
- [ ] `@tepegoz/reader` girişi yalnızca makale modelini export etmeli; DOM/JSX typecheck'i sürüklememeli.
- [ ] `@tepegoz/reader/extract` ayrı bir alt-giriş olarak `extractArticle(document)` sağlamalı.
- [ ] `extractArticle` düz bir `Document` üzerinde çalışmalı; jsdom gerektirmemeli ve sayfa içinde çalıştırılabilmeli.
- [ ] Çıkarım Readability tarzı skorlama yapmalı: link yoğunluğu + negatif class/id isim cezası.
- [ ] Sayfa güvenilmez girdi kabul edilmeli; çıkarılan her alan sınırlandırılmalı (bounded).
- [ ] `READER_LIMITS` blok sayısını 2000 ile sınırlamalı.
- [ ] `READER_LIMITS` metin bloğu başına 20.000 karakter tavanı uygulamalı.
- [ ] `READER_LIMITS` liste öğesi sayısını 500 ile sınırlamalı.
- [ ] `READER_LIMITS` başlık, byline ve kaynak (src) alanları için üst sınır uygulamalı.
- [ ] `image` bloğunun `src` değeri sayfadan çıkmadan önce `http(s)` veya `data:image` olarak doğrulanmalı.
- [ ] Link'ler kendi blok türü olarak korunmalı; href kaybedilmemeli.
- [ ] Zengin satır-içi biçimlendirme (kalın, italik, altı çizili) düz metne düzleştirilebilmeli — bilinçli kabul edilen maliyet.
- [ ] `@tepegoz/reader/view` `ReaderView` React bileşenini export etmeli ve blok listesini render etmeli.
- [ ] `readingMinutes` bir makale için tahmini okuma süresini hesaplamalı.
- [ ] `@tepegoz/reader/i18n` `en` ve `tr` sözlüklerini sağlamalı.
- [ ] i18n sözlükleri parite testinden geçmeli (her iki dilde aynı anahtar kümesi).
- [ ] `extractArticle` doğrudan vitest altında test edilebilir olmalı.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` script'leri çalışır olmalı.
- [ ] Paket, `ReaderArticle` tipini isteyen bir tüketiciye DOM tipleri getirmeyecek şekilde bölünmüş kalmalı.

## Olsa iyi olur

- [ ] Blok türleri paragraf, başlık, liste, alıntı, kod, görsel ve link ötesinde genişletilebilir olmalı.
- [ ] Çıkarım başlık/yazar/yayın tarihi/site adı gibi meta verileri ayrı alanlarda döndürmeli.
- [ ] Kapak görseli (lead image) ile içerik görselleri ayırt edilebilmeli.
- [ ] Limit aşımında sessiz kesme yerine "kısaltıldı" işareti taşınmalı.
- [ ] `readingMinutes` dile göre ayarlanabilir kelime/dakika hızı kabul etmeli.
- [ ] Çıkarım başarısız olduğunda (makale bulunamadı) net bir boş/başarısız sonuç dönmeli.
- [ ] `ReaderView` tipografi/font boyutu/tema gibi sunum tercihlerini prop olarak almalı.
- [ ] Kod blokları için dil etiketi korunmalı.

## Çok niş

- [ ] AMP veya `<article>` olmayan sayfalarda da içerik gövdesi bulunabilmeli.
- [ ] Çok sayfalı makalelerde "sonraki sayfa" bağlantısı tespit edilip birleştirilebilmeli.
- [ ] RTL diller ve dikey yazı için blok modeli yön bilgisi taşıyabilmeli.
- [ ] `data:image` src'lerin boyutu, bloklar için tanımlı bellek tavanına dahil edilmeli.
- [ ] Figür + figcaption ilişkisi görsel bloğunda korunmalı.
- [ ] Dipnot/anchor bağlantıları makale içi hedeflere çözülebilmeli.
- [ ] Aynı `Document` üzerinde tekrar çalıştırıldığında deterministik aynı blok listesini üretmeli.
