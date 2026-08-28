# process-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunumsal `tepegoz://process` yüzeyi: tarayıcı süreç ağacını (browser / GPU / utility / sekme renderer'ları) CPU, bellek ve PID ile listeleyen, bir sekme için "end process" sunan Chrome tarzı Görev Yöneticisi; host poll ve end-process callback'lerini enjekte eder.

## Kesinlikle olmalı
- [ ] `tepegoz://process` yüzeyini Chrome tarzı bir Görev Yöneticisi olarak sunmalı
- [ ] Tarayıcı süreç ağacını listelemeli: browser / GPU / utility / sekme başına renderer'lar
- [ ] Her satır için CPU, bellek ve PID göstermeli
- [ ] Bir sekme için "end process" (süreci sonlandır) eylemi sunmalı
- [ ] Poll (yoklama) callback'ini host'tan enjeksiyonla almalı, kendi veri toplamamalı
- [ ] End-process callback'ini host'tan enjeksiyonla almalı
- [ ] Yalnızca UI durumunu, satır şekillendirmeyi ve en/tr stringlerini sahiplenmeli
- [ ] Salt sunumsal (presentational) kalmalı — Electron/süreç API'sine doğrudan dokunmamalı
- [ ] İngilizce ve Türkçe stringleri barındırmalı (hardcode UI string yok)

## Olsa iyi olur
- [ ] Poll sonuçlarını periyodik yenileyip tabloyu güncellemeli
- [ ] Süreçleri türe göre (browser/GPU/utility/renderer) etiketleyip/gruplayıp gösterebilmeli
- [ ] CPU ve bellek değerlerini okunabilir biçimde biçimlendirmeli (ör. MB, %)
- [ ] Bir sütuna göre sıralama yapabilmeli (CPU / bellek / PID)
- [ ] "end process" yalnızca sekme renderer'ları için etkin olmalı, browser sürecinde devre dışı
- [ ] Süreç sonlandırıldıktan sonra satırı listeden düşürmeli/güncellemeli

## Çok niş
- [ ] Poll verisi boş/gecikmeli geldiğinde iskelet veya "veri yok" durumu göstermeli
- [ ] Aynı PID'nin iki yoklama arasında kaybolması durumunda satır tutarlı kaldırılmalı
- [ ] Çok sayıda sekme/renderer olduğunda tablo performanslı kalmalı
- [ ] Locale değişiminde başlıklar ve eylem etiketleri anında güncellemeli
- [ ] "end process" callback'i hata döndürdüğünde kullanıcıya geri bildirim vermeli
