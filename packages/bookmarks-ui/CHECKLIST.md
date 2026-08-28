# bookmarks-ui — CHECKLIST

> Bu liste yalnızca README okunarak üretildi; kod incelenmedi.
> Sunum amaçlı chrome yaprağı: `tepegoz://bookmarks` yöneticisi — solda klasör ağacı, sağda seçili klasör içeriği olan iki panelli düzen; @dnd-kit sürükle-sırala/reparent, ağaç genelinde arama, yeni klasör ve host'un native context menüsüne devreden sağ tık. Ağaç verisi, mutasyonlar ve navigasyon tümüyle enjekte edilir.

## Kesinlikle olmalı
- [ ] İki panelli düzen sunmalı: solda klasör ağacı, sağda seçili klasörün içeriği
- [ ] Bir klasör seçildiğinde sağ panelde o klasörün içeriğini göstermeli
- [ ] Aynı klasör içinde @dnd-kit ile sürükle-bırak yeniden sıralamayı desteklemeli
- [ ] Bir öğeyi ağaçtaki bir klasörün üstüne sürükleyerek reparent (üst klasör değiştirme) desteklemeli
- [ ] Tüm ağaç genelinde arama sunmalı
- [ ] Yeni klasör (New-folder) eylemi sunmalı
- [ ] Satırların sağ tık menüsünü host'un native context menüsüne devretmeli (`onContextMenu`)
- [ ] Ağaç verisini enjekte edilen `getTree` üzerinden almalı
- [ ] Her mutasyonu enjekte edilen callback'lere (`onMove` / `onNewFolder`) devretmeli, kendi başına yazmamalı
- [ ] Navigasyonu `onOpen(url)` ile host'a devretmeli
- [ ] Host mutasyondan sonra `refreshKey`'i artırınca yeniden fetch yapmalı
- [ ] Kendi `en`/`tr` i18n sözlüğüne sahip olmalı (`bookmarksUiDict`, `useT(bookmarksUiDict)`)
- [ ] Electron bridge'ine bağımlı olmamalı
- [ ] `BookmarksManager`, `BookmarkManagerNode`, `BookmarkNodeType`, `BookmarksManagerProps`, `bookmarksUiDict`, `BookmarksUiStrings`'i dışa aktarmalı
- [ ] `BookmarkManagerNode` alanları: `id`, `type`, `title`, `url`, opsiyonel `favicon`, `children`
- [ ] `BookmarkManagerNode` host'un daha zengin `BookmarkTreeNode`'u ile yapısal olarak uyumlu olmalı
- [ ] `BookmarkNodeType` yalnızca `'folder' | 'bookmark'` olmalı

## Olsa iyi olur
- [ ] `onMove` çağrısında hedef `newParentId` ve `index`'i vermeli
- [ ] `bookmarksUiDict` ana süreçte `tepegoz://bookmarks` sekme başlığı için yeniden kullanılabilmeli
- [ ] Sürükleme sırasında geçerli bırakma hedeflerini görsel olarak belirtmeli
- [ ] Arama sonuçlarını ağaç yapısı içinde bağlamıyla göstermeli
- [ ] Favicon verilmeyen bookmark'lar için yer tutucu ikon göstermeli
- [ ] Boş bir klasör seçildiğinde anlamlı bir boş-durum göstermeli
- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` betiklerini sağlamalı

## Çok niş
- [ ] Bir öğeyi kendi alt ağacındaki bir klasöre sürüklemeyi engellemeli (döngü oluşmamalı)
- [ ] `refreshKey` değişmeden `getTree` çıktısı değişse bile kontrat gereği yeniden fetch'e zorlamamalı
- [ ] Çok derin klasör ağacında sol panel kaydırma ile gezinilebilmeli
- [ ] Arama terimi hiçbir düğümle eşleşmediğinde net "sonuç yok" durumu göstermeli
- [ ] Sürükle-bırak sırasında klavye-only kullanıcılar için erişilebilir alternatif sunmalı
- [ ] Aynı anda birden çok mutasyon tetiklense bile son `refreshKey` kazanmalı
