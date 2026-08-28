# find-bar — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Presentational leaf: Ctrl+F sayfa-içi arama çubuğu; Electron-free, host `webContents.findInPage` çalıştırıp sayıları prop olarak besler, çubuk kendi dict'inden self-localize olur.

## Kesinlikle olmalı
- [ ] `FindBar` bir sorgu girişi, `n/m` sayaç, match-case toggle, prev/next stepper ve kapatma düğmesi sunmalı
- [ ] Mount'ta input'a odaklanıp içeriğini seçmeli — tekrar Ctrl+F önceki sorgunun üzerine yazsın
- [ ] Enter / Shift+Enter eşleşmeler arasında ileri/geri ilerlemeli
- [ ] Escape çubuğu kapatmalı
- [ ] Enter/Shift+Enter/Escape input üzerinde ele alınmalı, bu tuşlar alttaki sayfaya ulaşmamalı
- [ ] Eşleşme sayısını (`activeMatch`/`totalMatches`) prop olarak alıp göstermeli, kendisi arama yapmamalı
- [ ] Electron-free olmalı, bridge'e hiç dokunmamalı (jsdom'da unit-test edilebilmeli)
- [ ] Kendi `en`/`tr` sözlüğünden (`findBarDict`) self-localize olmalı
- [ ] Sayaç "sonuç yok" ile `n/m` arasında kendisi karar vermeli (string'ler davranışın parçası)
- [ ] `onQueryChange` ile sorgu değişimini host'a iletmeli
- [ ] `onNext`/`onPrevious` ile adım isteklerini host'a iletmeli
- [ ] `onToggleMatchCase` ile match-case durum değişimini host'a iletmeli
- [ ] `onClose` ile kapatmayı host'a iletmeli
- [ ] `FindBarProps` enjekte-props sözleşmesini dışa aktarmalı
- [ ] `findBarDict`'i dışa aktarmalı

## Olsa iyi olur
- [ ] `matchCase` durumunu controlled prop olarak yansıtmalı
- [ ] Toplam eşleşme 0 iken prev/next stepper'ları etkisiz/disabled göstermeli
- [ ] Boş sorguda sayaç ve stepper'ları nötr durumda tutmalı
- [ ] en/tr sözlük anahtar kümeleri birebir eşleşmeli
- [ ] Çubuk dar pencerede taşmadan yerleşmeli
- [ ] Klavye ve ekran okuyucu için erişilebilir etiketler taşımalı
- [ ] Kapatıldıktan sonra yeniden açıldığında input yeniden odaklanıp seçilmeli

## Çok niş
- [ ] Çok büyük `totalMatches` değerini sayaçta okunur biçimde biçimlendirmeli
- [ ] `activeMatch > totalMatches` gibi tutarsız prop kombinasyonlarında çökmemeli
- [ ] Hızlı ardışık Enter basışlarında adım isteklerini kaybetmeden iletmeli
- [ ] Sözlükte karşılığı olmayan dilde çekirdek dile düşmeli
