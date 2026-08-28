# persistence — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Local-first persistence (L1): tek doğruluk kaynağı olan append-only Event Journal, içerik-adresli blob store, ileri-yönlü migration'lar ve yerel meta — SQLite (better-sqlite3, WAL).

## Kesinlikle olmalı
- [ ] Append-only Event Journal'ı tek doğruluk kaynağı (single source of truth) olarak sunmalı
- [ ] `openDatabase(path)` ile veritabanı açabilmeli; `':memory:'` testler için desteklenmeli
- [ ] Açılan veritabanı WAL modunda ve `synchronous=NORMAL` ile yapılandırılmalı
- [ ] `migrate(db)` ileri-yönlü (forward-only) ve transactional migration çalıştırmalı
- [ ] Migration ilerlemesini `PRAGMA user_version` ile takip etmeli
- [ ] `EventJournal.append` ile olay eklemeli; olaylar değiştirilemez (immutable) olmalı
- [ ] `EventJournal.readFrom` ile belirli bir noktadan itibaren olayları okuyabilmeli
- [ ] `EventJournal.count` ile olay sayısını verebilmeli
- [ ] Her olaya monotonik artan `lsn` atamalı
- [ ] Her olayda `deviceId` sync anahtarını taşımalı
- [ ] `BlobStore.put/get/count` ile içerik-adresli blob saklamalı
- [ ] Blob'ları sha256 ile adreslemeli ve tekilleştirmeli (dedupe)
- [ ] `BlobStore.put` `cas://<hash>` referansı döndürmeli
- [ ] Journal asla base64 içerik saklamamalı — yalnızca `cas://` referansı
- [ ] `MetaStore.get/set` ile yerel meta okuyup yazabilmeli
- [ ] `MetaStore.deviceId` kurulum başına kararlı (stable) bir cihaz kimliği vermeli
- [ ] `kv` tablosu day-0 sync-meta taşımalı: `updated_at` / `version` / `tombstone`
- [ ] Olaylar tablosunda `device_id` sütunu bulunmalı
- [ ] ADR-0003 / ADR-0004 ile hizalı olmalı

## Olsa iyi olur
- [ ] Native modül CI'da OS başına yeniden derlenmeli (Electron ABI için electron-builder ile)
- [ ] Testlerde Node prebuilt better-sqlite3 kullanılabilmeli
- [ ] Migration'lar geri alınamaz olduğu için eski şemayı düşürmeden ilerlemeli
- [ ] `append` bir transaction içinde atomik olmalı (yarım olay yazılmamalı)
- [ ] `lsn` üretimi eşzamanlı yazımlarda çakışmasız olmalı
- [ ] Blob dedupe aynı içeriğin iki kez fiziksel yazılmasını önlemeli
- [ ] `readFrom` sync için verimli aralık okuması sağlamalı (tam tarama değil)
- [ ] `deviceId` bir kez üretilip kalıcı olmalı, sonraki açılışlarda değişmemeli

## Çok niş
- [ ] Bozuk/kısmi yazılmış WAL dosyasından açılışta kurtarma öngörülebilir olmalı
- [ ] `':memory:'` veritabanında migration ve journal davranışı diskle birebir aynı olmalı
- [ ] Var olmayan `cas://` hash'i için `BlobStore.get` net biçimde başarısız olmalı
- [ ] Tombstone'lu `kv` kayıtları sync sırasında silme olarak yorumlanabilmeli
- [ ] Çok büyük blob'larda bellek kullanımı sınırlı kalmalı
- [ ] Gelecekteki daha yüksek `user_version`'lı bir DB açıldığında güvenli şekilde reddedilmeli
