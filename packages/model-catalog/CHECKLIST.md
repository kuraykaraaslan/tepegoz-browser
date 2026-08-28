# model-catalog — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> İndirilebilir GGUF modellerinin veri odaklı kataloğu (models.catalog.json) ile indirme, doğrulama ve kurulum-durumu takibinin saf orkestrasyonu; bir model yüklenmeden önce sha256 bütünlüğü zorunlu, tüm disk/ağ I/O'su enjekte.

## Kesinlikle olmalı
- [ ] İndirilebilir GGUF modellerini veri odaklı bir listeden (models.catalog.json) okuyabilmeli — model eklemek/ayarlamak kod değil veri değişikliği olmalı
- [ ] ModelEntrySchema ile her katalog girdisini (id, name, url, sizeBytes, sha256, quant, ctx, paramsB, recommended/firstParty, license, minRamBytes) doğrulamalı
- [ ] loadCatalog(raw) ile ayrıştırılmış katalog dosyasını güven sınırında doğrulamalı
- [ ] Bozuk veya yinelenen id'li girdileri tek tek atmalı, tüm dosyayı reddetmemeli
- [ ] loadCatalog geçerli girdilerle birlikte insan-okunur hataları da döndürmeli
- [ ] CatalogFileSchema + CATALOG_VERSION ile disk katalog dosyası zarfını doğrulamalı
- [ ] Bir model yüklenmeden önce sha256 bütünlük doğrulaması zorunlu olmalı
- [ ] sha256OfStream ile biten bir indirmeyi uçtan uca akış üzerinden özetleyebilmeli
- [ ] sha256OfBuffer ile bellekteki bir tamponun özetini alabilmeli
- [ ] digestsMatch ile büyük/küçük harf duyarsız özet karşılaştırması yapmalı
- [ ] downloadStream(url, deps) ile HTTP Range ile devam ettirilebilir (resumable) indirme yürütmeli
- [ ] İndirme sırasında ilerleme (progress) bildirmeli
- [ ] İşbirlikçi (cooperative) iptal ile devam eden indirmeyi durdurabilmeli
- [ ] Tüm disk/ağ I/O'sunu DownloadStreamDeps üzerinden enjekte almalı — sahte akış üzerinde birim-test edilebilir olmalı
- [ ] ModelInstallSchema / ModelInstallStatusEnum ile per-model kurulum kaydını (downloading/installed/error, indirilen bayt, sha256Verified, dosya yolu) doğrulamalı
- [ ] loadInstallState ile kurulum-durumu dosyasını okuyabilmeli
- [ ] upsertInstall / removeInstall / findInstall saf ve değişmez (immutable) yardımcılar olmalı
- [ ] Kurulum-durumu dosyasını hoşgörülü yüklemeli: bozuk kayıtları atıp gerisini korumalı

## Olsa iyi olur
- [ ] recommended / firstParty bayraklarını UI'ın öne çıkarması için taşımalı
- [ ] minRamBytes ile bir modelin cihazda çalışıp çalışamayacağını belirtebilmeli
- [ ] license alanını her girdi için taşımalı
- [ ] Kesintiye uğramış bir indirmeyi kaldığı bayttan sürdürebilmeli (Range resume)
- [ ] quant / ctx / paramsB meta verilerini kullanıcıya model seçiminde sunabilmeli
- [ ] Gerçek axios akışı + dosya append'i pakete sızdırmadan desktop'a bırakabilmeli (temiz seam)
- [ ] error durumundaki bir kurulum kaydından yeniden denemeye izin vermeli
- [ ] Aynı id'ye tekrar upsert edildiğinde kaydı yerinde güncellemeli, çoğaltmamalı

## Çok niş
- [ ] Katalog dosyasında CATALOG_VERSION uyuşmazlığında güvenli davranmalı
- [ ] İndirme tamamlandıktan sonra sha256 tutmuyorsa dosyayı installed işaretlememeli
- [ ] Kısmi indirilmiş dosya diskte varken sha256OfStream yeniden hesaplayıp doğrulayabilmeli
- [ ] Sunucu Range isteklerini desteklemiyorsa indirmeyi baştan yürütebilmeli
- [ ] Aynı katalogda iki girdi aynı sha256'yı paylaşırsa yine de id'ye göre ayrı izlenmeli
- [ ] İptal edilen indirmenin kısmi baytları bir sonraki denemede sayaçla tutarlı kalmalı
- [ ] install-state dosyası tümüyle bozuksa boş durumla açılıp çökmemeli
