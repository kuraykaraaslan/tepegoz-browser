# credential-vault — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> AI sağlayıcı API anahtarları için BYO-key vault: anahtarları enjekte edilen `SecretCrypto` ile şifreleyip base64 ciphertext olarak diske yazan, renderer'a yalnızca metadata/boolean status veren Electron'suz çekirdek.

## Kesinlikle olmalı
- [ ] API anahtarları enjekte edilen `SecretCrypto` ile şifrelenmeli
- [ ] Anahtarlar diske base64 ciphertext olarak yazılmalı
- [ ] Persist yolu enjekte edilen `filePath` olmalı (`@tepegoz/json-store` üzerinden)
- [ ] Ham anahtarlar çağıranın dışına asla çıkmamalı
- [ ] Renderer yalnızca metadata veya provider başına boolean status görmeli
- [ ] Çekirdek Electron'dan bağımsız olmalı (runtime olmadan unit-test edilebilir)
- [ ] `init({ crypto, filePath })` on-disk dosyayı yüklemeli
- [ ] Legacy flat `{ provider: base64 }` map ilk yüklemede versiyonlu şekle in-place upconvert edilmeli
- [ ] Bir provider birden çok etiketli anahtar tutabilmeli, priority ile sıralı (ilk = default)
- [ ] `addKey(provider, label, apiKey)` koleksiyona anahtar eklemeli
- [ ] `removeKey(id)` idempotent olmalı
- [ ] `renameKey(id, label)` etiketi değiştirmeli
- [ ] `reorderKeys(orderedIds)` anahtar sırasını değiştirmeli
- [ ] Her mutation hemen persist edilmeli
- [ ] `listMeta()` / `listMetaByProvider(provider)` yalnızca metadata döndürmeli (ciphertext yok)
- [ ] `status()` provider başına "anahtar var mı" haritası döndürmeli
- [ ] `topProvider()` öncelikli provider'ı döndürmeli
- [ ] `getKeyById(id)` / `getFirstKeyForProvider(provider)` yalnızca main-process olmalı ve IPC üzerinden expose edilmemeli
- [ ] `getKeyById` / `getFirstKeyForProvider` ham anahtarı decrypt edip döndürmeli
- [ ] `isEncryptionAvailable()` şifreleme kullanılabilirliğini bildirmeli
- [ ] Malformed veya bilinmeyen-provider kayıtları yüklemede tek tek atılmalı; bir bozuk kayıt tüm vault'u düşürmemeli
- [ ] `ProviderKeyMeta` / `ProviderKeyStatus` `@tepegoz/shared-types`'tan re-export edilmeli (tek şema kaynağı)
- [ ] Metadata id / provider / label / createdAt / last4 içermeli
- [ ] `SecretCrypto` arayüzü `isAvailable` / `encrypt` / `decrypt` sağlamalı

## Olsa iyi olur
- [ ] `reset()` test seam'i sağlanmalı
- [ ] Priority sırası liste okumalarına yansımalı
- [ ] `last4` anahtarın yalnızca son 4 karakterini açığa çıkarmalı, gerisini değil
- [ ] Şifreleme kullanılamıyorsa `addKey` net biçimde başarısız olmalı veya uyarmalı
- [ ] Aynı provider + label ikinci kez eklenince tanımlı bir davranış olmalı
- [ ] Electron wiring desktop app'in `stores.electron.ts`'inde kalmalı
- [ ] `json-store` yazımı yarıda kalmış dosya bırakmamalı

## Çok niş
- [ ] Upconvert yalnızca bir kez çalışmalı, sonraki yüklemelerde tekrar tetiklenmemeli
- [ ] Disk dosyası tamamen bozuksa vault boş ama kullanılabilir başlamalı
- [ ] `removeKey` bilinmeyen id ile çağrılınca hata değil no-op olmalı
- [ ] `reorderKeys` eksik veya fazla id verilince güvenli davranmalı
- [ ] Çok sayıda provider/anahtar ile `listMeta` performansı makul kalmalı
- [ ] Tek bir kaydın decrypt'i başarısız olursa hata o kayıtla sınırlı kalmalı
