# extension-catalog — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Tarayıcının yerleşik/birinci-parti eklenti listesi için veri-güdümlü katalog modeli ve yükleyicisi.

## Kesinlikle olmalı
- [ ] `CatalogFileSchema` ile on-disk katalog dosyası envelope'unu zod şeması olarak tanımlamalı
- [ ] `CATALOG_VERSION` sabitini dışa aktarıp katalog dosyasının şema sürümünü işaretlemeli
- [ ] `loadCatalog(raw)` parse edilmiş katalog dosyasını güven sınırında doğrulamalı
- [ ] Malformed girişleri tek tek düşürmeli, tüm dosyayı çöpe atmamalı
- [ ] `LoadCatalogResult` içinde geçerli girişleri döndürmeli
- [ ] `LoadCatalogResult` içinde bozuk her şey için insan-okunur hata metni döndürmeli
- [ ] Eklenti manifest şeklini `@tepegoz/extension-sdk`'den türetmeli, kendi kopyasını tutmamalı
- [ ] Yalnızca `@tepegoz/extension-sdk` ve zod'a bağımlı olmalı
- [ ] Electron'a hiçbir bağımlılık içermemeli
- [ ] `CatalogFile` tipini dışa aktarmalı
- [ ] Eklenti ekleme/emekliye ayırma/yeniden ayarlamayı yalnızca katalog veri dosyası değişikliğiyle mümkün kılmalı
- [ ] Her katalog girişini extension-sdk manifest şemasına göre doğrulamalı

## Olsa iyi olur
- [ ] Her hata mesajı reddedilen girişi tanımlayacak kadar bağlam taşımalı (id/indeks)
- [ ] Aynı katalog dosyasında yinelenen eklenti id'lerini yakalamalı
- [ ] Beklenenden farklı `CATALOG_VERSION` değerini net bir hatayla bildirmeli
- [ ] Boş giriş listesine sahip katalog dosyasını geçerli saymalı
- [ ] Girişlerin dosyadaki sırasını korumalı
- [ ] `@tepegoz/model-catalog` ile tutarlı veri-güdümlü yükleyici deseni sunmalı

## Çok niş
- [ ] Bir girişin yalnızca bazı alanları bozuksa hata mesajında hangi alan olduğunu göstermeli
- [ ] İleride şema sürüm atlamaları için geriye dönük uyumluluk/dönüştürme noktası bırakmalı
- [ ] Çok sayıda girişli büyük katalog dosyasını tek geçişte doğrulayabilmeli
- [ ] Tümüyle geçersiz (JSON değil / obje değil) girdiyi çökmeden `LoadCatalogResult` hatasına çevirmeli
