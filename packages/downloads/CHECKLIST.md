# downloads — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Preload-safe public tipleri, reducer/selector'ları ve trust/risk yardımcılarını barındıran headless browser-download domain paketi; Electron, dosya yolları, quarantine taşımaları ve IPC desktop host'ta kalır.

## Kesinlikle olmalı
- [ ] Paket headless olmalı — Electron, filesystem ve IPC içermemeli
- [ ] Preload-safe public download tiplerinin sahibi olmalı
- [ ] Download state için bir reducer sağlamalı
- [ ] Download state üzerinde selector'lar sağlamalı
- [ ] Trust/risk yardımcıları sağlamalı — bir indirmenin riskli olup olmadığını belirlemeli
- [ ] Public tipler preload'da güvenle import edilebilmeli (bağımlılıksız)
- [ ] Reducer indirme yaşam döngüsü olaylarını işlemeli (başladı, ilerliyor, tamamlandı, hata, iptal)
- [ ] Filesystem path'leri, quarantine taşımaları ve IPC bu pakette değil host'ta olmalı
- [ ] Trust/risk sınıflandırması host'un quarantine kararına girdi olabilmeli
- [ ] Public tipler tek şema kaynağından türemeli / dışa aktarılmalı

## Olsa iyi olur
- [ ] Selector'lar aktif / tamamlanmış / başarısız indirmeleri ayırabilmeli
- [ ] Risk helper'ı dosya uzantısı / MIME'e göre tehlikeli türleri işaretlemeli
- [ ] Reducer saf olmalı (yan etkisiz); aynı girdi → aynı çıktı
- [ ] İlerleme yüzdesi / kalan süre selector ile türetilebilmeli
- [ ] Public tipler host'un quarantine durumunu bir alan olarak temsil edebilmeli
- [ ] Selector sonuçları memoize edilebilir / referans-kararlı olmalı

## Çok niş
- [ ] Aynı dosya adının tekrar indirilmesi state'te çakışmadan temsil edilmeli
- [ ] Bilinmeyen veya eksik alanlı indirme olayı reducer'ı çökertmemeli
- [ ] Çok sayıda eşzamanlı indirme ile selector performansı makul kalmalı
- [ ] Risk helper'ı çift uzantı (ör. `.pdf.exe`) gibi aldatma kalıplarını yakalamalı
- [ ] Reducer bilinmeyen action türünde state'i değiştirmeden döndürmeli
- [ ] İptal edilip yeniden başlatılan indirme aynı kimlik altında izlenebilmeli
