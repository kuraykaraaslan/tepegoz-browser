# file-operations — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Klasör-sandbox'lı `file_*` / `fileaccess_*` capability'leri: kullanıcının folder-grant whitelist'i tek yetkilendirme kaynağı, `FileAccessPolicy` saf path-math (ADR-0022).

## Kesinlikle olmalı
- [ ] `registerFileOperations(deps)` `file_*`/`fileaccess_*` araçlarını `CapabilityRegistry`'ye kaydetmeli
- [ ] Araçları verilen `FileSystemHost`/`FileAccessPolicy`/`GrantStore`'a bağlamalı
- [ ] Kullanıcının folder-grant whitelist'ini tek yetkilendirme kaynağı yapmalı — daha geniş dosya sistemi erişimi olmamalı
- [ ] `FileAccessPolicy.assertMembership` her handler'da çağrılan sert sandbox olmalı
- [ ] Her grant dışındaki bir yolu istisnasız reddetmeli
- [ ] `FileAccessPolicy.decide` mutasyon opları için `allow`/`ask`/`deny` mod geçidi döndürmeli
- [ ] `FileAccessPolicy` saf path-math olmalı (yan etkisiz, fs'e dokunmamalı)
- [ ] Read araçları `read` tehlike sınıfında olmalı (otomatik izinli) ama handler'da membership yine de zorlanmalı
- [ ] Write araçları `state_changing` sınıfında olmalı
- [ ] Delete araçları `destructive` sınıfında olmalı (→ HITL)
- [ ] `FILE_OP_REQUIRED_MODE` her mutasyon opunun gerektirdiği minimum grant modunu tanımlamalı
- [ ] Confirm handler'ın mod geçidi `FILE_OP_REQUIRED_MODE`'u tüketmeli
- [ ] `FILE_GRANT_TOOL_IDS` grant yönetim araçlarını (`fileaccess_create_grant`/`update_grant`/`delete_grant`) tanımlamalı
- [ ] Grant yönetim araçları her zaman kullanıcı onaylı olmalı, asla otomatik onaylanmamalı
- [ ] Grant modları `read`/`read-write`/`full` olarak ayrışmalı, opsiyonel olarak recursive olmalı
- [ ] Electron-free olmalı; somut fs ve grant kalıcılığı `FileSystemHost`/`GrantStore` ile enjekte edilmeli
- [ ] `FileSystemHost`'un `canonicalize` dışındaki her metodu zaten canonicalize edilmiş, grant-kontrollü mutlak yol almalı
- [ ] `FileSystemHost` seam'i `readFile`/`writeFile`/`appendFile`, `mkdir`/`readdir`/`stat`/`exists`, `rename`/`copyFile`/`remove`, glob `search` kapsamalı
- [ ] `FileEncoding`'i `utf8`/`base64` tutmalı ki ikili içerik IPC'yi güvenle geçsin
- [ ] `resetFileOperationsForTest` ile temiz unregister/yeniden register test seam'i sağlamalı

## Olsa iyi olur
- [ ] `..`/symlink ile grant dışına kaçış denemelerini `canonicalize` sonrası membership ile engellemeli
- [ ] Recursive olmayan bir grant'te alt klasör yollarını reddetmeli
- [ ] `decide` `ask` döndürdüğünde ToolGateway confirm akışını tetiklemeli
- [ ] Grant modu yetersizse (ör. `read` grant'te write) opu `deny`'lamalı
- [ ] `DirEntry`/`FileStat` veri tiplerini IPC-güvenli sade şekiller olarak dışa aktarmalı
- [ ] Aynı yolu kapsayan birden çok grant varsa en geniş modu uygulamalı
- [ ] `search` (glob) sonuçlarını da grant üyeliğine göre filtrelemeli
- [ ] Var olmayan yol üzerinde `stat`/`exists` çağrısı çökmeden sonuç dönmeli

## Çok niş
- [ ] Grant kökünün kendisinin silinmesi/taşınması gibi opları özel olarak ele almalı
- [ ] Canonicalize sırasında çözülemeyen yol için net bir ret üretmeli
- [ ] Çok büyük dosyada `base64` okuma/yazmada IPC boyut sınırını gözetmeli
- [ ] Grant modu daraltıldıktan sonra önceden izinli opların yeni moda tabi olmasını garanti etmeli
- [ ] Windows/POSIX yol ayracı farklarında membership matematiği tutarlı olmalı
- [ ] `full` mod ile `read-write` mod arasındaki farkı yalnızca ilgili oplarda göstermeli
