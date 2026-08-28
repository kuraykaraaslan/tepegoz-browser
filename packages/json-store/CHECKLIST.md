# json-store — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Ana süreç store'ları için küçük, crash-safe JSON dosya yardımcıları (Node-only, Electron yok); `credential-vault` ve `preferences` durumlarını `userData` altında düz JSON olarak saklamak için kullanır.

## Kesinlikle olmalı
- [ ] `readJsonFile(filePath)` dosyayı okuyup `JSON.parse` etmeli
- [ ] Dosya yoksa `undefined` döndürmeli (fırlatmamalı)
- [ ] Parse başarısızsa `undefined` döndürmeli (fırlatmamalı)
- [ ] `readJsonFile` hiçbir durumda exception fırlatmamalı
- [ ] Dönen değeri `unknown` olarak tiplemeli; çağıran doğrulamadan kullanmamalı
- [ ] `writeJsonFile(filePath, data)` veriyi serialize etmeli
- [ ] Yazmayı önce kardeş `.tmp` dosyasına yapmalı
- [ ] `.tmp` dosyasını `fsync`'lemeli
- [ ] `.tmp`'yi hedefin üzerine atomik `rename` ile taşımalı
- [ ] Gerekirse üst dizini oluşturmalı
- [ ] Yalnızca Node kullanmalı; Electron importu içermemeli
- [ ] Yazma sırasında çökme/güç kaybı hedef dosyayı bozuk/yarım bırakmamalı
- [ ] `credential-vault` ve `preferences` için JSON kalıcılığını karşılamalı

## Olsa iyi olur
- [ ] Çağıranların dönen şekli zod ile doğrulamasını sözleşme olarak varsaymalı (dosya güvenilmez)
- [ ] Bozuk vault dosyasının bir sonraki mutasyonda sessizce boş map ile ezilmesini önlemeli
- [ ] `.tmp` dosyası benzersiz/çakışmasız adlandırılmalı
- [ ] Başarısız yazmada eski hedef dosya sağlam kalmalı
- [ ] Yazılan JSON insan tarafından okunabilir biçimde olmalı
- [ ] `userData` altındaki düz JSON dosyaları için tasarlanmalı
- [ ] Rename öncesi hata durumunda yarım `.tmp` dosyası geride bırakılmamalı

## Çok niş
- [ ] Eski şema sürümünden gelen dosyalar da parse edilip çağırana ham verilebilmeli
- [ ] Kurcalanmış (tampered) dosya parse hatası gibi ele alınmalı, çökme olmamalı
- [ ] Dizin `fsync`'i ile rename'in kalıcılığı da garanti edilebilmeli
- [ ] Çok büyük JSON dosyalarında da bellek-güvenli davranmalı
- [ ] Aynı dosyaya eşzamanlı yazmalarda son yazan tutarlı bir dosya bırakmalı
