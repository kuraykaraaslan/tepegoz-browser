# downloads-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> `tepegoz://downloads` yüzeyinin presentational paketi: host list/command/subscribe callback'lerini enjekte eder, paket yalnızca UI state'i ve en/tr string'lerini sahiplenir.

## Kesinlikle olmalı
- [ ] `tepegoz://downloads` yüzeyini presentational olarak render etmeli
- [ ] İndirme listesi host'un enjekte ettiği list callback'inden gelmeli
- [ ] Kullanıcı eylemleri host'un enjekte ettiği command callback'i üzerinden gitmeli
- [ ] Canlı güncellemeler host'un enjekte ettiği subscribe callback'i ile alınmalı
- [ ] Paket yalnızca UI state sahibi olmalı (iş mantığı host'ta)
- [ ] `en`/`tr` string'lerinin sahibi olmalı
- [ ] Tüm kullanıcıya görünen metinler yerelleştirilmiş olmalı
- [ ] Electron / filesystem / IPC içermemeli
- [ ] UI state (seçili öğe, filtre, açık menü) yalnızca bu pakette tutulmalı

## Olsa iyi olur
- [ ] Hiç indirme yokken ayrı bir boş durum görünümü gösterilmeli
- [ ] İndirme başına eylemler (aç, klasörde göster, iptal, tekrar dene, kaldır) command callback'ine map edilmeli
- [ ] İlerleme çubuğu / yüzde subscribe güncellemeleriyle canlı yenilenmeli
- [ ] Riskli / quarantine edilmiş indirme görsel olarak işaretlenmeli
- [ ] Liste en yeni indirme üstte olacak şekilde sıralanmalı
- [ ] subscribe aboneliği unmount'ta temizlenmeli

## Çok niş
- [ ] Çok uzun dosya adları taşmadan gösterilmeli (kısaltma / tooltip)
- [ ] Host callback'i hata dönerse UI çökmeden hata durumu göstermeli
- [ ] Binlerce indirme kaydında liste akıcı kalmalı (virtualize veya sınır)
- [ ] `tr` ve `en` metinleri aynı layout'a sığmalı
- [ ] Aynı anda gelen çok sayıda subscribe olayı UI'da batch'lenebilmeli
