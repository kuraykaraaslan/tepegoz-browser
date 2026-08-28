# password-provider-google-csv — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Google Password Manager'ın CSV birlikte-çalışma biçimini uygulayan bir `PasswordProvider`: kendi başına salt-okunur, hiç kimlik-bilgisi tutmaz; `set()`/`export()` kayıtlı `local` sağlayıcıya devreder, yalnızca CSV ayrıştırma/serileştirme veri-düzlemini sahiplenir, şifreleme anahtarlarına hiç dokunmaz.

## Kesinlikle olmalı
- [ ] `@tepegoz/password-core`'daki `PasswordProvider` arayüzünü uygulamalı
- [ ] `id: 'google-csv'` olmalı
- [ ] `displayName: 'Google Password Manager (CSV)'` olmalı
- [ ] `capabilities`: `{ canWrite: false, canImport: true, canExport: true, canSync: false }` olmalı
- [ ] `list()` / `findById()` / `findByUrl()` boş / no-op olmalı (hiç kimlik-bilgisi tutmaz)
- [ ] `import(data)` Google'ın CSV dışa aktarımını ayrıştırabilmeli
- [ ] `import()` her satır için local vault'un `set()`'ini çağırmalı
- [ ] `import()` sonucu `{ imported, skipped, errors }` olarak toplamalı
- [ ] `set()` tamamen kayıtlı `local` sağlayıcıya devretmeli
- [ ] `export(format)` local vault'un kendi `export`'una devretmeli
- [ ] Şifreleme anahtarlarına kendisi asla dokunmamalı
- [ ] `parseGoogleCsv(csv)` saf bir ayrıştırıcı olmalı
- [ ] Ayrıştırıcı, varsa başlık satırını (name/url/username/note) otomatik algılayıp atlamalı
- [ ] Ayrıştırıcı `url` / `username` / `password` eksik satırları elemeli
- [ ] Ayrıştırıcı, gömülü virgül/tırnak içeren tırnaklı alanları ele almalı
- [ ] `serializeGoogleCsv(rows)` ters yönde saf serileştirici olmalı
- [ ] Serileştirici, ayrıştırıcıyla aynı başlık ve tırnaklama kurallarını kullanmalı
- [ ] `googleCsvProvider` tekil (singleton) örneğini dışa vermeli
- [ ] Local vault'u tek şifreli depolama motoru olarak korumalı

## Olsa iyi olur
- [ ] Round-trip: `serialize(parse(csv))` geçerli satırları korumalı
- [ ] Atlanan satır sayısı başlık ile bozuk satırı ayırt etmeli
- [ ] `errors` dizisi satır başına neden taşımalı
- [ ] CRLF ve LF satır sonlarını tolere etmeli
- [ ] Sondaki fazladan newline / boş son satırı tolere etmeli
- [ ] Dosya başındaki BOM'u tolere etmeli
- [ ] Başlık eşlemesi sayesinde sütun sırasından bağımsız çalışmalı
- [ ] Boş CSV girişi hata değil boş sonuç üretmeli

## Çok niş
- [ ] Tırnak içinde gömülü satır sonu (newline) içeren alanları ele almalı
- [ ] Bir CSV içinde yinelenen satırları (aynı url+username) politikaya göre ele almalı
- [ ] Çok büyük CSV içe aktarımını sınırlı/akışlı bellek kullanımıyla yapmalı
- [ ] UTF-8 olmayan kodlamalı CSV'yi net biçimde reddetmeli
- [ ] Opsiyonel olsa da `note` sütununu dışa aktarımda taşımalı
- [ ] Fazladan / bilinmeyen sondaki sütunları zarifçe yok saymalı
