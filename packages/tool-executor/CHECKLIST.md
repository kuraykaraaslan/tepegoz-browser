# tool-executor — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Bir tool call yürütülürken kullanılan saf yardımcılar: web metnindeki gizli/zero-width/bidi/homoglyph enjeksiyon vektörlerini temizleyen içerik sanitizer'ı (ADR-0008) ve planlayıcıya verilen sonlanmış, boyutu sınırlı, etiketi temizlenmiş interactable DOM-eleman modeli. Sıfır bağımlılık, Electron yok, DOM erişimi yok.

## Kesinlikle olmalı
- [ ] Web kaynaklı metinden gizli (hidden) karakterleri modele ulaşmadan önce temizleyebilmeli
- [ ] Sıfır genişlikli (zero-width) karakterleri temizleyebilmeli
- [ ] Bidi (çift yönlü metin) kontrol karakterlerini temizleyebilmeli
- [ ] Homoglyph tabanlı enjeksiyon vektörlerini temizleyebilmeli
- [ ] `sanitizeText` ile güvenilmeyen metni temizleyip sonuç döndürebilmeli
- [ ] `sanitizeSegments` ile segment listesini temizleyebilmeli
- [ ] `SanitizeResult` içinde segmentleri ve herhangi bir şeyin çıkarılıp çıkarılmadığı bilgisini vermeli
- [ ] Çıkarılan gizli içerik yerine `HIDDEN_PLACEHOLDER` metnini koyabilmeli
- [ ] `wrapUntrustedContent` ile temizlenmiş web içeriğini bir sınır işaretleyicisiyle sarmalı
- [ ] Sınır işaretleyicisi modele güvenilir talimat ile güvenilmeyen sayfa verisini ayırt ettirebilmeli
- [ ] `finalizeElements` ile ham `RawInteractable[]` listesini `InteractableElement[]` listesine dönüştürebilmeli
- [ ] `MAX_INTERACTABLE_ELEMENTS` sınırını uygulayarak eleman listesini kırpabilmeli
- [ ] `MAX_ELEMENT_LABEL` sınırını uygulayarak eleman etiketlerini kısaltabilmeli
- [ ] `sanitizeLabel` ile her elemanın etiketini içerik sanitizer kurallarıyla temizleyebilmeli
- [ ] `renderElementsText` ile sonlanmış eleman listesini modele gönderilen kompakt metin bloğuna dönüştürebilmeli
- [ ] `isInteractableRole` / `isEditableRole` ile erişilebilirlik rolüne göre eleman sınıflandırması yapabilmeli
- [ ] `INTERACTABLE_ROLES` kümesini eyleme uygun elemanları seçmek için sunmalı
- [ ] Sıfır bağımlılıkla çalışmalı (no deps)
- [ ] Electron'a bağımlı olmamalı
- [ ] DOM'a kendisi erişmemeli; yalnızca browser host'un ürettiği düz veri yapıları üzerinde çalışmalı
- [ ] Tüm yardımcıları saf (pure) tutmalı — yan etki üretmemeli

## Olsa iyi olur
- [ ] Temizleme sırasında görünür/meşru Unicode metni (ör. çok dilli içerik) bozmadan korumalı
- [ ] `SanitizeResult`'taki "çıkarıldı" bayrağını çağıranın loglama/uyarı için kullanmasına izin vermeli
- [ ] Kırpma sırasında planlayıcı için en olası eyleme uygun elemanları önceliklendirebilmeli
- [ ] `finalizeElements` çıktısında elemanların kararlı bir kimlik/hedefleme anahtarı taşımasını sağlamalı
- [ ] `renderElementsText` çıktısını token açısından kompakt ve deterministik tutmalı
- [ ] Boş veya tümü kırpılmış eleman listesinde makul bir çıktı üretmeli
- [ ] Etiket sanitizasyonunu tıklama/doldurma hedeflemesini bozmayacak şekilde yapmalı
- [ ] ADR-0008'de tanımlı enjeksiyon vektör kümesiyle uyumlu kalmalı
- [ ] Rol sınıflandırmasını hem tıklanabilir hem düzenlenebilir elemanları ayıracak biçimde sunmalı

## Çok niş
- [ ] İç içe geçmiş bidi override/isolate dizilerini dengesiz bırakmadan temizleyebilmeli
- [ ] Latin dışı alfabeleri homoglyph temizliğinde yanlış pozitif olmadan ele alabilmeli
- [ ] Çok büyük ham eleman listelerinde kırpmayı sabit sınırlar içinde tutabilmeli
- [ ] `HIDDEN_PLACEHOLDER`'ın kendisinin yeni bir enjeksiyon yüzeyi oluşturmadığını garanti etmeli
- [ ] `wrapUntrustedContent` sınır işaretleyicisinin sayfa içeriğiyle taklit edilerek aşılmasına karşı dayanıklı olmalı
- [ ] Aynı etikette hem zero-width hem homoglyph bulunduğunda kuralları tek geçişte uygulayabilmeli
- [ ] Segment sınırında bölünmüş çok baytlı karakterleri bozmadan işleyebilmeli
