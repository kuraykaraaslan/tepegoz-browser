# cert-warning-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Bir sitenin sertifikası doğrulanamadığında gösterilen, sertifika detayları enjekte edilen ve kararı callback'lerle dışarı veren Electron'suz TLS sertifika uyarı bileşeni (Phase 2c).

## Kesinlikle olmalı
- [ ] `CertWarning` doğrulanamayan TLS sertifikası için uyarı yüzeyini render etmeli
- [ ] Güvenli eylem (geri dön) birincil, odaklı ve ilk olmalı
- [ ] Yanlışlıkla basılan Enter kullanıcıyı geri götürmeli, siteye geçirmemeli
- [ ] Risk bir kategori değil sonuç olarak anlatılmalı ("birisi bu siteye gönderdiklerini okuyabilir veya değiştirebilir")
- [ ] Sertifika detayları etiketli kanıt olarak, görsel olarak ikincil gösterilmeli
- [ ] Issuer string'i asla uygulama metni gibi okunmamalı (onu sertifikayı sunan taraf seçti)
- [ ] Dialog devam etmenin ne kadar süreceğini söylemeli (istisna bellekte, process ile ölür)
- [ ] Karar callback'ler üzerinden dışarı çıkmalı
- [ ] Sertifika detayları props ile enjekte edilmeli
- [ ] Paket Electron'dan bağımsız olmalı
- [ ] `CertWarningProps` enjekte-props sözleşmesini tanımlamalı
- [ ] `certWarningDict` `en`/`tr` sözlüğü sağlamalı
- [ ] Tüm kullanıcıya görünen string'ler yerelleştirilmiş olmalı
- [ ] "Yine de devam et" eylemi ikincil ve az vurgulu olmalı

## Olsa iyi olur
- [ ] Bileşen hassas siteler (bankacılık, kripto, sağlık, şifre yöneticileri) için hiç çağrılmadığını varsayabilmeli — ana süreç onları hard-block eder
- [ ] Issuer / konu / geçerlilik alanları ayrı ayrı gösterilebilmeli
- [ ] İstisnanın kalıcı olmadığı metinde açıkça yer almalı
- [ ] Klavye ile gezinme güvenli sırayı korumalı (önce güvenli buton)
- [ ] Uzun issuer string'leri layout'u bozmadan gösterilmeli
- [ ] Hata nedeni (geçersiz CA, süresi dolmuş, isim uyuşmazlığı) kullanıcı diline çevrilebilmeli

## Çok niş
- [ ] Çok uzun veya kötü niyetli issuer metni layout'u bozmamalı ve script enjekte edememeli
- [ ] Sertifika detayı eksik/kısmi enjekte edilirse bileşen çökmemeli
- [ ] `tr` ve `en` metinleri aynı görsel hiyerarşiyi korumalı
- [ ] Ekran okuyucu risk cümlesini sertifika detaylarından önce okumalı
