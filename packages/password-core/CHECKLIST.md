# password-core — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Parola yöneticisi için sağlayıcıdan bağımsız tipler ve kayıt defteri: her kimlik-bilgisi kaynağının uyguladığı `PasswordProvider` arayüzünü ve tüm sağlayıcılar arası toplama yapan merkezi registry'yi tanımlar; tek bağımlılığı `@tepegoz/credential-vault`'tur.

## Kesinlikle olmalı
- [ ] Her kimlik-bilgisi kaynağının uyguladığı `PasswordProvider` arayüzünü tanımlamalı
- [ ] `PasswordProviderRegistry.register(provider)` sunmalı
- [ ] `PasswordProviderRegistry.get(id)` sunmalı
- [ ] `PasswordProviderRegistry.list()` sunmalı
- [ ] `findByUrl(url)` URL'yi origin'ine normalize edip tüm kayıtlı sağlayıcılardan sonuçları toplamalı
- [ ] Çağıranlar (autofill/UI) bir kimlik-bilgisinin hangi sağlayıcıya ait olduğunu bilmek zorunda kalmamalı
- [ ] `list_all()` tüm sağlayıcılar arası metadata toplaması yapmalı
- [ ] `reset()` test seam'i sunmalı
- [ ] `PasswordProvider`: `id` / `displayName` / `capabilities` üyelerini içermeli
- [ ] `PasswordProvider` okumaları: `list()` / `findById()` / `findByUrl()`
- [ ] `PasswordProvider` mutasyonları: `set()` / `remove()`
- [ ] `PasswordProvider` opsiyonel `import()` / `export()` desteklemeli
- [ ] `ProviderCapabilities`: `canWrite` / `canImport` / `canExport` / `canSync` bayraklarını tanımlamalı
- [ ] `LoginCredentialMeta`: IPC-güvenli, parola içermeyen metadata olmalı
- [ ] `LoginCredential`: `encryptedPassword` içeren tam kayıt; yalnızca ana süreçte, IPC'yi asla geçmemeli
- [ ] `NewCredential`: düz-metin parolalı giriş şekli; sağlayıcı yazarken şifreler
- [ ] Sağlayıcı düz-metin parolayı asla saklamamalı veya geri döndürmemeli (sözleşme)
- [ ] `ImportFormat` / `ExportFormat` / `ImportResult` ortak import/export sözleşmesini tanımlamalı
- [ ] `AutofillAvailablePayload`: `{ url, matches }` şeklinde renderer'a bildirim yükü tanımlamalı
- [ ] `SecretCrypto`'yu `@tepegoz/credential-vault`'tan yeniden dışa vermeli (tek crypto sözleşmesi, döngüsel import yok)
- [ ] Yalnızca `@tepegoz/credential-vault`'a bağımlı olmalı

## Olsa iyi olur
- [ ] `findByUrl` origin normalizasyonu path/query/fragment'i yok saymalı
- [ ] Registry aynı `id` ile ikinci `register`'ı öngörülebilir şekilde ele almalı (değiştir veya reddet)
- [ ] Bilinmeyen bir `id` için `get(id)` fırlatmadan `undefined` döndürmeli
- [ ] Toplanmış `findByUrl` sağlayıcılar arası aynı eşleşmeleri tekilleştirmeli
- [ ] Yetenekler UI'nın desteklenmeyen eylemleri gizlemesine izin vermeli (ör. `!canExport` ise dışa aktar düğmesi yok)
- [ ] Toplanmış `list_all` sonuçları kararlı bir sırayla dönmeli
- [ ] Autofill ve ayarlar UI'sı için tek import noktası registry olmalı

## Çok niş
- [ ] `findByUrl`'de alt-alan adı ile kayıt edilebilir alan adı eşleştirme politikası tanımlı olmalı
- [ ] Aynı kimlik-bilgisi `id`'sini iddia eden iki sağlayıcı deterministik ele alınmalı
- [ ] `list()` içinde hata fırlatan bir sağlayıcı tüm toplamayı bozmamalı
- [ ] Gelecekteki bir sağlayıcı (Bitwarden) çekirdek değişmeden takılabilmeli
- [ ] `http` ile `https` aynı/farklı origin sayılması belgelenmiş olmalı
- [ ] `findByUrl` için origin'deki port ele alınmalı
