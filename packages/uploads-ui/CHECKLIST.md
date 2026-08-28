# uploads-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Salt sunum `tepegoz://uploads` aktivite yüzeyi: host list/command/subscribe callback'lerini enjekte eder; paket yalnızca UI state'i ile en/tr string'lerini sahiplenir. Upload kayıtları redaktedir — yerel yollar ve içerik bu renderer paketine hiç girmez.

## Kesinlikle olmalı
- [ ] `tepegoz://uploads` aktivite yüzeyini salt sunum bileşeni olarak render edebilmeli
- [ ] Upload listesini host'un enjekte ettiği list callback'i üzerinden almalı
- [ ] Upload üzerinde eylemleri host'un enjekte ettiği command callback'i üzerinden çalıştırmalı
- [ ] Canlı güncellemeleri host'un enjekte ettiği subscribe callback'i üzerinden almalı
- [ ] Yalnızca UI state'i sahiplenmeli — upload verisini kendisi tutmamalı/çekmemeli
- [ ] en ve tr string'lerini paket içinde sahiplenmeli
- [ ] Yerel dosya yolları ve dosya içeriğinin bu renderer paketine girmesine izin vermemeli
- [ ] Redakte edilmiş upload kayıtlarını olduğu gibi göstermeli (redaksiyonu kaldırmaya çalışmamalı)
- [ ] Electron bridge'e doğrudan bağımlılığı olmamalı (her şey callback ile enjekte)

## Olsa iyi olur
- [ ] Upload'ları duruma (aktif / tamamlanmış / hatalı) göre gruplayarak veya filtreleyerek gösterebilmeli
- [ ] Risk seviyesini görsel bir rozet/uyarı ile gösterebilmeli
- [ ] subscribe callback'i güncelleme yayınladığında listeyi yeniden çekmeden tazeleyebilmeli
- [ ] Boş durum (hiç upload yok) için anlamlı bir mesaj göstermeli
- [ ] Bir upload için mevcut command'leri (iptal, kaldır vb.) duruma göre etkin/pasif gösterebilmeli
- [ ] Dil değişiminde en/tr string'leri arasında geçişi desteklemeli
- [ ] Uzun listelerde kaydırılabilir, performanslı bir liste sunabilmeli
- [ ] Zaman damgalarını yerelleştirilmiş biçimde gösterebilmeli

## Çok niş
- [ ] subscribe callback'inden unmount'ta düzgün şekilde abonelikten çıkabilmeli (sızıntı olmadan)
- [ ] command callback bir hata döndürdüğünde UI state'ini tutarlı bırakıp kullanıcıya bildirmeli
- [ ] Aynı upload için hızlı ardışık güncellemelerde son durumu yanlış sıralamadan göstermeli
- [ ] Redakte kayıtta beklenmeyen bir alan (ör. ham yol) gelirse onu göstermeden ele almalı
- [ ] Çok uzun dosya adlarını yolu ima etmeden kısaltarak gösterebilmeli
- [ ] tr çevirisi eksik bir anahtar olduğunda en fallback'ine düşebilmeli
