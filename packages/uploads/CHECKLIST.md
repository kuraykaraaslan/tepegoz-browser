# uploads — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tarayıcı dosya yüklemeleri için Electron-free upload broker domain modeli: redakte upload kayıtları, status/risk yardımcıları, zod şemaları ve `upload_*` Capability Plane kaydı. Dosya yolları, CDP file-input bağlama, native dialog ve Event Journal denetimi desktop'a aittir.

## Kesinlikle olmalı
- [ ] Tarayıcı dosya yüklemeleri için Electron-free bir upload broker domain modeli sunmalı
- [ ] Redakte edilmiş upload kayıtlarını tutabilmeli
- [ ] Yerel dosya yollarının ve dosya içeriğinin upload kayıtlarına girmesini engellemeli
- [ ] Upload durumu (status) için yardımcılar sunmalı
- [ ] Upload riski (risk) için yardımcılar sunmalı
- [ ] Upload kayıtları için zod şemalarını sahiplenmeli
- [ ] Upload kayıtlarını trust boundary'de zod ile doğrulayabilmeli
- [ ] `upload_*` araçlarını Capability Plane'e kaydedebilmeli
- [ ] Dosya yolları, CDP file-input bağlama, native dialog ve Event Journal denetimini kendine almamalı (desktop'a bırakmalı)
- [ ] Electron API'lerine bağımlılık içermemeli

## Olsa iyi olur
- [ ] Durum yardımcılarıyla bir upload'ın terminal (tamamlandı / iptal / hata) olup olmadığını belirleyebilmeli
- [ ] Risk yardımcılarıyla dosya türü/uzantısına göre bir risk seviyesi türetebilmeli
- [ ] Zod şemalarını `@tepegoz/shared-types` tek şema kaynağı ilkesiyle uyumlu tutmalı
- [ ] Upload kayıtlarını başlatan siteye/origin'e göre ilişkilendirebilmeli
- [ ] Redaksiyon kuralını dosya adı gösterirken bile yol bileşenini düşürecek şekilde uygulamalı
- [ ] `upload_*` araç kaydını uygulama başlangıcında bir kez yapılacak şekilde sunmalı
- [ ] Kayıt için oluşturulma/güncellenme zaman damgası gibi asgari meta veriyi tutabilmeli

## Çok niş
- [ ] Şema doğrulaması başarısız bir upload kaydını sessizce kabul etmek yerine reddedebilmeli
- [ ] Aynı file-input'a art arda bağlanan yüklemeleri ayrı kayıtlar olarak izleyebilmeli
- [ ] Çok sayıda geçmiş upload kaydında durum/risk yardımcılarını ucuz tutabilmeli
- [ ] Redakte edilmiş kaydın bile kullanıcı adı içeren yol parçası sızdırmadığını garanti etmeli
- [ ] Risk seviyesi bilinmeyen / uzantısız dosyalarda makul bir varsayılana düşebilmeli
- [ ] Desktop tarafı iptal ettiğinde domain durumunu tutarlı bir terminal duruma taşıyabilmeli
