# recipe-compiler — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Bir "recipe"in (damıtılmış, tekrar oynatılabilir otomasyon) geçtiği deterministik geçitler — model çağrısı yok, her fonksiyon düz bir karşılaştırma.

## Kesinlikle olmalı

- [ ] Paketteki hiçbir fonksiyon model/LLM çağrısı yapmamalı; hepsi düz karşılaştırma olmalı.
- [ ] Tüm fonksiyonlar saf (pure) olmalı; yan etkisi olmamalı.
- [ ] Şema kaynağı olarak yalnızca `@tepegoz/shared-types` kullanılmalı.
- [ ] `evaluateAssertion(assertion, snapshot)` bir recipe'in post-koşulunu `RunSnapshot`'a karşı değerlendirmeli.
- [ ] `evaluateAssertion` `{ passed }` döndürmeli ve başarısızlıkta bir gerekçe (reason) taşımalı.
- [ ] `RunSnapshot` değerlendirmesi URL, sayfa metni, journal'lanmış efekt türleri ve çıkarılmış sayısal değerleri kapsamalı.
- [ ] Değerlendirilen post-koşul, recipe'in *orijinal başarılı* çalışmasının fiilen sağladığı koşul olmalı (distill anında yakalanan, dilek olarak yazılmayan).
- [ ] `evaluateAssertion` "penultimate-step abandonment"i (bir adım erken durup yine de başarı raporlayan ajan) yakalayabilmeli.
- [ ] `shouldHaltOnFailure(...)` başarısız bir assertion'ın çalışmayı durduracağını mı yoksa yalnızca uyarı mı olduğunu belirlemeli.
- [ ] `narrowToUnattended` AutomationScheduler için mühürlü, tek yönlü daraltma sağlamalı (ADR-0013).
- [ ] `mayRunUnattended` bir adımın gözetimsiz çalışıp çalışamayacağına evet/hayır cevabı vermeli.
- [ ] Zamanlanmış bir çalışma yalnızca okuma + yazar zamanında ön onaylı idempotent durum değişikliklerine erişebilmeli.
- [ ] Gözetimsiz yetki hiçbir zaman recipe'in kendi etkileşimli yazım çalışmasının onayladığından daha geniş olmamalı.
- [ ] `destructive` adımlar hiçbir zaman otomatik çalışmamalı; hiçbir bayrak bunu geçersiz kılmamalı.
- [ ] `financial` adımlar hiçbir zaman otomatik çalışmamalı; hiçbir bayrak bunu geçersiz kılmamalı.
- [ ] Zamanlama, recipe'in yetkisini sonradan büyütememeli.
- [ ] Her geçit fonksiyonu birim testli olmalı.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` script'leri çalışır olmalı.
- [ ] Pause/resume mantığı bu modülde olmamalı; modül yalnızca yes/no cevabı vermeli.
- [ ] Girdi şemaları güven sınırında `safeParse` ile doğrulanmalı.

## Olsa iyi olur

- [ ] `evaluateAssertion` başarısızlık gerekçesi hangi alanın (URL/metin/efekt/sayısal) uyuşmadığını makine-okunur biçimde belirtmeli.
- [ ] Sayısal karşılaştırmalar tam eşitlik yerine tolerans/aralık desteklemeli.
- [ ] Assertion türleri genişletilebilir olmalı (yeni snapshot boyutları eklenebilmeli).
- [ ] `shouldHaltOnFailure` kararının gerekçesi loglanabilir/journal'lanabilir olmalı.
- [ ] Daraltma sonucu, hangi yeteneklerin kesildiğini denetlenebilir bir kayıt olarak üretmeli.
- [ ] Bir recipe'in beklenen post-koşulu insan-okunur biçimde özetlenebilmeli.
- [ ] `RunSnapshot` üretimi için yardımcı/normalizasyon fonksiyonları sunulmalı.
- [ ] Sayfa metni karşılaştırması boşluk/normalize farklarına dayanıklı olmalı.

## Çok niş

- [ ] Çıkarılmış sayısal değerlerde para birimi ve binlik ayıracı yerelleştirmesi ele alınmalı.
- [ ] `destructive`/`financial` sınıflandırması belirsiz bir adım için güvenli tarafta (otomatik çalıştırma) kalmalı.
- [ ] Aynı `assertion` + `snapshot` çifti için deterministik, tekrarlanabilir sonuç garantisi.
- [ ] Journal efekt türleri sürüm değiştiğinde geriye dönük assertion'lar hâlâ değerlendirilebilmeli.
- [ ] Boş/eksik snapshot alanları "geçti" değil "değerlendirilemedi" olarak ele alınmalı.
- [ ] Çok adımlı bir recipe'de ara adım assertion'ları ile nihai assertion ayırt edilebilmeli.
- [ ] Daraltma fonksiyonu idempotent olmalı; iki kez uygulanınca yetkiyi daha da daraltmamalı ama genişletmemeli de.
