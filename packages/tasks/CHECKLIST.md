# tasks — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Electron-free görev productization domain'i: kaydedilmiş agent görevleri, tetikleyici tanımları, redakte run/artifact kayıtları, reducer/selector'lar, main-only zod şemaları ve `task_*` Capability Plane araç kaydı.

## Kesinlikle olmalı
- [ ] Kaydedilmiş agent görevlerini (saved agent tasks) bir domain modeli olarak tutabilmeli
- [ ] Her görev için tetikleyici tanımlarını (trigger definitions) saklayabilmeli
- [ ] Görev çalıştırma kayıtlarını (run records) redakte edilmiş biçimde tutabilmeli
- [ ] Görev çıktısı/artifact kayıtlarını redakte edilmiş biçimde tutabilmeli
- [ ] Hassas/serbest metin alanlarının run ve artifact kayıtlarına redaksiyonsuz girmesini engellemeli
- [ ] Durum geçişlerini saf bir reducer ile yönetebilmeli
- [ ] Görev / çalıştırma / artifact sorguları için selector'lar sunmalı
- [ ] Zod şemalarını yalnızca main süreçte (main-only) tanımlamalı
- [ ] Görev, tetikleyici, run ve artifact kayıtlarını trust boundary'de zod ile doğrulayabilmeli
- [ ] `task_*` araçlarını Capability Plane'e kaydedebilmeli
- [ ] Electron API'lerine bağımlılık içermemeli (Electron-free kalmalı)
- [ ] Reducer'ı yan etkisiz (saf) tutmalı — I/O yapmamalı
- [ ] Görev yaşam döngüsünü (oluştur / güncelle / sil) reducer aksiyonlarıyla kapsamalı

## Olsa iyi olur
- [ ] Bir görevin birden çok tetikleyici tanımını destekleyebilmeli
- [ ] Run kayıtlarını görevine göre gruplayan/filtreleyen selector sunmalı
- [ ] Son çalıştırma durumunu (başarılı / başarısız / çalışıyor) selector ile verebilmeli
- [ ] Artifact kayıtlarını ait olduğu run'a bağlayabilmeli
- [ ] Zod şemalarını `@tepegoz/shared-types` tek şema kaynağı ilkesine uygun türetmeli
- [ ] Görev etkin/pasif (enabled) durumunu modelde tutabilmeli
- [ ] Redaksiyon kurallarını run ve artifact için tek yerde tanımlamalı
- [ ] `task_*` araç kaydını uygulama başlangıcında bir kez yapılacak şekilde sunmalı
- [ ] Bilinmeyen aksiyon veya geçersiz state'te reducer'ın mevcut state'i bozmadan dönmesini sağlamalı

## Çok niş
- [ ] Şema doğrulaması başarısız olan run/artifact kaydını sessizce kabul etmek yerine reddedebilmeli
- [ ] Tetikleyici tanımına ileride yeni tür eklendiğinde şemayı geriye dönük uyumlu tutabilmeli
- [ ] Çok sayıda geçmiş run kaydında selector'ların gereksiz yeniden hesap yapmamasını sağlayabilmeli
- [ ] Redakte edilmiş kayıtların bile kullanıcı kimliği / gizli anahtar sızdırmadığını garanti etmeli
- [ ] Görev silindiğinde ona bağlı run/artifact kayıtlarının selector'larda tutarlı görünmesini sağlamalı
- [ ] Main-only şemaların renderer bundle'ına sızmasını engelleyecek şekilde ayrılmış olmalı
