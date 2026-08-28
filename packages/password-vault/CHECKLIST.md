# password-vault — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> SQLite ile desteklenen yerel şifreli parola kasası: enjekte edilen bir `SecretCrypto` ile şifreleyen, ham parolayı paket dışına çıkarmayan bir `PasswordProvider` ve onun CRUD katmanı.

## Kesinlikle olmalı
- [ ] `PasswordVault`'ı `PasswordProvider` olarak `id: 'local'`, `displayName: 'Local Vault'` kimliğiyle sunmalı
- [ ] Parolayı diske yazmadan önce enjekte edilen `SecretCrypto` ile şifrelemeli
- [ ] Ham (şifresiz) parola bu paketin dışına asla çıkmamalı
- [ ] `findById` / `findByUrl` yalnızca ana süreçte çağrılabilir olmalı, IPC üzerinden asla açılmamalı
- [ ] `decrypt(credential)` yalnızca ana süreçte çalışmalı, bir IPC handler'ından çağrılmamalı
- [ ] `init({ crypto, db })` uygulama başlangıcında bir kez çağrılmalı
- [ ] `reset()` bir test dikişi olarak sağlanmalı
- [ ] `list()` tüm saklı kimlik bilgilerini döndürmeli
- [ ] `findById` / `findByUrl` tam ama hâlâ şifreli kaydı döndürmeli
- [ ] `set(credential)` normalize edilmiş origin + kullanıcı adı ikilisine göre upsert yapmalı
- [ ] `set` çağrısında parolayı hemen (anında) şifrelemeli
- [ ] `remove(id)` ile bir kimlik bilgisini silebilmeli
- [ ] `login_credentials` tablosu üzerinde çalışmalı ama şema sahibi olmamalı (şema `@tepegoz/persistence` migration'larında)
- [ ] Uygulama tarafından enjekte edilen bir `Db` örneği üzerinde çalışmalı
- [ ] `PasswordStore` statik SQLite CRUD katmanını (`list`/`findById`/`findByUrl`/`upsert`/`remove`) sağlamalı
- [ ] `PasswordVault`, CRUD işlemlerini `PasswordStore`'a delege etmeli
- [ ] `passwordVault` singleton örneğini dışa aktarmalı
- [ ] Tam yazma/içe aktarma/dışa aktarma yeteneklerine sahip olmalı

## Olsa iyi olur
- [ ] `import(csvData)` ile genel CSV formatından (name/url/username/password/note sütunları) en iyi çaba ile içe aktarma yapabilmeli
- [ ] CSV içe aktarmada başlık satırını otomatik algılamalı
- [ ] `import` sonucunda `{ imported, skipped, errors }` özetini döndürmeli
- [ ] `export()` her saklı kimlik bilgisini (şifresi çözülmüş) aynı genel CSV şekline serileştirmeli
- [ ] `import`/`export` CSV şekli çift yönlü (round-trip) tutarlı olmalı
- [ ] Bir tür/business-logic katmanı olarak ince kalmalı, şema mantığı barındırmamalı
- [ ] `@tepegoz/persistence`'ın `HistoryStore` konvansiyonlarını yansıtmalı
- [ ] `SecretCrypto` olarak masaüstünde Electron `safeStorage`/DPAPI kullanımını (enjeksiyonla) desteklemeli
- [ ] `@tepegoz/password-core`'dan gelen `PasswordProvider` arayüzüne tam uymalı
- [ ] Origin normalizasyonu tutarlı olmalı (aynı sitenin farklı yazımları tek kayda düşmeli)

## Çok niş
- [ ] Bozuk/eksik sütunlu CSV satırlarını atlayıp `errors`'a raporlamalı, tüm içe aktarmayı düşürmemeli
- [ ] `init` çağrılmadan yapılan erişimlerde net biçimde başarısız olmalı
- [ ] Aynı `init`'in iki kez çağrılmasına karşı korunmalı (veya idempotent olmalı)
- [ ] Şifre çözme yalnızca açıkça `decrypt()` üzerinden mümkün olmalı — kayıt döndüren okumalar hiç çözmemeli
- [ ] `safeStorage` kullanılamadığında (ör. Linux'ta kilitsiz oturum) davranışı öngörülebilir olmalı
- [ ] Boş kasa üzerinde `export()` geçerli (başlıklı, satırsız) CSV üretmeli
- [ ] Çok büyük CSV içe aktarmalarında bellek kullanımı makul kalmalı
