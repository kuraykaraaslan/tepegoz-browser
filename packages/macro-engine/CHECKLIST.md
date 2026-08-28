# macro-engine — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Deterministik, model-free makro yorumlayıcısı (modern iMacros ardılı): iç içe kontrol akışı, sınırsız değişken/dizi, CSV `forEachRow`, sandbox'lı ifade dili ve her element adımında host içinde auto-wait.

## Kesinlikle olmalı
- [ ] `runMacro` bir `Macro`'yu bir `MacroHost`'a karşı çalıştırmalı
- [ ] Yorumlayıcı deterministik ve model-free olmalı
- [ ] `if` / `repeat` kontrol akışını (iç içe dahil) desteklemeli
- [ ] Sınırsız değişken ve dizi desteklemeli
- [ ] CSV tabanlı `forEachRow`'u restart özelliğiyle desteklemeli
- [ ] iMacros `EVAL`'ı, keyfi JS çalıştırmayan sandbox'lı bir ifade diliyle değiştirmeli
- [ ] Element hedefleyen her adım host içinde auto-wait yapmalı (çözülene veya timeout'a kadar poll)
- [ ] Element beklemede sabit aralıklı `sleep` kullanmamalı
- [ ] Hataları konumlu `MacroError` olarak yüzeye çıkarmalı (hangi adım, iç içe yapıda hangi path)
- [ ] Electron'dan bağımsız olmalı; tarayıcı işlemleri `MacroHost` ile enjekte edilmeli
- [ ] `RunOptions` girişini desteklemeli (başlangıç değişkenleri, cancellation signal, `onProgress`, wait/step-count/pacing override)
- [ ] `RunResult` döndürmeli (`ok` / `aborted` / `stepsRun` / son `variables`)
- [ ] Runaway-loop guard uygulamalı (`maxSteps`, varsayılan 100.000 toplam leaf adım)
- [ ] Minimum post-operation pacing floor uygulamalı
- [ ] `RunProgress` union'ını (`started` / `step` / `done` / `failed`) yayınlamalı
- [ ] `failed` progress olayı başarısız adımın path'ini ve kind'ını taşımalı
- [ ] `MacroHost` sözleşmesini tanımlamalı (`navigate` / `click` / `fill` / `press` / `scroll` / `extract` / `waitFor` / `waitForLoad` / `elementExists` / `elementVisible` / `pageContainsText` / `readCsv` / `sleep`)
- [ ] Her element çağrısı bir `SelectorChain` almalı
- [ ] `VariableStore` değişken/dizi bağlama deposunu sağlamalı
- [ ] `evalExpr` / `Scope` sandbox'lı ifade değerlendiricisini sağlamalı
- [ ] `evalPredicate` bir `if`/loop koşulunu mevcut scope'a göre değerlendirmeli
- [ ] `MacroError` ve `MacroAborted` hata tiplerini dışa vermeli
- [ ] `MacroValue` tipini ve `toStr` / `toNum` / `toBool` coercion'larını dışa vermeli

## Olsa iyi olur
- [ ] `Macro` tipini `@tepegoz/shared-types`'tan almalı (kendi şemasını tanımlamamalı)
- [ ] `onProgress` `step` olaylarıyla UI ilerleme gösterebilmeli
- [ ] Cancellation signal koşan macro'yu ortada temiz durdurup `RunResult.aborted` vermeli
- [ ] `forEachRow` keyfi bir satırdan yeniden başlayabilmeli (restart)
- [ ] Opsiyonel `highlight` ile record/replay UX'i desteklemeli
- [ ] iMacros'un "bekle ve umut et" başarısızlık modunu auto-wait ile ortadan kaldırmalı
- [ ] `RunResult.stepsRun` çalıştırılan leaf adım sayısını doğru saymalı
- [ ] Sandbox ifade dili değişken/dizi/aritmetik/karşılaştırma operatörlerini desteklemeli

## Çok niş
- [ ] Verilen `pacing` override'ı floor'un altındaysa floor'a clamp edilmeli
- [ ] İç içe yapı path'i okunur biçimde raporlanmalı (ör. `repeat[2] > if > click`)
- [ ] `maxSteps` aşıldığında runaway olarak durup net hata vermeli
- [ ] CSV satır sonu / tırnak / ayraç kenar durumları `readCsv` seam'ine bırakılırken tutarlı tüketilmeli
- [ ] `evalExpr` sandbox'ı global scope / prototype erişimini engellemeli
- [ ] `waitFor` timeout'u adım veya `RunOptions` override'larından türetilebilmeli
